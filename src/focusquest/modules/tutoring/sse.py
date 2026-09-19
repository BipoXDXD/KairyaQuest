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

    O Starlette, ao receber um gerador sincrono, para de consumi-lo quando o
    cliente desconecta -- e nunca o fecha (medicao M1). O `finally` dele nao
    roda, a resposta fica `gerando` e o stream do provedor, aberto. Aqui, o
    cancelamento chega ao `finally` deste gerador assincrono, que chama
    `close()` no sincrono: o `GeneratorExit` entra pelo `yield` onde ele
    parou. O `close()` roda em thread, protegido do cancelamento em curso,
    porque o `finally` do sincrono grava no banco.

    A iteracao espera o `next()` terminar antes de o cancelamento valer (o
    `to_thread` nao abandona a thread). Entao, quando o `close()` roda, o
    gerador sincrono nunca esta executando.
    """
    try:
        while (item := await anyio.to_thread.run_sync(_proximo, gerador)) is not None:
            yield item
    finally:
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(gerador.close)
