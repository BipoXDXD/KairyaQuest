"""A versao do Python e a mesma em todo lugar que a declara (P-python-3-14-10-1).

`.python-version` manda: o uv le o arquivo, localmente e no CI. Conferido contra
ele, cada fonte com `arquivo:linha` dos dois lados:

- `FROM [--platform=...] python:X.Y.Z-...` de `docker/*Dockerfile` e
  `image: python:X.Y.Z-...` do `compose.yaml` (opcional): a tag precisa fixar o
  patch e ser igual. Pelo menos um `FROM python:` precisa existir.
- `[tool.mypy] python_version` do `pyproject.toml`: igual a serie (`X.Y`) do
  patch. A chave precisa existir; `python_version` de outras tabelas nao conta.
- `[project] requires-python`: so a forma `>=X.Y` ou `>=X.Y.Z` e aceita, e o
  patch do `.python-version` precisa satisfazer o limite. Qualquer outra forma
  (`>3.14`, `~=3.14`, `>=3.14,<4`, `==3.14.*`) reprova como "forma nao
  suportada", mesmo que o interpretador coubesse nela: estender o aceito e
  decisao consciente, nao acidente. A chave precisa existir.
- os comentarios `` `.python-version` (X.Y.Z) `` do `quality.yml`: pelo menos um
  precisa existir e todos citam o mesmo patch.

Fonte ausente (arquivo, tabela, chave ou comentario) reprova: sumir nao e passar.

Este teste NAO prova que o uv fixado no CI (`version:` do `setup-uv`) conhece o
patch: isso depende do catalogo de downloads da versao do uv e nao cabe em teste
offline. Ao trocar o patch do Python, confira e atualize esse `version:` (regra
em `docs/handoff/2026-11-11-versao-python.md`).
"""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

RAIZ = Path(__file__).resolve().parents[2]

ARQUIVO_PYTHON_VERSION = ".python-version"
ARQUIVO_PYPROJECT = "pyproject.toml"
ARQUIVO_WORKFLOW = ".github/workflows/quality.yml"
ARQUIVO_COMPOSE = "compose.yaml"
PADRAO_DOCKERFILES = "docker/*Dockerfile"

PATCH = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
IMAGEM_NO_FROM = re.compile(r"^FROM\s+(?:--platform=\S+\s+)?python:(?P<tag>[^\s@]+)")
IMAGEM_NO_COMPOSE = re.compile(r"^\s*image:\s*python:(?P<tag>[^\s@]+)")
TAG_COM_PATCH = re.compile(r"^(\d+\.\d+\.\d+)(?:-|$)")
LIMITE_INFERIOR = re.compile(r">=\s*(\d+)\.(\d+)(?:\.(\d+))?")
CABECALHO_DE_TABELA = re.compile(r"^\s*\[(?P<nome>[^\[\]]+)\]\s*(?:#.*)?$")
COMENTARIO_DO_WORKFLOW = re.compile(r"`\.python-version` \((?P<valor>[^)]*)\)")


@dataclass(frozen=True)
class Declaracao:
    """Uma versao de Python declarada em `onde` (`arquivo:linha`)."""

    valor: str
    onde: str


def _linhas(raiz: Path, relativo: str) -> list[tuple[int, str]]:
    caminho = raiz / relativo
    if not caminho.is_file():
        return []
    return list(enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1))


def _ler_patch_do_arquivo_de_versao(raiz: Path) -> tuple[Declaracao | None, list[str]]:
    for numero, texto in _linhas(raiz, ARQUIVO_PYTHON_VERSION):
        valor = texto.strip()
        if not valor:
            continue
        onde = f"{ARQUIVO_PYTHON_VERSION}:{numero}"
        if not PATCH.match(valor):
            return None, [f"{onde}: `{valor}` nao e uma versao com patch (X.Y.Z)"]
        return Declaracao(valor, onde), []
    return None, [f"{ARQUIVO_PYTHON_VERSION}: arquivo ausente ou vazio"]


