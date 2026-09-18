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


def test_falha_quando_ha_variavel_desconhecida_no_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Variavel desconhecida no .env e erro, nao e ignorada em silencio.

    Sem essa politica, digitar "FOCUSQUEST_DATABSE_URL" (sem o "E") no .env
    faria o pydantic engolir a variavel desconhecida e reportar a de sempre
    como ausente -- apontando para o lugar errado do defeito real.

    O arquivo .env precisa existir de verdade neste teste (nao basta
    monkeypatch.setenv): a fonte que le variaveis do os.environ diretamente
    descarta em silencio qualquer chave com o prefixo que nao bate com um
    campo declarado, sem chegar a validacao. So a fonte que le o arquivo
    .env repassa chaves desconhecidas como "extra", que e o que o
    extra="forbid" (padrao do pydantic, sem extra="ignore" aqui) rejeita.
    Isso foi confirmado rodando os dois casos manualmente antes de escrever
    este teste.
    """
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "FOCUSQUEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/d\n"
        "FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/t\n"
        "FOCUSQUEST_VARIAVEL_INEXISTENTE=qualquer-coisa\n"
    )
    with pytest.raises(ValueError):
        Settings()
