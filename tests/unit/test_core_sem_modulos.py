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
    `a.b` tambem conta) e `from ..x import y`. A prova e de imports estaticos:
    chamadas a `importlib.import_module` e `__import__` ficam fora deste AST.
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
        (
            "from focusquest.modules.missions import x",
            {"focusquest.modules.missions", "focusquest.modules.missions.x"},
        ),
        ("from focusquest import modules", {"focusquest.modules"}),
        ("from focusquest import modules as m", {"focusquest.modules"}),
        ("from .. import modules", {"focusquest.modules"}),
        (
            "from ..modules import missions",
            {"focusquest.modules", "focusquest.modules.missions"},
        ),
        (
            "from ..modules.missions import x",
            {"focusquest.modules.missions", "focusquest.modules.missions.x"},
        ),
        ("from focusquest.core import erros", set()),
        ("from . import erros", set()),
        ("import focusquest.modulesx", set()),
        ("import os", set()),
        (
            "import os, focusquest.modules.missions as m, "
            "focusquest.modules.tutoring as t",
            {"focusquest.modules.missions", "focusquest.modules.tutoring"},
        ),
        (
            "from focusquest import modules as m, core as c, modulesx as x",
            {"focusquest.modules"},
        ),
        (
            "from focusquest.modules import missions as m, tutoring as t",
            {
                "focusquest.modules",
                "focusquest.modules.missions",
                "focusquest.modules.tutoring",
            },
        ),
        (
            "from .. import modules as m, core as c",
            {"focusquest.modules"},
        ),
        ("import focusquest.modulesx.missions as m", set()),
        ("from focusquest.modulesx import missions", set()),
        ("from focusquest import modules_extra", set()),
    ],
)
def test_imports_proibidos_pega_cada_forma(fonte: str, esperado: set[str]) -> None:
    # Um conjunto maior tambem e defeito: acusaria uma dependencia inexistente.
    assert imports_proibidos(fonte) == esperado


def test_import_relativo_num_subpacote_sobe_do_pacote_do_arquivo() -> None:
    """`..` a partir de `focusquest.core.sub` e `focusquest.core`, nao a raiz."""
    assert imports_proibidos("from .. import modules", "focusquest.core.sub") == set()
    assert imports_proibidos("from ... import modules", "focusquest.core.sub") == {
        "focusquest.modules"
    }


def test_nenhum_arquivo_de_core_importa_um_modulo() -> None:
    """A direcao e `modules -> core`, nunca o contrario (ARCHITECTURE,
    `core/`). Um erro que depende de tipo de um modulo mora nesse modulo, como
    `AvaliacaoFalhouError` (usa `FalhaDaAvaliacao`) em `evaluation/`."""
    arquivos = sorted(NUCLEO.rglob("*.py"))
    assert arquivos
    for arquivo in arquivos:
        relativo = arquivo.relative_to(NUCLEO).parent.parts
        pacote = ".".join(("focusquest", "core", *relativo))
        proibidos = imports_proibidos(arquivo.read_text(), pacote)
        assert proibidos == set(), f"{arquivo.relative_to(NUCLEO)} importa {proibidos}"