def _imagens_base(raiz: Path) -> tuple[list[Declaracao], list[str]]:
    achadas: list[Declaracao] = []
    problemas: list[str] = []
    fontes = [
        (str(caminho.relative_to(raiz)), IMAGEM_NO_FROM)
        for caminho in sorted(raiz.glob(PADRAO_DOCKERFILES))
    ]
    fontes.append((ARQUIVO_COMPOSE, IMAGEM_NO_COMPOSE))
    for relativo, padrao in fontes:
        for numero, texto in _linhas(raiz, relativo):
            achado = padrao.match(texto)
            if not achado:
                continue
            onde = f"{relativo}:{numero}"
            patch = TAG_COM_PATCH.match(achado["tag"])
            if patch is None:
                problemas.append(
                    f"{onde}: a imagem `python:{achado['tag']}` nao fixa o patch "
                    "(esperado `python:X.Y.Z-...`)"
                )
            else:
                achadas.append(Declaracao(patch.group(1), onde))
    return achadas, problemas


def _serie(patch: str) -> str:
    maior, menor, _ = patch.split(".")
    return f"{maior}.{menor}"


def _onde_no_pyproject(raiz: Path, tabela: str, chave: str) -> str:
    """`pyproject.toml:linha` da `chave` dentro da `tabela`; sem linha se nao achar."""
    atual = ""
    for numero, texto in _linhas(raiz, ARQUIVO_PYPROJECT):
        cabecalho = CABECALHO_DE_TABELA.match(texto)
        if cabecalho:
            atual = cabecalho["nome"].strip()
        elif atual == tabela and re.match(rf"^\s*{re.escape(chave)}\s*=", texto):
            return f"{ARQUIVO_PYPROJECT}:{numero}"
    return ARQUIVO_PYPROJECT


