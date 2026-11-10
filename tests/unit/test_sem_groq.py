"""Fitness function: o provedor Groq saiu do codigo e da documentacao viva.

O `docs/HANDOFF.md` fica de fora porque guarda o historico das decisoes
(inclusive a de 22/10, que esta revertida). Este arquivo fica de fora porque
precisa escrever o nome que procura.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

_PASTAS = (
    "src",
    "tests",
    "frontend/src",
    "frontend/tests",
    "docs",
    "scripts",
    ".github",
    "alembic",
)
_ARQUIVOS_SOLTOS = (
    ".env.example",
    "README.md",
    "AGENTS.md",
    "Makefile",
    "pyproject.toml",
    ".pre-commit-config.yaml",
    "frontend/package.json",
    "frontend/vite.config.ts",
    "frontend/playwright.config.ts",
)
# A configuracao da raiz do front (package.json, vite.config.ts, tsconfig*,
# eslint, prettier...) entra inteira. Os lockfiles (`uv.lock`,
# `package-lock.json`) ficam de fora: so espelham os manifestos, que o gate
# confere (`uv lock --check`, `npm ci`), e os hashes em base64 de integridade
# poderiam conter a sequencia procurada por acaso.
_LOCKFILES = {"uv.lock", "package-lock.json"}
_ARQUIVOS_SOLTOS_DO_FRONT = {
    Path(nome).name for nome in _ARQUIVOS_SOLTOS if nome.startswith("frontend/")
}
# Dependencias instaladas e cache nao sao codigo do projeto.
_PASTAS_IGNORADAS = {"__pycache__", "node_modules"}
_AMOSTRA_BINARIA = 8192
_EXCECOES = {
    RAIZ / "docs" / "HANDOFF.md",
    Path(__file__).resolve(),
}
_PADRAO = re.compile("groq", re.IGNORECASE)


def _arquivos_varridos() -> list[Path]:
    arquivos = [RAIZ / nome for nome in _ARQUIVOS_SOLTOS]
    arquivos += sorted(RAIZ.glob("compose*.yaml"))
    arquivos += sorted(
        caminho
        for caminho in (RAIZ / "frontend").iterdir()
        if caminho.is_file() and caminho.name not in _ARQUIVOS_SOLTOS_DO_FRONT
    )
    for pasta in _PASTAS:
        arquivos += sorted(
            caminho
            for caminho in (RAIZ / pasta).rglob("*")
            if caminho.is_file() and _PASTAS_IGNORADAS.isdisjoint(caminho.parts)
        )
    return [
        arquivo
        for arquivo in arquivos
        if arquivo.resolve() not in _EXCECOES
        and arquivo.name not in _LOCKFILES
        and not _env_privado(arquivo)
        and not _binario(arquivo)
    ]


def _env_privado(arquivo: Path) -> bool:
    """`.env` e variantes guardam segredo e nao sao versionados; so o
    `.env.example` e documentacao."""
    return arquivo.name.startswith(".env") and arquivo.name != ".env.example"


def _binario(arquivo: Path) -> bool:
    """Imagem, fonte e afins: um byte NUL no inicio denuncia arquivo binario."""
    with arquivo.open("rb") as conteudo:
        return b"\0" in conteudo.read(_AMOSTRA_BINARIA)


def test_codigo_e_docs_nao_citam_groq() -> None:
    achados = [
        f"{arquivo.relative_to(RAIZ)}:{numero}"
        for arquivo in _arquivos_varridos()
        for numero, linha in enumerate(
            arquivo.read_text(encoding="utf-8", errors="ignore").splitlines(), 1
        )
        if _PADRAO.search(linha)
    ]
    assert achados == [], "ainda citam o Groq:\n" + "\n".join(achados)


def test_a_varredura_alcanca_as_pastas_que_promete() -> None:
    """Sem isto, um caminho errado em `_PASTAS` deixaria a varredura vazia, e
    o teste acima passaria sem olhar nada."""
    varridos = {
        arquivo.relative_to(RAIZ).as_posix() for arquivo in _arquivos_varridos()
    }
    for pasta in _PASTAS:
        assert any(caminho.startswith(f"{pasta}/") for caminho in varridos), pasta
    for nome in _ARQUIVOS_SOLTOS:
        assert nome in varridos, nome
    assert "frontend/tsconfig.json" in varridos
    assert {"uv.lock", "frontend/package-lock.json"}.isdisjoint(varridos)
