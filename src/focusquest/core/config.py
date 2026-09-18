"""Configuracao da aplicacao, lida do ambiente."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracao da aplicacao.

    Nenhum campo tem valor padrao para credencial: esquecer de configurar
    precisa falhar na partida, nao conectar em um banco qualquer.

    Variaveis desconhecidas sao REJEITADAS, nao ignoradas. Uma variavel que
    o .env precisa carregar para outro consumidor -- como o compose -- e
    declarada aqui, para que o conjunto de configuracao do projeto tenha um
    lugar so onde esta escrito.
    """

    model_config = SettingsConfigDict(env_prefix="FOCUSQUEST_", env_file=".env")

    database_url: str
    test_database_url: str
    # Consumida pelo compose.yaml, nao pelo Python. Declarada aqui porque o
    # .env a carrega e porque variavel desconhecida deve continuar sendo erro.
    db_port: int = 55432
