"""TEXT no banco, o StrEnum no Python -- nos dois sentidos."""

from enum import StrEnum
from typing import Any

from sqlalchemy import Text
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator


class TextoDeEnum[E: StrEnum](TypeDecorator[E]):
    """TEXT no banco, o StrEnum no Python.

    Sem este decorador a anotacao `Mapped[Enum]` so valeria na IDA: o enum e
    StrEnum, entao o driver grava 'pendente' sem ajuda nenhuma. E a VOLTA que
    quebra -- o PostgreSQL devolve uma str crua, e depois do primeiro refresh
    `missao.state is MissionState.PENDENTE` passa a ser falso enquanto `==`
    continua verdadeiro, justamente porque StrEnum compara igual a str. E o
    tipo de defeito que nao aparece em teste nenhum que use `==`, e que
    estoura em um `match` ou em um `is` meses depois.

    A alternativa seria `sa.Enum(E, native_enum=False)`, que gera VARCHAR(n)
    com CHECK proprio -- e as migracoes criaram TEXT com um CHECK nomeado. Um
    TypeDecorator sobre Text converte sem mudar o tipo da coluna.

    Coluna obrigatoria: um `None` que chegue aqui estoura (`ValueError` de
    `enum(None)`), porque a coluna e NOT NULL e um NULL significa que o
    esquema divergiu do modelo; devolver None em silencio esconderia isso
    atras de um AttributeError em outro lugar. Coluna nulavel (`anulavel`):
    None volta None.

    Os atributos se chamam como os parametros do `__init__` porque e por
    esses nomes que o SQLAlchemy monta a chave de cache (`cache_ok`).
    """

    impl = Text
    cache_ok = True

    def __init__(self, enum: type[E], anulavel: bool = False) -> None:
        super().__init__()
        self.enum = enum
        self.anulavel = anulavel

    def process_result_value(self, value: Any, dialect: Dialect) -> E | None:
        if value is None and self.anulavel:
            return None
        return self.enum(value)
