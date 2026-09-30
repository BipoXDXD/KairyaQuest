"""O adaptador Anthropic: a unica peca da aplicacao que importa o SDK."""

from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any

import anthropic
import httpx2
from anthropic import omit
from anthropic.types import MessageParam, ToolParam, ToolUseBlock
from anthropic.types.beta import (
    BetaFallbackBlock,
    BetaFallbackMessageIterationUsage,
    BetaMessage,
    BetaMessageParam,
    BetaToolParam,
    BetaToolUseBlock,
)

from focusquest.modules.missions.schemas import MissionCreate
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
from focusquest.modules.tutoring.schemas import RescheduleProposal

# Tentativas do proprio SDK, alem da primeira chamada. Elas so acontecem antes
# do primeiro evento: depois que o stream comecou, o SDK nao tenta de novo
# (medido: 3 chamadas com demora nos cabecalhos ou 500; 1 com o corte no meio).
TENTATIVAS = 2

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

# O `stop_reason` que NAO e o fim normal, traduzido para o dominio
# (pendencias 45 e 120). `end_turn` e `tool_use` sao o fim normal; `stop_sequence`
# e `pause_turn` nao acontecem nesta conversa (ela nao manda `stop_sequences`
# nem ferramenta de servidor) e, se acontecessem, contariam como fim normal.
_PARADAS: dict[str | None, Parada] = {
    "max_tokens": Parada.CORTADA,
    "model_context_window_exceeded": Parada.CORTADA,
    "refusal": Parada.RECUSADA,
}

DESCRICAO_DA_FERRAMENTA = (
    "Propõe uma missão de estudo. NÃO cria nada: a pessoa vê a proposta num "
    "cartão e decide se confirma ou recusa. Use no máximo uma vez por "
    "resposta. O prazo (deadline) é um instante ISO 8601 com fuso horário, "
    "no futuro."
)

DESCRICAO_DO_REAGENDAMENTO = (
    "Propõe mudar o prazo de UMA missão avulsa ainda não concluída da lista do "
    "contexto (pelo número #id dela). NÃO muda "
    "nada: a pessoa vê a proposta num cartão e decide se confirma ou recusa. "
    "Use só depois de conversar o motivo, e no máximo uma proposta por resposta. "
    "O novo prazo (new_deadline) é um instante ISO 8601 com fuso horário, no futuro."
)


def esquema_da_proposta() -> dict[str, Any]:
    """O `input_schema` da ferramenta, gerado do MESMO `MissionCreate` do
    `POST /api/missions`, para os dois contratos nao divergirem.

    O `description` do topo e a docstring de manutencao do schema:
    fala de 422 e de defeitos medidos, e nao serve ao modelo. A descricao
    para o modelo e `DESCRICAO_DA_FERRAMENTA`.
    """
    esquema = MissionCreate.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    return esquema


def esquema_do_reagendamento() -> dict[str, Any]:
    """O `input_schema` de `reschedule_mission`, gerado do `RescheduleProposal`
    (a tecnica de `esquema_da_proposta`)."""
    esquema = RescheduleProposal.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    # A docstring do enum tambem vai para o `$defs`; e de manutencao.
    for definicao in esquema.get("$defs", {}).values():
        definicao.pop("description", None)
    return esquema


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
    ) -> None:
        # A chave e o endereco SEMPRE explicitos: sem eles o SDK procura
        # credencial e endereco no ambiente sozinho (medido).
        self._cliente = anthropic.Anthropic(
            api_key=chave,
            base_url=base_url,
            timeout=timeout_segundos,
            max_retries=TENTATIVAS,
        )
        self._modelo = modelo
        self._max_tokens = max_tokens
        # Sem valor padrao, como a chave: quem monta o adaptador decide
        # (`Settings.tutor_fallback`, pendencia 174).
        self._fallback = fallback

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
        }
        with (
            _traduzir_erros(),
            self._cliente.beta.messages.stream(
                model=self._modelo,
                max_tokens=self._max_tokens,
                system=turno.sistema,
                messages=_mensagens_do_beta(turno),
                tools=[criar, reagendar],
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
                system=turno.sistema,
                messages=_mensagens_da_api(turno),
                tools=[definicao],
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
