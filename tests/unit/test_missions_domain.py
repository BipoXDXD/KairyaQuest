"""Regras da missao, sem banco e sem framework."""

from datetime import UTC, datetime, timedelta

import pytest

from focusquest.modules.missions.domain import (
    MissionState,
    TransicaoIlegalError,
    duracao_real,
    validar_transicao,
    xp_para_dificuldade,
)


@pytest.mark.parametrize(
    ("atual", "destino"),
    [
        (MissionState.PENDENTE, MissionState.EM_ANDAMENTO),
        (MissionState.PENDENTE, MissionState.CONCLUIDA),
        (MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA),
    ],
)
def test_transicoes_legais(atual: MissionState, destino: MissionState) -> None:
    validar_transicao(atual, destino)


@pytest.mark.parametrize(
    ("atual", "destino"),
    [
        (MissionState.CONCLUIDA, MissionState.PENDENTE),
        (MissionState.CONCLUIDA, MissionState.EM_ANDAMENTO),
        (MissionState.CONCLUIDA, MissionState.CONCLUIDA),
        (MissionState.EM_ANDAMENTO, MissionState.PENDENTE),
        (MissionState.PENDENTE, MissionState.PENDENTE),
    ],
)
def test_transicoes_ilegais_explicam_o_bloqueio(
    atual: MissionState, destino: MissionState
) -> None:
    with pytest.raises(TransicaoIlegalError) as erro:
        validar_transicao(atual, destino)
    # O README s8 exige "Explique bloqueios": a mensagem precisa nomear
    # os dois estados, nao apenas dizer "invalido".
    assert atual.value in str(erro.value)
    assert destino.value in str(erro.value)


def test_concluida_e_terminal() -> None:
    for destino in MissionState:
        with pytest.raises(TransicaoIlegalError):
            validar_transicao(MissionState.CONCLUIDA, destino)


def test_duracao_real_e_none_enquanto_nao_concluida() -> None:
    assert duracao_real(datetime.now(UTC), None) is None
    assert duracao_real(None, None) is None


def test_duracao_real_quando_concluida() -> None:
    inicio = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
    fim = datetime(2026, 9, 17, 11, 30, tzinfo=UTC)
    assert duracao_real(inicio, fim) == timedelta(hours=1, minutes=30)


def test_duracao_real_sem_inicio_e_none() -> None:
    assert duracao_real(None, datetime.now(UTC)) is None


@pytest.mark.parametrize("dificuldade", [1, 2, 3, 4, 5])
def test_xp_cresce_com_a_dificuldade(dificuldade: int) -> None:
    if dificuldade > 1:
        assert xp_para_dificuldade(dificuldade) > xp_para_dificuldade(dificuldade - 1)


def test_xp_e_sempre_positivo() -> None:
    for dificuldade in range(1, 11):
        assert xp_para_dificuldade(dificuldade) > 0


def test_xp_rejeita_dificuldade_invalida() -> None:
    with pytest.raises(ValueError):
        xp_para_dificuldade(0)
    with pytest.raises(ValueError):
        xp_para_dificuldade(-1)
