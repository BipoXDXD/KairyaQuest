"""A Kairya propoe reagendar, e a confirmacao executa (F14-F17).

Tres blocos, com tres redes de protecao diferentes:

- **A proposta** passa pelo `transmitir`, que grava em sessoes proprias e
  COMMITA: as missoes e as mensagens criadas aqui vao para o `Registro`, que
  apaga so o que o teste criou (mensagens primeiro, porque a acao executada
  aponta para a missao sem CASCADE).
- **A confirmacao no servico** roda na fixture `session`, revertida no fim.
- **A API e a concorrencia** commitam de verdade -- o `falhou` gravado antes
  do 409/422 e a disputa de travas so existem com commit -- e usam o
  `Registro` tambem.
"""

import threading
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.core.errors import OperacaoReutilizadaError
from focusquest.main import CodigoDeErro, app
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
    MissionReschedule,
    User,
    WeeklyPlan,
)
from focusquest.modules.missions.service import (
    criar_missao,
    iniciar_missao,
    reagendar_missao,
)
from focusquest.modules.tutoring.domain import (
    PRAZO_EXPIRADO,
    REAGENDAMENTO_INVALIDO,
    CodigoDoStream,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import (
    Executada,
    ParaGerar,
    PrazoExpirado,
    ReagendamentoInvalido,
    RespostaConcluida,
    RespostaFalhou,
    Tutoria,
    confirmar_acao,
    preparar_turno,
    rejeitar_acao,
    transmitir,
)
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

ESTUDANTE = 1
# Um usuario so deste arquivo, criado com commit e apagado na limpeza: o `2`
# dos outros arquivos vive dentro da transacao revertida deles.
ALHEIO = 9107
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
PRAZO_ATUAL = AGORA + timedelta(days=2)
NOVO_PRAZO = AGORA + timedelta(days=5)
# Uma semana so deste arquivo para a diaria commitada, longe das semanas dos
# outros testes (a UNIQUE e por usuario e semana).
SEGUNDA_DO_PLANO = date(2032, 3, 1)
NA_SEMANA_DO_PLANO = datetime(2032, 3, 1, 15, tzinfo=UTC)
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


class Registro:
    """O que o teste commitou, para a limpeza apagar SO isso."""

    def __init__(self) -> None:
        self.cids: list[str] = []
        self.missoes: list[int] = []
        self.planos: list[int] = []
        self.usuarios: list[int] = []

    def cid(self, sufixo: str) -> str:
        valor = f"reagendamento-{sufixo}"
        self.cids.append(valor)
        return valor


@pytest.fixture
def registro(banco_migrado: Engine) -> Iterator[Registro]:
    criado = Registro()
    try:
        yield criado
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            limpeza.execute(
                delete(TutorMessage).where(
                    TutorMessage.client_message_id.in_(criado.cids)
                )
            )
            limpeza.execute(delete(Mission).where(Mission.id.in_(criado.missoes)))
            limpeza.execute(delete(Mission).where(Mission.plan_id.in_(criado.planos)))
            limpeza.execute(delete(WeeklyPlan).where(WeeklyPlan.id.in_(criado.planos)))
            limpeza.execute(delete(User).where(User.id.in_(criado.usuarios)))
            limpeza.commit()


def _avulsa(session: Session, user_id: int = ESTUDANTE) -> Mission:
    return criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=2,
        estimated_minutes=30,
        deadline=PRAZO_ATUAL,
    )


def _entrada(mission_id: int, **ajustes: Any) -> dict[str, Any]:
    """A entrada de `reschedule_mission` como o modelo a manda."""
    entrada: dict[str, Any] = {
        "mission_id": mission_id,
        "new_deadline": "2026-09-24T09:00:00-03:00",  # = NOVO_PRAZO
        "reason": "falta_de_tempo",
    }
    return entrada | ajustes


# --- A proposta (transmitir) -----------------------------------------------


def _missao_commitada(
    fabrica: sessionmaker[Session], registro: Registro, **ajustes: Any
) -> int:
    with fabrica() as sessao:
        missao = _avulsa(sessao, **ajustes)
        sessao.commit()
    registro.missoes.append(missao.id)
    return missao.id


def _alvo(kind: str, fabrica: sessionmaker[Session], registro: Registro) -> int:
    """O `mission_id` de cada pre-condicao que a proposta recusa (F16)."""
    if kind == "inexistente":
        return 2**31 - 1
    if kind == "concluida":
        with fabrica() as sessao:
            missao = _avulsa(sessao)
            # Direto no estado, sem `concluir_missao`: a conclusao creditaria
            # XP commitado ao estudante, e nada aqui depende disso.
            missao.state = MissionState.CONCLUIDA
            missao.completed_at = AGORA
            sessao.commit()
        registro.missoes.append(missao.id)
        return missao.id
    if kind == "alheia":
        with fabrica() as sessao:
            sessao.add(User(id=ALHEIO, display_name="Outra pessoa"))
            sessao.commit()
        registro.usuarios.append(ALHEIO)
        return _missao_commitada(fabrica, registro, user_id=ALHEIO)
    assert kind == "diaria"
    with fabrica() as sessao:
        plano_id = _plano(sessao)
        sessao.commit()
        registro.planos.append(plano_id)
        return _diaria_do_plano(sessao, plano_id)


