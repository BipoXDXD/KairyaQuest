"""As configuracoes de execucao do PyCharm em `.run/` (README §4, pendencia 17).

O que estes testes provam e o que eles NAO provam:

- provam que os arquivos existem, sao XML bem formado, nao levam caminho
  pessoal nem segredo, nao estao no `.gitignore`, e que cada coisa que eles
  apontam (script do npm, alvo do Makefile, modulo da API, pasta de testes)
  existe de fato no repositorio -- o desvio que quebraria uma configuracao
  em silencio, sem o gate perceber;
- NAO provam que o PyCharm abre e executa as configuracoes. Isso so se ve
  na IDE (estado "nao executado" no docs/HANDOFF.md).
"""

import importlib.util
import json
import re
import subprocess
from pathlib import Path
from xml.etree import ElementTree

import pytest

RAIZ = Path(__file__).resolve().parents[2]
RUN = RAIZ / ".run"

# Nome do arquivo -> nome da configuracao na IDE. O PyCharm troca espacos e
# parenteses do nome por "_" ao gravar o arquivo; nomes de uma palavra evitam
# a conversao e mantem o arquivo previsivel.
ESPERADAS = {
    "API.run.xml": "API",
    "Frontend.run.xml": "Frontend",
    "Testes_backend.run.xml": "Testes backend",
    "Testes_frontend.run.xml": "Testes frontend",
    "Gate.run.xml": "Gate",
}

SDK_DO_PROJETO = "$PROJECT_DIR$/.venv/bin/python"


def _configuracao(arquivo: str) -> ElementTree.Element:
    """O elemento `<configuration>` do arquivo (o XML precisa ter so um)."""
    raiz = ElementTree.parse(RUN / arquivo).getroot()
    assert raiz.tag == "component"
    assert raiz.get("name") == "ProjectRunConfigurationManager"
    filhos = list(raiz)
    assert [f.tag for f in filhos] == ["configuration"]
    return filhos[0]


def _opcoes(cfg: ElementTree.Element) -> dict[str, str]:
    """Os `<option name=... value=...>` da configuracao, como dicionario."""
    return {
        o.attrib["name"]: o.attrib.get("value", "")
        for o in cfg.findall("option")
        if "name" in o.attrib
    }


def _no_disco(valor: str) -> Path:
    return RAIZ / valor.replace("$PROJECT_DIR$/", "")


def test_so_existem_as_configuracoes_esperadas() -> None:
    assert sorted(p.name for p in RUN.glob("*")) == sorted(ESPERADAS)


@pytest.mark.parametrize(("arquivo", "nome"), ESPERADAS.items())
def test_configuracao_bem_formada(arquivo: str, nome: str) -> None:
    cfg = _configuracao(arquivo)
    assert cfg.get("name") == nome
    assert cfg.get("default") == "false"


@pytest.mark.parametrize("arquivo", ESPERADAS)
def test_sem_caminho_pessoal_nem_segredo(arquivo: str) -> None:
    texto = (RUN / arquivo).read_text(encoding="utf-8")
    # Caminho absoluto de usuario (macOS, Linux, Windows) ou `~`.
    assert not re.search(r"/Users/|/home/|[A-Za-z]:\\|~/", texto)
    # Nome de variavel ou valor que cheire a credencial.
    assert not re.search(r"api[_-]?key|secret|password|token|sk-ant", texto, re.I)


def test_run_nao_esta_no_gitignore() -> None:
    # `git check-ignore -q`: 0 = ignorado, 1 = NAO ignorado, 128 = erro. So o
    # 1 serve; um erro do git nao pode passar por "nao ignorado".
    for arquivo in ESPERADAS:
        resultado = subprocess.run(
            ["git", "check-ignore", "-q", f".run/{arquivo}"],
            cwd=RAIZ,
            check=False,
        )
        assert resultado.returncode == 1, arquivo


def test_api_sobe_o_app_pelo_venv_do_projeto() -> None:
    o = _opcoes(_configuracao("API.run.xml"))
    assert o["SDK_HOME"] == SDK_DO_PROJETO
    assert o["IS_MODULE_SDK"] == "false"
    assert o["WORKING_DIRECTORY"] == "$PROJECT_DIR$"  # o .env e relativo a ele
    assert o["MODULE_MODE"] == "true"
    assert o["SCRIPT_NAME"] == "uvicorn"
    # Sem remendo em sys.path (README §4): o pacote vem da instalacao editavel.
    assert o["ADD_SOURCE_ROOTS"] == "false"
    assert o["ADD_CONTENT_ROOTS"] == "false"
    alvo, *resto = o["PARAMETERS"].split()
    assert alvo == "focusquest.main:app"
    assert resto == ["--host", "127.0.0.1", "--port", "8000"]
    assert importlib.util.find_spec(alvo.split(":")[0]) is not None


def test_pytest_roda_a_pasta_de_testes_pelo_venv_do_projeto() -> None:
    cfg = _configuracao("Testes_backend.run.xml")
    assert cfg.get("type") == "tests"
    assert cfg.get("factoryName") == "py.test"
    o = _opcoes(cfg)
    assert o["SDK_HOME"] == SDK_DO_PROJETO
    assert o["IS_MODULE_SDK"] == "false"
    assert o["WORKING_DIRECTORY"] == "$PROJECT_DIR$"
    assert o["ADD_SOURCE_ROOTS"] == "false"
    assert o["ADD_CONTENT_ROOTS"] == "false"
    # O alvo vem entre aspas escapadas (`&quot;` no arquivo).
    alvo = o["_new_target"].strip('"')
    assert o["_new_targetType"] == '"PATH"'
    assert _no_disco(alvo).is_dir()


@pytest.mark.parametrize(
    ("arquivo", "script"),
    [("Frontend.run.xml", "dev"), ("Testes_frontend.run.xml", "test")],
)
def test_configuracao_npm_aponta_para_script_que_existe(
    arquivo: str, script: str
) -> None:
    cfg = _configuracao(arquivo)
    assert cfg.get("type") == "js.build_tools.npm"
    pacote = cfg.find("package-json")
    assert pacote is not None
    caminho = _no_disco(pacote.attrib["value"])
    assert caminho == RAIZ / "frontend" / "package.json"
    comando = cfg.find("command")
    assert comando is not None
    assert comando.attrib["value"] == "run"
    scripts = [s.attrib["value"] for s in cfg.findall("scripts/script")]
    assert scripts == [script]
    declarados = json.loads(caminho.read_text(encoding="utf-8"))["scripts"]
    assert script in declarados


def test_gate_executa_o_alvo_check_do_makefile() -> None:
    cfg = _configuracao("Gate.run.xml")
    assert cfg.get("type") == "ShConfigurationType"
    o = _opcoes(cfg)
    assert o["EXECUTE_SCRIPT_FILE"] == "false"
    assert o["SCRIPT_WORKING_DIRECTORY"] == "$PROJECT_DIR$"
    # Rodar no terminal da IDE herda o PATH do shell do usuario (uv, node).
    assert o["EXECUTE_IN_TERMINAL"] == "true"
    # Paridade com o gate: o comando e o `make check`, e nada alem dele.
    assert o["SCRIPT_TEXT"] == "make check"
    makefile = (RAIZ / "Makefile").read_text(encoding="utf-8")
    assert re.search(r"^check:", makefile, re.M)
