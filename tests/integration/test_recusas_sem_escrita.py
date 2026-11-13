"""Toda recusa das operacoes da missao deixa o banco INTACTO (pendencia 97, T-M1).

Concluir, iniciar e reagendar recusam por muitos motivos, e cada recusa promete
a mesma coisa: nada foi gravado. Os testes que ja existiam provavam isso para
UM caminho (reuso de chave em outra missao), lendo o banco pela MESMA sessao,
com o autoflush de uma consulta, antes do rollback da fixture. Isso deixa tres
buracos, e este modulo fecha os tres:

1. **Os outros caminhos.** `CASOS` enumera as recusas de cada operacao
   (inexistente, alheia, oculta, chave gasta de cinco jeitos, expirada,
   transicao ilegal, prazo), e o mesmo conjunto roda no servico e na API.
2. **Antes E depois do rollback.** A "foto" do banco e o dump JSON de TODAS as
   tabelas do esquema (`to_jsonb`), nao um punhado de colunas escolhidas: uma
   escrita numa tabela que ninguem lembrou de conferir tambem reprova. Ela e
   tirada (a) na propria transacao da recusa, depois de um `flush`, o que prova
   que a funcao NAO escreveu antes de recusar (a confirmacao da Kairya grava a
   falha da acao na mesma transacao depois de uma recusa daqui), e (b) depois do
   rollback, por OUTRA conexao, o que prova que nada sobreviveu.
3. **A disputa da UNIQUE.** Ai a escrita ACONTECE (estado, evidencia e a
   operacao vao ao banco) e quem desfaz e o rollback. Os testes provocam a
   colisao sem depender de escalonador: ou o vencedor ja commitou depois que o
   perdedor fixou o snapshot (REPEATABLE READ), ou o vencedor segura a chave sem
   commitar e o perdedor e observado BLOQUEADO no indice unico, pelo proprio
   PostgreSQL (`pg_stat_activity`), antes de o vencedor commitar ou desfazer.

Tudo aqui commita de verdade (a recusa precisa de uma conexao sua, e o rollback
da transacao externa da fixture `session` mascararia exatamente o que se quer
medir). A limpeza e obrigacao deste modulo: `Cenario.limpar` apaga so o que ele
mesmo criou.
"""

import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.core.errors import (
    MissaoExpiradaError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
    PrazoDerivadoError,
    PrazoExpiradoError,
    PrazoForaDoLimite,
    PrazoInalteradoError,
)
from focusquest.main import app
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvidence,
    MissionOperation,
    WeeklyPlan,
)
from focusquest.modules.missions.service import (
    UNICIDADE_DA_OPERACAO,
    NovaEvidencia,
    concluir_missao,
    criar_missao,
    iniciar_missao,
    reagendar_missao,
)
from focusquest.modules.progression.models import XpEntry
from focusquest.modules.users.models import User
from integration.foto_do_banco import Foto, foto_do_banco

ESTUDANTE = 1
OUTRO = 2
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
QUINTA = QUARTA + timedelta(days=1)
# Quarta, meio-dia em Sao Paulo: a diaria de quarta e "hoje".
AGORA = datetime(2026, 9, 23, 15, 0, tzinfo=UTC)
PRAZO_DA_AVULSA = AGORA + timedelta(days=2)
NOVO_PRAZO = AGORA + timedelta(days=5)
HORIZONTE = timedelta(days=365)

# O XP de uma avulsa de dificuldade 2 (`criar_missao` abaixo), medido na
# conclusao em `test_missions_service.py`.
XP_DA_AVULSA = 40

# So um teto contra suite travada: a espera por bloqueio e por OBSERVACAO do
# estado do banco, nao por um tempo chutado.
SEGUNDOS_LIMITE = 30
INTERVALO_DA_OBSERVACAO = 0.02
LIMITE_DE_TRAVA = "5s"

Operacao = Literal["concluir", "iniciar", "reagendar"]
OPERACOES: tuple[Operacao, ...] = ("concluir", "iniciar", "reagendar")
SUFIXO_DA_ROTA: dict[Operacao, str] = {
    "concluir": "complete",
    "iniciar": "start",
    "reagendar": "reschedule",
}


def _relogio() -> datetime:
    return AGORA


def _executar(
    operacao: Operacao,
    sessao: Session,
    mission_id: int,
    chave: str,
    evidencia: NovaEvidencia | None,
    novo_prazo: datetime,
    motivo: MotivoDoReagendamento,
) -> object:
    if operacao == "concluir":
        return concluir_missao(
            sessao, ESTUDANTE, mission_id, chave, clock=_relogio, evidencia=evidencia
        )
    if operacao == "iniciar":
        return iniciar_missao(sessao, ESTUDANTE, mission_id, chave, clock=_relogio)
    return reagendar_missao(
        sessao,
        ESTUDANTE,
        mission_id,
        chave,
        novo_prazo=novo_prazo,
        motivo=motivo,
        origem=OrigemDoReagendamento.USUARIO,
        clock=_relogio,
    )


