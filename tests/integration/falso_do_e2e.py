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
from typing import Any, cast, get_args
from urllib.parse import urlsplit

from integration.provedor_falso import (
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Substituicao,
    Texto,
    TratadorDoFalso,
    falso_do_tratador,
)

_OPCOES = frozenset(
    {
        "blocks",
        "http_status",
        "cut_after_events",
        "hold_after_events",
        "stop_reason",
        "fallback",
    }
)
_OPCOES_DO_FALLBACK = frozenset({"model", "after_blocks", "sticky"})


# Teto das contagens de eventos: nenhuma resposta do falso chega perto, e um
# numero maior so pode ser erro de digitacao no cenario.
_MAX_EVENTOS = 1000


def _inteiro(
    dados: dict[str, object], chave: str, minimo: int, maximo: int
) -> int | None:
    """A opcao inteira `chave`, entre `minimo` e `maximo`, ou `None` se
    ausente. `bool` nao conta como inteiro (em Python, `True` e um `int`).

    A faixa e parte da validacao: um `cut_after_events` negativo nunca casa
    com um indice e vira um roteiro SEM corte, e um `http_status` fora de
    100-599 nem e status HTTP -- nos dois casos o cenario passaria pelo
    motivo errado, em vez de reprovar no PUT.
    """
    if chave not in dados:
        return None
    valor = dados[chave]
    if (
        not isinstance(valor, int)
        or isinstance(valor, bool)
        or not minimo <= valor <= maximo
    ):
        raise ValueError(f"{chave} precisa ser inteiro entre {minimo} e {maximo}")
    return valor


def _motivo(dados: dict[str, object]) -> MotivoDeParada | None:
    """O `stop_reason` escolhido pelo cenario, ou `None` se ausente (o falso
    deriva a parada do roteiro). So os valores de `MotivoDeParada`: um motivo
    inventado seria um `stop_reason` que a API nunca manda."""
    if "stop_reason" not in dados:
        return None
    valor = dados["stop_reason"]
    validos = get_args(MotivoDeParada)
    if valor not in validos:
        raise ValueError(f"stop_reason precisa ser um de: {', '.join(validos)}")
    return cast(MotivoDeParada, valor)


def _substituicao(dados: dict[str, object]) -> Substituicao | None:
    """A troca de modelo depois da recusa (pendencia 174), ou `None` se o
    cenario nao a pediu. Estrita como o roteiro: chave desconhecida reprova."""
    if "fallback" not in dados:
        return None
    troca = dados["fallback"]
    if not isinstance(troca, dict):
        raise ValueError("fallback precisa ser um objeto")
    desconhecidas = set(troca) - _OPCOES_DO_FALLBACK
    if desconhecidas:
        raise ValueError(
            f"chave desconhecida em fallback: {', '.join(sorted(desconhecidas))}"
        )
    padrao = Substituicao()
    modelo = troca.get("model", padrao.modelo)
    if not isinstance(modelo, str) or not modelo:
        raise ValueError("fallback.model precisa ser um texto nao vazio")
    fixa = troca.get("sticky", padrao.fixa)
    if not isinstance(fixa, bool):
        raise ValueError("fallback.sticky precisa ser booleano")
    apos = _inteiro(troca, "after_blocks", 0, _MAX_EVENTOS)
    return Substituicao(
        modelo, apos_blocos=padrao.apos_blocos if apos is None else apos, fixa=fixa
    )


def _bloco(dados: object) -> Texto | ChamadaDeFerramenta:
    if isinstance(dados, dict) and set(dados) == {"text"}:
        pedacos = dados["text"]
        if not isinstance(pedacos, list) or not all(
            isinstance(p, str) for p in pedacos
        ):
            raise ValueError("text precisa ser uma lista de textos")
        return Texto(tuple(pedacos))
    if isinstance(dados, dict) and set(dados) in (
        {"tool_input"},
        {"tool_input", "tool_name"},
    ):
        entrada = dados["tool_input"]
        if not isinstance(entrada, dict):
            raise ValueError("tool_input precisa ser um objeto")
        if "tool_name" not in dados:
            return ChamadaDeFerramenta(entrada)
        nome = dados["tool_name"]
        if not isinstance(nome, str) or not nome:
            raise ValueError("tool_name precisa ser um texto nao vazio")
        return ChamadaDeFerramenta(entrada, nome=nome)
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
    # (medido).
    status = _inteiro(dados, "http_status", 100, 599)
    return Roteiro(
        blocos=tuple(_bloco(b) for b in blocos),
        status_http=200 if status is None else status,
        cortar_apos_eventos=_inteiro(dados, "cut_after_events", 0, _MAX_EVENTOS),
        segurar_apos_eventos=_inteiro(dados, "hold_after_events", 0, _MAX_EVENTOS),
        stop_reason=_motivo(dados),
        substituicao=_substituicao(dados),
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

    def _tamanho(self) -> int:
        """O tamanho do corpo, pelo `content-length`, ou `ValueError`. Sem o
        cabecalho, `int(None)` levantaria `TypeError` FORA da recusa, e o
        cliente veria so a conexao caindo, sem o motivo."""
        cabecalho = self.headers["content-length"]
        if cabecalho is None:
            raise ValueError("content-length obrigatorio")
        return int(cabecalho)

    def do_PUT(self) -> None:
        if self.path != "/_control/script":
            self._responder(404)
            return
        try:
            roteiro = roteiro_do_json(json.loads(self.rfile.read(self._tamanho())))
        except ValueError as erro:
            # `json.JSONDecodeError` e subclasse de `ValueError`.
            # Um corpo que nao foi lido inteiro deixaria lixo na conexao
            # persistente (HTTP/1.1): depois de um 400, ela fecha.
            self.close_connection = True
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
        # O endpoint beta, que a conversa chama (pendencia 174), posta em
        # `/v1/messages?beta=true`: a query nao muda a rota.
        if urlsplit(self.path).path == "/v1/messages":
            super().do_POST()
        elif self.path == "/_control/release":
            falso.liberar.set()
            self._responder(204)
        elif self.path == "/_control/reset":
            # Solta uma resposta presa por `hold_after_events` de um cenario
            # anterior e rearma o `liberar` para o proximo roteiro.
            #
            # O tratador espera no `Event` que CAPTUROU no inicio da
            # requisicao, junto com o roteiro (`TratadorDoFalso.do_POST`) --
            # nao no `falso.liberar` do momento da espera. Por isso este
            # `set` acorda tanto quem ja esta esperando quanto quem ainda nao
            # chegou ao ponto de espera: os dois vao esperar no `Event` velho,
            # que fica acionado para sempre. `clear()` no mesmo objeto, em vez
            # de um `Event` novo, reprenderia quem ainda nao acordou.
            #
            # O roteiro e trocado PRIMEIRO: o tratador captura `liberar` e
            # depois `roteiro`, e assim quem capturar o `Event` novo (que
            # ninguem aciona) captura tambem o roteiro vazio, que nao segura.
            falso.roteiro = Roteiro()
            falso.liberar.set()
            falso.liberar = threading.Event()
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
