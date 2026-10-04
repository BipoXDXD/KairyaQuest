"""Validacao comum de textos que serao persistidos no PostgreSQL."""

from typing import Annotated

from pydantic import AfterValidator


def rejeitar_nul(texto: str) -> str:
    """Recusa U+0000, que colunas text e JSONB nao podem representar.

    Nao sanitiza: remover um caractere alteraria conteudo e identificadores
    de idempotencia sem o conhecimento de quem os enviou.
    """
    if "\x00" in texto:
        raise ValueError("texto nao pode conter o caractere NUL (U+0000)")
    return texto


TextoPersistivel = Annotated[str, AfterValidator(rejeitar_nul)]
