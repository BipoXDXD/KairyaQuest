"""Leitura dos prompts versionados em Markdown, um arquivo por `Idioma`.

A persona (`tutoring`) e a rubrica (`evaluation`) seguem o mesmo arranjo,
`<prefixo>.<idioma>.md`, e a mesma regra: o texto e fixo por build, entao um
arquivo ausente ou vazio e defeito de deploy e tem de derrubar a partida do
app (`main._ciclo_de_vida`), nao o turno de um estudante.
"""

from collections.abc import Mapping
from importlib.resources.abc import Traversable
from types import MappingProxyType

from focusquest.core.idioma import Idioma


class PromptInvalidoError(RuntimeError):
    """Um prompt versionado esta ausente ou vazio; a mensagem nomeia o arquivo."""


def carregar_prompts(diretorio: Traversable, prefixo: str) -> Mapping[Idioma, str]:
    """O texto de `<prefixo>.<idioma>.md` para todo `Idioma`, somente leitura.

    Levanta `PromptInvalidoError` no primeiro arquivo ausente ou so com
    espaco em branco.
    """
    return MappingProxyType(
        {
            idioma: _ler_prompt(diretorio / f"{prefixo}.{idioma.value}.md")
            for idioma in Idioma
        }
    )


def _ler_prompt(arquivo: Traversable) -> str:
    try:
        texto = arquivo.read_text(encoding="utf-8")
    except FileNotFoundError as erro:
        raise PromptInvalidoError(f"prompt ausente: {arquivo.name}") from erro
    if not texto.strip():
        raise PromptInvalidoError(f"prompt vazio: {arquivo.name}")
    return texto
