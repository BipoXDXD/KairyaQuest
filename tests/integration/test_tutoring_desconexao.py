"""A desconexao do cliente no meio da resposta, com uvicorn DE VERDADE.

O `TestClient` bufferiza a resposta inteira e nao desconecta.
So um servidor real reproduz o cenario: gerador sincrono cru no
`StreamingResponse`, cliente desconecta, resposta fica pendurada.

**O que este teste PROVA:** ponta a ponta, com um cliente real se
desconectando no meio do stream, a resposta termina gravada como
`interrompida` -- nunca fica presa em `gerando` para sempre.

**O que este teste NAO PROVA:** ele nao
isola QUAL guarda fecha a cadeia. Medido e instrumentado: nesta maquina, a
resposta termina `interrompida` mesmo com o invoucro `fechando_ao_cancelar`
e o `finally: eventos.close()` de `_em_sse` removidos ao mesmo tempo -- so
que TARDE (3 a 11s depois da desconexao, contra os poucos milissegundos das
duas guardas), porque a escrita do proximo evento no socket ja fechado
acaba falhando, e essa falha aciona a finalizacao automatica de generator
do CPython por conta propria (fecha um generator suspenso sem referencia,
via refcounting, sem nenhum `close()` explicito no caminho). Ou seja: SEM as
duas guardas, o fechamento existe mas depende do SO e de um detalhe de
implementacao do CPython que a linguagem nao promete; COM elas, e imediato e
portavel -- e e essa garantia que a spec pede (README, "sem perda destrutiva
de progresso"), nao so o resultado eventual.

A prova por mutacao de CADA guarda, isolada e deterministica (sem depender
do SO nem do escalonador), esta em outro lugar:

- o invoucro `fechando_ao_cancelar`:
  `tests/unit/test_tutoring_sse.py::test_cancelar_o_consumo_fecha_o_gerador`
  (apagar o `close()` de dentro dele o faz reprovar);
- o `finally: eventos.close()` de `_em_sse`:
  `tests/unit/test_tutoring_router_sse.py::test_fechar_o_em_sse_fecha_o_gerador_de_eventos`
  (apagar o `finally` o faz reprovar).
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
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

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
        # Presa depois do primeiro pedaco: o cliente ve um `delta` e some.
        blocos=(Texto(("comecou", " e seguiu")),),
        segurar_apos_eventos=APOS_O_PRIMEIRO_PEDACO,
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
    # O cliente ja desconectou. O falso solta o resto para o SDK nao ficar
    # bloqueado -- o invoucro fecha a cadeia em ~1ms (medido); sem ele, o
    # fechamento so viria da falha (tardia) de escrever no socket morto.
    falso.liberar.set()
    _esperar(
        lambda: _status(banco_migrado, cid) == [StatusDaMensagem.INTERROMPIDA],
        "a resposta virar interrompida",
    )
