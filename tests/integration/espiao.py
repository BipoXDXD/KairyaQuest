"""Um transporte HTTP que copia o corpo da resposta enquanto o SDK o le.

Existe para a camada 3 chamar o adaptador de PRODUCAO (`ProvedorAnthropic`)
e ainda ver os eventos que a API mandou, inclusive o `ping` que o SDK
descarta. Fica do lado do CLIENTE, em `tests/`: nao e um modo de captura em
`src/` nem um proxy no `anthropic_base_url` (decisao D8), e o endereco da
chamada real continua o padrao.
"""

import json
from collections.abc import Iterator
from typing import Any

import httpx2

from focusquest.modules.tutoring.anthropic_provider import Esforco, ProvedorAnthropic


class _Copia(httpx2.SyncByteStream):
    """Entrega cada pedaco ao SDK e guarda uma copia dele."""

    def __init__(self, origem: httpx2.SyncByteStream, destino: bytearray) -> None:
        self._origem = origem
        self._destino = destino

    def __iter__(self) -> Iterator[bytes]:
        for pedaco in self._origem:
            self._destino.extend(pedaco)
            yield pedaco

    def close(self) -> None:
        self._origem.close()


class Espiao(httpx2.BaseTransport):
    """Guarda o corpo CRU e os cabecalhos da ultima resposta, e do ultimo
    pedido so o corpo e o `anthropic-beta` (pendencia 174) -- nunca os
    cabecalhos inteiros, que levam a chave."""

    def __init__(self, interno: httpx2.BaseTransport) -> None:
        self._interno = interno
        self._bruto = bytearray()
        self._cabecalhos: httpx2.Headers | None = None
        self._corpo_do_pedido: bytes | None = None
        self._beta_do_pedido = ""

    def handle_request(self, request: httpx2.Request) -> httpx2.Response:
        self._corpo_do_pedido = request.read()
        self._beta_do_pedido = request.headers.get("anthropic-beta", "")
        resposta = self._interno.handle_request(request)
        assert isinstance(resposta.stream, httpx2.SyncByteStream)
        self._bruto = bytearray()
        self._cabecalhos = resposta.headers
        return httpx2.Response(
            status_code=resposta.status_code,
            headers=resposta.headers,
            stream=_Copia(resposta.stream, self._bruto),
            extensions=resposta.extensions,
        )

    def close(self) -> None:
        self._interno.close()

    def corpo_do_pedido(self) -> dict[str, Any] | None:
        """O JSON do ultimo pedido, ou `None` antes do primeiro."""
        if self._corpo_do_pedido is None:
            return None
        corpo: dict[str, Any] = json.loads(self._corpo_do_pedido)
        return corpo

    def betas_do_pedido(self) -> list[str]:
        """Os betas que o ultimo pedido declarou no `anthropic-beta`."""
        return [b.strip() for b in self._beta_do_pedido.split(",") if b.strip()]

    def linhas(self) -> Iterator[str]:
        """As linhas do corpo DECODIFICADO: a copia e do transporte, antes do
        `content-encoding`, e so uma resposta nova a decodifica."""
        if self._cabecalhos is None:
            return iter(())
        return httpx2.Response(
            200, headers=self._cabecalhos, content=bytes(self._bruto)
        ).iter_lines()


def provedor_espionado(
    *,
    chave: str,
    base_url: str,
    modelo: str,
    max_tokens: int,
    timeout_segundos: float,
    fallback: bool,
    esforco: Esforco,
    esforco_da_avaliacao: Esforco,
) -> tuple[ProvedorAnthropic, Espiao]:
    """O `ProvedorAnthropic` de producao, com o `Espiao` no transporte e sem
    tentativas do SDK (`max_retries=0`), para a conta das chamadas pagas ser
    exata. E a UNICA diferenca em relacao a producao."""
    provedor = ProvedorAnthropic(
        chave=chave,
        base_url=base_url,
        modelo=modelo,
        max_tokens=max_tokens,
        timeout_segundos=timeout_segundos,
        fallback=fallback,
        esforco=esforco,
        esforco_da_avaliacao=esforco_da_avaliacao,
    )
    espiao = Espiao(httpx2.HTTPTransport())
    # O construtor de producao nao aceita cliente HTTP (e nao deve: a captura
    # nao mora em `src/`, decisao D8); `with_options` copia o cliente com o
    # mesmo timeout, trocando so o transporte e as tentativas.
    provedor._cliente = provedor._cliente.with_options(
        http_client=httpx2.Client(transport=espiao, timeout=timeout_segundos),
        max_retries=0,
    )
    return provedor, espiao
