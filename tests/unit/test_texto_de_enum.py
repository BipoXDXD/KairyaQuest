"""`TextoDeEnum`: TEXT no banco, o StrEnum no Python, nos dois sentidos.

Sem banco: o `TypeDecorator` e chamado direto, como em `test_leitura_tolerante`.
"""

from enum import StrEnum

import pytest
from sqlalchemy import Text
from sqlalchemy.dialects import postgresql

from focusquest.core.texto_de_enum import TextoDeEnum

# O `__init__` do dialeto nao tem anotacao de tipo no SQLAlchemy; ver
# `test_leitura_tolerante`.
DIALETO = postgresql.dialect()  # type: ignore[no-untyped-call]


class Cor(StrEnum):
    AZUL = "azul"
    VERDE = "verde"


class Forma(StrEnum):
    AZUL = "azul"


def test_a_volta_devolve_o_membro_e_nao_a_str_crua() -> None:
    lido = TextoDeEnum(Cor).process_result_value("verde", DIALETO)
    assert lido is Cor.VERDE


def test_valor_fora_do_enum_e_divergencia_de_esquema_e_estoura() -> None:
    with pytest.raises(ValueError, match="'roxo' is not a valid Cor"):
        TextoDeEnum(Cor).process_result_value("roxo", DIALETO)


def test_none_numa_coluna_obrigatoria_estoura_em_vez_de_passar_em_silencio() -> None:
    with pytest.raises(ValueError, match="None is not a valid Cor"):
        TextoDeEnum(Cor).process_result_value(None, DIALETO)


def test_none_numa_coluna_anulavel_volta_none() -> None:
    assert TextoDeEnum(Cor, anulavel=True).process_result_value(None, DIALETO) is None


def test_coluna_anulavel_ainda_converte_o_valor_presente() -> None:
    lido = TextoDeEnum(Cor, anulavel=True).process_result_value("azul", DIALETO)
    assert lido is Cor.AZUL


def test_a_coluna_continua_sendo_text() -> None:
    assert isinstance(TextoDeEnum(Cor).impl, Text)


def test_a_chave_de_cache_distingue_enum_e_anulabilidade() -> None:
    """`cache_ok` monta a chave dos atributos do `__init__`: se dois decoradores
    de enums ou de anulabilidade diferentes colidissem, o SQLAlchemy reusaria o
    SQL compilado de um no outro."""
    chaves = {
        TextoDeEnum(Cor)._static_cache_key,
        TextoDeEnum(Forma)._static_cache_key,
        TextoDeEnum(Cor, anulavel=True)._static_cache_key,
    }
    assert len(chaves) == 3
    assert TextoDeEnum(Cor)._static_cache_key == TextoDeEnum(Cor)._static_cache_key