def _plano(sessao: Session) -> int:
    """Cria o plano da semana deste arquivo e devolve o id dele."""
    criar_plano(
        sessao,
        user_id=ESTUDANTE,
        semana=SEGUNDA_DO_PLANO,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=relogio(NA_SEMANA_DO_PLANO),
    )
    return sessao.scalars(
        select(WeeklyPlan.id).where(
            WeeklyPlan.user_id == ESTUDANTE,
            WeeklyPlan.week_start == SEGUNDA_DO_PLANO,
        )
    ).one()


def _diaria_do_plano(sessao: Session, plano_id: int) -> int:
    return sessao.scalars(
        select(Mission.id).where(
            Mission.plan_id == plano_id,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == SEGUNDA_DO_PLANO,
        )
    ).one()


def _turno(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    chamada: ChamadaDeFerramenta,
    sufixo: str,
    stop_reason: Literal["end_turn", "tool_use", "max_tokens"] | None = None,
) -> tuple[int, list[Any]]:
    """Prepara, commita e transmite um turno cujo modelo chama `chamada`."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Vamos mover.",)), chamada), stop_reason=stop_reason
    )
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=registro.cid(sufixo),
            conteudo="Estou sem tempo esta semana",
            tutoria=tutoria,
            clock=relogio(AGORA),
        )
        sessao.commit()
    assert isinstance(preparo, ParaGerar)
    eventos = list(transmitir(fabrica, preparo, tutoria, clock=relogio(AGORA)))
    return preparo.resposta_id, eventos


def _resposta(fabrica: sessionmaker[Session], resposta_id: int) -> TutorMessage:
    with fabrica() as sessao:
        resposta = sessao.get(TutorMessage, resposta_id)
        assert resposta is not None
        return resposta


def _historico_de(engine: Engine, mission_id: int) -> list[MissionReschedule]:
    with Session(bind=engine) as sessao:
        return list(
            sessao.scalars(
                select(MissionReschedule)
                .where(MissionReschedule.mission_id == mission_id)
                .order_by(MissionReschedule.id)
            )
        )


def test_a_proposta_valida_vira_acao_com_o_retrato_e_nao_muda_nada(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
) -> None:
    mission_id = _missao_commitada(fabrica, registro)
    _, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(_entrada(mission_id), nome="reschedule_mission"),
        "valida",
    )
    final = eventos[-1]
    assert isinstance(final, RespostaConcluida)
    (acao,) = final.mensagem.actions
    assert acao.kind is TipoDeAcao.REAGENDAR_MISSAO
    assert acao.state is EstadoDaAcao.PROPOSTA
    assert acao.mission_id is None
    # A entrada normalizada para UTC e o retrato escrito pelo backend (F16).
    assert acao.payload == {
        "mission_id": mission_id,
        "new_deadline": "2026-09-24T12:00:00Z",
        "reason": "falta_de_tempo",
        "instructions": "Ler o capitulo 3",
        "previous_deadline": "2026-09-21T12:00:00Z",
    }
    # Propor nao muda nada (F15).
    with fabrica() as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        assert missao.deadline == PRAZO_ATUAL
    assert _historico_de(banco_migrado, mission_id) == []


def test_a_proposta_de_em_andamento_tambem_vale(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
) -> None:
    """F8: a `em_andamento` se reagenda; a pre-condicao so recusa a concluida."""
    mission_id = _missao_commitada(fabrica, registro)
    with fabrica() as sessao:
        iniciar_missao(
            sessao, ESTUDANTE, mission_id, "op-inicio-t7", clock=relogio(AGORA)
        )
        sessao.commit()
    _, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(_entrada(mission_id), nome="reschedule_mission"),
        "em-andamento",
    )
    assert isinstance(eventos[-1], RespostaConcluida)


def test_a_proposta_cortada_por_max_tokens_nao_vira_acao(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
) -> None:
    """O corte por `max_tokens` descarta QUALQUER proposta, e nao so a de
    criacao: a entrada de `reschedule_mission` pode ter chegado pela metade.
    O pior caso de proposito, como no teste da criacao: um bloco completo e
    valido, com a pre-condicao satisfeita, seguido do corte -- so a guarda do
    corte impede a acao. A resposta fica `interrompida`, com o texto parcial,
    e a missao nao muda."""
    mission_id = _missao_commitada(fabrica, registro)
    resposta_id, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(_entrada(mission_id), nome="reschedule_mission"),
        "cortada",
        stop_reason="max_tokens",
    )
    final = eventos[-1]
    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.INTERROMPIDA
    assert final.mensagem.content == "Vamos mover."
    assert final.mensagem.actions == []
    assert _resposta(fabrica, resposta_id).actions == []
    with fabrica() as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        assert missao.deadline == PRAZO_ATUAL
    assert _historico_de(banco_migrado, mission_id) == []


@pytest.mark.parametrize(
    "entrada",
    [
        pytest.param({"reason": None}, id="sem_motivo"),
        pytest.param({"new_deadline": "2026-09-24T09:00:00"}, id="sem_fuso"),
        pytest.param({"mission_id": True}, id="mission_id_booleano"),
        # O modelo tentando escrever o retrato: recusado, nunca gravado (F16).
        pytest.param({"previous_deadline": "2026-09-30T12:00:00Z"}, id="retrato_prev"),
        pytest.param({"instructions": "Outra coisa"}, id="retrato_instrucao"),
    ],
)
def test_a_proposta_fora_do_esquema_e_proposta_invalida(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    entrada: dict[str, Any],
) -> None:
    mission_id = _missao_commitada(fabrica, registro)
    corpo = {k: v for k, v in (_entrada(mission_id) | entrada).items() if v is not None}
    resposta_id, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(corpo, nome="reschedule_mission"),
        "fora-do-esquema",
    )
    assert eventos[-1] == RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
    vista = _resposta(fabrica, resposta_id)
    assert (vista.status, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "proposta_invalida",
    )
    assert vista.content == "Vamos mover."
    assert vista.actions == []


@pytest.mark.parametrize("kind", ["concluida", "alheia", "inexistente", "diaria"])
def test_a_pre_condicao_recusa_e_nenhuma_acao_nasce(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    kind: str,
) -> None:
    """F16: propor mudar a missao que nao existe, alheia, concluida ou de
    prazo derivado e saida invalida do modelo. O `error` sai DEPOIS de a falha
    estar gravada, como toda falha do stream."""
    mission_id = _alvo(kind, fabrica, registro)
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Vamos mover.",)),
            ChamadaDeFerramenta(_entrada(mission_id), nome="reschedule_mission"),
        )
    )
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=registro.cid(f"pre-{kind}"),
            conteudo="Estou sem tempo",
            tutoria=tutoria,
            clock=relogio(AGORA),
        )
        sessao.commit()
    assert isinstance(preparo, ParaGerar)
    resposta_id = preparo.resposta_id
    eventos = []
    for evento in transmitir(fabrica, preparo, tutoria, clock=relogio(AGORA)):
        eventos.append(evento)
        if isinstance(evento, RespostaFalhou):
            # No instante do `error`, a falha ja esta gravada.
            vista = _resposta(fabrica, resposta_id)
            assert vista.status is StatusDaMensagem.FALHOU
            assert vista.error_code == "proposta_invalida"
            assert vista.content == "Vamos mover."
            assert vista.actions == []
    # E ele e o ultimo evento: nada de `done` depois.
    assert eventos[-1] == RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
    assert not any(isinstance(e, RespostaConcluida) for e in eventos)


CRIACAO = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo de uma pagina",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-20T12:00:00+00:00",
}


@pytest.mark.parametrize("formato", ["reagendamento", "criacao"])
def test_ferramenta_desconhecida_e_proposta_invalida(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
    formato: str,
) -> None:
    """F18: nome fora das duas e `proposta_invalida` QUALQUER que seja a
    entrada -- inclusive uma que valeria como criacao."""
    mission_id = _missao_commitada(fabrica, registro)
    entrada = _entrada(mission_id) if formato == "reagendamento" else CRIACAO
    resposta_id, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(entrada, nome="split_mission"),
        f"desconhecida-{formato}",
    )
    assert eventos[-1] == RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
    assert _resposta(fabrica, resposta_id).actions == []


def test_a_entrada_de_criacao_na_ferramenta_de_reagendar_nao_vira_criacao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    registro: Registro,
) -> None:
    """Antes, a entrada era validada como
    `MissionCreate` sem olhar o nome -- uma chamada de `reschedule_mission`
    com corpo de criacao viraria uma acao `create_mission`."""
    resposta_id, eventos = _turno(
        fabrica,
        tutoria,
        falso,
        registro,
        ChamadaDeFerramenta(CRIACAO, nome="reschedule_mission"),
        "criacao-trocada",
    )
    assert eventos[-1] == RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
    assert _resposta(fabrica, resposta_id).actions == []


# --- A confirmacao (servico, sessao revertida) -----------------------------


def _proposta(
    session: Session,
    mission_id: int,
    *,
    novo: datetime = NOVO_PRAZO,
    motivo: str = "falta_de_tempo",
    cid: str = "reag-1",
    retrato: dict[str, Any] | None = None,
) -> TutorAction:
    """A acao como o `_completar` a grava: entrada normalizada + retrato."""
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.USUARIO,
        content="estou sem tempo",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=cid,
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.TUTORA,
        content="Vamos mover.",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    payload = {
        "mission_id": mission_id,
        "new_deadline": novo.isoformat(),
        "reason": motivo,
        "instructions": "Ler o capitulo 3",
        "previous_deadline": PRAZO_ATUAL.isoformat(),
    } | (retrato or {})
    acao = TutorAction(
        message_id=resposta.id,
        kind=TipoDeAcao.REAGENDAR_MISSAO,
        payload=payload,
        state=EstadoDaAcao.PROPOSTA,
        created_at=AGORA,
    )
    session.add(acao)
    session.flush()
    return acao


def _confirmar(
    session: Session, acao_id: int, op: str, agora: datetime = AGORA
) -> Executada | PrazoExpirado | ReagendamentoInvalido:
    return confirmar_acao(session, ESTUDANTE, acao_id, op, clock=relogio(agora))


def _linhas(session: Session, mission_id: int) -> list[MissionReschedule]:
    return list(
        session.scalars(
            select(MissionReschedule)
            .where(MissionReschedule.mission_id == mission_id)
            .order_by(MissionReschedule.id)
        )
    )


def test_confirmar_reagenda_pela_kairya(session: Session) -> None:
    missao = _avulsa(session)
    acao = _proposta(session, missao.id)
    resultado = _confirmar(session, acao.id, "op-t7-1")

    assert isinstance(resultado, Executada)
    assert resultado.missao.id == missao.id
    assert resultado.missao.deadline == NOVO_PRAZO
    (linha,) = _linhas(session, missao.id)
    assert linha.origin is OrigemDoReagendamento.KAIRYA
    assert linha.operation_id == "op-t7-1"
    assert linha.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
    assert (linha.previous_deadline, linha.new_deadline) == (PRAZO_ATUAL, NOVO_PRAZO)
    assert resultado.acao.state is EstadoDaAcao.EXECUTADA
    assert resultado.acao.mission_id == missao.id
    assert resultado.acao.operation_id == "op-t7-1"
    assert resultado.acao.decided_at == AGORA
    assert resultado.acao.error_code is None


def test_o_retrato_nao_decide_nada(session: Session) -> None:
    """O retrato e so o que a pessoa viu: o `previous_deadline` gravado no
    historico e o prazo REAL da hora da confirmacao, e um retrato adulterado
    nao muda a missao alvo."""
    missao = _avulsa(session)
    acao = _proposta(
        session,
        missao.id,
        retrato={"previous_deadline": "2020-01-01T00:00:00Z", "instructions": "x"},
    )
    assert isinstance(_confirmar(session, acao.id, "op-t7-r"), Executada)
    (linha,) = _linhas(session, missao.id)
    assert linha.previous_deadline == PRAZO_ATUAL


def test_reenvio_da_confirmacao_executada_nao_duplica(session: Session) -> None:
    missao = _avulsa(session)
    acao = _proposta(session, missao.id)
    primeira = _confirmar(session, acao.id, "op-t7-2")
    # Mesmo depois de o novo prazo passar: o reenvio e o resultado de antes.
    segunda = _confirmar(session, acao.id, "op-t7-2", agora=NOVO_PRAZO + timedelta(1))
    assert isinstance(primeira, Executada) and isinstance(segunda, Executada)
    assert segunda.missao.id == primeira.missao.id
    assert len(_linhas(session, missao.id)) == 1
    with pytest.raises(TransicaoIlegalError, match="executada"):
        _confirmar(session, acao.id, "op-t7-3")


def test_prazo_proposto_ja_passado_grava_falhou(session: Session) -> None:
    missao = _avulsa(session)
    acao = _proposta(session, missao.id, novo=AGORA)  # no limite: vencido
    resultado = _confirmar(session, acao.id, "op-t7-4")
    assert isinstance(resultado, PrazoExpirado)
    assert (resultado.acao.state, resultado.acao.error_code) == (
        EstadoDaAcao.FALHOU,
        PRAZO_EXPIRADO,
    )
    assert resultado.acao.operation_id == "op-t7-4"
    assert resultado.acao.decided_at == AGORA
    assert resultado.acao.mission_id is None
    assert missao.deadline == PRAZO_ATUAL
    assert _linhas(session, missao.id) == []
    assert isinstance(_confirmar(session, acao.id, "op-t7-4"), PrazoExpirado)
    with pytest.raises(TransicaoIlegalError):
        _confirmar(session, acao.id, "op-t7-5")


def _concluir_direto(session: Session, missao: Mission) -> None:
    missao.state = MissionState.CONCLUIDA
    missao.completed_at = AGORA
    session.flush()


def _reagendar_pela_tela_para_o_mesmo(session: Session, missao: Mission) -> None:
    reagendar_missao(
        session,
        ESTUDANTE,
        missao.id,
        "op-tela",
        novo_prazo=NOVO_PRAZO,
        motivo=MotivoDoReagendamento.DIFICULDADE,
        origem=OrigemDoReagendamento.USUARIO,
        clock=relogio(AGORA),
    )


def _apagar(session: Session, missao: Mission) -> None:
    session.delete(missao)
    session.flush()


def _passar_para_outro(session: Session, missao: Mission) -> None:
    session.add(User(id=ALHEIO, display_name="Outra pessoa"))
    session.flush()
    missao.user_id = ALHEIO
    session.flush()


@pytest.mark.parametrize(
    ("mudanca", "linhas_depois"),
    [
        pytest.param(_concluir_direto, 0, id="concluida"),
        pytest.param(_reagendar_pela_tela_para_o_mesmo, 1, id="prazo_ja_igual"),
        pytest.param(_apagar, 0, id="apagada"),
        pytest.param(_passar_para_outro, 0, id="alheia"),
    ],
)
def test_a_missao_mudou_depois_da_proposta(
    session: Session,
    mudanca: Callable[[Session, Mission], None],
    linhas_depois: int,
) -> None:
    """F17: a confirmacao revalida tudo; o que nao vale mais vira
    `falhou`/`reagendamento_invalido`, e o reenvio da o mesmo resultado."""
    missao = _avulsa(session)
    mission_id = missao.id
    acao = _proposta(session, mission_id)
    mudanca(session, missao)

    resultado = _confirmar(session, acao.id, "op-t7-6")
    assert isinstance(resultado, ReagendamentoInvalido)
    assert (resultado.acao.state, resultado.acao.error_code) == (
        EstadoDaAcao.FALHOU,
        REAGENDAMENTO_INVALIDO,
    )
    assert resultado.acao.operation_id == "op-t7-6"
    assert resultado.acao.mission_id is None
    # Nenhuma linha da Kairya: so a da tela, quando a mudanca foi ela.
    assert len(_linhas(session, mission_id)) == linhas_depois
    assert isinstance(_confirmar(session, acao.id, "op-t7-6"), ReagendamentoInvalido)
    with pytest.raises(TransicaoIlegalError):
        _confirmar(session, acao.id, "op-t7-7")


def test_a_diaria_na_confirmacao_e_reagendamento_invalido(session: Session) -> None:
    """Um payload que aponte para uma diaria (a proposta nunca grava isso,
    mas a confirmacao nao confia no payload): `PrazoDerivadoError` tambem vira
    `reagendamento_invalido`."""
    diaria_id = _diaria_do_plano(session, _plano(session))
    acao = _proposta(session, diaria_id, novo=NA_SEMANA_DO_PLANO + timedelta(days=9))
    resultado = _confirmar(session, acao.id, "op-t7-d", agora=NA_SEMANA_DO_PLANO)
    assert isinstance(resultado, ReagendamentoInvalido)


def test_chave_gasta_num_inicio_e_operacao_reutilizada(session: Session) -> None:
    """A chave da confirmacao ja nomeou uma operacao de missao: 409, e a acao
    continua `proposta` (nada gravado)."""
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-gasta", clock=relogio(AGORA))
    acao = _proposta(session, missao.id)
    with pytest.raises(OperacaoReutilizadaError, match="op-gasta"):
        _confirmar(session, acao.id, "op-gasta")
    session.refresh(acao)
    assert acao.state is EstadoDaAcao.PROPOSTA
    assert acao.operation_id is None
    assert _linhas(session, missao.id) == []


def test_chave_gasta_num_reagendamento_identico_da_tela_e_reutilizada(
    session: Session,
) -> None:
    """A mesma chave, a mesma missao, o mesmo prazo e o mesmo motivo, gastos
    pela TELA: o `reagendar_missao` trataria como reenvio e devolveria a
    missao sem gravar, e a acao se diria executada por um reagendamento que a
    pessoa fez sozinha (`origin = usuario`). E chave gasta."""
    missao = _avulsa(session)
    reagendar_missao(
        session,
        ESTUDANTE,
        missao.id,
        "op-da-tela",
        novo_prazo=NOVO_PRAZO,
        motivo=MotivoDoReagendamento.FALTA_DE_TEMPO,
        origem=OrigemDoReagendamento.USUARIO,
        clock=relogio(AGORA),
    )
    acao = _proposta(session, missao.id)
    with pytest.raises(OperacaoReutilizadaError, match="op-da-tela"):
        _confirmar(session, acao.id, "op-da-tela")
    assert [linha.origin for linha in _linhas(session, missao.id)] == [
        OrigemDoReagendamento.USUARIO
    ]


def test_confirmar_em_andamento_continua_em_andamento(session: Session) -> None:
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-inicio", clock=relogio(AGORA))
    acao = _proposta(session, missao.id)
    resultado = _confirmar(session, acao.id, "op-t7-8")
    assert isinstance(resultado, Executada)
    assert resultado.missao.state is MissionState.EM_ANDAMENTO


def test_a_criacao_continua_pelo_caminho_de_antes(session: Session) -> None:
    """O despacho pelo `kind` nao desvia a `create_mission`."""
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.USUARIO,
        content="me da uma missao",
        status=StatusDaMensagem.COMPLETA,
        client_message_id="criar-t7",
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.TUTORA,
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    acao = TutorAction(
        message_id=resposta.id,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={
            "instructions": "Ler o capitulo 4",
            "completion_criterion": "Resumo",
            "difficulty": 2,
            "estimated_minutes": 30,
            "deadline": NOVO_PRAZO.isoformat(),
        },
        state=EstadoDaAcao.PROPOSTA,
        created_at=AGORA,
    )
    session.add(acao)
    session.flush()
    resultado = _confirmar(session, acao.id, "op-criar-t7")
    assert isinstance(resultado, Executada)
    assert resultado.missao.instructions == "Ler o capitulo 4"
    assert _linhas(session, resultado.missao.id) == []


# --- A API (com commit de verdade) -----------------------------------------


@pytest.fixture
def api(banco_migrado: Engine) -> Iterator[TestClient]:
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: banco_migrado,
        get_clock: lambda: lambda: AGORA,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app) as c:
        yield c
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


def _proposta_commitada(
    engine: Engine, registro: Registro, sufixo: str, **ajustes: Any
) -> tuple[int, int]:
    """Uma missao e uma proposta de reagendamento dela, commitadas."""
    with Session(bind=engine, expire_on_commit=False) as sessao:
        missao = _avulsa(sessao)
        acao = _proposta(sessao, missao.id, cid=registro.cid(sufixo), **ajustes)
        sessao.commit()
    registro.missoes.append(missao.id)
    return missao.id, acao.id


def _acao_na_conversa(api: TestClient, acao_id: int) -> dict[str, Any]:
    """A acao como a tela a rele depois do erro: `GET /api/tutoring/messages`."""
    acoes = [
        acao
        for mensagem in api.get("/api/tutoring/messages").json()
        for acao in mensagem["actions"]
        if acao["id"] == acao_id
    ]
    (acao,) = acoes
    encontrada: dict[str, Any] = acao
    return encontrada


def test_api_confirma_e_devolve_a_missao_reagendada(
    api: TestClient, banco_migrado: Engine, registro: Registro
) -> None:
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "api-ok")
    url = f"/api/tutoring/actions/{acao_id}/confirm"
    resposta = api.post(url, json={"operation_id": "op-api-t7"})
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["action"]["kind"] == "reschedule_mission"
    assert corpo["action"]["state"] == "executada"
    assert corpo["action"]["mission_id"] == mission_id
    assert corpo["mission"]["id"] == mission_id
    assert corpo["mission"]["deadline"] == "2026-09-24T12:00:00Z"
    assert corpo["mission"]["reschedules"] == [
        {
            "previous_deadline": "2026-09-21T12:00:00Z",
            "new_deadline": "2026-09-24T12:00:00Z",
            "reason": "falta_de_tempo",
            "origin": "tifa",
            "rescheduled_at": "2026-09-19T12:00:00Z",
        }
    ]
    # O reenvio e o mesmo corpo, sem linha nova.
    assert api.post(url, json={"operation_id": "op-api-t7"}).json() == corpo
    assert len(_historico_de(banco_migrado, mission_id)) == 1


def test_api_reagendamento_invalido_e_409_com_a_falha_ja_gravada(
    api: TestClient, banco_migrado: Engine, registro: Registro
) -> None:
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "api-409")
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        missao.state = MissionState.CONCLUIDA
        missao.completed_at = AGORA
        sessao.commit()
    url = f"/api/tutoring/actions/{acao_id}/confirm"
    resposta = api.post(url, json={"operation_id": "op-api-409"})
    assert resposta.status_code == 409
    assert resposta.json()["code"] == "reagendamento_invalido"
    acao = _acao_na_conversa(api, acao_id)
    assert (acao["state"], acao["error_code"]) == ("falhou", "reagendamento_invalido")
    # O reenvio devolve o mesmo erro.
    de_novo = api.post(url, json={"operation_id": "op-api-409"})
    assert (de_novo.status_code, de_novo.json()["code"]) == (
        409,
        "reagendamento_invalido",
    )
    assert _historico_de(banco_migrado, mission_id) == []


def test_api_prazo_expirado_e_422_com_a_falha_ja_gravada(
    api: TestClient, banco_migrado: Engine, registro: Registro
) -> None:
    mission_id, acao_id = _proposta_commitada(
        banco_migrado, registro, "api-422", novo=AGORA - timedelta(hours=1)
    )
    url = f"/api/tutoring/actions/{acao_id}/confirm"
    resposta = api.post(url, json={"operation_id": "op-api-422"})
    assert resposta.status_code == 422
    assert resposta.json()["code"] == "prazo_expirado"
    acao = _acao_na_conversa(api, acao_id)
    assert (acao["state"], acao["error_code"]) == ("falhou", "prazo_expirado")
    assert _historico_de(banco_migrado, mission_id) == []


def test_o_codigo_do_409_e_o_mesmo_gravado_na_acao() -> None:
    assert CodigoDeErro.REAGENDAMENTO_INVALIDO.value == REAGENDAMENTO_INVALIDO


# --- Concorrencia (conexoes reais) -----------------------------------------


def _em_paralelo(tarefas: list[Callable[[Session], str]], engine: Engine) -> list[str]:
    """Cada tarefa na propria conexao, com a largada real da barreira
    (`sessao.connection()` antes do `wait()`, ver `test_missions_concorrencia`)."""
    barreira = threading.Barrier(len(tarefas), timeout=SEGUNDOS_LIMITE)
    resultados: list[str | None] = [None] * len(tarefas)

    def rodar(indice: int, tarefa: Callable[[Session], str]) -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()
            barreira.wait()
            try:
                resultados[indice] = tarefa(sessao)
                sessao.commit()
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[indice] = "bloqueada"
            except OperacaoReutilizadaError:
                sessao.rollback()
                resultados[indice] = "reutilizada"

    threads = [
        threading.Thread(target=rodar, args=(i, t)) for i, t in enumerate(tarefas)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "espera circular ou trava esquecida"
    assert None not in resultados
    return [r for r in resultados if r is not None]


def _confirmacao(acao_id: int, op: str) -> Callable[[Session], str]:
    def tarefa(sessao: Session) -> str:
        resultado = confirmar_acao(sessao, ESTUDANTE, acao_id, op, clock=relogio(AGORA))
        assert isinstance(resultado, Executada)
        return "executada"

    return tarefa


def test_duas_confirmacoes_com_chaves_diferentes_um_elo_so(
    banco_migrado: Engine, registro: Registro
) -> None:
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "corrida-1")
    resultados = _em_paralelo(
        [_confirmacao(acao_id, "op-c-a"), _confirmacao(acao_id, "op-c-b")],
        banco_migrado,
    )
    assert sorted(resultados) == ["bloqueada", "executada"]
    assert len(_historico_de(banco_migrado, mission_id)) == 1


def test_a_mesma_confirmacao_em_paralelo_um_elo_so(
    banco_migrado: Engine, registro: Registro
) -> None:
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "corrida-2")
    resultados = _em_paralelo(
        [_confirmacao(acao_id, "op-c-x"), _confirmacao(acao_id, "op-c-x")],
        banco_migrado,
    )
    assert resultados == ["executada", "executada"]
    assert len(_historico_de(banco_migrado, mission_id)) == 1


def test_confirmacao_e_reagendamento_direto_juntos_encadeiam(
    banco_migrado: Engine, registro: Registro
) -> None:
    """F14: a confirmacao trava acao -> missao; o reagendamento direto so a
    missao. Nenhuma espera circular (as duas terminam dentro do limite), e o
    historico ganha dois elos encadeados, sem atualizacao perdida."""
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "corrida-3")
    prazo_da_tela = AGORA + timedelta(days=7)

    def pela_tela(sessao: Session) -> str:
        reagendar_missao(
            sessao,
            ESTUDANTE,
            mission_id,
            "op-c-tela",
            novo_prazo=prazo_da_tela,
            motivo=MotivoDoReagendamento.DIFICULDADE,
            origem=OrigemDoReagendamento.USUARIO,
            clock=relogio(AGORA),
        )
        return "tela"

    resultados = _em_paralelo(
        [_confirmacao(acao_id, "op-c-kairya"), pela_tela], banco_migrado
    )
    assert resultados == ["executada", "tela"]
    primeiro, segundo = _historico_de(banco_migrado, mission_id)
    assert primeiro.previous_deadline == PRAZO_ATUAL
    assert segundo.previous_deadline == primeiro.new_deadline
    assert {primeiro.origin, segundo.origin} == {
        OrigemDoReagendamento.KAIRYA,
        OrigemDoReagendamento.USUARIO,
    }
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        assert missao.deadline == segundo.new_deadline
        total = sessao.execute(
            select(func.count())
            .select_from(MissionReschedule)
            .where(MissionReschedule.mission_id == mission_id)
        ).scalar_one()
        assert total == 2


def test_a_missao_ja_carregada_na_sessao_e_relida_depois_da_trava(
    banco_migrado: Engine, registro: Registro
) -> None:
    """`session.get(..., with_for_update=True)` emite o
    `SELECT ... FOR UPDATE`, mas, sem `populate_existing`, NAO sobrescreve um
    objeto que ja esta no identity map. A confirmacao carrega a missao antes?
    Hoje nao; este teste a carrega de proposito, deixa outra conexao
    reagendar e commitar, e so entao confirma: o elo da Kairya tem de partir do
    prazo que a trava leu, nao do que estava em memoria -- senao o historico
    perde um elo e o prazo da tela e sobrescrito sem registro."""
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "relida")
    prazo_da_tela = AGORA + timedelta(days=3)
    with Session(bind=banco_migrado) as confirmacao:
        velha = confirmacao.get(Mission, mission_id)
        assert velha is not None and velha.deadline == PRAZO_ATUAL
        with Session(bind=banco_migrado) as tela:
            reagendar_missao(
                tela,
                ESTUDANTE,
                mission_id,
                "op-relida-tela",
                novo_prazo=prazo_da_tela,
                motivo=MotivoDoReagendamento.DIFICULDADE,
                origem=OrigemDoReagendamento.USUARIO,
                clock=relogio(AGORA),
            )
            tela.commit()
        resultado = confirmar_acao(
            confirmacao, ESTUDANTE, acao_id, "op-relida-kairya", clock=relogio(AGORA)
        )
        assert isinstance(resultado, Executada)
        confirmacao.commit()
    tela_elo, kairya_elo = _historico_de(banco_migrado, mission_id)
    assert (tela_elo.previous_deadline, tela_elo.new_deadline) == (
        PRAZO_ATUAL,
        prazo_da_tela,
    )
    assert (kairya_elo.previous_deadline, kairya_elo.new_deadline) == (
        prazo_da_tela,
        NOVO_PRAZO,
    )


def test_a_acao_ja_carregada_na_sessao_e_relida_depois_da_trava(
    banco_migrado: Engine, registro: Registro
) -> None:
    """O mesmo cuidado do teste acima, agora na ACAO: `session.get(...,
    with_for_update=True)` sem `populate_existing` nao sobrescreve uma acao
    que ja estava no identity map, que voltaria com o estado de ANTES da
    trava. Hoje nenhum caminho de producao carrega a acao antes (a rota abre
    sessao nova e `_buscar_acao` e a primeira leitura), entao o teste a carrega
    de proposito: outra conexao a recusa e commita, e a confirmacao tem de ver
    `recusada` -- e nao executar o reagendamento de uma proposta recusada,
    sobrescrevendo a recusa."""
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "acao-relida")
    with Session(bind=banco_migrado) as confirmacao:
        velha = confirmacao.get(TutorAction, acao_id)
        assert velha is not None and velha.state is EstadoDaAcao.PROPOSTA
        with Session(bind=banco_migrado) as tela:
            rejeitar_acao(tela, ESTUDANTE, acao_id, clock=relogio(AGORA))
            tela.commit()
        with pytest.raises(TransicaoIlegalError, match="recusada"):
            confirmar_acao(
                confirmacao, ESTUDANTE, acao_id, "op-acao-relida", clock=relogio(AGORA)
            )
    assert _historico_de(banco_migrado, mission_id) == []
    with Session(bind=banco_migrado) as leitura:
        acao = leitura.get(TutorAction, acao_id)
        assert acao is not None and acao.state is EstadoDaAcao.RECUSADA


def test_chave_gravada_por_outra_acao_depois_da_consulta_vira_reuso(
    banco_migrado: Engine, registro: Registro
) -> None:
    """O caminho da UNIQUE de `tutor_actions` no reagendamento, sem thread:
    REPEATABLE READ fixa o snapshot antes de outra conexao gastar a chave
    numa outra acao. A consulta nao a ve; o `flush` final esbarra na UNIQUE e
    a recusa sai com a mesma cara do caminho sequencial -- e o reagendamento
    feito na mesma transacao volta junto no rollback."""
    mission_id, acao_id = _proposta_commitada(banco_migrado, registro, "unique")
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        sessao.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        sessao.execute(select(func.count()).select_from(TutorAction))
        with Session(bind=banco_migrado, expire_on_commit=False) as intrusa:
            outra = _proposta(intrusa, mission_id, cid=registro.cid("unique-intrusa"))
            outra.state = EstadoDaAcao.RECUSADA
            outra.decided_at = AGORA
            outra.operation_id = "op-disputada-t7"
            intrusa.commit()
        with pytest.raises(OperacaoReutilizadaError, match="op-disputada-t7"):
            confirmar_acao(
                sessao, ESTUDANTE, acao_id, "op-disputada-t7", clock=relogio(AGORA)
            )
        sessao.rollback()
    assert _historico_de(banco_migrado, mission_id) == []


def test_duas_acoes_iguais_com_a_mesma_chave_em_paralelo_uma_vence(
    banco_migrado: Engine, registro: Registro
) -> None:
    """Duas acoes DIFERENTES com a mesma proposta (mesma
    missao, prazo e motivo), confirmadas juntas com a MESMA chave. As travas
    de acao nao se cruzam; a segunda espera a trava da missao, o
    `reagendar_missao` a le como reenvio (mesma chave, mesmo conteudo) e a
    guarda do elo passa (`kairya`). Quem recusa e a UNIQUE de `tutor_actions`
    no `flush` da acao -- e o rollback leva tudo. Um elo so."""
    mission_id, primeira = _proposta_commitada(banco_migrado, registro, "gemea-1")
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        segunda = _proposta(sessao, mission_id, cid=registro.cid("gemea-2")).id
        sessao.commit()
    resultados = _em_paralelo(
        [_confirmacao(primeira, "op-gemea"), _confirmacao(segunda, "op-gemea")],
        banco_migrado,
    )
    assert sorted(resultados) == ["executada", "reutilizada"]
    assert len(_historico_de(banco_migrado, mission_id)) == 1
    with Session(bind=banco_migrado) as sessao:
        estados = sorted(
            (a.state.value, a.operation_id)
            for a in sessao.scalars(
                select(TutorAction).where(TutorAction.id.in_([primeira, segunda]))
            )
        )
    assert estados == [("executada", "op-gemea"), ("proposta", None)]
