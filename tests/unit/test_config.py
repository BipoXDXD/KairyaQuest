"""A configuracao vem do ambiente, sem valor embutido para credencial."""

from pathlib import Path

import pytest
from pydantic import SecretStr

from focusquest.core.config import Settings


def test_le_a_url_do_banco_do_ambiente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    # Sem o chdir, este teste le o .env real do repositorio: com
    # extra="forbid" ativo, qualquer chave FOCUSQUEST_* que alguem acrescente
    # la derruba este teste por um motivo que ele nao afirma testar.
    monkeypatch.chdir(tmp_path)
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


_BANCOS = (
    "FOCUSQUEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/d\n"
    "FOCUSQUEST_TEST_DATABASE_URL=postgresql+psycopg://u:p@h:55432/t\n"
)


def _settings_do_arquivo(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, conteudo: str
) -> Settings:
    """Um `Settings` lido SO de um .env escrito pelo teste.

    As variaveis de banco saem do ambiente para que o .env do teste seja a
    unica fonte; o chdir impede o .env real do repositorio de entrar.
    """
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(_BANCOS + conteudo)
    return Settings()


def test_a_chave_da_anthropic_e_opcional(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Sem chave, o Settings carrega: a ausencia e um estado do produto
    (a Tifa indisponivel, README s14), nao configuracao esquecida."""
    assert _settings_do_arquivo(monkeypatch, tmp_path, "").anthropic_api_key is None


def test_chave_vazia_no_env_conta_como_ausente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A linha do .env.example e `FOCUSQUEST_ANTHROPIC_API_KEY=`, vazia.

    Sem `env_ignore_empty`, ela viraria `SecretStr("")`, e a tela diria que a
    Tifa esta disponivel ate a primeira mensagem receber 401.
    """
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_ANTHROPIC_API_KEY=\n"
    )
    assert settings.anthropic_api_key is None


def test_a_chave_nao_aparece_na_representacao(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    settings = _settings_do_arquivo(
        monkeypatch, tmp_path, "FOCUSQUEST_ANTHROPIC_API_KEY=sk-ant-segredo\n"
    )
    assert settings.anthropic_api_key == SecretStr("sk-ant-segredo")
    assert "sk-ant-segredo" not in repr(settings)
    assert "sk-ant-segredo" not in str(settings)


def test_padroes_da_tutoria(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Os padroes da spec -- e o endereco da API escrito por extenso.

    O `delenv` desfaz, so neste teste, a guarda de `tests/conftest.py`: e o
    unico jeito de ler o padrao de verdade.
    """
    monkeypatch.delenv("FOCUSQUEST_ANTHROPIC_BASE_URL", raising=False)
    settings = _settings_do_arquivo(monkeypatch, tmp_path, "")
    assert settings.anthropic_base_url == "https://api.anthropic.com"
    assert settings.tutor_model == "claude-opus-5"
    assert settings.tutor_max_tokens == 1024
    assert settings.tutor_timeout_seconds == 60
    assert settings.tutor_history_messages == 20


@pytest.mark.parametrize(
    "linha",
    [
        "FOCUSQUEST_TUTOR_MAX_TOKENS=0",
        "FOCUSQUEST_TUTOR_TIMEOUT_SECONDS=0",
        "FOCUSQUEST_TUTOR_HISTORY_MESSAGES=0",
    ],
)
def test_limites_da_tutoria_recusam_zero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, linha: str
) -> None:
    """Zero tokens, zero segundos ou zero mensagens de historico nao sao uma
    configuracao: sao um defeito que so apareceria na primeira conversa."""
    with pytest.raises(ValueError):
        _settings_do_arquivo(monkeypatch, tmp_path, linha + "\n")


def test_a_suite_nunca_aponta_para_a_anthropic() -> None:
    """A guarda de `tests/conftest.py` vale para todo teste.

    O .env local do dono tem a chave de verdade, e o `pre-push` exporta toda
    `FOCUSQUEST_*` dele. Com a guarda, um teste que esquecesse o override do
    provedor bateria numa porta fechada, e nao numa chamada paga.
    """
    assert Settings().anthropic_base_url == "http://127.0.0.1:9"
