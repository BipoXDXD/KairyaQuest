"""Cliente Anthropic falso que so guarda os kwargs de cada `stream`.

Compartilhado pelos testes que olham o CONTEUDO do pedido (o adaptador e a
fiacao da configuracao em `get_tutoria`); nenhum chega a rede.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import anthropic
import pytest

from focusquest.core.idioma import Idioma
from focusquest.modules.tutoring.persona import persona_do_idioma
from focusquest.modules.tutoring.provider import Ferramenta, MensagemDoTurno, Turno

# A persona de producao, como a tutoria a monta: o teste do prefixo cacheado
# olha o texto real que vai no bloco com `cache_control`.
TURNO = Turno(
    sistema=persona_do_idioma(Idioma.PT_BR),
    contexto="CONTEXTO DO TURNO",
    mensagens=(
        MensagemDoTurno("user", "oi"),
        MensagemDoTurno("assistant", "ola"),
        MensagemDoTurno("user", "bora estudar"),
    ),
)
FERRAMENTA = Ferramenta(
    nome="record_evaluation",
    descricao="Registra a avaliacao.",
    esquema={"type": "object", "properties": {}, "additionalProperties": False},
)
_FIM = SimpleNamespace(
    type="message_stop", message=SimpleNamespace(usage=SimpleNamespace(iterations=None))
)


class _Mensagens:
    """`messages` (ou `beta.messages`) que so guarda os kwargs do `stream`."""

    def __init__(self, pedidos: list[dict[str, Any]]) -> None:
        self._pedidos = pedidos

    @contextmanager
    def stream(self, **kwargs: Any) -> Iterator[Iterator[SimpleNamespace]]:
        self._pedidos.append(kwargs)
        yield iter([_FIM])


class ClienteFalso:
    def __init__(self, **_: Any) -> None:
        self.pedidos: list[dict[str, Any]] = []
        self.messages = _Mensagens(self.pedidos)
        self.beta = SimpleNamespace(messages=_Mensagens(self.pedidos))


def instalar_cliente_falso(monkeypatch: pytest.MonkeyPatch) -> list[ClienteFalso]:
    """Troca `anthropic.Anthropic` pelo falso; devolve os clientes criados."""
    criados: list[ClienteFalso] = []

    def criar(**kwargs: Any) -> ClienteFalso:
        cliente = ClienteFalso(**kwargs)
        criados.append(cliente)
        return cliente

    monkeypatch.setattr(anthropic, "Anthropic", criar)
    return criados
