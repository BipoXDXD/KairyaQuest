"""O adaptador Anthropic: a unica peca da aplicacao que importa o SDK."""

import logging
import re
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any, Literal

import anthropic
import httpx2
from anthropic import omit
from anthropic.types import MessageParam, ToolParam, ToolUseBlock
from anthropic.types.beta import (
    BetaFallbackBlock,
    BetaFallbackMessageIterationUsage,
    BetaMessage,
    BetaMessageParam,
    BetaTextBlockParam,
    BetaToolParam,
    BetaToolUseBlock,
)

from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.provider import (
    Delta,
    EventoDoProvedor,
    Ferramenta,
    Fim,
    Parada,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.tool_definitions import (
    DESCRICAO_DA_FERRAMENTA as DESCRICAO_DA_FERRAMENTA,
)
from focusquest.modules.tutoring.tool_definitions import (
    DESCRICAO_DO_REAGENDAMENTO as DESCRICAO_DO_REAGENDAMENTO,
)
from focusquest.modules.tutoring.tool_definitions import (
    esquema_da_proposta as esquema_da_proposta,
)
from focusquest.modules.tutoring.tool_definitions import (
    esquema_do_reagendamento as esquema_do_reagendamento,
)

_LOGGER = logging.getLogger(__name__)
# Cabecalhos de limite da documentacao "Rate limits" da Anthropic; qualquer
# outro (location, set-cookie, request-id...) fica fora do log.
_CABECALHOS_DE_LIMITE = (
    "retry-after",
    "anthropic-ratelimit-requests-limit",
    "anthropic-ratelimit-requests-remaining",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-tokens-limit",
    "anthropic-ratelimit-tokens-remaining",
    "anthropic-ratelimit-tokens-reset",
    "anthropic-ratelimit-input-tokens-limit",
    "anthropic-ratelimit-input-tokens-remaining",
    "anthropic-ratelimit-input-tokens-reset",
    "anthropic-ratelimit-output-tokens-limit",
    "anthropic-ratelimit-output-tokens-remaining",
    "anthropic-ratelimit-output-tokens-reset",
)
_TAMANHO_MAXIMO_DO_VALOR = 64
# Espaco, "=", quebra de linha e controle forjariam campos ou linhas no log.
_FORA_DO_SEGURO = re.compile(r"[^A-Za-z0-9._:,+-]")

# Tentativas do proprio SDK, alem da primeira chamada: NENHUMA. O SDK so repete
# antes do primeiro evento, e repetir custa o orcamento de tempo que a tela
# espera: com 2 tentativas e 60 s por fase o pior caso era de ~181 s por
# `(1 + 2) * 60 s` mais o backoff, contra os 90 s do nginx (pendencia
# P-prazo-medido-1). Alem disso o SDK obedece ao `Retry-After` da resposta SEM
# teto (`_calculate_retry_timeout`, SDK 1.11), entao so `max_retries=0` torna o
# pior caso calculavel pelo que este cliente configura. O preco: um 429, 5xx ou
# erro de conexao passageiro aparece na tela como `provedor_indisponivel` na
# primeira ocorrencia, em vez de ser mascarado por uma segunda chamada; o
# estudante reenvia a pergunta (o reenvio ja e o caminho previsto).
# `tests/unit/test_prazos_coerentes.py` confere o teto a partir destes numeros.
TENTATIVAS = 0

# As fases da chamada que NAO sao a espera pelo modelo, cada uma com o seu
# relogio no httpx. Pequenas de proposito: o pior caso de uma chamada e a SOMA
# das quatro fases (`connect + write + read + pool`), e o que sobra do
# orcamento (`Settings.tutor_timeout_seconds`) e a espera pelo modelo. Julgamento,
# sem medida de rede: conectar e escrever um corpo de poucos KB num provedor
# saudavel leva milissegundos; 3 s e 2 s ja sao folgados. O pool de conexoes do
# SDK tem 1000 vagas, entao a fila e teorica.
# O `connect` NAO cobre a resolucao de DNS (o getaddrinfo do sistema nao tem
# prazo no httpx) e vale POR ENDERECO resolvido: um nome com varios enderecos
# gasta ate `connect` em cada um. O teto de 60 s e, por isso, ligeiramente
# otimista no pior caso de rede; so uma medida em producao diria o quanto.
CONEXAO_SEGUNDOS = 3.0
ESCRITA_SEGUNDOS = 2.0
FILA_DO_POOL_SEGUNDOS = 1.0

# O beta do fallback do lado do servidor (pendencia 174). A data e EXATA: o
# `fallbacks="default"` so e aceito com `2026-07-01`; o `2026-06-01` aceita so a
# lista explicita, e qualquer outra data da 400 (documentacao "Refusals and
# fallback"). Um 400 aqui derruba TODA pergunta como `provedor_indisponivel`:
# a saida e `FOCUSQUEST_TUTOR_FALLBACK=false`.
BETA_DO_FALLBACK = "server-side-fallback-2026-07-01"

# Teto de saida da AVALIACAO, proprio e maior que o do chat (1024): um
# `feedback` de ate 1500 caracteres mais o JSON da ferramenta precisam caber
# com folga (e, nos modelos que pensam por padrao, o thinking gasta do mesmo
# `max_tokens`). Truncado, o
# `input` sairia parcial (ver o `stop_reason` em `avaliar`).
MAX_TOKENS_DA_AVALIACAO = 2048

# Os niveis de esforco que a configuracao aceita (`output_config.effort`). Os
# modelos 5.x recusam com 400 `temperature`, `top_p`, `top_k` e
# `budget_tokens`: a profundidade do raciocinio se controla SO pelo esforco, e
# o `thinking` nao e enviado (adaptativo e o padrao desses modelos).
Esforco = Literal["low", "medium", "high"]

# O `stop_reason` que NAO e o fim normal, traduzido para o dominio
# (pendencias 45 e 120). `end_turn` e `tool_use` sao o fim normal; `stop_sequence`
# e `pause_turn` nao acontecem nesta conversa (ela nao manda `stop_sequences`
# nem ferramenta de servidor) e, se acontecessem, contariam como fim normal.
_PARADAS: dict[str | None, Parada] = {
    "max_tokens": Parada.CORTADA,
    "model_context_window_exceeded": Parada.CORTADA,
    "refusal": Parada.RECUSADA,
}


def _valor_seguro(valor: str) -> str:
    return _FORA_DO_SEGURO.sub("?", valor[:_TAMANHO_MAXIMO_DO_VALOR])


def _descrever_limites(cabecalhos: httpx2.Headers) -> str:
    return "".join(
        f" {nome}={_valor_seguro(cabecalhos[nome])}"
        for nome in _CABECALHOS_DE_LIMITE
        if nome in cabecalhos
    )


@contextmanager
def _traduzir_erros() -> Iterator[None]:
    """Traduz as excecoes do SDK e do transporte para as do provedor.

    Um ponto so, para `responder` e `avaliar`: as duas falam com o mesmo SDK e
    tem de falhar do mesmo jeito. O `with` funciona tambem dentro do generator
    de `responder`: um `GeneratorExit` (o consumidor parou de ler) atravessa
    sem ser capturado.
    """
    try:
        yield
    except (anthropic.APITimeoutError, httpx2.TimeoutException) as erro:
        # Os DOIS tipos, e nao so o do SDK: a demora no meio do stream sai
        # como `httpx2.ReadTimeout` cru (medido).
        raise TempoEsgotadoError("o provedor demorou alem do limite") from erro
    except (anthropic.APIError, httpx2.TransportError) as erro:
        if isinstance(erro, anthropic.APIStatusError):
            _LOGGER.warning(
                "Falha HTTP do provedor: status=%d tipo=%s%s",
                erro.status_code,
                type(erro).__name__,
                _descrever_limites(erro.response.headers),
            )
        raise ProvedorIndisponivelError(
            f"o provedor falhou: {type(erro).__name__}"
        ) from erro


def _mensagens_da_api(turno: Turno) -> list[MessageParam]:
    """As mensagens do turno no formato da API estavel, para a avaliacao."""
    return [
        {"role": mensagem.papel, "content": mensagem.texto}
        for mensagem in turno.mensagens
    ]


def _mensagens_do_beta(turno: Turno) -> list[BetaMessageParam]:
    """As mesmas mensagens no tipo do endpoint beta, que a conversa chama. Os
    dois `TypedDict` tem as mesmas chaves, mas o mypy estrito nao os unifica."""
    return [
        {"role": mensagem.papel, "content": mensagem.texto}
        for mensagem in turno.mensagens
    ]


def _sistema_com_cache(turno: Turno) -> list[BetaTextBlockParam]:
    """O sistema da conversa em blocos: a persona fecha o prefixo cacheado; o
    contexto do turno, que muda a cada pergunta, vem num bloco depois dele.

    O prefixo e `tools` -> `system` (ordem da API): as ferramentas e a persona
    sao iguais em todo turno, e o `cache_control` na ultima ferramenta e na
    persona marca onde ele termina. O contexto e o historico ficam fora.
    """
    persona: BetaTextBlockParam = {
        "type": "text",
        "text": turno.sistema,
        "cache_control": {"type": "ephemeral"},
    }
    contexto: list[BetaTextBlockParam] = (
        [{"type": "text", "text": turno.contexto}] if turno.contexto else []
    )
    return [persona, *contexto]


def _substituto(mensagem: BetaMessage) -> str | None:
    """O modelo que serviu a resposta quando o servidor a refez noutro depois
    de uma recusa, ou `None` quando foi o pedido.

    O sinal e a entrada `fallback_message` de `usage.iterations`, como manda a
    documentacao ("the signal for whether a fallback model served the response
    is the presence of a `fallback_message` entry in `usage.iterations`, not
    this block"): e o unico que cobre a troca antes da saida, no meio e o
    roteamento fixo, que nao tem bloco `fallback`. Comparar `model` com o
    modelo configurado quebraria com um alias.
    """
    for iteracao in mensagem.usage.iterations or []:
        if isinstance(iteracao, BetaFallbackMessageIterationUsage):
            return iteracao.model
    return None


class ProvedorAnthropic:
    """Fala com a API de Mensagens pelo SDK oficial, sincrono."""

    def __init__(
        self,
        *,
        chave: str,
        base_url: str,
        modelo: str,
        max_tokens: int,
        timeout_segundos: float,
        fallback: bool,
        esforco: Esforco,
        esforco_da_avaliacao: Esforco,
    ) -> None:
        # A chave e o endereco SEMPRE explicitos: sem eles o SDK procura
        # credencial e endereco no ambiente sozinho (medido).
        self._cliente = anthropic.Anthropic(
            api_key=chave,
            base_url=base_url,
            # `timeout_segundos` e a espera por leitura (pelos cabecalhos e entre
            # chunks); as outras fases tem prazo proprio, somado no pior caso.
            timeout=anthropic.Timeout(
                connect=CONEXAO_SEGUNDOS,
                read=timeout_segundos,
                write=ESCRITA_SEGUNDOS,
                pool=FILA_DO_POOL_SEGUNDOS,
            ),
            max_retries=TENTATIVAS,
        )
        self._modelo = modelo
        self._max_tokens = max_tokens
        # Sem valor padrao, como a chave: quem monta o adaptador decide
        # (`Settings.tutor_fallback`, pendencia 174).
        self._fallback = fallback
        # Sem valor padrao tambem: `Settings.tutor_effort` e
        # `Settings.evaluation_effort` decidem.
        self._esforco = esforco
        self._esforco_da_avaliacao = esforco_da_avaliacao

    @property
    def modelo(self) -> str:
        """O modelo que este adaptador chama."""
        return self._modelo

    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        """Os eventos da resposta, pelo endpoint BETA (pendencia 174).

        O beta e o que tem o fallback do lado do servidor: com ele ligado, a
        API refaz a requisicao recusada no modelo que a Anthropic recomenda
        para a categoria da recusa (`fallbacks="default"`), dentro do mesmo
        stream. Desligado, a chamada e a mesma, sem `fallbacks` e sem o
        cabecalho: um caminho so de codigo.

        A proposta sai so no `message_stop`, e a que fechou ANTES do bloco
        `fallback` e descartada: e trabalho do modelo que recusou, e o
        substituto so recebe o texto parcial como contexto. O texto parcial,
        esse, fica: o substituto o continua.
        """
        criar: BetaToolParam = {
            "name": TipoDeAcao.CRIAR_MISSAO.value,
            "description": DESCRICAO_DA_FERRAMENTA,
            "input_schema": esquema_da_proposta(),
        }
        reagendar: BetaToolParam = {
            "name": TipoDeAcao.REAGENDAR_MISSAO.value,
            "description": DESCRICAO_DO_REAGENDAMENTO,
            "input_schema": esquema_do_reagendamento(),
            # A ULTIMA ferramenta fecha a parte das ferramentas no prefixo.
            "cache_control": {"type": "ephemeral"},
        }
        with (
            _traduzir_erros(),
            self._cliente.beta.messages.stream(
                model=self._modelo,
                max_tokens=self._max_tokens,
                system=_sistema_com_cache(turno),
                messages=_mensagens_do_beta(turno),
                tools=[criar, reagendar],
                output_config={"effort": self._esforco},
                # Uma proposta por resposta (README s14).
                tool_choice={"type": "auto", "disable_parallel_tool_use": True},
                fallbacks="default" if self._fallback else omit,
                betas=[BETA_DO_FALLBACK] if self._fallback else omit,
            ) as stream,
        ):
            motivo_da_parada: str | None = None
            proposta: Proposta | None = None
            for evento in stream:
                if evento.type == "text":
                    yield Delta(evento.text)
                elif evento.type == "content_block_start" and isinstance(
                    evento.content_block, BetaFallbackBlock
                ):
                    proposta = None
                elif evento.type == "content_block_stop" and isinstance(
                    # `BetaToolUseBlock` NAO e subclasse de `ToolUseBlock`
                    # (medido): com o tipo estavel, nenhuma proposta sairia.
                    evento.content_block,
                    BetaToolUseBlock,
                ):
                    proposta = Proposta(
                        evento.content_block.name, dict(evento.content_block.input)
                    )
                elif evento.type == "message_delta":
                    motivo_da_parada = evento.delta.stop_reason
                elif evento.type == "message_stop":
                    if proposta is not None:
                        yield proposta
                    yield Fim(
                        _PARADAS.get(motivo_da_parada, Parada.TERMINOU),
                        substituto=_substituto(evento.message),
                    )

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        """A entrada da chamada de `ferramenta`, ou `None` se o modelo nao a chamou
        ou se a resposta parou por `stop_reason` diferente de `tool_use`.

        `tool_choice` e `auto` (EM3), e nao FORCADO na ferramenta: em alguns
        modelos o forcado da 400 ou exige thinking desligado (ver a referencia
        da API, `tool_choice`), o que prenderia a avaliacao ao modelo
        configurado. Quem manda o modelo chamar `record_evaluation`
        e o sistema da avaliacao; se ele nao chamar, o resultado e `None`, que
        o servico grava como `avaliacao_invalida`. `strict` faz a entrada
        obedecer ao esquema. O stream e consumido inteiro por dentro; so
        `message_stop` prova que a resposta terminou, como na conversa.
        """
        definicao: ToolParam = {
            "name": ferramenta.nome,
            "description": ferramenta.descricao,
            "input_schema": ferramenta.esquema,
            "strict": True,
        }
        entrada: dict[str, Any] | None = None
        terminou = False
        motivo_da_parada: str | None = None
        with (
            _traduzir_erros(),
            self._cliente.messages.stream(
                model=self._modelo,
                max_tokens=MAX_TOKENS_DA_AVALIACAO,
                # A avaliacao nao tem contexto de turno; se tiver, ele vai junto.
                system="\n\n".join(filter(None, (turno.sistema, turno.contexto))),
                messages=_mensagens_da_api(turno),
                tools=[definicao],
                output_config={"effort": self._esforco_da_avaliacao},
                tool_choice={"type": "auto", "disable_parallel_tool_use": True},
            ) as stream,
        ):
            for evento in stream:
                if (
                    evento.type == "content_block_stop"
                    and isinstance(evento.content_block, ToolUseBlock)
                    and evento.content_block.name == ferramenta.nome
                ):
                    entrada = dict(evento.content_block.input)
                elif evento.type == "message_delta":
                    motivo_da_parada = evento.delta.stop_reason
                elif evento.type == "message_stop":
                    terminou = True
        if not terminou:
            raise ProvedorIndisponivelError("o stream terminou sem message_stop")
        if motivo_da_parada != "tool_use":
            # `max_tokens` (ou outra parada) deixa um `input` possivelmente
            # parcial: nao o entrega como se fosse uma avaliacao valida.
            return None
        return entrada
