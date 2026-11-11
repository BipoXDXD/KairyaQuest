"""O espiao de transporte: copia o corpo CRU que o SDK le, sem mudar a leitura.

E a peca que deixa a camada 3 da avaliacao e da conversa com duas ferramentas
chamar o adaptador de PRODUCAO (`ProvedorAnthropic`) e, ainda assim, ver os
eventos que a API mandou -- inclusive o `ping`, que o SDK descarta.
"""

import gzip

import httpx2
import pytest

from focusquest.modules.tutoring.provider import ProvedorIndisponivelError, Turno
from integration.conftest import TIMEOUT_FOLGADO
from integration.espiao import Espiao, provedor_espionado
from integration.provedor_falso import Roteiro, ServidorAnthropicFalso


def _responder_com(corpo: bytes, cabecalhos: dict[str, str]) -> httpx2.MockTransport:
    def tratar(pedido: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, headers=cabecalhos, content=corpo)

    return httpx2.MockTransport(tratar)


def test_o_espiao_entrega_o_corpo_inalterado_e_guarda_as_linhas() -> None:
    corpo = b"event: ping\ndata: {}\n\nevent: message_stop\ndata: {}\n\n"
    espiao = Espiao(_responder_com(corpo, {"content-type": "text/event-stream"}))
    with httpx2.Client(transport=espiao) as cliente:
        lido = cliente.get("https://exemplo.invalido/v1/messages").content
    assert lido == corpo
    assert list(espiao.linhas()) == [
        "event: ping",
        "data: {}",
        "",
        "event: message_stop",
        "data: {}",
        "",
    ]


def test_o_espiao_decodifica_o_corpo_comprimido() -> None:
    """A copia e do corpo CRU do transporte: com `content-encoding: gzip`, sem
    decodificar, as linhas seriam bytes comprimidos e a sequencia sairia vazia
    -- e a camada 3 falharia por um motivo que nao e a API."""
    corpo = b"event: message_stop\ndata: {}\n\n"
    espiao = Espiao(
        _responder_com(
            gzip.compress(corpo),
            {"content-type": "text/event-stream", "content-encoding": "gzip"},
        )
    )
    with httpx2.Client(transport=espiao) as cliente:
        assert cliente.get("https://exemplo.invalido/").content == corpo
    assert list(espiao.linhas()) == ["event: message_stop", "data: {}", ""]


def test_sem_resposta_o_espiao_nao_tem_linhas() -> None:
    espiao = Espiao(_responder_com(b"", {}))
    assert list(espiao.linhas()) == []


def test_o_provedor_espionado_nao_tenta_de_novo(
    falso: ServidorAnthropicFalso,
) -> None:
    """A conta das chamadas pagas da camada 3 so e exata sem as tentativas do
    SDK: em producao (`TENTATIVAS = 2`) um 500 viraria tres chamadas."""
    falso.roteiro = Roteiro(status_http=500)
    provedor, _ = provedor_espionado(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=16,
        timeout_segundos=TIMEOUT_FOLGADO,
        fallback=True,
        esforco="low",
        esforco_da_avaliacao="medium",
    )
    with pytest.raises(ProvedorIndisponivelError):
        list(provedor.responder(Turno(sistema="s", mensagens=())))
    assert len(falso.recebidas) == 1


def test_o_espiao_guarda_do_pedido_so_o_corpo_e_o_beta() -> None:
    """A camada 3 do fallback (pendencia 174) prova que o pedido REAL levou
    `fallbacks` e o cabecalho beta. O espiao guarda so esses dois: nunca os
    cabecalhos inteiros, que tem a chave (`x-api-key`)."""
    espiao = Espiao(_responder_com(b"", {}))
    with httpx2.Client(transport=espiao) as cliente:
        cliente.post(
            "https://exemplo.invalido/v1/messages?beta=true",
            json={"fallbacks": "default"},
            headers={
                "x-api-key": "sk-ant-segredo",
                "anthropic-beta": "server-side-fallback-2026-07-01",
            },
        )
    assert espiao.corpo_do_pedido() == {"fallbacks": "default"}
    assert espiao.betas_do_pedido() == ["server-side-fallback-2026-07-01"]
    assert "sk-ant-segredo" not in repr(vars(espiao))


def test_sem_pedido_o_espiao_nao_tem_corpo_nem_beta() -> None:
    espiao = Espiao(_responder_com(b"", {}))
    assert espiao.corpo_do_pedido() is None
    assert espiao.betas_do_pedido() == []