@dataclass(frozen=True)
class Pedido:
    """Uma operacao que vai ser RECUSADA, com o que a recusa deve ser no servico
    (`erro`) e na API (`status` e `code`)."""

    operacao: Operacao
    mission_id: int
    chave: str
    erro: type[Exception]
    status: int
    code: str
    evidencia: NovaEvidencia | None = None
    novo_prazo: datetime = NOVO_PRAZO
    motivo: MotivoDoReagendamento = MotivoDoReagendamento.DIFICULDADE

    def chamar(self, sessao: Session) -> object:
        return _executar(
            self.operacao,
            sessao,
            self.mission_id,
            self.chave,
            self.evidencia,
            self.novo_prazo,
            self.motivo,
        )

    @property
    def url(self) -> str:
        return f"/api/missions/{self.mission_id}/{SUFIXO_DA_ROTA[self.operacao]}"

    @property
    def corpo(self) -> dict[str, Any]:
        corpo: dict[str, Any] = {"operation_id": self.chave}
        if self.operacao == "concluir" and self.evidencia is not None:
            corpo["evidence"] = {
                "text": self.evidencia.texto,
                "link": self.evidencia.link,
            }
        if self.operacao == "reagendar":
            corpo["new_deadline"] = self.novo_prazo.isoformat()
            corpo["reason"] = self.motivo.value
        return corpo


