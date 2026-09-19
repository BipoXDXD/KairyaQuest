"""O invoucro que fecha o gerador sincrono quando o cliente desconecta.

A prova de ponta a ponta, com uvicorn, esta em
`tests/integration/test_tutoring_desconexao.py`. Aqui o mecanismo e isolado:
cancelar o consumo tem de chegar ao `finally` do gerador sincrono.

O teste guarda uma referencia ao gerador (`gerador`) de proposito: sem ela, o
coletor fecharia o gerador sozinho ao recolhe-lo, e a assercao passaria com o
`close()` removido do invoucro.
"""

from collections.abc import Generator

import anyio

from focusquest.modules.tutoring.sse import evento_sse, fechando_ao_cancelar


def _gerador(registro: list[str]) -> Generator[str]:
    try:
        yield "a"
        yield "b"
        registro.append("terminou")
    except GeneratorExit:
        registro.append("fechado")
        raise


def test_consumo_completo_entrega_tudo() -> None:
    registro: list[str] = []
    gerador = _gerador(registro)

    async def principal() -> list[str]:
        return [item async for item in fechando_ao_cancelar(gerador)]

    assert anyio.run(principal) == ["a", "b"]
    assert registro == ["terminou"]


def test_cancelar_o_consumo_fecha_o_gerador() -> None:
    registro: list[str] = []
    gerador = _gerador(registro)

    async def principal() -> None:
        with anyio.CancelScope() as escopo:
            async for _ in fechando_ao_cancelar(gerador):
                escopo.cancel()
                await anyio.sleep(0)

    anyio.run(principal)
    assert registro == ["fechado"]
    # `gi_frame` existe em todo generator do CPython, mas o stub do typeshed
    # para `Generator` nao o declara -- a prova de que o gerador foi FECHADO
    # (e nao so abandonado) e exatamente essa, entao o ignore fica aqui.
    assert gerador.gi_frame is None  # type: ignore[attr-defined]


def test_formato_do_evento() -> None:
    esperado = 'event: delta\ndata: {"text": "oi"}\n\n'
    assert evento_sse("delta", '{"text": "oi"}') == esperado
