"""O dominio do acompanhamento: sem banco, sem relogio (Incremento F)."""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import TypeAdapter, ValidationError

from focusquest.modules.missions.domain import (
    MissionState,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    ProblemaDoNovoPrazo,
    TipoDeOperacao,
    TransicaoIlegalError,
    prazo_em_utc,
    problema_do_novo_prazo,
    validar_reagendamento,
    validar_transicao,
)
from focusquest.modules.missions.schemas import PrazoComFuso

AGORA = datetime(2026, 9, 29, 15, 0, tzinfo=UTC)
ATUAL = AGORA + timedelta(days=2)
SAO_PAULO = timezone(timedelta(hours=-3))


def test_os_motivos_sao_os_tres_do_readme() -> None:
    """README s5: distinguir dificuldade, falta de tempo e mudanca de prioridade."""
    assert [m.value for m in MotivoDoReagendamento] == [
        "dificuldade",
        "falta_de_tempo",
        "mudanca_de_prioridade",
    ]


def test_as_origens_e_os_tipos_de_operacao() -> None:
    assert [o.value for o in OrigemDoReagendamento] == ["usuario", "tifa"]
    assert [t.value for t in TipoDeOperacao] == ["complete", "start", "reschedule"]


@pytest.mark.parametrize(
    ("novo", "esperado"),
    [
        (ATUAL + timedelta(days=1), None),
        # Antecipar e permitido (F9).
        (AGORA + timedelta(minutes=1), None),
        (AGORA, ProblemaDoNovoPrazo.NO_PASSADO),
        (AGORA - timedelta(seconds=1), ProblemaDoNovoPrazo.NO_PASSADO),
        (ATUAL, ProblemaDoNovoPrazo.INALTERADO),
        # O mesmo instante escrito em outro fuso e o mesmo prazo.
        (ATUAL.astimezone(SAO_PAULO), ProblemaDoNovoPrazo.INALTERADO),
    ],
)
def test_problema_do_novo_prazo(
    novo: datetime, esperado: ProblemaDoNovoPrazo | None
) -> None:
    assert problema_do_novo_prazo(novo, ATUAL, AGORA) is esperado


def test_prazo_passado_igual_ao_atual_e_antes_de_tudo_passado() -> None:
    vencido = AGORA - timedelta(days=1)
    assert (
        problema_do_novo_prazo(vencido, vencido, AGORA)
        is ProblemaDoNovoPrazo.NO_PASSADO
    )


@pytest.mark.parametrize("campo", ["novo", "atual", "agora"])
def test_instante_sem_fuso_e_recusado(campo: str) -> None:
    valores = {"novo": ATUAL + timedelta(days=1), "atual": ATUAL, "agora": AGORA}
    valores[campo] = valores[campo].replace(tzinfo=None)
    with pytest.raises(ValueError, match="sem fuso"):
        problema_do_novo_prazo(valores["novo"], valores["atual"], valores["agora"])


@pytest.mark.parametrize("estado", [MissionState.PENDENTE, MissionState.EM_ANDAMENTO])
def test_reagendar_vale_antes_de_concluir(estado: MissionState) -> None:
    validar_reagendamento(estado)


def test_reagendar_concluida_e_transicao_ilegal() -> None:
    with pytest.raises(TransicaoIlegalError, match="reagendar uma missao 'concluida'"):
        validar_reagendamento(MissionState.CONCLUIDA)


def test_iniciar_so_de_pendente() -> None:
    """A transicao ja existia (1a); o F e o primeiro a usa-la."""
    validar_transicao(MissionState.PENDENTE, MissionState.EM_ANDAMENTO)
    for estado in (MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA):
        with pytest.raises(TransicaoIlegalError):
            validar_transicao(estado, MissionState.EM_ANDAMENTO)


@pytest.mark.parametrize("valor", ["2026-10-01T10:00:00", "9999-12-31T23:59:59-03:00"])
def test_prazo_com_fuso_recusa_sem_fuso_e_irrepresentavel(valor: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(PrazoComFuso).validate_python(valor)


def test_prazo_em_utc_normaliza_o_instante() -> None:
    """O mesmo instante, so que em UTC: a grafia muda, o instante nao."""
    em_sp = datetime(2026, 10, 1, 10, 0, tzinfo=SAO_PAULO)
    normalizado = prazo_em_utc(em_sp)
    assert normalizado == em_sp
    assert normalizado.tzinfo is UTC


def test_prazo_em_utc_recusa_instante_sem_fuso() -> None:
    """Sem fuso, `astimezone` assumiria o fuso da MAQUINA em silencio (revisao
    da T4, I1): 10:00 viraria 13:00Z num Mac em -03:00 e 10:00Z num container
    em UTC."""
    with pytest.raises(ValueError, match="sem fuso"):
        prazo_em_utc(datetime(2026, 10, 1, 10, 0))


def test_prazo_em_utc_recusa_instante_fora_da_faixa() -> None:
    """A data local cabe no `datetime`, o instante em UTC nao: o
    `OverflowError` cru vira o mesmo `ValueError` da borda."""
    with pytest.raises(ValueError, match="fora da faixa"):
        prazo_em_utc(datetime(9999, 12, 31, 23, 59, 59, tzinfo=SAO_PAULO))