class Cenario:
    """O que um teste commitou, para a limpeza apagar SO isso."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.missoes: list[int] = []
        self.planos: list[int] = []
        self.criou_outro_usuario = False

    def sessao(self) -> Session:
        return Session(bind=self.engine, expire_on_commit=False)

    def foto(self) -> Foto:
        """O banco como UMA conexao nova o ve: so o que foi commitado."""
        with self.engine.connect() as conexao:
            return foto_do_banco(conexao)

    def avulsa(self, user_id: int = ESTUDANTE) -> int:
        with self.sessao() as sessao:
            if user_id == OUTRO and not self.criou_outro_usuario:
                sessao.add(User(id=OUTRO, display_name="Outra pessoa"))
                sessao.flush()
                self.criou_outro_usuario = True
            missao = criar_missao(
                sessao,
                user_id=user_id,
                instructions="Ler o capitulo 3",
                completion_criterion="Resumo de uma pagina",
                difficulty=2,
                estimated_minutes=30,
                deadline=PRAZO_DA_AVULSA,
            )
            sessao.commit()
            self.missoes.append(missao.id)
            return missao.id

    def diaria(self, dia: date) -> int:
        """A diaria do dia, criando o plano da semana na primeira vez."""
        with self.sessao() as sessao:
            plano_id = sessao.scalar(
                select(WeeklyPlan.id).where(
                    WeeklyPlan.user_id == ESTUDANTE, WeeklyPlan.week_start == SEGUNDA
                )
            )
            if plano_id is None:
                criar_plano(
                    sessao,
                    user_id=ESTUDANTE,
                    semana=SEGUNDA,
                    diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
                    especial=NovaEspecial("E", "c", 60),
                    clock=lambda: datetime(2026, 9, 21, 15, tzinfo=UTC),
                )
                sessao.commit()
                plano_id = sessao.scalars(
                    select(WeeklyPlan.id).where(
                        WeeklyPlan.user_id == ESTUDANTE,
                        WeeklyPlan.week_start == SEGUNDA,
                    )
                ).one()
                self.planos.append(plano_id)
            return sessao.scalars(
                select(Mission.id).where(
                    Mission.plan_id == plano_id,
                    Mission.mission_type == MissionType.DIARIA,
                    Mission.day == dia,
                )
            ).one()

    def gastar(
        self,
        operacao: Operacao,
        mission_id: int,
        chave: str,
        evidencia: NovaEvidencia | None = None,
        novo_prazo: datetime = NOVO_PRAZO,
    ) -> None:
        """Faz a operacao DE VERDADE (e commita), para a chave ficar gasta."""
        with self.sessao() as sessao:
            _executar(
                operacao,
                sessao,
                mission_id,
                chave,
                evidencia,
                novo_prazo,
                MotivoDoReagendamento.DIFICULDADE,
            )
            sessao.commit()

    def limpar(self) -> None:
        """Apaga as missoes, os planos e o usuario que o teste criou.

        As operacoes, evidencias, lancamentos de XP, conquistas e reagendamentos
        vao junto pelo `ondelete=CASCADE`. Com prazo (`lock_timeout`): uma
        thread que sobrevivesse ao teste seguraria a trava e a limpeza esperaria
        por ela para sempre.
        """
        with self.sessao() as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.id.in_(self.missoes)))
            sessao.execute(delete(Mission).where(Mission.plan_id.in_(self.planos)))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id.in_(self.planos)))
            if self.criou_outro_usuario:
                sessao.execute(delete(User).where(User.id == OUTRO))
            sessao.commit()


@pytest.fixture
def cenario(banco_migrado: Engine) -> Iterator[Cenario]:
    criado = Cenario(banco_migrado)
    try:
        yield criado
    finally:
        criado.limpar()


@pytest.fixture
def cliente(banco_migrado: Engine) -> Iterator[TestClient]:
    """A API com a sessao REAL da requisicao (`get_session` sobre a engine de
    teste): quem desfaz uma recusa e o fechamento dela, como em producao."""
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: banco_migrado,
        get_clock: lambda: _relogio,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app) as c:
        yield c
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


# ---------------------------------------------------------------------------
# O catalogo de recusas
# ---------------------------------------------------------------------------

Caso = Callable[[Cenario], Pedido]

NAO_ENCONTRADA = (404, "missao_nao_encontrada")
OUTRO_PEDIDO = (409, "operacao_reutilizada")
TRANSICAO = (409, "transicao_ilegal")
EXPIRADA = (409, "missao_expirada")
INEXISTENTE = 2**31 - 1


def _pedido(
    operacao: Operacao,
    mission_id: int,
    chave: str,
    erro: type[Exception],
    http: tuple[int, str],
    **extras: Any,
) -> Pedido:
    return Pedido(operacao, mission_id, chave, erro, http[0], http[1], **extras)


def _inexistente(operacao: Operacao) -> Caso:
    return lambda c: _pedido(
        operacao, INEXISTENTE, "op-x", MissaoNaoEncontradaError, NAO_ENCONTRADA
    )


def _alheia(operacao: Operacao) -> Caso:
    return lambda c: _pedido(
        operacao,
        c.avulsa(user_id=OUTRO),
        "op-x",
        NaoPertenceAoUsuarioError,
        NAO_ENCONTRADA,
    )


def _diaria_futura_com_chave_gasta(operacao: Operacao) -> Caso:
    """C11: a ocultacao vem ANTES do reenvio. Uma chave gasta numa missao real,
    mandada a uma diaria ainda nao revelada, e 404, nunca 409."""

    def caso(c: Cenario) -> Pedido:
        c.gastar(operacao, c.avulsa(), "op-gasta")
        return _pedido(
            operacao,
            c.diaria(QUINTA),
            "op-gasta",
            MissaoNaoEncontradaError,
            NAO_ENCONTRADA,
        )

    return caso


def _chave_gasta_em_outra_missao(operacao: Operacao) -> Caso:
    def caso(c: Cenario) -> Pedido:
        evidencia = NovaEvidencia("Entrega original", "https://exemplo.com/a")
        c.gastar(
            operacao,
            c.avulsa(),
            "op-x",
            evidencia=evidencia if operacao == "concluir" else None,
        )
        return _pedido(
            operacao,
            c.avulsa(),
            "op-x",
            OperacaoReutilizadaError,
            OUTRO_PEDIDO,
            evidencia=NovaEvidencia("Pedido recusado", None),
        )

    return caso


def _chave_gasta_em_outro_tipo(operacao: Operacao) -> Caso:
    """A MESMA missao, mas a chave nomeou outro tipo de operacao."""
    gasta_em: Operacao = "concluir" if operacao != "concluir" else "iniciar"

    def caso(c: Cenario) -> Pedido:
        missao = c.avulsa()
        c.gastar(gasta_em, missao, "op-x")
        return _pedido(operacao, missao, "op-x", OperacaoReutilizadaError, OUTRO_PEDIDO)

    return caso


def _concluida_e_chave_nova(operacao: Operacao) -> Caso:
    def caso(c: Cenario) -> Pedido:
        missao = c.avulsa()
        c.gastar("concluir", missao, "op-1", evidencia=NovaEvidencia("Primeira", None))
        return _pedido(
            operacao,
            missao,
            "op-2",
            TransicaoIlegalError,
            TRANSICAO,
            evidencia=NovaEvidencia("Segunda", None),
        )

    return caso


def _ja_iniciada_e_chave_nova(c: Cenario) -> Pedido:
    missao = c.avulsa()
    c.gastar("iniciar", missao, "op-1")
    return _pedido("iniciar", missao, "op-2", TransicaoIlegalError, TRANSICAO)


def _diaria_de_ontem(operacao: Operacao) -> Caso:
    return lambda c: _pedido(
        operacao,
        c.diaria(QUARTA - timedelta(days=1)),
        "op-x",
        MissaoExpiradaError,
        EXPIRADA,
    )


def _concluir_com_outra_evidencia(
    gravada: NovaEvidencia | None, pedida: NovaEvidencia | None
) -> Caso:
    """A MESMA chave na MESMA missao, com evidencia diferente: chave gasta."""

    def caso(c: Cenario) -> Pedido:
        missao = c.avulsa()
        c.gastar("concluir", missao, "op-x", evidencia=gravada)
        return _pedido(
            "concluir",
            missao,
            "op-x",
            OperacaoReutilizadaError,
            OUTRO_PEDIDO,
            evidencia=pedida,
        )

    return caso


def _reagendar_com_outro_pedido(**diferente: Any) -> Caso:
    def caso(c: Cenario) -> Pedido:
        missao = c.avulsa()
        c.gastar("reagendar", missao, "op-x")
        return _pedido(
            "reagendar",
            missao,
            "op-x",
            OperacaoReutilizadaError,
            OUTRO_PEDIDO,
            **diferente,
        )

    return caso


def _reagendar_prazo(
    prazo: datetime, erro: type[Exception], http: tuple[int, str]
) -> Caso:
    return lambda c: _pedido(
        "reagendar", c.avulsa(), "op-x", erro, http, novo_prazo=prazo
    )


def _reagendar_diaria(c: Cenario) -> Pedido:
    return _pedido(
        "reagendar",
        c.diaria(QUARTA),
        "op-x",
        PrazoDerivadoError,
        (409, "prazo_derivado"),
    )


TEXTO = NovaEvidencia("Feito", None)
COM_LINK = NovaEvidencia("Feito", "https://exemplo.com/a")

CASOS: dict[str, Caso] = {
    # Quem pede o que nao pode ver.
    **{f"{op}-inexistente": _inexistente(op) for op in OPERACOES},
    **{f"{op}-de-outro-usuario": _alheia(op) for op in OPERACOES},
    **{
        f"{op}-diaria-futura-com-chave-gasta": _diaria_futura_com_chave_gasta(op)
        for op in OPERACOES
    },
    # A chave ja nomeou outra coisa.
    **{
        f"{op}-chave-de-outra-missao": _chave_gasta_em_outra_missao(op)
        for op in OPERACOES
    },
    **{f"{op}-chave-de-outro-tipo": _chave_gasta_em_outro_tipo(op) for op in OPERACOES},
    # Estado que a transicao recusa.
    **{f"{op}-ja-concluida": _concluida_e_chave_nova(op) for op in OPERACOES},
    "iniciar-ja-iniciada": _ja_iniciada_e_chave_nova,
    # A regra do dia.
    "concluir-diaria-de-ontem": _diaria_de_ontem("concluir"),
    "iniciar-diaria-de-ontem": _diaria_de_ontem("iniciar"),
    # `_mesma_evidencia`, de ponta a ponta: cada diferenca recusa e nao grava.
    "concluir-reenvio-com-texto-diferente": _concluir_com_outra_evidencia(
        TEXTO, NovaEvidencia("Outro", None)
    ),
    "concluir-reenvio-com-link-a-mais": _concluir_com_outra_evidencia(TEXTO, COM_LINK),
    "concluir-reenvio-com-link-diferente": _concluir_com_outra_evidencia(
        COM_LINK, NovaEvidencia("Feito", "https://exemplo.com/b")
    ),
    "concluir-reenvio-sem-link": _concluir_com_outra_evidencia(COM_LINK, TEXTO),
    "concluir-reenvio-sem-evidencia": _concluir_com_outra_evidencia(TEXTO, None),
    "concluir-reenvio-com-evidencia-onde-nao-havia": _concluir_com_outra_evidencia(
        None, TEXTO
    ),
    # Reagendar: o que so ele recusa.
    "reagendar-reenvio-com-outro-prazo": _reagendar_com_outro_pedido(
        novo_prazo=NOVO_PRAZO + timedelta(hours=1)
    ),
    "reagendar-reenvio-com-outro-motivo": _reagendar_com_outro_pedido(
        motivo=MotivoDoReagendamento.FALTA_DE_TEMPO
    ),
    "reagendar-diaria": _reagendar_diaria,
    "reagendar-prazo-no-passado": _reagendar_prazo(
        AGORA - timedelta(hours=1), PrazoExpiradoError, (422, "prazo_expirado")
    ),
    # Fronteira: `novo <= agora` e o passado, e o instante exato ja o e.
    "reagendar-prazo-igual-a-agora": _reagendar_prazo(
        AGORA, PrazoExpiradoError, (422, "prazo_expirado")
    ),
    "reagendar-prazo-igual-ao-atual": _reagendar_prazo(
        PRAZO_DA_AVULSA, PrazoInalteradoError, (409, "prazo_inalterado")
    ),
    # Fronteira: `agora + 365 dias` ainda cabe; um microssegundo a mais, nao.
    "reagendar-um-microssegundo-alem-do-horizonte": _reagendar_prazo(
        AGORA + HORIZONTE + timedelta(microseconds=1),
        PrazoForaDoLimite,
        (422, "prazo_fora_do_limite"),
    ),
}


def test_o_catalogo_cobre_as_tres_operacoes() -> None:
    """Uma operacao nova de recusa sem caso aqui reprova: o catalogo nao
    envelhece em silencio."""
    for operacao in OPERACOES:
        assert [nome for nome in CASOS if nome.startswith(operacao)], operacao


def test_a_foto_enxerga_uma_escrita(cenario: Cenario) -> None:
    """A prova de que `foto == foto` nao e vazia: a foto cobre as tabelas das
    operacoes e muda quando UMA linha muda, em qualquer delas."""
    missao = cenario.avulsa()
    antes = cenario.foto()
    assert {
        "missions",
        "mission_operations",
        "mission_evidence",
        "mission_reschedules",
        "xp_entries",
        "user_achievements",
    } <= antes.keys()

    cenario.gastar("concluir", missao, "op-foto", evidencia=TEXTO)
    depois = cenario.foto()

    mudaram = {tabela for tabela in antes if antes[tabela] != depois[tabela]}
    assert mudaram == {
        "missions",
        "mission_operations",
        "mission_evidence",
        "xp_entries",
        "user_achievements",
    }


# ---------------------------------------------------------------------------
# A recusa no servico: nada escrito antes do rollback, nada sobrevive a ele
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nome", CASOS)
def test_a_recusa_nao_escreve_nada(cenario: Cenario, nome: str) -> None:
    pedido = CASOS[nome](cenario)
    antes = cenario.foto()

    with cenario.sessao() as sessao:
        with pytest.raises(pedido.erro):
            pedido.chamar(sessao)

        # (a) DENTRO da transacao da recusa. O `flush` poe no banco tudo o que a
        # funcao deixou pendente; a leitura e pela conexao da propria sessao,
        # que enxerga o que ainda nao foi commitado. Uma escrita antes da
        # recusa aparece aqui, e so aqui: o rollback a esconderia.
        sessao.flush()
        assert foto_do_banco(sessao.connection()) == antes, (
            "a recusa escreveu antes de recusar"
        )

        sessao.rollback()

    # (b) Depois do rollback, por uma conexao que nao e a da sessao.
    assert cenario.foto() == antes


# ---------------------------------------------------------------------------
# A recusa na API: o status, o code e o banco intacto
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nome", CASOS)
def test_a_api_recusa_com_o_code_certo_e_nao_escreve_nada(
    cenario: Cenario, cliente: TestClient, nome: str
) -> None:
    pedido = CASOS[nome](cenario)
    antes = cenario.foto()

    resposta = cliente.post(pedido.url, json=pedido.corpo)

    assert (resposta.status_code, resposta.json()["code"]) == (
        pedido.status,
        pedido.code,
    )
    assert cenario.foto() == antes


@pytest.mark.parametrize(
    ("operacao", "corpo"),
    [
        pytest.param("concluir", {"operation_id": ""}, id="concluir-chave-vazia"),
        pytest.param(
            "concluir",
            {"operation_id": "op-x", "evidence": {"text": "   "}},
            id="concluir-evidencia-em-branco",
        ),
        pytest.param(
            "concluir",
            {"operation_id": "op-x", "evidence": {"text": "ok", "extra": 1}},
            id="concluir-campo-desconhecido",
        ),
        pytest.param("iniciar", {}, id="iniciar-sem-chave"),
        pytest.param(
            "reagendar",
            {
                "operation_id": "op-x",
                "new_deadline": "2026-10-01T10:00:00",
                "reason": "dificuldade",
            },
            id="reagendar-prazo-sem-fuso",
        ),
        pytest.param(
            "reagendar",
            {
                "operation_id": "op-x",
                "new_deadline": "2026-10-01T10:00:00Z",
                "reason": "porque sim",
            },
            id="reagendar-motivo-desconhecido",
        ),
    ],
)
def test_a_api_recusa_o_corpo_invalido_com_422_e_nao_escreve_nada(
    cenario: Cenario,
    cliente: TestClient,
    operacao: Operacao,
    corpo: dict[str, Any],
) -> None:
    missao = cenario.avulsa()
    antes = cenario.foto()

    resposta = cliente.post(
        f"/api/missions/{missao}/{SUFIXO_DA_ROTA[operacao]}", json=corpo
    )

    assert resposta.status_code == 422
    assert cenario.foto() == antes


# ---------------------------------------------------------------------------
# A disputa da UNIQUE de operation_id
# ---------------------------------------------------------------------------


def _resumo(cenario: Cenario, *missoes: int) -> dict[str, Any]:
    """O que o banco guarda das missoes dadas, em forma de comparar por
    igualdade com um literal."""
    with cenario.sessao() as sessao:
        return {
            "estados": {
                m.id: m.state
                for m in sessao.scalars(select(Mission).where(Mission.id.in_(missoes)))
            },
            "operacoes": sorted(
                (o.operation_id, o.mission_id, o.kind)
                for o in sessao.scalars(
                    select(MissionOperation).where(
                        MissionOperation.mission_id.in_(missoes)
                    )
                )
            ),
            "evidencias": sorted(
                (e.mission_id, e.text)
                for e in sessao.scalars(
                    select(MissionEvidence).where(
                        MissionEvidence.mission_id.in_(missoes)
                    )
                )
            ),
            "xp": sorted(
                (x.mission_id, x.amount)
                for x in sessao.scalars(
                    select(XpEntry).where(XpEntry.mission_id.in_(missoes))
                )
            ),
        }


@pytest.mark.parametrize("perdedora", OPERACOES)
def test_a_unique_recusa_a_perdedora_e_o_rollback_desfaz_o_que_ela_escreveu(
    cenario: Cenario, perdedora: Operacao
) -> None:
    """REPEATABLE READ: o snapshot da perdedora nasce ANTES de a vencedora
    commitar, entao a consulta de idempotencia nao ve a chave gasta e a
    perdedora ESCREVE (estado, evidencia, operacao) ate o indice unico recusar.
    O caminho da UNIQUE e percorrido sempre, sem thread nenhuma.

    A foto depois do rollback tem de ser exatamente a que a vencedora deixou:
    nem estado, nem evidencia, nem XP, nem conquista da perdedora.
    """
    ganha = cenario.avulsa()
    perde = cenario.avulsa()

    with cenario.sessao() as sessao:
        sessao.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        # A primeira leitura e o que fixa o snapshot.
        sessao.scalar(select(MissionOperation.operation_id).limit(1))

        cenario.gastar("concluir", ganha, "op-disputada", evidencia=TEXTO)
        depois_da_vencedora = cenario.foto()

        with pytest.raises(OperacaoReutilizadaError) as excecao:
            _executar(
                perdedora,
                sessao,
                perde,
                "op-disputada",
                COM_LINK,
                NOVO_PRAZO,
                MotivoDoReagendamento.DIFICULDADE,
            )
        sessao.rollback()

    # Foi a restricao do banco que recusou, nao a consulta.
    causa = excecao.value.__cause__
    assert isinstance(causa, IntegrityError)
    assert UNICIDADE_DA_OPERACAO in str(causa.orig)
    assert "op-disputada" in str(excecao.value)
    assert str(ganha) not in str(excecao.value)

    assert cenario.foto() == depois_da_vencedora
    assert _resumo(cenario, ganha, perde) == {
        "estados": {ganha: MissionState.CONCLUIDA, perde: MissionState.PENDENTE},
        "operacoes": [("op-disputada", ganha, "complete")],
        "evidencias": [(ganha, "Feito")],
        "xp": [(ganha, XP_DA_AVULSA)],
    }


@contextmanager
def _conexoes_da_perdedora(engine: Engine) -> Iterator[set[int]]:
    """Registra o `pid` de todo backend que o pool entregar enquanto o bloco
    roda (inclusive o do monitor, que as consultas abaixo excluem). Armado
    ANTES de a perdedora comecar, ele guarda a conexao dela antes de qualquer
    INSERT/flush, seja a perdedora o servico (sessao propria) ou a API (sessao
    da requisicao, noutra thread do TestClient).
    """
    pids: set[int] = set()

    def registrar(dbapi_conexao: Any, _registro: Any, _proxy: Any) -> None:
        pids.add(dbapi_conexao.info.backend_pid)

    event.listen(engine, "checkout", registrar)
    try:
        yield pids
    finally:
        event.remove(engine, "checkout", registrar)


def _esperar_a_perdedora_na_unique(
    engine: Engine, pids: set[int], *, limite_s: float = SEGUNDOS_LIMITE
) -> None:
    """Espera, observando o PostgreSQL, ate a perdedora (uma das conexoes em
    `pids`) esperar o `transactionid` da vencedora.

    `wait_event_type = 'Lock'` + `wait_event = 'transactionid'` e a espera de
    uma insercao num indice unico por uma chave que outra transacao ainda
    pode confirmar; qualquer outra trava (relacao, advisory, tupla) ou
    qualquer outra conexao nao serve de prova. Sem adivinhar quanto tempo isso
    leva. `AUTOCOMMIT` porque `pg_stat_activity` e fotografada por transacao:
    numa transacao aberta a espera nunca apareceria.
    """
    limite = time.monotonic() + limite_s
    consulta = text(
        "SELECT count(*) FROM pg_stat_activity "
        "WHERE pid = ANY(CAST(:pids AS integer[])) AND pid <> pg_backend_pid() "
        "AND wait_event_type = 'Lock' AND wait_event = 'transactionid'"
    )
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as monitor:
        while time.monotonic() < limite:
            if monitor.execute(consulta, {"pids": sorted(pids)}).scalar_one():
                return
            threading.Event().wait(INTERVALO_DA_OBSERVACAO)
    pytest.fail("a perdedora nunca ficou bloqueada no indice unico da vencedora")


def _cancelar_conexoes(engine: Engine, pids: set[int]) -> None:
    """Cancela a consulta em curso dessas conexoes, para que uma perdedora que
    estourou o teto nao fique presa depois do teste."""
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as monitor:
        monitor.execute(
            text(
                "SELECT pg_cancel_backend(pid) FROM pg_stat_activity "
                "WHERE pid = ANY(CAST(:pids AS integer[])) AND pid <> pg_backend_pid()"
            ),
            {"pids": sorted(pids)},
        )


def _disputar(
    cenario: Cenario,
    ganha: int,
    chave: str,
    perdedora: Callable[[], str],
    *,
    vencedora_confirma: bool,
) -> str:
    """A vencedora segura a chave SEM commitar; a perdedora (numa thread) e
    observada bloqueada no indice unico; so entao a vencedora commita ou
    desfaz."""
    resultado: list[str] = []

    def rodar() -> None:
        try:
            resultado.append(perdedora())
        except Exception as erro:
            resultado.append(f"excecao inesperada: {erro!r}")

    thread = threading.Thread(target=rodar)
    vencedora = cenario.sessao()
    try:
        concluir_missao(
            vencedora, ESTUDANTE, ganha, chave, clock=_relogio, evidencia=TEXTO
        )
        with _conexoes_da_perdedora(cenario.engine) as pids:
            thread.start()
            try:
                _esperar_a_perdedora_na_unique(cenario.engine, pids)
                if vencedora_confirma:
                    vencedora.commit()
                else:
                    vencedora.rollback()
            finally:
                vencedora.close()
                thread.join(timeout=SEGUNDOS_LIMITE)
                if thread.is_alive():
                    _cancelar_conexoes(cenario.engine, pids)
                    thread.join(timeout=SEGUNDOS_LIMITE)
    finally:
        vencedora.close()
    assert not thread.is_alive(), "a perdedora ficou presa"
    assert len(resultado) == 1
    return resultado[0]


def _perdedora_no_servico(
    cenario: Cenario, perde: int, chave: str
) -> Callable[[], str]:
    def perder() -> str:
        with cenario.sessao() as sessao:
            try:
                concluir_missao(
                    sessao,
                    ESTUDANTE,
                    perde,
                    chave,
                    clock=_relogio,
                    evidencia=COM_LINK,
                )
                sessao.commit()
            except OperacaoReutilizadaError:
                sessao.rollback()
                return "chave gasta"
            return "concluiu"

    return perder


def test_vencedora_commita_a_perdedora_bloqueada_recebe_a_chave_gasta(
    cenario: Cenario,
) -> None:
    ganha, perde = cenario.avulsa(), cenario.avulsa()

    resultado = _disputar(
        cenario,
        ganha,
        "op-disputada",
        _perdedora_no_servico(cenario, perde, "op-disputada"),
        vencedora_confirma=True,
    )

    assert resultado == "chave gasta"
    assert _resumo(cenario, ganha, perde) == {
        "estados": {ganha: MissionState.CONCLUIDA, perde: MissionState.PENDENTE},
        "operacoes": [("op-disputada", ganha, "complete")],
        "evidencias": [(ganha, "Feito")],
        "xp": [(ganha, XP_DA_AVULSA)],
    }


def test_vencedora_desfaz_a_perdedora_bloqueada_conclui_e_so_ela_deixa_efeito(
    cenario: Cenario,
) -> None:
    """O outro desfecho do mesmo entrelacamento: a chave SOLTA, e quem estava
    preso segue em frente. Um so efeito, agora da perdedora."""
    ganha, perde = cenario.avulsa(), cenario.avulsa()

    resultado = _disputar(
        cenario,
        ganha,
        "op-disputada",
        _perdedora_no_servico(cenario, perde, "op-disputada"),
        vencedora_confirma=False,
    )

    assert resultado == "concluiu"
    assert _resumo(cenario, ganha, perde) == {
        "estados": {ganha: MissionState.PENDENTE, perde: MissionState.CONCLUIDA},
        "operacoes": [("op-disputada", perde, "complete")],
        "evidencias": [(perde, "Feito")],
        "xp": [(perde, XP_DA_AVULSA)],
    }


def _perdedora_na_api(cliente: TestClient, perde: int, chave: str) -> Callable[[], str]:
    def perder() -> str:
        resposta = cliente.post(
            f"/api/missions/{perde}/complete",
            json={
                "operation_id": chave,
                "evidence": {"text": COM_LINK.texto, "link": COM_LINK.link},
            },
        )
        corpo = resposta.json()
        return f"{resposta.status_code} {corpo.get('code', corpo.get('state'))}"

    return perder


def test_a_api_responde_409_a_perdedora_bloqueada_e_o_banco_fica_so_com_a_vencedora(
    cenario: Cenario, cliente: TestClient
) -> None:
    ganha, perde = cenario.avulsa(), cenario.avulsa()

    resultado = _disputar(
        cenario,
        ganha,
        "op-disputada",
        _perdedora_na_api(cliente, perde, "op-disputada"),
        vencedora_confirma=True,
    )

    assert resultado == "409 operacao_reutilizada"
    assert _resumo(cenario, ganha, perde) == {
        "estados": {ganha: MissionState.CONCLUIDA, perde: MissionState.PENDENTE},
        "operacoes": [("op-disputada", ganha, "complete")],
        "evidencias": [(ganha, "Feito")],
        "xp": [(ganha, XP_DA_AVULSA)],
    }


def test_a_api_responde_200_a_perdedora_quando_a_vencedora_desfaz(
    cenario: Cenario, cliente: TestClient
) -> None:
    ganha, perde = cenario.avulsa(), cenario.avulsa()

    resultado = _disputar(
        cenario,
        ganha,
        "op-disputada",
        _perdedora_na_api(cliente, perde, "op-disputada"),
        vencedora_confirma=False,
    )

    assert resultado == "200 concluida"
    assert _resumo(cenario, ganha, perde) == {
        "estados": {ganha: MissionState.PENDENTE, perde: MissionState.CONCLUIDA},
        "operacoes": [("op-disputada", perde, "complete")],
        "evidencias": [(perde, "Feito")],
        "xp": [(perde, XP_DA_AVULSA)],
    }


def test_a_api_tem_um_so_efeito_quando_a_chave_e_gasta_em_sequencia(
    cenario: Cenario, cliente: TestClient
) -> None:
    """Sem disputa nenhuma: o 409 sequencial tambem nao mexe no que o 200 gravou."""
    ganha, perde = cenario.avulsa(), cenario.avulsa()
    primeira = cliente.post(
        f"/api/missions/{ganha}/complete",
        json={"operation_id": "op-x", "evidence": {"text": "Feito"}},
    )
    assert primeira.status_code == 200, primeira.text
    depois_da_primeira = cenario.foto()

    segunda = cliente.post(
        f"/api/missions/{perde}/complete",
        json={"operation_id": "op-x", "evidence": {"text": "Feito"}},
    )

    assert (segunda.status_code, segunda.json()["code"]) == OUTRO_PEDIDO
    assert cenario.foto() == depois_da_primeira


# ---------------------------------------------------------------------------
# A prova de bloqueio so vale se o filtro dela nao aceita qualquer espera
# ---------------------------------------------------------------------------

CHAVE_ADVISORY = 424242


def test_a_espera_nao_aceita_trava_que_nao_e_a_do_indice_unico(
    cenario: Cenario,
) -> None:
    """Uma conexao bloqueada em `wait_event = 'advisory'` (tambem do tipo
    `Lock`) NAO prova que a perdedora chegou a UNIQUE: o filtro exige
    `transactionid` e o teto estoura em vez de aceitar a espera errada."""
    with cenario.engine.connect().execution_options(
        isolation_level="AUTOCOMMIT"
    ) as dona:
        dona.execute(text("SELECT pg_advisory_lock(:k)"), {"k": CHAVE_ADVISORY})
        try:
            with _conexoes_da_perdedora(cenario.engine) as pids:

                def esperar_a_trava() -> None:
                    with cenario.engine.connect().execution_options(
                        isolation_level="AUTOCOMMIT"
                    ) as presa:
                        presa.execute(
                            text("SELECT pg_advisory_lock(:k)"), {"k": CHAVE_ADVISORY}
                        )
                        presa.execute(
                            text("SELECT pg_advisory_unlock(:k)"),
                            {"k": CHAVE_ADVISORY},
                        )

                thread = threading.Thread(target=esperar_a_trava)
                thread.start()
                try:
                    with pytest.raises(pytest.fail.Exception):
                        _esperar_a_perdedora_na_unique(
                            cenario.engine, pids, limite_s=0.5
                        )
                finally:
                    dona.execute(
                        text("SELECT pg_advisory_unlock(:k)"), {"k": CHAVE_ADVISORY}
                    )
                    thread.join(timeout=SEGUNDOS_LIMITE)
                assert not thread.is_alive()
        finally:
            dona.execute(text("SELECT pg_advisory_unlock_all()"))


def test_a_espera_nao_aceita_um_pid_que_nao_e_o_da_perdedora(
    cenario: Cenario,
) -> None:
    """Sem nenhuma conexao registrada, o filtro nao ve espera alguma."""
    with pytest.raises(pytest.fail.Exception):
        _esperar_a_perdedora_na_unique(cenario.engine, set(), limite_s=0.3)


def test_cancelar_conexoes_solta_a_perdedora_presa(cenario: Cenario) -> None:
    desfecho: list[str] = []

    def dormir() -> None:
        try:
            with cenario.engine.connect() as presa:
                presa.execute(text("SELECT pg_sleep(60)"))
            desfecho.append("terminou")
        except Exception as erro:
            desfecho.append(type(erro.__cause__ or erro).__name__)

    with _conexoes_da_perdedora(cenario.engine) as pids:
        thread = threading.Thread(target=dormir)
        thread.start()
        limite = time.monotonic() + SEGUNDOS_LIMITE
        while not pids and time.monotonic() < limite:
            threading.Event().wait(INTERVALO_DA_OBSERVACAO)
        # A consulta so e cancelavel depois de comecar: espere o pg_sleep.
        with cenario.engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as monitor:
            while (
                time.monotonic() < limite
                and not monitor.execute(
                    text(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE pid = ANY(CAST(:p AS integer[])) "
                        "AND query LIKE '%pg_sleep%' AND state = 'active'"
                    ),
                    {"p": sorted(pids)},
                ).scalar_one()
            ):
                threading.Event().wait(INTERVALO_DA_OBSERVACAO)
        _cancelar_conexoes(cenario.engine, pids)
        thread.join(timeout=SEGUNDOS_LIMITE)

    assert not thread.is_alive()
    assert desfecho == ["QueryCanceled"]
