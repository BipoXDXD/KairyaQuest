"""`core/` e a camada de baixo: nao importa nenhum modulo de funcionalidade."""

import ast
from pathlib import Path

import focusquest.core

NUCLEO = Path(focusquest.core.__file__).parent


def _importados(arquivo: Path) -> set[str]:
    arvore = ast.parse(arquivo.read_text())
    nomes: set[str] = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.ImportFrom) and no.module:
            nomes.add(no.module)
        elif isinstance(no, ast.Import):
            nomes.update(alias.name for alias in no.names)
    return nomes


def test_nenhum_arquivo_de_core_importa_um_modulo() -> None:
    """A direcao e `modules -> core`, nunca o contrario (ARCHITECTURE,
    `core/`). Um erro de um modulo so mora no modulo, como
    `AvaliacaoFalhouError` em `evaluation/`."""
    arquivos = sorted(NUCLEO.glob("*.py"))
    assert arquivos
    for arquivo in arquivos:
        proibidos = {
            nome
            for nome in _importados(arquivo)
            if nome.startswith("focusquest.modules")
        }
        assert proibidos == set(), f"{arquivo.name} importa {proibidos}"
