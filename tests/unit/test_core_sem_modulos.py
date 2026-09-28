"""`core/` e a camada de baixo: nao importa nenhum modulo de funcionalidade."""

import ast
from pathlib import Path

import pytest

import focusquest.core

NUCLEO = Path(focusquest.core.__file__).parent
PROIBIDO = "focusquest.modules"


def _e_proibido(nome: str) -> bool:
    return nome == PROIBIDO or nome.startswith(f"{PROIBIDO}.")


def imports_proibidos(fonte: str, pacote: str = "focusquest.core") -> set[str]:
    """Nomes absolutos sob `focusquest.modules` que `fonte` importa.

    `pacote` e o pacote do proprio arquivo, para resolver o import relativo.
    Cobre `import a.b`, `from a import b` (o `b` pode ser um submodulo, entao
    `a.b` tambem conta) e `from ..x import y`.
    """
    achados: set[str] = set()
    for no in ast.walk(ast.parse(fonte)):
        if isinstance(no, ast.Import):
            achados.update(a.name for a in no.names if _e_proibido(a.name))
        elif isinstance(no, ast.ImportFrom):
            base = no.module or ""
            if no.level:
                partes = pacote.split(".")
                raiz = ".".join(partes[: len(partes) - (no.level - 1)])
                base = f"{raiz}.{base}" if base else raiz
            candidatos = {base, *(f"{base}.{a.name}" for a in no.names)}
            achados.update(c for c in candidatos if _e_proibido(c))
    return achados


@pytest.mark.parametrize(
    ("fonte", "esperado"),
    [
        ("import focusquest.modules.missions", {"focusquest.modules.missions"}),
        ("from focusquest.modules.missions import x", {"focusquest.modules.missions"}),
        ("from focusquest import modules", {"focusquest.modules"}),
        ("from focusquest import modules as m", {"focusquest.modules"}),
        ("from .. import modules", {"focusquest.modules"}),
        ("from ..modules import missions", {"focusquest.modules"}),
        ("from ..modules.missions import x", {"focusquest.modules.missions"}),
        ("from focusquest.core import erros", set()),
        ("from . import erros", set()),
        ("import focusquest.modulesx", set()),
        ("import os", set()),
    ],
)
def test_imports_proibidos_pega_cada_forma(fonte: str, esperado: set[str]) -> None:
    assert imports_proibidos(fonte) >= esperado
    assert bool(imports_proibidos(fonte)) == bool(esperado)


def test_import_relativo_num_subpacote_sobe_do_pacote_do_arquivo() -> None:
    """`..` a partir de `focusquest.core.sub` e `focusquest.core`, nao a raiz."""
    assert imports_proibidos("from .. import modules", "focusquest.core.sub") == set()
    assert imports_proibidos("from ... import modules", "focusquest.core.sub") == {
        "focusquest.modules"
    }


def test_nenhum_arquivo_de_core_importa_um_modulo() -> None:
    """A direcao e `modules -> core`, nunca o contrario (ARCHITECTURE,
    `core/`). Um erro de um modulo so mora no modulo, como
    `AvaliacaoFalhouError` em `evaluation/`."""
    arquivos = sorted(NUCLEO.rglob("*.py"))
    assert arquivos
    for arquivo in arquivos:
        relativo = arquivo.relative_to(NUCLEO).parent.parts
        pacote = ".".join(("focusquest", "core", *relativo))
        proibidos = imports_proibidos(arquivo.read_text(), pacote)
        assert proibidos == set(), f"{arquivo.relative_to(NUCLEO)} importa {proibidos}"
