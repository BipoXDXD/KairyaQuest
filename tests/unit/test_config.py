"""A configuracao vem do ambiente, sem valor embutido para credencial."""

from pathlib import Path

import pytest

from focusquest.core.config import Settings


def test_le_a_url_do_banco_do_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    settings = Settings()
    assert settings.database_url == "postgresql+psycopg://u:p@h:55432/d"
    assert settings.test_database_url == "postgresql+psycopg://u:p@h:55432/t"


def test_falha_quando_a_url_do_banco_nao_esta_no_ambiente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    # O Settings le ".env" (caminho relativo) do diretorio de trabalho. Sem
    # o chdir, o .env real do repositorio (README s4/Step 9) esconderia a
    # falta de configuracao e o teste pararia de testar o que promete.
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError):
        Settings()
