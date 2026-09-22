"""O servidor falso do E2E: o controle HTTP e o processo.

O E2E (Playwright) nao importa Python: ele fala com o falso por HTTP, e este
arquivo prova o contrato desse controle do lado de ca. Os testes rodam o
falso NA MESMA thread do pytest (porta 0) para o controle, e como PROCESSO
(`python -m integration.falso_do_e2e`) para a linha de comando que o
`playwright.config.ts` usa.
"""

import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import anthropic
import httpx
import pytest

from integration.falso_do_e2e import TratadorComControle, roteiro_do_json
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture
def controlado() -> Iterator[ServidorAnthropicFalso]:
    with ServidorAnthropicFalso(tratador=TratadorComControle) as falso:
        yield falso


def _sdk(falso: ServidorAnthropicFalso) -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key="e2e-chave-ficticia", base_url=falso.url, max_retries=0
    )


def test_roteiro_do_json_monta_texto_ferramenta_e_opcoes() -> None:
    roteiro = roteiro_do_json(
        {
            "blocks": [{"text": ["a", "b"]}, {"tool_input": {"difficulty": 2}}],
            "cut_after_events": 3,
            "hold_after_events": 2,
            "http_status": 200,
        }
    )
    assert roteiro == Roteiro(
        blocos=(Texto(("a", "b")), ChamadaDeFerramenta({"difficulty": 2})),
        cortar_apos_eventos=3,
        segurar_apos_eventos=2,
        status_http=200,
    )


@pytest.mark.parametrize(
    ("dados", "motivo"),
    [
        ([], "o roteiro precisa ser um objeto"),
        ({"blocks": "x"}, "blocks precisa ser uma lista"),
        ({"blocks": [{"imagem": 1}]}, "bloco desconhecido"),
        ({"blocks": [{"text": "nao e lista"}]}, "text precisa ser uma lista de textos"),
        ({"blocks": [{"text": [1]}]}, "text precisa ser uma lista de textos"),
        ({"blocks": [{"tool_input": []}]}, "tool_input precisa ser um objeto"),
        (
            {"blocks": [], "cut_after_events": "3"},
            "cut_after_events precisa ser inteiro",
        ),
        ({"blocks": [], "fantasia": 1}, "chave desconhecida: fantasia"),
    ],
)
def test_roteiro_invalido_e_recusado_com_o_motivo(dados: object, motivo: str) -> None:
    """Um roteiro mal escrito no cenario precisa reprovar ALTO, no PUT, e nao
    virar uma resposta vazia que o cenario leria como "a Tifa nao disse nada"."""
    with pytest.raises(ValueError, match=motivo):
        roteiro_do_json(dados)


