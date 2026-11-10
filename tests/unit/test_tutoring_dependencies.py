"""A dependencia de producao da tutoria: Anthropic com a chave, `None` sem ela."""

import os
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import pytest
from anthropic import omit

import focusquest.modules.tutoring.dependencies as dependencias
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from unit.anthropic_falso import FERRAMENTA, TURNO, instalar_cliente_falso


@pytest.fixture
def ambiente_limpo(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    """Sem o .env do repositorio e sem `FOCUSQUEST_*` do shell: so o que o
    teste define. O cache do modulo comeca vazio e volta vazio."""
    monkeypatch.setattr(dependencias, "_tutoria", None)
    for chave in list(os.environ):
        if chave.startswith("FOCUSQUEST_"):
            monkeypatch.delenv(chave)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/d")
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:1/t")
    # Porta fechada: nenhum teste daqui chama o provedor, e se chamasse a
    # conexao seria recusada (a mesma guarda de tests/conftest.py).
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_BASE_URL", "http://127.0.0.1:9")
    yield


@pytest.mark.usefixtures("ambiente_limpo")
@pytest.mark.parametrize("chave", [None, "", "   "])
def test_get_tutoria_sem_chave_devolve_none(
    monkeypatch: pytest.MonkeyPatch, chave: str | None
) -> None:
    if chave is not None:
        monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", chave)
    assert dependencias.get_tutoria() is None


@pytest.mark.usefixtures("ambiente_limpo")
def test_get_tutoria_com_chave_usa_provedor_anthropic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-ficticia")
    tutoria = dependencias.get_tutoria()
    assert tutoria is not None
    assert isinstance(tutoria.provedor, ProvedorAnthropic)
    assert tutoria.provedor.modelo == "claude-sonnet-5-5"
    # O modelo gravado como quem interpretou e o mesmo que o adaptador chama.
    assert tutoria.modelo == "claude-sonnet-5-5"
    assert dependencias.get_tutoria() is tutoria


@pytest.mark.usefixtures("ambiente_limpo")
def test_get_tutoria_leva_a_configuracao_do_ambiente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-ficticia")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_MODEL", "claude-haiku-5-5")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_HISTORY_MESSAGES", "7")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_TIMEOUT_SECONDS", "12")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_DAILY_TURN_LIMIT", "5")
    tutoria = dependencias.get_tutoria()
    assert tutoria is not None
    assert isinstance(tutoria.provedor, ProvedorAnthropic)
    assert tutoria.provedor.modelo == "claude-haiku-5-5"
    assert tutoria.modelo == "claude-haiku-5-5"
    assert (tutoria.historico, tutoria.limite) == (7, timedelta(seconds=12))
    assert tutoria.turnos_por_dia == 5


@pytest.mark.usefixtures("ambiente_limpo")
def test_get_tutoria_repassa_esforco_e_fallback_ao_pedido(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Valores fora do padrao: um `esforco="low"` ou `fallback=True` fixos na
    fiacao passariam em todos os outros testes, porque coincidem com o padrao."""
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-ficticia")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_MODEL", "claude-modelo-qualquer")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_EFFORT", "high")
    monkeypatch.setenv("FOCUSQUEST_EVALUATION_EFFORT", "low")
    monkeypatch.setenv("FOCUSQUEST_TUTOR_FALLBACK", "false")
    criados = instalar_cliente_falso(monkeypatch)
    tutoria = dependencias.get_tutoria()
    assert tutoria is not None

    list(tutoria.provedor.responder(TURNO))
    tutoria.provedor.avaliar(TURNO, FERRAMENTA)

    (chat, avaliacao) = criados[0].pedidos
    assert chat["model"] == "claude-modelo-qualquer"
    assert chat["output_config"] == {"effort": "high"}
    assert {"fallbacks", "betas"}.isdisjoint(
        chave for chave, valor in chat.items() if valor is not omit
    )
    assert avaliacao["output_config"] == {"effort": "low"}
