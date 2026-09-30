"""O que o servico de tutoria sabe de um provedor de IA -- e nada alem.

O servico depende deste `Protocol`, e nao do SDK: ele grava e emite, e nao
sabe que existe Anthropic. O adaptador e a unica peca que importa o SDK.
"""

from collections.abc import Generator
from dataclasses import dataclass
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class Delta:
    """Um pedaco do texto da resposta."""

    texto: str


@dataclass(frozen=True)
class Proposta:
    """O modelo chamou uma ferramenta de proposta com esta entrada.

    `nome` diz QUAL ferramenta foi chamada (F18). A entrada ainda NAO foi
    validada: quem valida e o servico, pelo schema da ferramenta, antes de
    gravar qualquer acao.
    """

    nome: str
    entrada: dict[str, Any]


@dataclass(frozen=True)
class Fim:
    """A resposta terminou de verdade (`message_stop`).

    Existe porque o fim da iteracao nao prova nada: um stream cortado no meio
    termina a iteracao em silencio (medicao M3 do plano do 1b-1). So quem
    recebeu `Fim` pode gravar a resposta como `completa`.
    """


EventoDoProvedor = Delta | Proposta | Fim


@dataclass(frozen=True)
class MensagemDoTurno:
    papel: Literal["user", "assistant"]
    texto: str


@dataclass(frozen=True)
class Turno:
    """Tudo o que o provedor recebe para responder uma pergunta."""

    sistema: str
    mensagens: tuple[MensagemDoTurno, ...]


@dataclass(frozen=True)
class Ferramenta:
    """Uma ferramenta que o chamador define e o provedor oferece ao modelo.

    O provedor a oferece em modo estrito (`strict`): a entrada da chamada
    obedece ao esquema. Chamar ou nao e decisao do modelo (`tool_choice` auto).

    E parametro, e nao constante do adaptador, para `tutoring` nao importar
    `evaluation`: quem conhece a rubrica e `evaluation`.
    """

    nome: str
    descricao: str
    esquema: dict[str, Any]


class ProvedorIndisponivelError(Exception):
    """O provedor recusou ou falhou, depois das tentativas."""


class TempoEsgotadoError(Exception):
    """A resposta demorou mais que o limite configurado."""


class Provedor(Protocol):
    def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
        """Os eventos da resposta, em ordem.

        Um GERADOR, e nao um iteravel qualquer: o servico o fecha (`close()`)
        quando o cliente desconecta, e o fechamento precisa chegar ao stream
        HTTP do provedor.
        """
        ...

    def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any] | None:
        """A entrada da chamada de `ferramenta`, ou `None` se o modelo terminou
        sem chama-la ou se a resposta parou por outro motivo que `tool_use`
        (por exemplo, `max_tokens`). A entrada ainda NAO foi validada.

        Levanta `ProvedorIndisponivelError` (inclusive no stream cortado, sem
        `message_stop`) e `TempoEsgotadoError`.
        """
        ...
