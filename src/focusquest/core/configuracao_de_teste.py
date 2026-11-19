"""Configuracao e validacao de alvo para as ferramentas de teste."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

# O PostgreSQL trunca identificadores acima de 63 bytes (NAMEDATALEN - 1).
LIMITE_DO_IDENTIFICADOR = 63
# Opções de transporte e diagnóstico que não redefinem o destino da URL.
PARAMETROS_DE_CONEXAO = frozenset(
    {
        "application_name",
        "channel_binding",
        "connect_timeout",
        "sslcert",
        "sslcrl",
        "sslcrldir",
        "sslkey",
        "sslmode",
        "sslrootcert",
    }
)


class ConfiguracaoDeTeste(BaseSettings):
    """Le as chaves de teste do mesmo .env, com precedencia do ambiente."""

    model_config = SettingsConfigDict(
        env_prefix="FOCUSQUEST_",
        env_file=".env",
        env_ignore_empty=True,
        hide_input_in_errors=True,
        # O arquivo tambem contem as chaves validadas pelo Settings da API.
        dotenv_filtering="only_existing",
        extra="forbid",
    )

    test_database_url: str
    # A faixa mantem as portas do E2E disjuntas (servers.ts). O pre-push
    # reserva a metade superior, somando 25 ao deslocamento do worktree.
    e2e_port_offset: int = Field(default=0, ge=0, le=49)


def exigir_alvo_de_banco_de_teste(url: URL) -> None:
    """Valida o destino antes de abrir uma conexão para uma operação de teste."""
    if url.query.keys() - PARAMETROS_DE_CONEXAO:
        raise RuntimeError(
            "recusando a URL de teste com parâmetros de conexão não permitidos; "
            "confira FOCUSQUEST_TEST_DATABASE_URL"
        )
    nome = url.database or ""
    if not nome.endswith("_test"):
        raise RuntimeError(
            f"recusando rodar teste destrutivo contra o banco '{nome}'; "
            "esperado um banco cujo nome termine em '_test' -- confira "
            "FOCUSQUEST_TEST_DATABASE_URL"
        )
    if len(nome.encode()) > LIMITE_DO_IDENTIFICADOR:
        raise RuntimeError(
            f"recusando usar o banco '{nome}': o nome passa de "
            f"{LIMITE_DO_IDENTIFICADOR} bytes, e o PostgreSQL o truncaria em "
            "silencio -- escolha um nome de worktree mais curto"
        )
