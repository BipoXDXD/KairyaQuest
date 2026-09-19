"""A desconexao do cliente no meio da resposta, com uvicorn DE VERDADE.

O `TestClient` bufferiza a resposta inteira (medicao M9) e nao desconecta.
So um servidor real reproduz o que a medicao M1 achou: sem o invoucro
`fechando_ao_cancelar`, o gerador nunca e fechado e a resposta fica
`gerando`.
"""

import threading
import time
from collections.abc import Callable, Iterator

import httpx
import pytest
import uvicorn
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from focusquest.core.database import get_engine
from focusquest.main import app
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.service import Tutoria
from integration.conftest import Conversa
from integration.provedor_falso import Roteiro, ServidorAnthropicFalso, Texto

PRAZO = 15.0


def _esperar(condicao: Callable[[], bool], descricao: str) -> None:
    """Espera por CONDICAO, com prazo -- nao por um numero de segundos."""
    limite = time.monotonic() + PRAZO
    while time.monotonic() < limite:
        if condicao():
            return
        time.sleep(0.05)
    pytest.fail(f"prazo esgotado esperando: {descricao}")


@pytest.fixture
def servidor(banco_migrado: Engine, tutoria: Tutoria) -> Iterator[str]:
    app.dependency_overrides[get_engine] = lambda: banco_migrado
    app.dependency_overrides[get_tutoria] = lambda: tutoria
    config = uvicorn.Config(
        app, host="127.0.0.1", port=0, log_level="warning", lifespan="off"
    )
    servidor = uvicorn.Server(config)
    thread = threading.Thread(target=servidor.run, daemon=True)
    thread.start()
    try:
        _esperar(lambda: servidor.started, "uvicorn subir")
        porta = servidor.servers[0].sockets[0].getsockname()[1]
        yield f"http://127.0.0.1:{porta}"
    finally:
        servidor.should_exit = True
        thread.join(timeout=PRAZO)
        app.dependency_overrides.pop(get_engine, None)
        app.dependency_overrides.pop(get_tutoria, None)


def _status(engine: Engine, cid: str) -> list[StatusDaMensagem]:
    with Session(bind=engine) as sessao:
        pergunta = sessao.scalar(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        )
        if pergunta is None:
            return []
        return list(
            sessao.scalars(
                select(TutorMessage.status).where(
                    TutorMessage.reply_to_id == pergunta.id
                )
            )
        )


def test_desconectar_no_meio_grava_interrompida(
    servidor: str,
    banco_migrado: Engine,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("comecou", " e seguiu")),), segurar_apos_eventos=3
    )
    cid = conversa.id("desconexao")
    with (
        httpx.Client(timeout=PRAZO) as cliente,
        cliente.stream(
            "POST",
            f"{servidor}/api/tutoring/messages",
            json={"client_message_id": cid, "content": "oi"},
        ) as resposta,
    ):
        for linha in resposta.iter_lines():
            if linha == "event: delta":
                break
        # Com a resposta comprovadamente no meio, a pergunta ja esta
        # commitada e a resposta, `gerando`: a rota commita antes do stream.
        assert _status(banco_migrado, cid) == [StatusDaMensagem.GERANDO]
    # O cliente fechou. O falso solta o resto, a thread do `next()` volta, e o
    # cancelamento chega ao gerador.
    falso.liberar.set()
    _esperar(
        lambda: _status(banco_migrado, cid) == [StatusDaMensagem.INTERROMPIDA],
        "a resposta virar interrompida",
    )