def _comparar_com_o_pyproject(raiz: Path, esperado: Declaracao) -> list[str]:
    if not (raiz / ARQUIVO_PYPROJECT).is_file():
        return [f"{ARQUIVO_PYPROJECT}: arquivo ausente"]
    try:
        dados = tomllib.loads((raiz / ARQUIVO_PYPROJECT).read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as erro:
        return [f"{ARQUIVO_PYPROJECT}: TOML invalido ({erro})"]
    return _comparar_mypy(raiz, dados, esperado) + _comparar_requires_python(
        raiz, dados, esperado
    )


def _comparar_mypy(
    raiz: Path, dados: dict[str, Any], esperado: Declaracao
) -> list[str]:
    serie_do_mypy = dados.get("tool", {}).get("mypy", {}).get("python_version")
    if serie_do_mypy is None:
        return [f"{ARQUIVO_PYPROJECT}: [tool.mypy] sem `python_version`"]
    serie = _serie(esperado.valor)
    if str(serie_do_mypy) == serie:
        return []
    onde = _onde_no_pyproject(raiz, "tool.mypy", "python_version")
    return [
        f"versao do Python divergente: {esperado.onde} diz {esperado.valor} "
        f"(serie {serie}), {onde} diz mypy `python_version = {serie_do_mypy}`"
    ]


def _comparar_requires_python(
    raiz: Path, dados: dict[str, Any], esperado: Declaracao
) -> list[str]:
    spec = dados.get("project", {}).get("requires-python")
    if spec is None:
        return [f"{ARQUIVO_PYPROJECT}: [project] sem `requires-python`"]
    onde = _onde_no_pyproject(raiz, "project", "requires-python")
    limite = LIMITE_INFERIOR.fullmatch(str(spec).strip())
    if limite is None:
        return [
            f"{onde}: `requires-python = {spec}` e uma forma nao suportada "
            "(esperado so `>=X.Y` ou `>=X.Y.Z`)"
        ]
    pedido = tuple(int(parte or 0) for parte in limite.groups())
    if pedido > tuple(int(parte) for parte in esperado.valor.split(".")):
        return [
            f"versao do Python divergente: {esperado.onde} diz {esperado.valor}, "
            f"{onde} pede `requires-python = {spec}`, que nao aceita esse "
            "interpretador"
        ]
    return []


def _comparar_com_comentarios_do_workflow(
    raiz: Path, esperado: Declaracao
) -> list[str]:
    if not (raiz / ARQUIVO_WORKFLOW).is_file():
        return [f"{ARQUIVO_WORKFLOW}: arquivo ausente"]
    problemas: list[str] = []
    citacoes = 0
    for numero, texto in _linhas(raiz, ARQUIVO_WORKFLOW):
        achado = COMENTARIO_DO_WORKFLOW.search(texto)
        if achado is None:
            continue
        citacoes += 1
        if achado["valor"] != esperado.valor:
            problemas.append(
                f"versao do Python divergente: {esperado.onde} diz {esperado.valor}, "
                f"{ARQUIVO_WORKFLOW}:{numero} cita {achado['valor']}"
            )
    if citacoes == 0:
        problemas.append(
            f"{ARQUIVO_WORKFLOW}: nenhum comentario com `.python-version` (X.Y.Z); "
            "o comentario que cita o patch sumiu ou mudou de formato"
        )
    return problemas


def verificar_coerencia(raiz: Path) -> list[str]:
    """Devolve uma mensagem `arquivo:linha` para cada divergencia achada."""
    esperado, problemas = _ler_patch_do_arquivo_de_versao(raiz)
    imagens, problemas_das_imagens = _imagens_base(raiz)
    problemas.extend(problemas_das_imagens)
    if not imagens and not problemas_das_imagens:
        problemas.append(
            f"{PADRAO_DOCKERFILES}: nenhuma `FROM python:X.Y.Z-...` achada; "
            "a imagem da API deixou de fixar o Python"
        )
    if esperado is None:
        return problemas
    for imagem in imagens:
        if imagem.valor != esperado.valor:
            problemas.append(
                f"versao do Python divergente: {esperado.onde} diz {esperado.valor}, "
                f"{imagem.onde} diz {imagem.valor}"
            )
    problemas.extend(_comparar_com_o_pyproject(raiz, esperado))
    problemas.extend(_comparar_com_comentarios_do_workflow(raiz, esperado))
    return problemas


# --- o repositorio de verdade -------------------------------------------------


def test_o_python_e_o_mesmo_em_todo_lugar_do_repositorio() -> None:
    problemas = verificar_coerencia(RAIZ)

    assert not problemas, "\n".join(problemas)


# --- o verificador falha quando deve (repositorio de mentira) -----------------

DOCKERFILE_COERENTE = (
    "FROM ghcr.io/astral-sh/uv:0.12.15@sha256:aaaa AS uv\n"
    "FROM python:3.14.10-slim-trixie@sha256:bbbb AS build\n"
    "RUN true\n"
    "FROM python:3.14.10-slim-trixie@sha256:bbbb\n"
)
PYPROJECT_COERENTE = (
    '[project]\nrequires-python = ">=3.14"\n\n[tool.mypy]\npython_version = "3.14"\n'
)
WORKFLOW_COERENTE = (
    "      # `.python-version` (3.14.10) so resolve se o uv o contiver\n"
)


def _repositorio(
    destino: Path,
    *,
    python_version: str | None = "3.14.10\n",
    dockerfile: str = DOCKERFILE_COERENTE,
    pyproject: str | None = PYPROJECT_COERENTE,
    workflow: str | None = WORKFLOW_COERENTE,
    compose: str | None = None,
) -> Path:
    (destino / "docker").mkdir()
    (destino / ".github/workflows").mkdir(parents=True)
    if python_version is not None:
        (destino / ARQUIVO_PYTHON_VERSION).write_text(python_version)
    (destino / "docker/api.Dockerfile").write_text(dockerfile)
    if pyproject is not None:
        (destino / ARQUIVO_PYPROJECT).write_text(pyproject)
    if workflow is not None:
        (destino / ARQUIVO_WORKFLOW).write_text(workflow)
    if compose is not None:
        (destino / ARQUIVO_COMPOSE).write_text(compose)
    return destino


def test_repositorio_coerente_nao_tem_divergencia(tmp_path: Path) -> None:
    assert verificar_coerencia(_repositorio(tmp_path)) == []


def test_imagem_com_outro_patch_reprova_com_arquivo_e_linha_dos_dois_lados(
    tmp_path: Path,
) -> None:
    dockerfile = DOCKERFILE_COERENTE.replace("3.14.10-slim", "3.14.9-slim", 1)

    problemas = verificar_coerencia(_repositorio(tmp_path, dockerfile=dockerfile))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        "docker/api.Dockerfile:2 diz 3.14.9"
    ]


def test_cada_from_python_e_conferido_e_so_o_divergente_reprova(
    tmp_path: Path,
) -> None:
    dockerfile = DOCKERFILE_COERENTE.replace(
        "FROM python:3.14.10-slim-trixie@sha256:bbbb\n",
        "FROM python:3.14.11-slim-trixie@sha256:bbbb\n",
    )
    assert dockerfile.count("3.14.11") == 1  # so o segundo estagio (linha 4)

    problemas = verificar_coerencia(_repositorio(tmp_path, dockerfile=dockerfile))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        "docker/api.Dockerfile:4 diz 3.14.11"
    ]


