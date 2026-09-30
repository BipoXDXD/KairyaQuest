"""As regras do ciclo diario, como funcoes puras, em tabela.

Nada aqui le relogio nem toca banco: e o que deixa a meia-noite exata, a
virada da semana e a janela da especial testaveis sem viagem no tempo (spec
do ciclo diario, secao "Testes", dominio puro).
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from focusquest.modules.missions.cycle_domain import (
    NAO_CONCLUIVEIS,
    Availability,
    DiaDoPlano,
    com_inicio_a_tempo,
    dia_de,
    dias_da_semana,
    dias_para_o_marco,
    disponibilidade_da_diaria,
    disponibilidade_da_especial,
    fim_da_janela_da_especial,
    fim_do_dia,
    inicio_do_dia,
    limite_da_conclusao_tardia,
    marco_da_semana,
    marco_mais_recente,
    na_conclusao_tardia,
    segunda_da_semana,
    sequencia,
    sequencia_ate,
)
from focusquest.modules.missions.domain import (
    DIFICULDADE_DA_ESPECIAL,
    MissionType,
    xp_da_missao,
    xp_para_dificuldade,
)
from focusquest.modules.missions.schemas import DIFICULDADE_MAXIMA

# 2026-09-21 e uma segunda-feira; a semana dela vai ate o domingo 27.
SEGUNDA = date(2026, 9, 21)
TERCA = SEGUNDA + timedelta(days=1)
QUARTA = SEGUNDA + timedelta(days=2)
QUINTA = SEGUNDA + timedelta(days=3)
DOMINGO = SEGUNDA + timedelta(days=6)
UMA_SEMANA = timedelta(days=7)


def _semana(
    segunda: date, concluidas: set[int], criado_em: date | None = None
) -> dict[date, DiaDoPlano]:
    """Os 7 dias de um plano; `concluidas` sao indices (0 = segunda)."""
    criacao = segunda if criado_em is None else criado_em
    return {
        dia: DiaDoPlano(concluida=indice in concluidas, plano_criado_em=criacao)
        for indice, dia in enumerate(dias_da_semana(segunda))
    }


TODOS = set(range(7))


# --- dia e semana ----------------------------------------------------------


@pytest.mark.parametrize(
    ("instante", "esperado"),
    [
        (datetime(2026, 9, 21, 2, 59, 59, tzinfo=UTC), date(2026, 9, 20)),
        # A meia-noite exata pertence ao dia seguinte (intervalo semiaberto).
        (datetime(2026, 9, 21, 3, 0, 0, tzinfo=UTC), date(2026, 9, 21)),
        (datetime(2026, 9, 22, 2, 59, 59, 999999, tzinfo=UTC), date(2026, 9, 21)),
    ],
)
def test_o_dia_e_a_data_civil_em_sao_paulo(instante: datetime, esperado: date) -> None:
    assert dia_de(instante) == esperado


def test_instante_sem_fuso_e_recusado() -> None:
    with pytest.raises(ValueError, match="sem fuso"):
        dia_de(datetime(2026, 9, 21, 12, 0))


def test_inicio_e_fim_do_dia_sao_as_meias_noites_de_sao_paulo() -> None:
    assert inicio_do_dia(SEGUNDA) == datetime(2026, 9, 21, 3, tzinfo=UTC)
    assert fim_do_dia(SEGUNDA) == datetime(2026, 9, 22, 3, tzinfo=UTC)


@pytest.mark.parametrize("dia", dias_da_semana(SEGUNDA))
def test_a_semana_comeca_na_segunda(dia: date) -> None:
    assert segunda_da_semana(dia) == SEGUNDA


def test_os_sete_dias_da_semana() -> None:
    assert dias_da_semana(SEGUNDA) == [SEGUNDA + timedelta(days=i) for i in range(7)]


# --- disponibilidade da diaria (hoje = quarta) ----------------------------


@pytest.mark.parametrize(
    ("dia", "concluida", "criado_em", "esperado"),
    [
        (QUARTA, True, SEGUNDA, Availability.CONCLUIDA),
        (SEGUNDA, False, QUARTA, Availability.FORA_DO_PLANO),
        (QUINTA, False, SEGUNDA, Availability.BLOQUEADA),
        (QUARTA, False, SEGUNDA, Availability.DISPONIVEL),
        (SEGUNDA, False, SEGUNDA, Availability.PERDIDA),
    ],
)
def test_disponibilidade_da_diaria(
    dia: date, concluida: bool, criado_em: date, esperado: Availability
) -> None:
    estado = DiaDoPlano(concluida=concluida, plano_criado_em=criado_em)
    assert disponibilidade_da_diaria(dia, estado, QUARTA) is esperado


def test_nao_concluiveis_sao_o_que_ja_passou_ou_nao_era_do_plano() -> None:
    assert (
        frozenset(
            {Availability.FORA_DO_PLANO, Availability.PERDIDA, Availability.EXPIRADA}
        )
        == NAO_CONCLUIVEIS
    )


# --- sequencia -------------------------------------------------------------


def test_sem_historico_a_sequencia_e_zero() -> None:
    assert sequencia({}, SEGUNDA) == 0
    assert sequencia_ate({}, SEGUNDA) == 0


def test_a_diaria_de_hoje_em_aberto_nao_quebra() -> None:
    assert sequencia(_semana(SEGUNDA, {0, 1}), QUARTA) == 2


def test_a_diaria_de_hoje_concluida_conta() -> None:
    assert sequencia(_semana(SEGUNDA, {0, 1, 2}), QUARTA) == 3


def test_um_dia_perdido_quebra_a_sequencia() -> None:
    historico = _semana(SEGUNDA, {0, 2})
    assert sequencia(historico, QUARTA) == 1
    assert sequencia(historico, QUINTA) == 1


def test_a_sequencia_atravessa_semanas() -> None:
    historico = {
        **_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}),
        **_semana(SEGUNDA, {0, 1}),
    }
    assert sequencia(historico, TERCA) == 6


def test_dia_sem_plano_nao_conta_nem_quebra() -> None:
    """Semana S-2 inteira, S-1 sem plano, segunda de S concluida: 7 + 1."""
    historico = {
        **_semana(SEGUNDA - 2 * UMA_SEMANA, TODOS),
        **_semana(SEGUNDA, {0}),
    }
    assert sequencia(historico, SEGUNDA) == 8


def test_dia_fora_do_plano_nao_conta_nem_quebra() -> None:
    """Plano criado na quarta: segunda e terca ficam fora, e sao puladas."""
    historico = {
        **_semana(SEGUNDA - UMA_SEMANA, TODOS),
        **_semana(SEGUNDA, {2}, criado_em=QUARTA),
    }
    assert sequencia(historico, QUARTA) == 8


@pytest.mark.parametrize(("s", "faltam"), [(0, 7), (6, 1), (7, 7), (8, 6)])
def test_dias_para_o_marco(s: int, faltam: int) -> None:
    assert dias_para_o_marco(s) == faltam


# --- marco -----------------------------------------------------------------


def test_o_marco_no_domingo() -> None:
    historico = _semana(SEGUNDA, TODOS)
    assert sequencia_ate(historico, DOMINGO) == 7
    assert marco_da_semana(historico, SEGUNDA) == DOMINGO


def test_sem_sete_dias_nao_ha_marco() -> None:
    assert marco_da_semana(_semana(SEGUNDA, {0, 1, 2, 3, 4, 5}), SEGUNDA) is None


def test_o_marco_no_meio_da_semana() -> None:
    historico = {
        **_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}),
        **_semana(SEGUNDA, {0, 1, 2}),
    }
    assert marco_da_semana(historico, SEGUNDA) == QUARTA


def test_sequencia_de_14_da_uma_especial_em_cada_semana() -> None:
    historico = {**_semana(SEGUNDA, TODOS), **_semana(SEGUNDA + UMA_SEMANA, TODOS)}
    assert sequencia(historico, DOMINGO + UMA_SEMANA) == 14
    assert marco_da_semana(historico, SEGUNDA) == DOMINGO
    assert marco_da_semana(historico, SEGUNDA + UMA_SEMANA) == DOMINGO + UMA_SEMANA


def test_marco_mais_recente_da_semana_atual() -> None:
    historico = {
        **_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}),
        **_semana(SEGUNDA, {0, 1, 2}),
    }
    assert marco_mais_recente(historico, QUINTA) == QUARTA


def test_marco_mais_recente_da_semana_anterior() -> None:
    """Marco no domingo de S; na segunda de S+1 ele ainda e o mais recente."""
    historico = _semana(SEGUNDA, TODOS)
    assert marco_mais_recente(historico, SEGUNDA + UMA_SEMANA) == DOMINGO


def test_sem_marco_recente() -> None:
    assert marco_mais_recente(_semana(SEGUNDA, {0}), QUARTA) is None


# --- especial --------------------------------------------------------------


def test_a_janela_da_especial_vai_ate_o_fim_do_dia_seguinte() -> None:
    # Marco no domingo 27: a janela fecha na meia-noite de terca 29 em SP.
    assert fim_da_janela_da_especial(DOMINGO) == datetime(2026, 9, 29, 3, tzinfo=UTC)


def test_especial_sem_marco_esta_bloqueada() -> None:
    agora = datetime(2026, 9, 23, 15, tzinfo=UTC)
    assert disponibilidade_da_especial(None, False, agora) is Availability.BLOQUEADA


def test_especial_concluida_continua_concluida_depois_da_janela() -> None:
    depois = fim_da_janela_da_especial(DOMINGO) + timedelta(days=30)
    assert disponibilidade_da_especial(DOMINGO, True, depois) is Availability.CONCLUIDA


@pytest.mark.parametrize(
    ("agora", "esperado"),
    [
        (inicio_do_dia(DOMINGO), Availability.DISPONIVEL),
        (
            fim_da_janela_da_especial(DOMINGO) - timedelta(microseconds=1),
            Availability.DISPONIVEL,
        ),
        (fim_da_janela_da_especial(DOMINGO), Availability.EXPIRADA),
    ],
)
def test_especial_na_borda_da_janela(agora: datetime, esperado: Availability) -> None:
    assert disponibilidade_da_especial(DOMINGO, False, agora) is esperado


# --- F25: a missao iniciada a tempo pode ser concluida depois do prazo -------

PRAZO_DA_QUARTA = fim_do_dia(QUARTA)  # quinta 00:00 em SP
INICIO_A_TEMPO = PRAZO_DA_QUARTA - timedelta(minutes=10)  # quarta 23:50


def test_o_limite_da_conclusao_tardia_e_o_fim_do_dia_seguinte_ao_prazo() -> None:
    # Prazo da diaria de quarta: quinta 00:00; limite: sexta 00:00 (SP).
    assert limite_da_conclusao_tardia(PRAZO_DA_QUARTA) == fim_do_dia(QUINTA)
    assert limite_da_conclusao_tardia(PRAZO_DA_QUARTA) == datetime(
        2026, 9, 25, 3, tzinfo=UTC
    )
    # Especial do marco no domingo: janela ate terca 00:00, limite quarta 00:00.
    assert limite_da_conclusao_tardia(fim_da_janela_da_especial(DOMINGO)) == fim_do_dia(
        DOMINGO + timedelta(days=2)
    )


@pytest.mark.parametrize("vencida", [Availability.PERDIDA, Availability.EXPIRADA])
@pytest.mark.parametrize(
    ("iniciada_em", "agora", "esperado"),
    [
        # Iniciada as 23:50, concluida as 00:10: ainda disponivel.
        (INICIO_A_TEMPO, PRAZO_DA_QUARTA + timedelta(minutes=10), "disponivel"),
        # Ate o ultimo instante do dia seguinte.
        (
            INICIO_A_TEMPO,
            fim_do_dia(QUINTA) - timedelta(microseconds=1),
            "disponivel",
        ),
        # No limite (semiaberto), ja passou.
        (INICIO_A_TEMPO, fim_do_dia(QUINTA), "vencida"),
        # Nunca iniciada: continua vencida (pendente depois do prazo).
        (None, PRAZO_DA_QUARTA + timedelta(minutes=10), "vencida"),
        # Iniciada no proprio prazo (ou depois) nao e "a tempo".
        (PRAZO_DA_QUARTA, PRAZO_DA_QUARTA + timedelta(minutes=10), "vencida"),
    ],
)
def test_com_inicio_a_tempo_reabre_so_a_vencida_iniciada_antes_do_prazo(
    vencida: Availability,
    iniciada_em: datetime | None,
    agora: datetime,
    esperado: str,
) -> None:
    resultado = com_inicio_a_tempo(vencida, PRAZO_DA_QUARTA, iniciada_em, agora)
    assert resultado is (
        Availability.DISPONIVEL if esperado == "disponivel" else vencida
    )


@pytest.mark.parametrize(
    "outra",
    [
        Availability.FORA_DO_PLANO,
        Availability.BLOQUEADA,
        Availability.DISPONIVEL,
        Availability.CONCLUIDA,
    ],
)
def test_com_inicio_a_tempo_nao_mexe_no_que_nao_venceu(outra: Availability) -> None:
    """Fora do plano nunca pode ser iniciada; o resto nao e prazo vencido."""
    agora = PRAZO_DA_QUARTA + timedelta(minutes=10)
    assert com_inicio_a_tempo(outra, PRAZO_DA_QUARTA, INICIO_A_TEMPO, agora) is outra


_DEPOIS = PRAZO_DA_QUARTA + timedelta(minutes=10)
_LIMITE = fim_do_dia(QUINTA)


@pytest.mark.parametrize(
    ("agora", "disponibilidade", "concluida_em", "esperado"),
    [
        # Antes do prazo nao e tardia: e a missao de sempre.
        (
            PRAZO_DA_QUARTA - timedelta(microseconds=1),
            Availability.DISPONIVEL,
            None,
            False,
        ),
        # Depois do prazo, reaberta pela F25.
        (_DEPOIS, Availability.DISPONIVEL, None, True),
        # Vencida sem inicio: nao aparece.
        (_DEPOIS, Availability.PERDIDA, None, False),
        # Concluida com atraso: continua a vista ate o limite.
        (_DEPOIS, Availability.CONCLUIDA, _DEPOIS, True),
        (_LIMITE - timedelta(microseconds=1), Availability.CONCLUIDA, _DEPOIS, True),
        (_LIMITE, Availability.CONCLUIDA, _DEPOIS, False),
        # Concluida exatamente no prazo ja e atraso (o intervalo e semiaberto).
        (_DEPOIS, Availability.CONCLUIDA, PRAZO_DA_QUARTA, True),
        # Concluida a tempo: nao e tardia.
        (
            _DEPOIS,
            Availability.CONCLUIDA,
            PRAZO_DA_QUARTA - timedelta(microseconds=1),
            False,
        ),
    ],
)
def test_na_conclusao_tardia(
    agora: datetime,
    disponibilidade: Availability,
    concluida_em: datetime | None,
    esperado: bool,
) -> None:
    assert (
        na_conclusao_tardia(PRAZO_DA_QUARTA, disponibilidade, concluida_em, agora)
        is esperado
    )


# --- XP da especial ----------------------------------------------------------


def test_a_especial_vale_o_triplo_da_dificuldade_maxima() -> None:
    assert xp_da_missao(MissionType.ESPECIAL, DIFICULDADE_DA_ESPECIAL) == 660


@pytest.mark.parametrize("tipo", [MissionType.AVULSA, MissionType.DIARIA])
def test_avulsa_e_diaria_valem_a_curva_da_dificuldade(tipo: MissionType) -> None:
    assert xp_da_missao(tipo, 3) == xp_para_dificuldade(3)


def test_a_dificuldade_da_especial_e_a_maxima_aceita_pela_api() -> None:
    """Duas constantes que precisam ser a mesma: a regra (dominio) e a borda."""
    assert DIFICULDADE_DA_ESPECIAL == DIFICULDADE_MAXIMA
