"""A curva de nivel e o catalogo de conquistas: regras puras (spec, D4 e D9)."""

from datetime import date, timedelta

import pytest

from focusquest.modules.missions.cycle_domain import DiaDoPlano
from focusquest.modules.progression.domain import (
    CATALOGO,
    Codigo,
    FaixaDoNivel,
    FatosDoUsuario,
    conquistas_satisfeitas,
    faixa_do_nivel,
    maior_sequencia,
    nivel_do_saldo,
    xp_para_o_nivel,
)

SEGUNDA = date(2026, 9, 21)


@pytest.mark.parametrize(
    ("xp", "nivel"),
    [
        (0, 1),
        (99, 1),
        (100, 2),
        (299, 2),
        (300, 3),
        (999, 4),
        (1000, 5),
        (19000, 20),
        # Um XP abaixo do piso do nivel 8388609: a raiz em ponto flutuante de
        # 1 + 4*xp/50 arredonda para cima e erra o nivel (R4 corrigida).
        (3518437628313599, 8388608),
        # Um XP abaixo do piso do nivel 83886081: aqui nem a divisao inteira
        # salva o float -- int(math.sqrt(1 + 4*(xp//50))) erra por um. Ainda
        # cabe num inteiro de 64 bits.
        (351843725082623999, 83886080),
    ],
)
def test_nivel_do_saldo_nas_bordas(xp: int, nivel: int) -> None:
    assert nivel_do_saldo(xp) == nivel


@pytest.mark.parametrize(
    ("nivel", "xp"), [(1, 0), (2, 100), (3, 300), (5, 1000), (10, 4500), (20, 19000)]
)
def test_xp_para_o_nivel_e_a_tabela_da_spec(nivel: int, xp: int) -> None:
    assert xp_para_o_nivel(nivel) == xp


def test_nivel_do_saldo_e_o_inverso_da_curva_ate_o_nivel_200() -> None:
    # No nivel 1 o piso e 0; piso - 1 seria -1, um saldo invalido (ja coberto
    # por test_saldo_negativo_e_recusado), entao a checagem "abaixo do piso"
    # so faz sentido a partir do nivel 2.
    for nivel in range(1, 201):
        piso = xp_para_o_nivel(nivel)
        assert nivel_do_saldo(piso) == nivel
        if piso > 0:
            assert nivel_do_saldo(piso - 1) == max(1, nivel - 1)


def test_saldo_negativo_e_recusado() -> None:
    with pytest.raises(ValueError, match="saldo"):
        nivel_do_saldo(-1)


def test_nivel_zero_e_recusado() -> None:
    with pytest.raises(ValueError, match="nivel"):
        xp_para_o_nivel(0)


@pytest.mark.parametrize(
    ("xp", "faixa"),
    [
        (0, FaixaDoNivel(1, 0, 100)),
        (1000, FaixaDoNivel(5, 1000, 1500)),
        (1340, FaixaDoNivel(5, 1000, 1500)),
        (1499, FaixaDoNivel(5, 1000, 1500)),
    ],
)
def test_faixa_do_nivel(xp: int, faixa: FaixaDoNivel) -> None:
    assert faixa_do_nivel(xp) == faixa


def test_o_catalogo_tem_os_sete_codigos_na_ordem_do_painel() -> None:
    assert [c.codigo.value for c in CATALOGO] == [
        "first_steps",
        "streak_7",
        "streak_30",
        "veteran_10",
        "veteran_50",
        "veteran_100",
        "tifa_partnership",
    ]
    assert [c.titulo for c in CATALOGO] == [
        "Primeiros passos",
        "Uma semana inteira",
        "Um mês de hábito",
        "Veterano I",
        "Veterano II",
        "Veterano III",
        "Parceria com a Tifa",
    ]


def _fatos(
    concluidas: int = 0, sequencia: int = 0, tifa: bool = False
) -> FatosDoUsuario:
    return FatosDoUsuario(
        missoes_concluidas=concluidas,
        maior_sequencia=sequencia,
        concluiu_missao_da_tifa=tifa,
    )


@pytest.mark.parametrize(
    ("codigo", "abaixo", "no_limite"),
    [
        (Codigo.FIRST_STEPS, _fatos(concluidas=0), _fatos(concluidas=1)),
        (Codigo.STREAK_7, _fatos(sequencia=6), _fatos(sequencia=7)),
        (Codigo.STREAK_30, _fatos(sequencia=29), _fatos(sequencia=30)),
        (Codigo.VETERAN_10, _fatos(concluidas=9), _fatos(concluidas=10)),
        (Codigo.VETERAN_50, _fatos(concluidas=49), _fatos(concluidas=50)),
        (Codigo.VETERAN_100, _fatos(concluidas=99), _fatos(concluidas=100)),
        (Codigo.TIFA_PARTNERSHIP, _fatos(tifa=False), _fatos(tifa=True)),
    ],
)
def test_cada_regra_no_limite(
    codigo: Codigo, abaixo: FatosDoUsuario, no_limite: FatosDoUsuario
) -> None:
    assert codigo not in conquistas_satisfeitas(abaixo)
    assert codigo in conquistas_satisfeitas(no_limite)


def _dias(inicio: date, concluidas: list[bool]) -> dict[date, DiaDoPlano]:
    return {
        inicio + timedelta(days=i): DiaDoPlano(concluida=feita, plano_criado_em=inicio)
        for i, feita in enumerate(concluidas)
    }


def test_maior_sequencia_sem_historico_e_zero() -> None:
    assert maior_sequencia({}) == 0


def test_maior_sequencia_e_a_maior_ja_atingida_nao_a_atual() -> None:
    historico = _dias(SEGUNDA, [True] * 7 + [False] + [True] * 2)
    assert maior_sequencia(historico) == 7
