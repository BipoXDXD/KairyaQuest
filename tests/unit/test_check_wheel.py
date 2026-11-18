"""`scripts/check_wheel.py`: a conferencia do `make check-wheel`.

A lista do que o wheel deve levar vem dos `.md` em `prompts/` do checkout,
nao de uma lista fixa: um idioma ou prompt novo entra na conferencia sem
editar o script. O build real (`uv build`) fica no alvo; aqui o wheel e um
zip montado no teste, o que prova que a conferencia reprova quando falta um
`.md` -- ou quando ele vai vazio.
"""

import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".git").exists())
SCRIPT = ROOT / "scripts" / "check_wheel.py"

PERSONA = "focusquest/modules/tutoring/prompts/persona.en.md"
RUBRICA = "focusquest/modules/evaluation/prompts/rubric.en.md"


def _checkout(raiz: Path, *caminhos: str) -> Path:
    src = raiz / "src"
    for caminho in caminhos:
        arquivo = src / caminho
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        arquivo.write_text("texto", encoding="utf-8")
    return src


def _wheel(raiz: Path, conteudo: dict[str, str]) -> Path:
    wheel = raiz / "focusquest-0-py3-none-any.whl"
    with zipfile.ZipFile(wheel, "w") as arquivo:
        for nome, texto in conteudo.items():
            arquivo.writestr(nome, texto)
    return wheel


def _conferir(*argumentos: Path | str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *(str(arg) for arg in argumentos)],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize("quantidade", [0, 1, 3], ids=["nenhum", "um", "um-a-mais"])
def test_uso_errado_exibe_instrucoes(tmp_path: Path, quantidade: int) -> None:
    src = _checkout(tmp_path, PERSONA)
    wheel = _wheel(tmp_path, {PERSONA: "texto"})
    argumentos: list[Path | str] = [wheel, src, "extra"]

    resultado = _conferir(*argumentos[:quantidade])

    assert resultado.returncode == 2
    assert resultado.stderr.strip() == "uso: check_wheel.py <wheel> <src>"
    assert resultado.stdout == ""


def test_aprova_quando_todo_prompt_do_checkout_esta_no_wheel(tmp_path: Path) -> None:
    src = _checkout(tmp_path, PERSONA, RUBRICA)
    wheel = _wheel(tmp_path, {PERSONA: "texto", RUBRICA: "texto"})

    resultado = _conferir(wheel, src)

    assert resultado.returncode == 0, resultado.stderr
    assert "2 prompts presentes" in resultado.stdout


def test_reprova_e_nomeia_o_prompt_ausente_do_wheel(tmp_path: Path) -> None:
    src = _checkout(tmp_path, PERSONA, RUBRICA)
    wheel = _wheel(tmp_path, {PERSONA: "texto"})

    resultado = _conferir(wheel, src)

    assert resultado.returncode == 1
    assert f"ausente no wheel: {RUBRICA}" in resultado.stderr


def test_reprova_e_nomeia_o_prompt_vazio_no_wheel(tmp_path: Path) -> None:
    src = _checkout(tmp_path, PERSONA, RUBRICA)
    wheel = _wheel(tmp_path, {PERSONA: "texto", RUBRICA: ""})

    resultado = _conferir(wheel, src)

    assert resultado.returncode == 1
    assert f"vazio no wheel: {RUBRICA}" in resultado.stderr


def test_reprova_quando_o_checkout_nao_tem_prompt_nenhum(tmp_path: Path) -> None:
    src = _checkout(tmp_path)
    wheel = _wheel(tmp_path, {PERSONA: "texto"})

    resultado = _conferir(wheel, src)

    assert resultado.returncode == 1
    assert "nenhum prompt" in resultado.stderr
