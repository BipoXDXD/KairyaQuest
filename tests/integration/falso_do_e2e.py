"""O servidor falso da Anthropic como PROCESSO, para o E2E.

O Playwright sobe este modulo como `webServer` (`frontend/playwright.config.ts`)
numa porta fixa. E o MESMO `ServidorAnthropicFalso` do pytest -- os eventos
continuam construidos com os tipos do SDK fixado (camada 1) --, acrescido de
um controle HTTP sob `/_control/`, porque o cenario e TypeScript e nao
consegue trocar o `roteiro` do objeto Python como a fixture `falso` faz.

Nao existe "modo falso" em `src/`: a API do E2E e a de producao, apontada
para ca por `FOCUSQUEST_ANTHROPIC_BASE_URL`, e a guarda de
`scripts/e2e-env.sh` recusa subi-la fora do loopback.
"""

import argparse
import json
import threading
from typing import Any

from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
    TratadorDoFalso,
    falso_do_tratador,
)

_OPCOES = frozenset({"blocks", "http_status", "cut_after_events", "hold_after_events"})


def _inteiro(dados: dict[str, object], chave: str) -> int | None:
    """A opcao inteira `chave`, ou `None` se ausente. `bool` nao conta como
    inteiro (em Python, `True` e um `int`)."""
    if chave not in dados:
        return None
    valor = dados[chave]
    if not isinstance(valor, int) or isinstance(valor, bool):
        raise ValueError(f"{chave} precisa ser inteiro")
    return valor


def _bloco(dados: object) -> Texto | ChamadaDeFerramenta:
    if isinstance(dados, dict) and set(dados) == {"text"}:
        pedacos = dados["text"]
        if not isinstance(pedacos, list) or not all(
            isinstance(p, str) for p in pedacos
        ):
            raise ValueError("text precisa ser uma lista de textos")
        return Texto(tuple(pedacos))
    if isinstance(dados, dict) and set(dados) == {"tool_input"}:
        entrada = dados["tool_input"]
        if not isinstance(entrada, dict):
            raise ValueError("tool_input precisa ser um objeto")
        return ChamadaDeFerramenta(entrada)
    raise ValueError(f"bloco desconhecido: {dados!r}")


def roteiro_do_json(dados: object) -> Roteiro:
    """O `Roteiro` que o cenario descreveu em JSON, ou `ValueError` com o motivo.

    Estrito: chave desconhecida reprova. Um erro de digitacao no cenario
    (`cut_after_event`) viraria, se ignorado, um roteiro sem o corte -- e o
    cenario do corte PASSARIA pelo motivo errado.
    """
    if not isinstance(dados, dict):
        raise ValueError("o roteiro precisa ser um objeto")
    desconhecidas = set(dados) - _OPCOES
    if desconhecidas:
        raise ValueError(f"chave desconhecida: {', '.join(sorted(desconhecidas))}")
    blocos = dados.get("blocks", [])
    if not isinstance(blocos, list):
        raise ValueError("blocks precisa ser uma lista")
    # Cada opcao POR NOME, e nao `Roteiro(**opcoes)`: com um `dict[str, int]`
    # desempacotado, o mypy strict confere o dict contra TODOS os campos do
    # `Roteiro` e reprova no `atrasar_evento: tuple[int, float] | None`
    # (medido na revisao do plano).
    status = _inteiro(dados, "http_status")
    return Roteiro(
        blocos=tuple(_bloco(b) for b in blocos),
        status_http=200 if status is None else status,
        cortar_apos_eventos=_inteiro(dados, "cut_after_events"),
        segurar_apos_eventos=_inteiro(dados, "hold_after_events"),
    )


class TratadorComControle(TratadorDoFalso):
    """O tratador do falso mais as rotas de `/_control/`."""

    def _falso(self) -> ServidorAnthropicFalso:
        return falso_do_tratador(self)

    def _responder(self, status: int, corpo: dict[str, Any] | None = None) -> None:
        dados = b"" if corpo is None else json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_PUT(self) -> None:
        if self.path != "/_control/script":
            self._responder(404)
            return
        tamanho = int(self.headers["content-length"])
        try:
            roteiro = roteiro_do_json(json.loads(self.rfile.read(tamanho)))
        except (ValueError, json.JSONDecodeError) as erro:
            self._responder(400, {"error": str(erro)})
            return
        self._falso().roteiro = roteiro
        self._responder(204)

    def do_GET(self) -> None:
        if self.path != "/_control/requests":
            self._responder(404)
            return
        recebidas = [
            {"api_key": r.cabecalhos.get("x-api-key", ""), "body": r.corpo}
            for r in self._falso().recebidas
        ]
        self._responder(200, {"requests": recebidas})

    def do_POST(self) -> None:
        falso = self._falso()
        if self.path == "/v1/messages":
            super().do_POST()
        elif self.path == "/_control/release":
            falso.liberar.set()
            self._responder(204)
        elif self.path == "/_control/reset":
            # Solta uma resposta presa por `hold_after_events` de um cenario
            # anterior ANTES de trocar tudo: o tratador preso espera no `Event`
            # que ele leu, e so este `set` o acorda. Depois, um `Event` NOVO
            # para o proximo roteiro -- `clear()` no mesmo objeto poderia
            # reprender o tratador que ainda nao acordou.
            falso.liberar.set()
            falso.liberar = threading.Event()
            falso.roteiro = Roteiro()
            falso.recebidas.clear()
            self._responder(204)
        else:
            self._responder(404)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--porta", type=int, required=True)
    argumentos = parser.parse_args(argv)
    with ServidorAnthropicFalso(porta=argumentos.porta, tratador=TratadorComControle):
        # O Playwright encerra o processo ao fim da suite (SIGTERM).
        threading.Event().wait()


if __name__ == "__main__":
    main()