DOCKERFILE_UM_ESTAGIO = "FROM python:3.14.10-slim-trixie@sha256:bbbb\n"


def test_arquivo_de_versao_mais_novo_que_a_imagem_reprova(tmp_path: Path) -> None:
    repositorio = _repositorio(
        tmp_path,
        python_version="3.14.11\n",
        dockerfile=DOCKERFILE_UM_ESTAGIO,
        workflow=WORKFLOW_COERENTE.replace("3.14.10", "3.14.11"),
    )

    problemas = verificar_coerencia(repositorio)

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.11, "
        "docker/api.Dockerfile:1 diz 3.14.10"
    ]


def test_arquivo_de_versao_mais_novo_que_o_comentario_do_workflow_reprova(
    tmp_path: Path,
) -> None:
    repositorio = _repositorio(
        tmp_path,
        python_version="3.14.11\n",
        dockerfile=DOCKERFILE_UM_ESTAGIO.replace("3.14.10", "3.14.11"),
    )

    problemas = verificar_coerencia(repositorio)

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.11, "
        ".github/workflows/quality.yml:1 cita 3.14.10"
    ]


def test_from_com_platform_tambem_e_conferido(tmp_path: Path) -> None:
    dockerfile = (
        "FROM --platform=$BUILDPLATFORM python:3.14.9-slim-trixie@sha256:bbbb "
        "AS build\n"
    )

    problemas = verificar_coerencia(_repositorio(tmp_path, dockerfile=dockerfile))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        "docker/api.Dockerfile:1 diz 3.14.9"
    ]


def test_imagem_sem_patch_na_tag_reprova(tmp_path: Path) -> None:
    dockerfile = "FROM python:3.14-slim-trixie\n"

    problemas = verificar_coerencia(_repositorio(tmp_path, dockerfile=dockerfile))

    assert problemas == [
        "docker/api.Dockerfile:1: a imagem `python:3.14-slim-trixie` nao fixa o "
        "patch (esperado `python:X.Y.Z-...`)"
    ]


def test_dockerfile_sem_imagem_python_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(
        _repositorio(tmp_path, dockerfile="FROM debian:trixie-slim\n")
    )

    assert len(problemas) == 1
    assert problemas[0].startswith("docker/*Dockerfile: nenhuma `FROM python:")


def test_imagem_python_no_compose_tambem_e_conferida(tmp_path: Path) -> None:
    compose = "services:\n  api:\n    image: python:3.13.2-slim\n"

    problemas = verificar_coerencia(_repositorio(tmp_path, compose=compose))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        "compose.yaml:3 diz 3.13.2"
    ]


def test_mypy_em_outra_serie_reprova(tmp_path: Path) -> None:
    pyproject = PYPROJECT_COERENTE.replace(
        'python_version = "3.14"', 'python_version = "3.13"'
    )

    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject))

    assert len(problemas) == 1
    assert "pyproject.toml:5" in problemas[0]
    assert ".python-version:1 diz 3.14.10" in problemas[0]


@pytest.mark.parametrize("spec", [">=3.15", ">=3.14.11"])
def test_requires_python_que_nao_aceita_o_interpretador_reprova(
    tmp_path: Path, spec: str
) -> None:
    pyproject = PYPROJECT_COERENTE.replace('">=3.14"', f'"{spec}"')

    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        f"pyproject.toml:2 pede `requires-python = {spec}`, que nao aceita "
        "esse interpretador"
    ]


@pytest.mark.parametrize("spec", [">=3.14", ">=3.14.0", ">=3.14.10", ">= 3.13"])
def test_requires_python_com_limite_inferior_que_aceita_o_interpretador_passa(
    tmp_path: Path, spec: str
) -> None:
    pyproject = PYPROJECT_COERENTE.replace('">=3.14"', f'"{spec}"')

    assert verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject)) == []


