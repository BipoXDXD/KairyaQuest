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
    sem fecha-lo quando o cliente desconecta (medicao M1 do plano: um
    `finally` que nunca rodou numa janela de observacao de 2s). Aqui, o
    cancelamento chega ao `finally` deste gerador assincrono, que chama
    `close()` no sincrono, de forma IMEDIATA e DETERMINISTICA: o
    `GeneratorExit` entra pelo `yield` onde ele parou, sem depender de o
    sistema operacional notar que o socket do cliente morreu, nem de o
    CPython decidir destruir um objeto sem referencia. O `close()` roda em
    thread, protegido do cancelamento em curso (`CancelScope(shield=True)`),
    porque o `finally` do sincrono grava no banco.

    A iteracao espera o `next()` terminar antes de o cancelamento valer (o
    `to_thread` nao abandona a thread). Entao, quando o `close()` roda, o
    gerador sincrono nunca esta executando.

    MEDIDO nesta maquina (fix round 1/5 da Task 7, macOS, Python 3.14,
    Starlette 1.6): este invoucro e o `finally: eventos.close()` de
    `router._em_sse` se cobrem. Removendo UM dos dois isoladamente, ou os
    DOIS ao mesmo tempo,
    `tests/integration/test_tutoring_desconexao.py` continua passando (3/3
    execucoes em cada combinacao). A causa, instrumentada e medida: o roteiro
    do teste ainda produz mais um evento apos a liberacao, e a tentativa de
    ESCREVER esse evento no socket do cliente ja fechado so falha 3 a 11
    segundos depois (o SO leva esse tempo para notar a conexao morta nesta
    maquina) -- e e essa falha, propagada pelo `iterate_in_threadpool` do
    Starlette, que abandona a cadeia de generators e aciona a finalizacao
    automatica do CPython (fecha um generator suspenso sem referencia, via
    refcounting, mesmo sem NENHUM `close()` explicito no caminho). Como a
    janela do teste e de 15s, ela alcanca essa falha tardia e passa mesmo sem
    as duas guardas -- o que explica, sem contradizer, a medicao M1 original
    (2s de janela e curto demais para essa falha aparecer). Ou seja: NENHUMA
    mutacao deste par, isolada ou combinada, e hoje discriminada por este
    teste. As duas guardas continuam aqui porque sao a garantia PORTAVEL e
    IMEDIATA -- nao dependem de quanto tempo o SO leva para notar um socket
    morto, nem de um detalhe de implementacao do CPython que a linguagem nao
    promete.
    """
    try:
        while (item := await anyio.to_thread.run_sync(_proximo, gerador)) is not None:
            yield item
    finally:
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(gerador.close)
