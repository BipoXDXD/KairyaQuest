"""As transicoes da acao proposta pela Kairya."""

import pytest

from focusquest.modules.missions.domain import TransicaoIlegalError
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    validar_transicao_da_acao,
)

_LEGAIS = [
    (EstadoDaAcao.PROPOSTA, EstadoDaAcao.EXECUTADA),
    (EstadoDaAcao.PROPOSTA, EstadoDaAcao.RECUSADA),
    (EstadoDaAcao.PROPOSTA, EstadoDaAcao.FALHOU),
]


@pytest.mark.parametrize(("atual", "destino"), _LEGAIS)
def test_transicoes_legais(atual: EstadoDaAcao, destino: EstadoDaAcao) -> None:
    validar_transicao_da_acao(atual, destino)


@pytest.mark.parametrize(
    ("atual", "destino"),
    [
        (atual, destino)
        for atual in EstadoDaAcao
        for destino in EstadoDaAcao
        if (atual, destino) not in _LEGAIS
    ],
)
def test_todo_o_resto_e_ilegal(atual: EstadoDaAcao, destino: EstadoDaAcao) -> None:
    """Os tres estados de decisao sao terminais, e proposta->proposta nao e
    transicao. A lista e o complemento de `_LEGAIS`: um estado novo entra aqui
    sozinho, ilegal ate alguem o declarar legal."""
    with pytest.raises(TransicaoIlegalError, match=atual.value):
        validar_transicao_da_acao(atual, destino)
