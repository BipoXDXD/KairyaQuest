"""Configuracao da aplicacao, lida do ambiente."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracao da aplicacao.

    Nenhum campo tem valor padrao: esquecer de configurar precisa falhar na
    partida, nao conectar em um banco qualquer.
    """

    # extra="ignore": o .env tambem alimenta o compose.yaml (ex.:
    # FOCUSQUEST_DB_PORT), entao ele traz chaves que nao viram campo aqui.
    # Sem isso, o pydantic rejeita a leitura do .env com "extra_forbidden".
    model_config = SettingsConfigDict(
        env_prefix="FOCUSQUEST_", env_file=".env", extra="ignore"
    )

    database_url: str
    test_database_url: str
