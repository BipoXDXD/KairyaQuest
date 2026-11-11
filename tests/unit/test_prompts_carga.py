"""Os prompts versionados (persona e rubrica) sao lidos e validados na
partida do app, para todo `Idioma`.

Um prompt ausente ou vazio e defeito de build, nao de uso: tem de derrubar a
partida, nomeando o arquivo, e nao o primeiro turno do estudante -- na
avaliacao esse primeiro turno vem depois do commit da tentativa, e a falha
deixaria a tentativa orfa (o retry receberia 409 ate o limite do orfao).
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from focusquest.core.idioma import Idioma
from focusquest.core.prompts import PromptInvalidoError, carregar_prompts
from focusquest.main import app


def _escrever_todos(diretorio: Path, prefixo: str) -> None:
    for idioma in Idioma:
        (diretorio / f"{prefixo}.{idioma.value}.md").write_text(
            f"texto {idioma.value}", encoding="utf-8"
        )


def test_carrega_o_texto_de_todo_idioma(tmp_path: Path) -> None:
    _escrever_todos(tmp_path, "persona")

    textos = carregar_prompts(tmp_path, "persona")

    assert textos == {Idioma.PT_BR: "texto pt-BR", Idioma.EN: "texto en"}


@pytest.mark.parametrize("conteudo", ["", " \n\t\n"])
def test_arquivo_vazio_falha_nomeando_o_arquivo(tmp_path: Path, conteudo: str) -> None:
    _escrever_todos(tmp_path, "rubric")
    (tmp_path / "rubric.en.md").write_text(conteudo, encoding="utf-8")

    with pytest.raises(PromptInvalidoError, match=r"vazio: rubric\.en\.md"):
        carregar_prompts(tmp_path, "rubric")


def test_arquivo_ausente_falha_nomeando_o_arquivo(tmp_path: Path) -> None:
    _escrever_todos(tmp_path, "persona")
    (tmp_path / "persona.pt-BR.md").unlink()

    with pytest.raises(PromptInvalidoError, match=r"ausente: persona\.pt-BR\.md"):
        carregar_prompts(tmp_path, "persona")


@pytest.mark.parametrize("carregador", ["personas", "rubricas"])
def test_prompt_invalido_derruba_a_partida_do_app(
    monkeypatch: pytest.MonkeyPatch, carregador: str
) -> None:
    def _invalido() -> None:
        raise PromptInvalidoError("prompt vazio: x.md")

    monkeypatch.setattr(f"focusquest.main.{carregador}", _invalido)

    cliente = TestClient(app)

    with pytest.raises(PromptInvalidoError, match="x.md"):
        cliente.__enter__()
