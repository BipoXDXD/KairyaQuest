"""O dominio da entrega e da avaliacao: sem banco, sem relogio (Incremento E)."""

import pytest

from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    MissionState,
    MissionType,
    TransicaoIlegalError,
    Veredito,
    Verificacao,
    validar_transicao_da_avaliacao,
    verificacao_da_missao,
    xp_da_missao,
)
from focusquest.modules.progression.domain import bonus_da_avaliacao


@pytest.mark.parametrize(
    ("veredito", "xp", "esperado"),
    [
        (Veredito.ATENDE, 220, 110),
        (Veredito.ATENDE, 20, 10),
        # XP impar: divisao inteira, para baixo (E7).
        (Veredito.ATENDE, 101, 50),
        (Veredito.ATENDE, xp_da_missao(MissionType.ESPECIAL, 5), 330),
        (Veredito.PARCIAL, 220, 0),
        (Veredito.NAO_ATENDE, 220, 0),
    ],
)
def test_bonus_da_avaliacao(veredito: Veredito, xp: int, esperado: int) -> None:
    assert bonus_da_avaliacao(veredito, xp) == esperado


@pytest.mark.parametrize(
    ("estado", "tem_evidencia", "esperado"),
    [
        (MissionState.PENDENTE, False, None),
        (MissionState.EM_ANDAMENTO, False, None),
        (MissionState.CONCLUIDA, False, Verificacao.AUTODECLARADA),
        (MissionState.CONCLUIDA, True, Verificacao.COM_EVIDENCIA),
    ],
)
def test_verificacao_da_missao(
    estado: MissionState, tem_evidencia: bool, esperado: Verificacao | None
) -> None:
    assert verificacao_da_missao(estado, tem_evidencia) is esperado


def test_evidencia_em_missao_nao_concluida_e_defeito_e_nao_vira_verificacao() -> None:
    """A evidencia so e gravada na conclusao (spec, "Modelo de dados"): uma
    pendente com evidencia e estado impossivel, e dizer "com evidencia" sobre
    ela afirmaria uma entrega que nao aconteceu."""
    with pytest.raises(ValueError, match="nao concluida"):
        verificacao_da_missao(MissionState.PENDENTE, True)


_LEGAIS = [
    (EstadoDaAvaliacao.AVALIANDO, EstadoDaAvaliacao.CONCLUIDA),
    (EstadoDaAvaliacao.AVALIANDO, EstadoDaAvaliacao.FALHOU),
    (EstadoDaAvaliacao.FALHOU, EstadoDaAvaliacao.AVALIANDO),
]

# O complemento das legais entre TODOS os pares (9 - 3 = 6), gerado e nao
# escrito a mao: uma transicao nova no enum entra aqui como ilegal ate alguem
# decidir o contrario.
_ILEGAIS = [
    (atual, destino)
    for atual in EstadoDaAvaliacao
    for destino in EstadoDaAvaliacao
    if (atual, destino) not in _LEGAIS
]


@pytest.mark.parametrize(("atual", "destino"), _LEGAIS)
def test_transicoes_legais_da_avaliacao(
    atual: EstadoDaAvaliacao, destino: EstadoDaAvaliacao
) -> None:
    # Sem assercao explicita de proposito: a transicao legal passa por nao levantar.
    validar_transicao_da_avaliacao(atual, destino)


@pytest.mark.parametrize(("atual", "destino"), _ILEGAIS)
def test_transicoes_ilegais_da_avaliacao(
    atual: EstadoDaAvaliacao, destino: EstadoDaAvaliacao
) -> None:
    # A mensagem traz os dois estados: "ir de 'atual' para 'destino'".
    with pytest.raises(
        TransicaoIlegalError,
        match=f"ir de '{atual.value}' para '{destino.value}'",
    ):
        validar_transicao_da_avaliacao(atual, destino)
