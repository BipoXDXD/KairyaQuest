"""Confirmar e recusar uma proposta da Kairya: o "sim" deterministico (D2).

O clique vai direto ao backend, sem passar pelo modelo. A confirmacao cria a
missao e grava `executada` na MESMA transacao, com a acao travada.
"""

import threading
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, event, func, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.core.errors import AcaoNaoEncontradaError, OperacaoReutilizadaError
from focusquest.main import app
from focusquest.modules.missions.domain import MissionState, TransicaoIlegalError
from focusquest.modules.missions.models import Mission, User
from focusquest.modules.tutoring.domain import (
    ESTIMATIVA_FORA_DO_LIMITE,
    PRAZO_EXPIRADO,
    PRAZO_FORA_DO_LIMITE,
    PROPOSTA_INVALIDA,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import (
    Executada,
    ForaDoLimite,
    PrazoExpirado,
    PropostaInvalida,
    ResultadoDaConfirmacao,
    confirmar_acao,
    rejeitar_acao,
)

ESTUDANTE = 1
OUTRO = 2
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
LIMITE_DE_TRAVA = "2s"


def _payload(prazo: datetime) -> dict[str, Any]:
    return {
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina",
        "difficulty": 3,
        "estimated_minutes": 40,
        "deadline": prazo.isoformat(),
    }


def _proposta(
    session: Session,
    *,
    prazo: datetime = AGORA + timedelta(days=1),
    user_id: int = ESTUDANTE,
    cid: str = "acao-1",
    **ajustes: Any,
) -> TutorAction:
    pergunta = TutorMessage(
        user_id=user_id,
        role=Papel.USUARIO,
        content="me da uma missao",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=cid,
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=user_id,
        role=Papel.TUTORA,
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    campos: dict[str, Any] = {
        "message_id": resposta.id,
        "kind": TipoDeAcao.CRIAR_MISSAO,
        "payload": _payload(prazo),
        "state": EstadoDaAcao.PROPOSTA,
        "created_at": AGORA,
    }
    acao = TutorAction(**(campos | ajustes))
    session.add(acao)
    session.flush()
    return acao


def _confirmar(session: Session, acao_id: int, op: str) -> ResultadoDaConfirmacao:
    return confirmar_acao(session, ESTUDANTE, acao_id, op, clock=lambda: AGORA)


def _missoes(session: Session) -> int:
    return session.execute(select(func.count()).select_from(Mission)).scalar_one()


# --- Confirmar -------------------------------------------------------------


def test_confirmar_cria_a_missao_e_executa_a_acao(session: Session) -> None:
    acao = _proposta(session)
    resultado = _confirmar(session, acao.id, "op-1")

    assert isinstance(resultado, Executada)
    missao = resultado.missao
    assert (missao.instructions, missao.difficulty, missao.estimated_minutes) == (
        "Ler o capitulo 3",
        3,
        40,
    )
    assert missao.state is MissionState.PENDENTE
    assert missao.user_id == ESTUDANTE
    assert resultado.acao.state is EstadoDaAcao.EXECUTADA
    assert resultado.acao.mission_id == missao.id
    assert resultado.acao.operation_id == "op-1"
    assert resultado.acao.decided_at == AGORA


def test_reenviar_a_mesma_confirmacao_devolve_a_mesma_missao(session: Session) -> None:
    acao = _proposta(session)
    primeira = _confirmar(session, acao.id, "op-1")
    segunda = _confirmar(session, acao.id, "op-1")
    assert isinstance(primeira, Executada) and isinstance(segunda, Executada)
    assert segunda.missao.id == primeira.missao.id
    assert _missoes(session) == 1


def test_operation_id_de_outra_acao_e_chave_gasta(session: Session) -> None:
    _confirmar(session, _proposta(session, cid="a").id, "op-1")
    outra = _proposta(session, cid="b")
    with pytest.raises(OperacaoReutilizadaError, match="op-1"):
        _confirmar(session, outra.id, "op-1")


def test_confirmar_executada_com_chave_nova_e_transicao_ilegal(
    session: Session,
) -> None:
    acao = _proposta(session)
    _confirmar(session, acao.id, "op-1")
    with pytest.raises(TransicaoIlegalError, match="executada"):
        _confirmar(session, acao.id, "op-2")


@pytest.mark.parametrize("estado", [EstadoDaAcao.RECUSADA, EstadoDaAcao.FALHOU])
def test_confirmar_decidida_e_transicao_ilegal(
    session: Session, estado: EstadoDaAcao
) -> None:
    acao = _proposta(session, state=estado, decided_at=AGORA)
    with pytest.raises(TransicaoIlegalError, match=estado.value):
        _confirmar(session, acao.id, "op-1")


def test_prazo_vencido_grava_falhou_e_nao_cria_missao(session: Session) -> None:
    acao = _proposta(session, prazo=AGORA)  # no limite: vencido
    resultado = _confirmar(session, acao.id, "op-1")
    assert isinstance(resultado, PrazoExpirado)
    assert resultado.acao.state is EstadoDaAcao.FALHOU
    assert resultado.acao.error_code == PRAZO_EXPIRADO
    assert resultado.acao.mission_id is None
    assert _missoes(session) == 0

    # O mesmo clique de novo: o mesmo resultado, e nao transicao ilegal.
    assert isinstance(_confirmar(session, acao.id, "op-1"), PrazoExpirado)
    # Um clique novo: a acao ja foi decidida.
    with pytest.raises(TransicaoIlegalError):
        _confirmar(session, acao.id, "op-2")


def test_prazo_um_segundo_no_futuro_ainda_vale(session: Session) -> None:
    acao = _proposta(session, prazo=AGORA + timedelta(seconds=1))
    assert isinstance(_confirmar(session, acao.id, "op-1"), Executada)


# --- Limites da avulsa (pendencia 26) --------------------------------------


@pytest.mark.parametrize(
    ("prazo", "minutos", "codigo"),
    [
        (AGORA + timedelta(days=1), 1441, ESTIMATIVA_FORA_DO_LIMITE),
        (AGORA + timedelta(days=365, seconds=1), 40, PRAZO_FORA_DO_LIMITE),
    ],
    ids=["estimativa 1441", "prazo agora+365d+1s"],
)
def test_proposta_fora_do_limite_grava_falhou_e_nao_cria_missao(
    session: Session, prazo: datetime, minutos: int, codigo: str
) -> None:
    acao = _proposta(session, payload=_payload(prazo) | {"estimated_minutes": minutos})
    resultado = _confirmar(session, acao.id, "op-1")

    assert resultado == ForaDoLimite(acao, codigo)
    assert (acao.state, acao.error_code) == (EstadoDaAcao.FALHOU, codigo)
    assert (acao.operation_id, acao.decided_at) == ("op-1", AGORA)
    assert acao.mission_id is None
    assert _missoes(session) == 0
    # O mesmo clique de novo: o mesmo resultado, gravado, e nao transicao ilegal.
    assert _confirmar(session, acao.id, "op-1") == ForaDoLimite(acao, codigo)
    with pytest.raises(TransicaoIlegalError):
        _confirmar(session, acao.id, "op-2")


@pytest.mark.parametrize(
    "ajuste",
    [
        {"instructions": ""},
        {"difficulty": 6},
        {"deadline": "2026-09-20T12:00:00"},
    ],
    ids=["instrucoes vazias", "dificuldade 6", "prazo sem fuso"],
)
def test_proposta_historica_fora_do_esquema_grava_falhou_e_nao_cria_missao(
    session: Session, ajuste: dict[str, Any]
) -> None:
    """Pendencia 47: um payload gravado antes de o esquema endurecer nao
    passa mais na revalidacao. Era `ValidationError` solto (500); agora a falha
    e gravada na acao, como o prazo expirado, e a rota a traduz em 422."""
    acao = _proposta(session, payload=_payload(AGORA + timedelta(days=1)) | ajuste)
    resultado = _confirmar(session, acao.id, "op-1")

    assert resultado == PropostaInvalida(acao)
    assert (acao.state, acao.error_code) == (EstadoDaAcao.FALHOU, PROPOSTA_INVALIDA)
    assert (acao.operation_id, acao.decided_at) == ("op-1", AGORA)
    assert acao.mission_id is None
    assert _missoes(session) == 0
    assert _confirmar(session, acao.id, "op-1") == PropostaInvalida(acao)
    with pytest.raises(TransicaoIlegalError):
        _confirmar(session, acao.id, "op-2")


@pytest.mark.parametrize(
    "payload",
    [[], ["instructions"], "texto", 7],
    ids=["lista vazia", "lista", "texto", "numero"],
)
def test_proposta_historica_que_nao_e_objeto_grava_falhou_e_nao_cria_missao(
    session: Session, payload: Any
) -> None:
    acao = _proposta(session, payload=payload)
    resultado = _confirmar(session, acao.id, "op-1")

    assert resultado == PropostaInvalida(acao)
    assert (acao.state, acao.error_code) == (EstadoDaAcao.FALHOU, PROPOSTA_INVALIDA)
    assert acao.mission_id is None
    assert _missoes(session) == 0
    assert _confirmar(session, acao.id, "op-1") == PropostaInvalida(acao)


@pytest.mark.parametrize(
    ("prazo", "minutos"),
    [(AGORA + timedelta(days=365), 40), (AGORA + timedelta(days=1), 1440)],
    ids=["prazo agora+365d", "estimativa 1440"],
)
def test_proposta_na_borda_do_limite_ainda_executa(
    session: Session, prazo: datetime, minutos: int
) -> None:
    acao = _proposta(session, payload=_payload(prazo) | {"estimated_minutes": minutos})
    resultado = _confirmar(session, acao.id, "op-1")
    assert isinstance(resultado, Executada)
    assert (resultado.missao.deadline, resultado.missao.estimated_minutes) == (
        prazo,
        minutos,
    )


# --- Recusar ---------------------------------------------------------------


def test_recusar_proposta(session: Session) -> None:
    acao = _proposta(session)
    recusada = rejeitar_acao(session, ESTUDANTE, acao.id, clock=lambda: AGORA)
    assert recusada.state is EstadoDaAcao.RECUSADA
    assert recusada.decided_at == AGORA


def test_recusar_de_novo_e_idempotente(session: Session) -> None:
    acao = _proposta(session)
    rejeitar_acao(session, ESTUDANTE, acao.id, clock=lambda: AGORA)
    depois = AGORA + timedelta(hours=1)
    de_novo = rejeitar_acao(session, ESTUDANTE, acao.id, clock=lambda: depois)
    assert de_novo.state is EstadoDaAcao.RECUSADA
    assert de_novo.decided_at == AGORA


def test_recusar_executada_e_transicao_ilegal(session: Session) -> None:
    acao = _proposta(session)
    _confirmar(session, acao.id, "op-1")
    with pytest.raises(TransicaoIlegalError):
        rejeitar_acao(session, ESTUDANTE, acao.id, clock=lambda: AGORA)


# --- Inexistente e alheia --------------------------------------------------


def test_acao_inexistente(session: Session) -> None:
    with pytest.raises(AcaoNaoEncontradaError, match="nao existe"):
        _confirmar(session, 999_999, "op-1")
    with pytest.raises(AcaoNaoEncontradaError):
        rejeitar_acao(session, ESTUDANTE, 999_999, clock=lambda: AGORA)


def test_acao_de_outro_usuario_e_nao_encontrada(session: Session) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _proposta(session, user_id=OUTRO, cid="alheia")
    with pytest.raises(AcaoNaoEncontradaError, match="outro usuario"):
        _confirmar(session, alheia.id, "op-1")


# --- A traducao do IntegrityError ------------------------------------------


def test_violacao_que_nao_e_do_operation_id_nao_vira_reuso(session: Session) -> None:
    """So a UNIQUE do `operation_id` vira `OperacaoReutilizadaError`.

    A linha invalida nao pode entrar ANTES da trava: `_buscar_acao` chama
    `session.get(..., with_for_update=True)`, que so emite o SELECT (e so
    autoflusha) quando ha algo pendente para descartar primeiro. Uma linha
    invalida adicionada direto por `session.add` antes da chamada estouraria
    ali -- fora do `try/except` de `confirmar_acao` -- e o teste passaria
    sem nunca exercitar a guarda que distingue a UNIQUE de qualquer outra
    violacao, que e a guarda sob prova.

    Por isso a linha invalida entra por um `before_flush`: ele so dispara
    quando ja HA algo pendente para flushar por outro motivo -- e isso so
    acontece dentro do `try`, no flush interno do `criar_missao`. A violacao
    estoura ali, o `except IntegrityError` de `confirmar_acao` intercepta, e
    a guarda do nome da restricao decide (corretamente) que nao e reuso.
    """
    acao = _proposta(session)

    def _adicionar_linha_invalida(
        sessao: Session, _contexto: object, _instancias: object
    ) -> None:
        sessao.add(
            TutorMessage(
                user_id=ESTUDANTE,
                role=Papel.USUARIO,
                content="sem id do cliente",
                status=StatusDaMensagem.COMPLETA,
                created_at=AGORA,
            )
        )

    event.listen(session, "before_flush", _adicionar_linha_invalida)
    try:
        with pytest.raises(IntegrityError, match="ck_tutor_messages_forma"):
            _confirmar(session, acao.id, "op-1")
    finally:
        event.remove(session, "before_flush", _adicionar_linha_invalida)


# --- Concorrencia, com commits de verdade ----------------------------------


@pytest.fixture
def acao_commitada(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        acao = _proposta(sessao, cid="concorrencia")
        sessao.commit()
    try:
        yield acao.id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            missoes = limpeza.scalars(
                select(TutorAction.mission_id).where(TutorAction.id == acao.id)
            ).all()
            limpeza.execute(
                delete(TutorMessage).where(
                    TutorMessage.client_message_id == "concorrencia"
                )
            )
            limpeza.execute(
                delete(Mission).where(Mission.id.in_([m for m in missoes if m]))
            )
            limpeza.commit()


def _confirmar_em_paralelo(engine: Engine, acao_id: int, ops: list[str]) -> list[str]:
    barreira = threading.Barrier(len(ops), timeout=30)
    resultados: list[str | None] = [None] * len(ops)

    def tentar(indice: int, op: str) -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()  # largada real: ver test_missions_concorrencia.py
            barreira.wait()
            try:
                confirmar_acao(sessao, ESTUDANTE, acao_id, op, clock=lambda: AGORA)
                sessao.commit()
                resultados[indice] = "executada"
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[indice] = "bloqueada"

    threads = [
        threading.Thread(target=tentar, args=(i, op)) for i, op in enumerate(ops)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive()
    assert None not in resultados
    return [r for r in resultados if r is not None]


def _missoes_da_acao(engine: Engine, acao_id: int) -> list[int | None]:
    with Session(bind=engine) as sessao:
        return list(
            sessao.scalars(
                select(TutorAction.mission_id).where(TutorAction.id == acao_id)
            )
        )


def test_dois_confirmar_com_a_mesma_chave_criam_uma_missao(
    banco_migrado: Engine, acao_commitada: int
) -> None:
    resultados = _confirmar_em_paralelo(banco_migrado, acao_commitada, ["op-x", "op-x"])
    assert resultados == ["executada", "executada"]
    with Session(bind=banco_migrado) as sessao:
        (mission_id,) = _missoes_da_acao(banco_migrado, acao_commitada)
        assert sessao.get(Mission, mission_id) is not None


def test_dois_confirmar_com_chaves_diferentes_um_vence(
    banco_migrado: Engine, acao_commitada: int
) -> None:
    resultados = _confirmar_em_paralelo(banco_migrado, acao_commitada, ["op-a", "op-b"])
    assert sorted(resultados) == ["bloqueada", "executada"]


def _confirmar_ou_recusar_em_paralelo(engine: Engine, acao_id: int) -> list[str]:
    """A corrida confirmar-x-recusar sobre a MESMA acao.

    Ao contrario de `_confirmar_em_paralelo` (duas confirmacoes, onde o
    UPDATE final de qualquer uma das duas toca `operation_id` -- coluna
    UNIQUE -- e por isso escala sozinho para uma trava forte o bastante
    para serializar as duas), `rejeitar_acao` so grava `state` e
    `decided_at`: nenhuma coluna indexada. Aqui quem serializa a decisao e
    SO o `with_for_update=True` de `_buscar_acao`. Sem ele, as duas
    threads leriam a acao ainda `proposta` ao mesmo tempo e as duas
    aplicariam a propria decisao -- inclusive o `criar_missao` do lado que
    confirma, que ficaria orfa se a recusa "vencesse" por ultimo no UPDATE.
    """
    barreira = threading.Barrier(2, timeout=30)
    resultados: list[str | None] = [None, None]

    def confirmar() -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()  # largada real: ver test_missions_concorrencia.py
            barreira.wait()
            try:
                confirmar_acao(
                    sessao, ESTUDANTE, acao_id, "op-corrida", clock=lambda: AGORA
                )
                sessao.commit()
                resultados[0] = "confirmada"
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[0] = "bloqueada"

    def recusar() -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()
            barreira.wait()
            try:
                rejeitar_acao(sessao, ESTUDANTE, acao_id, clock=lambda: AGORA)
                sessao.commit()
                resultados[1] = "recusada"
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[1] = "bloqueada"

    threads = [threading.Thread(target=confirmar), threading.Thread(target=recusar)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive()
    assert None not in resultados
    return [r for r in resultados if r is not None]


def _total_de_missoes_do_estudante(engine: Engine) -> int:
    with Session(bind=engine) as sessao:
        return sessao.execute(
            select(func.count())
            .select_from(Mission)
            .where(Mission.user_id == ESTUDANTE)
        ).scalar_one()


def test_confirmar_e_recusar_em_paralelo_uma_decisao_vence(
    banco_migrado: Engine, acao_commitada: int
) -> None:
    """A corrida mais forte sobre a acao: confirmar e recusar ao mesmo tempo.

    Exatamente uma decisao vence, a outra recebe `TransicaoIlegalError`, e a
    acao termina num estado SO -- coerente com o efeito colateral dele: se
    `executada`, com `mission_id` apontando para uma missao que existe; se
    `recusada`, sem `mission_id` nenhum e sem missao nenhuma criada (nao so
    para esta acao -- para o estudante inteiro, o que descarta a missao
    orfa que a confirmacao perdedora deixaria para tras se tivesse chegado a
    criar a missao antes de descobrir que perdeu).
    """
    resultados = _confirmar_ou_recusar_em_paralelo(banco_migrado, acao_commitada)
    assert sorted(resultados) in (
        ["bloqueada", "confirmada"],
        ["bloqueada", "recusada"],
    )

    with Session(bind=banco_migrado) as sessao:
        acao = sessao.get(TutorAction, acao_commitada)
        assert acao is not None
        if acao.state is EstadoDaAcao.EXECUTADA:
            assert resultados == ["confirmada", "bloqueada"]
            assert acao.mission_id is not None
            assert sessao.get(Mission, acao.mission_id) is not None
            assert _total_de_missoes_do_estudante(banco_migrado) == 1
        else:
            assert acao.state is EstadoDaAcao.RECUSADA
            assert resultados == ["bloqueada", "recusada"]
            assert acao.mission_id is None
            assert _total_de_missoes_do_estudante(banco_migrado) == 0


def test_confirmar_trava_a_linha_da_acao(
    banco_migrado: Engine, acao_commitada: int
) -> None:
    """O mecanismo, pedido ao PostgreSQL: FOR KEY SHARE conflita com a trava
    que o UPDATE final de `confirmar_acao` acaba pedindo.

    Isto NAO isola o `with_for_update=True` do `SELECT` de `_buscar_acao`: o
    UPDATE final grava `operation_id`, coluna coberta pela restricao UNICA
    `uq_tutor_actions_operation_id`, e o PostgreSQL escala esse UPDATE para
    uma trava forte o bastante para conflitar com `FOR KEY SHARE` de
    qualquer jeito -- com ou sem o `with_for_update` do `SELECT` anterior
    (medido: remover o `with_for_update=True` de `_buscar_acao` NAO faz
    este teste reprovar; quem prova essa trava especifica e a corrida real
    de `test_dois_confirmar_com_chaves_diferentes_um_vence` e, para o
    caminho do recusar -- que nao grava nenhuma coluna indexada --,
    `test_confirmar_e_recusar_em_paralelo_uma_decisao_vence`.)

    O que este teste prova, deterministicamente: que `confirmar_acao`
    esbarra numa `FOR KEY SHARE` alheia -- o mecanismo de espera de fato
    acontece, ainda que a trava exercitada por ele possa vir do UPDATE
    final e nao do `SELECT` inicial.
    """
    with banco_migrado.connect() as dono_da_trava:
        dono_da_trava.execute(
            text("SELECT id FROM tutor_actions WHERE id = :id FOR KEY SHARE"),
            {"id": acao_commitada},
        )
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            with pytest.raises(OperationalError) as excecao:
                confirmar_acao(
                    sessao, ESTUDANTE, acao_commitada, "op-t", clock=lambda: AGORA
                )
            sessao.rollback()
        assert isinstance(excecao.value.orig, psycopg.errors.LockNotAvailable)


def test_chave_gravada_depois_da_consulta_vira_reuso(
    banco_migrado: Engine, acao_commitada: int
) -> None:
    """O caminho da UNIQUE, sem thread: REPEATABLE READ fixa o snapshot antes
    de outra conexao gastar a chave em outra acao."""
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        sessao.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        sessao.execute(select(func.count()).select_from(TutorAction))

        with Session(bind=banco_migrado, expire_on_commit=False) as intrusa:
            outra = _proposta(
                intrusa,
                cid="intrusa",
                operation_id="op-disputada",
                state=EstadoDaAcao.RECUSADA,
                decided_at=AGORA,
            )
            intrusa.commit()
        try:
            with pytest.raises(OperacaoReutilizadaError):
                confirmar_acao(
                    sessao,
                    ESTUDANTE,
                    acao_commitada,
                    "op-disputada",
                    clock=lambda: AGORA,
                )
            sessao.rollback()
        finally:
            with Session(bind=banco_migrado) as limpeza:
                limpeza.execute(
                    delete(TutorMessage).where(
                        TutorMessage.client_message_id == "intrusa"
                    )
                )
                limpeza.commit()
    assert outra.id != acao_commitada


# --- API ----------------------------------------------------------------------


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


@pytest.fixture
def proposta_historica(banco_migrado: Engine) -> Iterator[int]:
    """Uma proposta de missao commitada com payload fora do esquema atual."""
    payload = _payload(AGORA + timedelta(days=1)) | {"difficulty": 6}
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        acao = _proposta(sessao, cid="api-historica", payload=payload)
        sessao.commit()
    try:
        yield acao.id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            limpeza.execute(
                delete(TutorMessage).where(
                    TutorMessage.client_message_id == "api-historica"
                )
            )
            limpeza.commit()


def test_api_proposta_de_missao_invalida_e_422_com_a_falha_ja_gravada(
    api: TestClient, banco_migrado: Engine, proposta_historica: int
) -> None:
    """Pendencia 47 na criacao: nunca 500. O 422 sai depois do commit da
    falha, o reenvio devolve o mesmo erro e nenhuma missao nasce."""
    url = f"/api/tutoring/actions/{proposta_historica}/confirm"
    resposta = api.post(url, json={"operation_id": "op-api-hist"})
    assert resposta.status_code == 422, resposta.text
    assert resposta.json()["code"] == "proposta_invalida"
    with Session(bind=banco_migrado) as sessao:
        acao = sessao.get_one(TutorAction, proposta_historica)
        assert (acao.state, acao.error_code) == (
            EstadoDaAcao.FALHOU,
            PROPOSTA_INVALIDA,
        )
        assert acao.mission_id is None
    de_novo = api.post(url, json={"operation_id": "op-api-hist"})
    assert (de_novo.status_code, de_novo.json()["code"]) == (422, "proposta_invalida")
