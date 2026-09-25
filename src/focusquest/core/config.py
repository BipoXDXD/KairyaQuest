"""Configuracao da aplicacao, lida do ambiente."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracao da aplicacao.

    Nenhum campo tem valor padrao para credencial de BANCO: esquecer de
    configurar precisa falhar na partida, nao conectar em um banco qualquer.

    A excecao e a chave da Anthropic, e ela e deliberada. O README s14 manda
    mostrar indisponibilidade quando nao ha credencial: a ausencia dela e um
    ESTADO do produto (a Tifa fora do ar, o Quartel-General funcionando), nao
    uma configuracao esquecida. Por isso `anthropic_api_key` e opcional, e
    `SecretStr` a esconde do `repr` e dos logs.

    Variaveis desconhecidas sao REJEITADAS, nao ignoradas. Uma variavel que
    o .env precisa carregar para outro consumidor -- como o compose -- e
    declarada aqui, para que o conjunto de configuracao do projeto tenha um
    lugar so onde esta escrito.

    Variavel VAZIA conta como ausente (`env_ignore_empty`): o .env.example
    traz a chave como `FOCUSQUEST_ANTHROPIC_API_KEY=`, e uma chave vazia que
    virasse `SecretStr("")` diria "configurada" para uma credencial que nao
    existe.
    """

    model_config = SettingsConfigDict(
        env_prefix="FOCUSQUEST_", env_file=".env", env_ignore_empty=True
    )

    database_url: str
    test_database_url: str
    # Consumida pelo compose.yaml, nao pelo Python. Declarada aqui porque o
    # .env a carrega e porque variavel desconhecida deve continuar sendo erro.
    db_port: int = 55432
    # Consumida pelo E2E (frontend/tests/e2e/servers.ts, via Makefile), nao pela
    # aplicacao: desloca as tres portas do E2E para dois gates rodarem ao mesmo
    # tempo em worktrees diferentes (pendencia 19). De 0 a 49 -- o limite e o
    # vao entre a API (8100) e o falso (8150), menos um; o servers.ts o deriva
    # das portas e tests/unit/test_config.py confere que os dois batem. Faixa
    # por convencao: 0 a 24 para worktrees, 25 a 49 para o pre-push
    # (scripts/push-env.sh).
    e2e_port_offset: int = Field(default=0, ge=0, le=49)

    anthropic_api_key: SecretStr | None = None
    # Escrito por extenso, e nao `None`: com `base_url=None` o SDK obedece a
    # `ANTHROPIC_BASE_URL` do ambiente (medido), e uma variavel solta no shell
    # mandaria a conversa para outro endereco.
    anthropic_base_url: str = "https://api.anthropic.com"
    tutor_model: str = "claude-opus-5"
    tutor_max_tokens: int = Field(default=1024, ge=1)
    tutor_timeout_seconds: float = Field(default=60, gt=0)
    tutor_history_messages: int = Field(default=20, ge=1)
