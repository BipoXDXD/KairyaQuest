"""Os limites de negocio da missao avulsa (pendencia 26), sem banco.

A regra recebe o instante `agora` como argumento: o schema nao le relogio, e
quem chama (a rota, o servico do reagendamento) passa o instante que o relogio
injetado devolveu. Os valores esperados sao literais escritos a mao, nunca
recalculados com as constantes do modulo.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from focusquest.core.errors import EstimativaForaDoLimite, PrazoForaDoLimite
from focusquest.modules.missions.service import (
    validar_limites_da_avulsa,
    validar_prazo_da_avulsa,
)

AGORA = datetime(2026, 11, 10, 15, 0, tzinfo=UTC)
PRAZO_VALIDO = AGORA + timedelta(days=1)
SAO_PAULO = ZoneInfo("America/Sao_Paulo")


@pytest.mark.parametrize("minutos", [1, 1440], ids=["piso", "teto"])
def test_estimativa_na_borda_e_aceita(minutos: int) -> None:
    validar_limites_da_avulsa(minutos, PRAZO_VALIDO, AGORA)


@pytest.mark.parametrize(
    "minutos", [-1, 0, 1441, 2**31 - 1], ids=["negativo", "zero", "teto+1", "int4"]
)
def test_estimativa_fora_da_faixa_e_recusada(minutos: int) -> None:
    with pytest.raises(EstimativaForaDoLimite) as erro:
        validar_limites_da_avulsa(minutos, PRAZO_VALIDO, AGORA)
    # Explique bloqueios (README s8): a mensagem diz a faixa aceita.
    assert str(erro.value) == (
        f"a estimativa precisa ficar entre 1 e 1440 minutos; veio {minutos}"
    )


@pytest.mark.parametrize(
    "prazo",
    [
        AGORA + timedelta(seconds=1),
        AGORA + timedelta(days=365),
        # O mesmo instante do teto escrito em outro fuso: instantes comparam
        # como instantes.
        (AGORA + timedelta(days=365)).astimezone(SAO_PAULO),
    ],
    ids=["agora+1s", "agora+365d", "agora+365d em -03:00"],
)
def test_prazo_dentro_da_janela_e_aceito(prazo: datetime) -> None:
    validar_limites_da_avulsa(30, prazo, AGORA)
    validar_prazo_da_avulsa(prazo, AGORA)


@pytest.mark.parametrize(
    "prazo",
    [
        AGORA - timedelta(days=1),
        AGORA,
        AGORA + timedelta(days=365, seconds=1),
        datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC),
    ],
    ids=["ontem", "agora", "agora+365d+1s", "ano 9999"],
)
def test_prazo_fora_da_janela_e_recusado(prazo: datetime) -> None:
    with pytest.raises(PrazoForaDoLimite) as erro:
        validar_limites_da_avulsa(30, prazo, AGORA)
    assert "365" in str(erro.value)
    with pytest.raises(PrazoForaDoLimite):
        validar_prazo_da_avulsa(prazo, AGORA)


def test_a_estimativa_e_conferida_antes_do_prazo() -> None:
    """Com os dois fora, o erro e o da estimativa: a ordem e fixa, e a tela
    recebe sempre o mesmo `code` para o mesmo pedido."""
    with pytest.raises(EstimativaForaDoLimite):
        validar_limites_da_avulsa(0, AGORA, AGORA)


def test_instante_sem_fuso_e_recusado_alto() -> None:
    """Comparar naive com aware estouraria `TypeError` cru (500). Quem chega
    aqui ja passou pela borda com fuso; sem fuso e defeito de quem chamou."""
    with pytest.raises(ValueError, match="fuso"):
        validar_prazo_da_avulsa(datetime(2026, 11, 11, 15, 0), AGORA)
    with pytest.raises(ValueError, match="fuso"):
        validar_prazo_da_avulsa(PRAZO_VALIDO, datetime(2026, 11, 10, 15, 0))
