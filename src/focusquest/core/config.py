"""Configuracao da aplicacao, lida do ambiente."""

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Os nomes que o `logging` conhece, em caixa alta. `NOTSET` fica de fora: no
# logger do app ele quer dizer "herde da raiz" (so WARNING ou acima), que e o
# estado de antes de haver configuracao, e nao um nivel que se escolhe.
NivelDeLog = Annotated[
    Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
    BeforeValidator(lambda valor: valor.upper() if isinstance(valor, str) else valor),
]


class ConfiguracaoDeLog(BaseSettings):
    """O nivel de log, lido SEM exigir o resto da configuracao (pendencia 13).

    Existe separada do `Settings` porque a partida configura o log antes de
    qualquer coisa tocar no banco, e o `/health` responde sem configuracao de
    banco: ler o nivel pelo `Settings` exigiria `FOCUSQUEST_DATABASE_URL`.

    `extra="ignore"` e so desta classe: o .env tem as outras chaves do
    projeto, e quem as recusa, se forem desconhecidas, e o `Settings` -- que
    HERDA `log_level` daqui, para o campo ser declarado e validado num lugar
    so (e para `FOCUSQUEST_LOG_LEVEL` no .env nao virar `extra_forbidden`).
    """

    model_config = SettingsConfigDict(
        env_prefix="FOCUSQUEST_",
        env_file=".env",
        env_ignore_empty=True,
        # O valor pode ser segredo: sem isto o erro imprime `input_value=...`.
        hide_input_in_errors=True,
        extra="ignore",
    )

    log_level: NivelDeLog = "INFO"


class Settings(ConfiguracaoDeLog):
    """Configuracao da aplicacao.

    Nenhum campo tem valor padrao para credencial de BANCO: esquecer de
    configurar precisa falhar na partida, nao conectar em um banco qualquer.

    A excecao e a chave da Anthropic, e ela e deliberada. O README s14 manda
    mostrar indisponibilidade quando nao ha credencial: a ausencia dela e um
    ESTADO do produto (a Kairya fora do ar, o Quartel-General funcionando), nao
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

    # `extra="forbid"` escrito, e nao herdado do padrao: a classe-mae ignora
    # chave desconhecida, e sem esta linha o `Settings` passaria a ignorar
    # tambem.
    # Limite: o pydantic-settings so aplica `extra` as fontes de arquivo (.env)
    # e de init. A fonte de AMBIENTE le apenas as variaveis dos campos
    # declarados, entao `FOCUSQUEST_ALGO_ERRADO=1` exportado no processo e
    # descartada em silencio (fixado em tests/unit/test_config.py).
    model_config = SettingsConfigDict(
        env_prefix="FOCUSQUEST_",
        env_file=".env",
        env_ignore_empty=True,
        # O valor pode ser segredo: sem isto o erro imprime `input_value=...`.
        hide_input_in_errors=True,
        extra="forbid",
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
    # O mesmo modelo conversa e avalia; o esforco e que muda entre os dois.
    tutor_model: str = "claude-sonnet-5-5"
    # O teto de SAIDA de uma resposta da Kairya. O thinking adaptativo gasta
    # deste mesmo teto; a saida e cobrada pelo uso real, nao pelo teto.
    tutor_max_tokens: int = Field(default=2048, ge=1)
    # A espera por LEITURA do provedor (pelos cabecalhos e entre chunks), nao o
    # orcamento inteiro de uma chamada: a ela o adaptador soma conexao, escrita
    # e fila do pool (6 s, `anthropic_provider.py`). 54 + 6 = 60 s, o que sobra
    # do `proxy_read_timeout` (90 s) depois da folga do orfao (30 s). Subir este
    # numero sem subir o nginx faz o 504 do proxy, sem `code`, vencer o
    # `tempo_esgotado` do backend; `tests/unit/test_prazos_coerentes.py` reprova.
    tutor_timeout_seconds: float = Field(default=54, gt=0)
    tutor_history_messages: int = Field(default=20, ge=1)
    # Teto de chamadas ao modelo por dia (de Sao Paulo) por estudante: guarda
    # de orcamento da API, nao regra do produto. O reenvio de uma pergunta
    # interrompida tambem conta, porque tambem e pago.
    tutor_daily_turn_limit: int = Field(default=60, ge=1)
    # O fallback do lado do servidor para a recusa (pendencia 174, beta): a API
    # refaz a requisicao recusada no modelo que a Anthropic recomenda para a
    # categoria da recusa. Desligar com FOCUSQUEST_TUTOR_FALLBACK=false se o
    # beta mudar e a API passar a recusar a requisicao inteira.
    tutor_fallback: bool = True
    # `output_config.effort` (os modelos 5.x recusam `temperature` e
    # `budget_tokens`): chat curto em `low`, a avaliacao da rubrica em `medium`.
    tutor_effort: Literal["low", "medium", "high"] = "low"
    evaluation_effort: Literal["low", "medium", "high"] = "medium"