def test_o_roteiro_definido_pelo_controle_chega_ao_sdk(
    controlado: ServidorAnthropicFalso,
) -> None:
    resposta = httpx.put(
        f"{controlado.url}/_control/script",
        json={
            "blocks": [
                {"text": ["Bora, ", "vamos!"]},
                {"tool_input": {"difficulty": 2}},
            ]
        },
    )
    assert resposta.status_code == 204

    with _sdk(controlado).messages.stream(
        model="claude-opus-5",
        max_tokens=10,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        final = stream.get_final_message()

    texto, ferramenta = final.content
    assert texto.type == "text" and texto.text == "Bora, vamos!"
    assert ferramenta.type == "tool_use" and ferramenta.input == {"difficulty": 2}


def test_roteiro_invalido_responde_400_com_o_motivo(
    controlado: ServidorAnthropicFalso,
) -> None:
    resposta = httpx.put(
        f"{controlado.url}/_control/script", json={"blocks": [{"x": 1}]}
    )
    assert resposta.status_code == 400
    assert "bloco desconhecido" in resposta.json()["error"]


def test_as_requisicoes_recebidas_sao_lidas_pelo_controle_com_a_chave(
    controlado: ServidorAnthropicFalso,
) -> None:
    """E o que deixa o cenario provar que a API do E2E falou com o FALSO, e
    com a chave FICTICIA -- nao com a Anthropic, nem com a chave do .env."""
    with _sdk(controlado).messages.stream(
        model="claude-opus-5",
        max_tokens=7,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        stream.get_final_message()

    corpo = httpx.get(f"{controlado.url}/_control/requests").json()
    assert len(corpo["requests"]) == 1
    assert corpo["requests"][0]["api_key"] == "e2e-chave-ficticia"
    assert corpo["requests"][0]["body"]["max_tokens"] == 7


def test_reset_apaga_as_requisicoes_e_o_roteiro(
    controlado: ServidorAnthropicFalso,
) -> None:
    httpx.put(f"{controlado.url}/_control/script", json={"blocks": [{"text": ["x"]}]})
    with _sdk(controlado).messages.stream(
        model="claude-opus-5",
        max_tokens=7,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        stream.get_final_message()

    assert httpx.post(f"{controlado.url}/_control/reset").status_code == 204
    assert httpx.get(f"{controlado.url}/_control/requests").json() == {"requests": []}
    assert controlado.roteiro == Roteiro()
    assert not controlado.liberar.is_set()


def test_reset_solta_uma_resposta_presa(controlado: ServidorAnthropicFalso) -> None:
    """Um cenario que reprovou com a resposta presa nao pode prender o proximo:
    o `beforeEach` do E2E chama o reset, e ele tem de soltar o tratador."""
    httpx.put(
        f"{controlado.url}/_control/script",
        json={"blocks": [{"text": ["um", "dois"]}], "hold_after_events": 3},
    )
    terminou = threading.Event()

    def consumir() -> None:
        with _sdk(controlado).messages.stream(
            model="claude-opus-5",
            max_tokens=7,
            messages=[{"role": "user", "content": "oi"}],
        ) as stream:
            stream.get_final_message()
        terminou.set()

    threading.Thread(target=consumir, daemon=True).start()
    # Espera a resposta chegar ao ponto de espera (a requisicao foi registrada).
    prazo = time.monotonic() + 5
    while not controlado.recebidas:
        assert time.monotonic() < prazo
        time.sleep(0.05)

    httpx.post(f"{controlado.url}/_control/reset")

    # Solto na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert terminou.wait(timeout=5)
    assert not controlado.liberar.is_set()


def test_segurar_e_liberar_pelo_controle(controlado: ServidorAnthropicFalso) -> None:
    """A resposta fica presa depois de N eventos ate o `release`. E o que deixa o
    axe auditar o estado "escrevendo" com o texto comprovadamente no meio."""
    httpx.put(
        f"{controlado.url}/_control/script",
        json={"blocks": [{"text": ["um", "dois"]}], "hold_after_events": 3},
    )
    with _sdk(controlado).messages.stream(
        model="claude-opus-5",
        max_tokens=7,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        pedacos = stream.text_stream
        assert next(pedacos) == "um"
        antes = time.monotonic()
        httpx.post(f"{controlado.url}/_control/release")
        assert next(pedacos) == "dois"
    # O release destravou na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert time.monotonic() - antes < 5


def test_rota_desconhecida_responde_404(controlado: ServidorAnthropicFalso) -> None:
    """Um SDK apontado para o caminho errado precisa reprovar alto."""
    assert httpx.post(f"{controlado.url}/v1/complete", json={}).status_code == 404
    assert httpx.get(f"{controlado.url}/qualquer").status_code == 404


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_o_processo_sobe_na_porta_pedida_e_responde_o_controle() -> None:
    """A MESMA linha de comando do `playwright.config.ts`, numa porta livre."""
    porta = _porta_livre()
    processo = subprocess.Popen(
        [sys.executable, "-m", "integration.falso_do_e2e", "--porta", str(porta)],
        cwd=RAIZ,
        env={"PYTHONPATH": str(RAIZ / "tests"), "PATH": ""},
    )
    try:
        prazo = time.monotonic() + 15
        while True:
            try:
                resposta = httpx.get(f"http://127.0.0.1:{porta}/_control/requests")
                break
            except httpx.TransportError:
                assert time.monotonic() < prazo, "o falso nao subiu em 15 s"
                time.sleep(0.1)
        assert resposta.json() == {"requests": []}
    finally:
        processo.terminate()
        processo.wait(timeout=10)


def test_o_processo_exige_a_porta() -> None:
    resultado = subprocess.run(
        [sys.executable, "-m", "integration.falso_do_e2e"],
        cwd=RAIZ,
        env={"PYTHONPATH": str(RAIZ / "tests"), "PATH": ""},
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode != 0
    assert "--porta" in resultado.stderr
