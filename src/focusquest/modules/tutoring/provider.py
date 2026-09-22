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
    """O modelo chamou a ferramenta `create_mission` com esta entrada.

    A entrada ainda NAO foi validada: quem valida e o servico, pelo
    `MissionCreate`, antes de gravar qualquer acao.
    """

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