@pytest.mark.parametrize("spec", [">3.14", "~=3.14", ">=3.14,<4", "==3.14.*", "3.14"])
def test_requires_python_em_forma_nao_suportada_reprova_sem_dizer_que_diverge(
    tmp_path: Path, spec: str
) -> None:
    pyproject = PYPROJECT_COERENTE.replace('">=3.14"', f'"{spec}"')

    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject))

    assert len(problemas) == 1
    assert problemas[0].startswith("pyproject.toml:2:")
    assert f"requires-python = {spec}" in problemas[0]
    assert "forma nao suportada" in problemas[0]
    assert "divergente" not in problemas[0]


def test_comentario_do_workflow_com_patch_velho_reprova(tmp_path: Path) -> None:
    workflow = WORKFLOW_COERENTE.replace("3.14.10", "3.14.9")

    problemas = verificar_coerencia(_repositorio(tmp_path, workflow=workflow))

    assert problemas == [
        "versao do Python divergente: .python-version:1 diz 3.14.10, "
        ".github/workflows/quality.yml:1 cita 3.14.9"
    ]


@pytest.mark.parametrize(
    ("conteudo", "trecho"),
    [
        (None, "arquivo ausente ou vazio"),
        ("\n\n", "arquivo ausente ou vazio"),
        ("3.14\n", "nao e uma versao com patch"),
        ("cpython-3.14.10\n", "nao e uma versao com patch"),
    ],
    ids=["ausente", "vazio", "sem-patch", "formato-estranho"],
)
def test_arquivo_de_versao_invalido_reprova_com_o_arquivo(
    tmp_path: Path, conteudo: str | None, trecho: str
) -> None:
    problemas = verificar_coerencia(_repositorio(tmp_path, python_version=conteudo))

    assert len(problemas) == 1
    assert problemas[0].startswith(ARQUIVO_PYTHON_VERSION)
    assert trecho in problemas[0]


# --- uma fonte que some nao pode passar em silencio ---------------------------

PYPROJECT_SEM_MYPY = '[project]\nrequires-python = ">=3.14"\n'
PYPROJECT_SEM_REQUIRES = (
    '[project]\nname = "x"\n\n[tool.mypy]\npython_version = "3.14"\n'
)


def test_pyproject_sem_a_tabela_do_mypy_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(
        _repositorio(tmp_path, pyproject=PYPROJECT_SEM_MYPY)
    )

    assert problemas == ["pyproject.toml: [tool.mypy] sem `python_version`"]


def test_mypy_sem_python_version_reprova(tmp_path: Path) -> None:
    pyproject = PYPROJECT_SEM_MYPY + "\n[tool.mypy]\nstrict = true\n"

    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject))

    assert problemas == ["pyproject.toml: [tool.mypy] sem `python_version`"]


def test_python_version_de_outra_tabela_nao_conta_como_o_do_mypy(
    tmp_path: Path,
) -> None:
    pyproject = PYPROJECT_SEM_MYPY + '\n[tool.outra]\npython_version = "3.14"\n'

    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject))

    assert problemas == ["pyproject.toml: [tool.mypy] sem `python_version`"]


def test_python_version_de_outra_tabela_nao_diverge_do_mypy_certo(
    tmp_path: Path,
) -> None:
    pyproject = PYPROJECT_COERENTE + '\n[tool.outra]\npython_version = "3.13"\n'

    assert verificar_coerencia(_repositorio(tmp_path, pyproject=pyproject)) == []


def test_pyproject_sem_requires_python_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(
        _repositorio(tmp_path, pyproject=PYPROJECT_SEM_REQUIRES)
    )

    assert problemas == ["pyproject.toml: [project] sem `requires-python`"]


def test_pyproject_ausente_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject=None))

    assert problemas == ["pyproject.toml: arquivo ausente"]


def test_pyproject_que_nao_e_toml_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(_repositorio(tmp_path, pyproject="[project\n"))

    assert len(problemas) == 1
    assert problemas[0].startswith("pyproject.toml: TOML invalido")


def test_workflow_ausente_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(_repositorio(tmp_path, workflow=None))

    assert problemas == [".github/workflows/quality.yml: arquivo ausente"]


def test_workflow_sem_nenhum_comentario_com_o_patch_reprova(tmp_path: Path) -> None:
    problemas = verificar_coerencia(_repositorio(tmp_path, workflow="name: quality\n"))

    assert len(problemas) == 1
    assert problemas[0].startswith(".github/workflows/quality.yml: nenhum comentario")
    assert "`.python-version` (X.Y.Z)" in problemas[0]
