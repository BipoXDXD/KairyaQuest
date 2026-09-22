"""O formato SSE e o invoucro que fecha o gerador quando o cliente some."""

from collections.abc import AsyncIterator, Generator

import anyio


def evento_sse(nome: str, dados: str) -> str:
    """Um evento SSE. `dados` e JSON numa linha so (o `model_dump_json` do
    Pydantic nao quebra linha), entao um `data:` basta."""
    return f"event: {nome}\ndata: {dados}\n\n"


def _proximo(gerador: Generator[str]) -> str | None:
    return next(gerador, None)


async def fechando_ao_cancelar(gerador: Generator[str]) -> AsyncIterator[str]:
    """Itera o gerador sincrono numa thread e o FECHA se o consumo for cancelado.

    O Starlette, ao receber um gerador sincrono cru, pode parar de consumi-lo
    sem fecha-lo quando o cliente desconecta. Aqui, o cancelamento chega ao
    `finally` deste gerador assincrono, que chama `close()` no sincrono, de
    forma IMEDIATA e DETERMINISTICA: o `GeneratorExit` entra pelo `yield`
    onde ele parou, sem depender de o sistema operacional notar que o socket
    do cliente morreu, nem de o CPython decidir destruir um objeto sem
    referencia. O `close()` roda em thread, protegido do cancelamento em
    curso (`CancelScope(shield=True)`), porque o `finally` do sincrono grava
    no banco.

    A iteracao espera o `next()` terminar antes de o cancelamento valer (o
    `to_thread` nao abandona a thread). Entao, quando o `close()` roda, o
    gerador sincrono nunca esta executando.

    Sem este invoucro (e sem o `finally: eventos.close()` de
    `router._em_sse`), o fechamento ainda acontece eventualmente, mas de
    forma TARDIA e NAO PORTAVEL -- depende de o SO notar o socket do cliente
    morto e de um detalhe de implementacao do CPython (refcounting) que a
    linguagem nao promete como contrato. As duas guardas continuam aqui
    porque sao a garantia PORTAVEL e IMEDIATA que o README pede ("sem perda
    destrutiva de progresso"). A medicao completa que sustenta esta escolha
    esta em `docs/HANDOFF.md` e na emenda M1 de
    `docs/superpowers/specs/2026-09-18-incremento-1b-design.md`; a prova
    deterministica de que esta guarda especifica fecha o gerador esta em
    `tests/unit/test_tutoring_sse.py::test_cancelar_o_consumo_fecha_o_gerador`.
    """
    try:
        while (item := await anyio.to_thread.run_sync(_proximo, gerador)) is not None:
            yield item
    finally:
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(gerador.close)
