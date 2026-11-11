"""Tolerant reader dos valores renomeados pela migracao 0008 (Tarefa 2.1).

O dominio so escreve os valores novos (`kairya`, `kairya_partnership`). Ate a
Tarefa 2.2 (o contract), o CHECK do banco ainda aceita o valor antigo, entao
uma linha antiga pode chegar -- de um backup restaurado, por exemplo. A leitura
a normaliza no adaptador de persistencia, antes de chegar ao dominio ou ao
contrato JSON. Sem banco: o `TypeDecorator` e chamado direto.
"""

import pytest
from sqlalchemy.dialects import postgresql

from focusquest.modules.missions.domain import OrigemDoReagendamento
from focusquest.modules.missions.models import OrigemDoReagendamentoText
from focusquest.modules.progression.domain import Codigo
from focusquest.modules.progression.models import CodigoText

# O `__init__` do dialeto nao tem anotacao de tipo no SQLAlchemy, e o mypy
# estrito recusa a chamada; o `TypeDecorator` so exige o argumento.
DIALETO = postgresql.dialect()  # type: ignore[no-untyped-call]


def test_o_dominio_escreve_so_os_valores_novos() -> None:
    assert OrigemDoReagendamento.KAIRYA.value == "kairya"
    assert Codigo.KAIRYA_PARTNERSHIP.value == "kairya_partnership"


@pytest.mark.parametrize(
    ("guardado", "lido"),
    [
        ("usuario", OrigemDoReagendamento.USUARIO),
        ("kairya", OrigemDoReagendamento.KAIRYA),
        ("tifa", OrigemDoReagendamento.KAIRYA),
    ],
)
def test_a_origem_lida_chega_normalizada(
    guardado: str, lido: OrigemDoReagendamento
) -> None:
    valor = OrigemDoReagendamentoText().process_result_value(guardado, DIALETO)
    assert valor is lido


def test_a_origem_desconhecida_falha_alto() -> None:
    with pytest.raises(ValueError, match="sistema"):
        OrigemDoReagendamentoText().process_result_value("sistema", DIALETO)


@pytest.mark.parametrize(
    ("guardado", "lido"),
    [
        ("first_steps", Codigo.FIRST_STEPS),
        ("kairya_partnership", Codigo.KAIRYA_PARTNERSHIP),
        ("tifa_partnership", Codigo.KAIRYA_PARTNERSHIP),
    ],
)
def test_o_codigo_lido_chega_normalizado(guardado: str, lido: Codigo) -> None:
    assert CodigoText().process_result_value(guardado, DIALETO) is lido


def test_o_codigo_desconhecido_falha_alto() -> None:
    with pytest.raises(ValueError, match="streak_365"):
        CodigoText().process_result_value("streak_365", DIALETO)


def test_a_origem_nula_falha_alto() -> None:
    # NOT NULL e sem outer join: NULL e divergencia de esquema, nao valor.
    with pytest.raises(ValueError, match="None"):
        OrigemDoReagendamentoText().process_result_value(None, DIALETO)


def test_o_codigo_nulo_continua_nulo() -> None:
    # O LEFT JOIN de `ler_progresso` traz `code` NULL para quem nao tem conquista.
    assert CodigoText().process_result_value(None, DIALETO) is None
