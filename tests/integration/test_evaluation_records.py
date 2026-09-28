"""A escrita da avaliacao (`missions.evaluation_records`): transicoes, orfa,
tentativa superada (E9, E10). Sessao com rollback; o relogio e parametro."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from focusquest.core.errors import (
    AvaliacaoEmAndamentoError,
    MissaoNaoEncontradaError,
    SemEvidenciaError,
)
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MissionType,
    Veredito,
)
from focusquest.modules.missions.evaluation_records import (
    Tentativa,
    abrir_tentativa,
    registrar_falha,
    registrar_resultado,
)
from focusquest.modules.missions.models import Mission, MissionEvaluation
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
)

ESTUDANTE = 1
AGORA = datetime(2026, 9, 23, 15, tzinfo=UTC)
DEPOIS = AGORA + timedelta(minutes=5)
MODELO = "claude-opus-5"
# Uma orfa so existe se `requested_at` for anterior a este corte; o padrao dos
# testes e um corte BEM antes do pedido: nada e orfa.
NADA_E_ORFA = AGORA - timedelta(hours=1)


def _missao(session: Session, *, evidencia: NovaEvidencia | None) -> Mission:
    """Uma avulsa concluida agora, com ou sem evidencia."""
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    return concluir_missao(
        session,
        ESTUDANTE,
        missao.id,
        f"op-{missao.id}",
        clock=lambda: AGORA,
        evidencia=evidencia,
    )


def _com_evidencia(session: Session) -> Mission:
    return _missao(
        session, evidencia=NovaEvidencia("Fiz o resumo", "https://exemplo.com/r")
    )


def _abrir(
    session: Session,
    mission_id: int,
    *,
    agora: datetime = AGORA,
    orfa_antes_de: datetime = NADA_E_ORFA,
    modelo: str = MODELO,
) -> Tentativa | MissionEvaluation:
    return abrir_tentativa(
        session,
        ESTUDANTE,
        mission_id,
        clock=lambda: agora,
        modelo=modelo,
        limite_do_orfao=agora - orfa_antes_de,
    )


def _tentativa(aberta: Tentativa | MissionEvaluation) -> Tentativa:
    assert isinstance(aberta, Tentativa), aberta
    return aberta


def _avaliacao(session: Session, mission_id: int) -> MissionEvaluation:
    return session.scalars(
        select(MissionEvaluation).where(MissionEvaluation.mission_id == mission_id)
    ).one()


# --- abrir_tentativa -------------------------------------------------------


def test_abrir_grava_avaliando_e_devolve_a_tentativa_1(session: Session) -> None:
    missao = _com_evidencia(session)
    aberta = _abrir(session, missao.id)
    assert aberta == Tentativa(
        mission_id=missao.id,
        attempt=1,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        evidence_text="Fiz o resumo",
        evidence_link="https://exemplo.com/r",
    )
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.attempt, avaliacao.model) == (
        EstadoDaAvaliacao.AVALIANDO,
        1,
        MODELO,
    )
    assert avaliacao.requested_at == AGORA
    assert (avaliacao.finished_at, avaliacao.error_code, avaliacao.verdict) == (
        None,
        None,
        None,
    )


@pytest.mark.parametrize(
    "corte",
    [AGORA - timedelta(seconds=1), AGORA],
    ids=["corte-antes-do-pedido", "corte-no-instante-do-pedido"],
)
def test_avaliando_nao_orfa_e_em_andamento(session: Session, corte: datetime) -> None:
    """No proprio instante do corte ainda nao e orfa: so o que e ANTERIOR a ele."""
    missao = _com_evidencia(session)
    _abrir(session, missao.id)
    with pytest.raises(AvaliacaoEmAndamentoError):
        _abrir(session, missao.id, agora=DEPOIS, orfa_antes_de=corte)
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.attempt, avaliacao.requested_at) == (
        EstadoDaAvaliacao.AVALIANDO,
        1,
        AGORA,
    )


def test_a_orfa_e_retomada_numa_tentativa_nova(session: Session) -> None:
    missao = _com_evidencia(session)
    _abrir(session, missao.id)
    aberta = _tentativa(
        _abrir(
            session,
            missao.id,
            agora=DEPOIS,
            orfa_antes_de=AGORA + timedelta(microseconds=1),
            modelo="outro-modelo",
        )
    )
    assert aberta.attempt == 2
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.attempt, avaliacao.model) == (
        EstadoDaAvaliacao.AVALIANDO,
        2,
        "outro-modelo",
    )
    assert avaliacao.requested_at == DEPOIS
    assert (avaliacao.error_code, avaliacao.finished_at) == (None, None)


def test_a_falhou_e_repetida_com_attempt_mais_um(session: Session) -> None:
    missao = _com_evidencia(session)
    primeira = _tentativa(_abrir(session, missao.id))
    assert registrar_falha(
        session,
        primeira,
        falha=FalhaDaAvaliacao.PROVEDOR_INDISPONIVEL,
        clock=lambda: AGORA,
    )
    segunda = _tentativa(_abrir(session, missao.id, agora=DEPOIS))
    assert segunda.attempt == 2
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.error_code, avaliacao.finished_at) == (
        EstadoDaAvaliacao.AVALIANDO,
        None,
        None,
    )
    assert avaliacao.requested_at == DEPOIS


def test_a_concluida_e_devolvida_sem_mudar_nada(session: Session) -> None:
    missao = _com_evidencia(session)
    tentativa = _tentativa(_abrir(session, missao.id))
    registrar_resultado(
        session,
        tentativa,
        veredito=Veredito.PARCIAL,
        feedback="Falta o fim.",
        clock=lambda: AGORA,
    )
    devolvida = _abrir(session, missao.id, agora=DEPOIS, modelo="outro-modelo")
    assert devolvida is _avaliacao(session, missao.id)
    assert isinstance(devolvida, MissionEvaluation)
    assert (devolvida.state, devolvida.attempt, devolvida.model) == (
        EstadoDaAvaliacao.CONCLUIDA,
        1,
        MODELO,
    )
    assert (devolvida.requested_at, devolvida.finished_at) == (AGORA, AGORA)


def test_sem_evidencia_autodeclarada_e_recusada(session: Session) -> None:
    missao = _missao(session, evidencia=None)
    with pytest.raises(SemEvidenciaError):
        _abrir(session, missao.id)
    assert missao.evaluation is None


def test_sem_evidencia_pendente_e_recusada(session: Session) -> None:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler",
        completion_criterion="Resumo",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    with pytest.raises(SemEvidenciaError):
        _abrir(session, missao.id)


def test_inexistente_e_nao_encontrada(session: Session) -> None:
    with pytest.raises(MissaoNaoEncontradaError):
        _abrir(session, 2**31 - 1)


def test_diaria_de_dia_futuro_e_nao_encontrada(session: Session) -> None:
    """A ocultacao vem ANTES da evidencia: a diaria futura (sem evidencia)
    responde 404, e nao `sem_evidencia`, que revelaria que ela existe."""
    segunda = date(2026, 9, 21)
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=segunda,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=lambda: AGORA - timedelta(days=1),
    )
    futura = session.scalars(
        select(Mission).where(
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == segunda + timedelta(days=5),
        )
    ).one()
    with pytest.raises(MissaoNaoEncontradaError):
        _abrir(session, futura.id)


# --- registrar_resultado e registrar_falha ---------------------------------


def test_registrar_resultado_conclui_a_tentativa_corrente(session: Session) -> None:
    missao = _com_evidencia(session)
    tentativa = _tentativa(_abrir(session, missao.id))
    gravada = registrar_resultado(
        session,
        tentativa,
        veredito=Veredito.ATENDE,
        feedback="Muito bom.",
        clock=lambda: DEPOIS,
    )
    assert gravada is not None
    gravada_missao, avaliacao = gravada.missao, gravada.avaliacao
    assert gravada.agora == DEPOIS
    assert gravada_missao is missao
    assert avaliacao is _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.verdict, avaliacao.feedback) == (
        EstadoDaAvaliacao.CONCLUIDA,
        Veredito.ATENDE,
        "Muito bom.",
    )
    assert avaliacao.finished_at == DEPOIS


def _superada(session: Session) -> tuple[Mission, Tentativa]:
    """A tentativa 1, depois de a orfa virar a tentativa 2 (E10)."""
    missao = _com_evidencia(session)
    primeira = _tentativa(_abrir(session, missao.id))
    _abrir(session, missao.id, agora=DEPOIS, orfa_antes_de=DEPOIS)
    return missao, primeira


def test_registrar_resultado_da_superada_nao_grava(session: Session) -> None:
    missao, primeira = _superada(session)
    assert (
        registrar_resultado(
            session,
            primeira,
            veredito=Veredito.ATENDE,
            feedback="x",
            clock=lambda: DEPOIS,
        )
        is None
    )
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.attempt, avaliacao.verdict) == (
        EstadoDaAvaliacao.AVALIANDO,
        2,
        None,
    )


def test_registrar_falha_da_corrente_grava_falhou(session: Session) -> None:
    missao = _com_evidencia(session)
    tentativa = _tentativa(_abrir(session, missao.id))
    assert registrar_falha(
        session, tentativa, falha=FalhaDaAvaliacao.TEMPO_ESGOTADO, clock=lambda: DEPOIS
    )
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.error_code, avaliacao.finished_at) == (
        EstadoDaAvaliacao.FALHOU,
        FalhaDaAvaliacao.TEMPO_ESGOTADO,
        DEPOIS,
    )


def test_registrar_falha_da_superada_nao_grava(session: Session) -> None:
    missao, primeira = _superada(session)
    assert not registrar_falha(
        session,
        primeira,
        falha=FalhaDaAvaliacao.AVALIACAO_INVALIDA,
        clock=lambda: DEPOIS,
    )
    avaliacao = _avaliacao(session, missao.id)
    assert (avaliacao.state, avaliacao.attempt, avaliacao.error_code) == (
        EstadoDaAvaliacao.AVALIANDO,
        2,
        None,
    )


def test_a_mesma_tentativa_ja_encerrada_nao_grava_de_novo(session: Session) -> None:
    """Mesmo `attempt`, estado que nao e mais `avaliando`: nem resultado depois
    da falha, nem falha depois do resultado."""
    missao = _com_evidencia(session)
    tentativa = _tentativa(_abrir(session, missao.id))
    assert registrar_falha(
        session, tentativa, falha=FalhaDaAvaliacao.TEMPO_ESGOTADO, clock=lambda: AGORA
    )
    assert (
        registrar_resultado(
            session,
            tentativa,
            veredito=Veredito.ATENDE,
            feedback="x",
            clock=lambda: DEPOIS,
        )
        is None
    )
    assert _avaliacao(session, missao.id).state is EstadoDaAvaliacao.FALHOU

    outra = _com_evidencia(session)
    corrente = _tentativa(_abrir(session, outra.id))
    registrar_resultado(
        session, corrente, veredito=Veredito.ATENDE, feedback="Ok.", clock=lambda: AGORA
    )
    assert not registrar_falha(
        session, corrente, falha=FalhaDaAvaliacao.TEMPO_ESGOTADO, clock=lambda: DEPOIS
    )
    assert _avaliacao(session, outra.id).state is EstadoDaAvaliacao.CONCLUIDA


def test_registrar_sobre_missao_apagada_e_nao_encontrada(session: Session) -> None:
    missao = _com_evidencia(session)
    tentativa = _tentativa(_abrir(session, missao.id))
    session.delete(missao)
    session.flush()
    with pytest.raises(MissaoNaoEncontradaError):
        registrar_falha(
            session,
            tentativa,
            falha=FalhaDaAvaliacao.TEMPO_ESGOTADO,
            clock=lambda: DEPOIS,
        )
    with pytest.raises(MissaoNaoEncontradaError):
        registrar_resultado(
            session,
            tentativa,
            veredito=Veredito.ATENDE,
            feedback="x",
            clock=lambda: DEPOIS,
        )
