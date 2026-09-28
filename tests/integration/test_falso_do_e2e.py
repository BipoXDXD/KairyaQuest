"""O servidor falso do E2E: o controle HTTP e o processo.

O E2E (Playwright) nao importa Python: ele fala com o falso por HTTP, e este
arquivo prova o contrato desse controle do lado de ca. Os testes rodam o
falso NA MESMA thread do pytest (porta 0) para o controle, e como PROCESSO
(`python -m integration.falso_do_e2e`) para a linha de comando que o
`playwright.config.ts` usa.
"""

import http.client
import json
import queue
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from integration import provedor_falso
from integration.falso_do_e2e import TratadorComControle, roteiro_do_json
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
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


def test_tool_name_escolhe_a_ferramenta_e_o_padrao_e_create_mission() -> None:
    roteiro = roteiro_do_json(
        {
            "blocks": [
                {"tool_input": {"verdict": "atende"}, "tool_name": "record_evaluation"},
                {"tool_input": {"difficulty": 2}},
            ]
        }
    )
    assert roteiro.blocos == (
        ChamadaDeFerramenta({"verdict": "atende"}, nome="record_evaluation"),
        ChamadaDeFerramenta({"difficulty": 2}, nome="create_mission"),
    )


@pytest.mark.parametrize(
    ("dados", "roteiro"),
    [
        (
            {"http_status": 100, "cut_after_events": 0, "hold_after_events": 1000},
            Roteiro(status_http=100, cortar_apos_eventos=0, segurar_apos_eventos=1000),
        ),
        (
            {"http_status": 599, "cut_after_events": 1000, "hold_after_events": 0},
            Roteiro(status_http=599, cortar_apos_eventos=1000, segurar_apos_eventos=0),
        ),
    ],
)
def test_as_bordas_da_faixa_sao_aceitas(dados: object, roteiro: Roteiro) -> None:
    assert roteiro_do_json(dados) == roteiro


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
            {"blocks": [{"tool_input": {}, "tool_name": 3}]},
            "tool_name precisa ser um texto nao vazio",
        ),
        (
            {"blocks": [{"tool_input": {}, "tool_name": ""}]},
            "tool_name precisa ser um texto nao vazio",
        ),
        (
            {"blocks": [], "cut_after_events": "3"},
            "cut_after_events precisa ser inteiro",
        ),
        (
            {"blocks": [], "hold_after_events": True},
            "hold_after_events precisa ser inteiro",
        ),
        ({"blocks": [], "fantasia": 1}, "chave desconhecida: fantasia"),
        # Um numero fora da faixa viraria um roteiro que nunca corta, nunca
        # segura, ou um status que o `http.server` nem sabe mandar -- e o
        # cenario passaria pelo motivo errado.
        (
            {"blocks": [], "cut_after_events": -1},
            "cut_after_events precisa ser inteiro entre 0 e",
        ),
        (
            {"blocks": [], "hold_after_events": -1},
            "hold_after_events precisa ser inteiro entre 0 e",
        ),
        (
            {"blocks": [], "hold_after_events": 1001},
            "hold_after_events precisa ser inteiro entre 0 e 1000",
        ),
        (
            {"blocks": [], "http_status": 99},
            "http_status precisa ser inteiro entre 100 e 599",
        ),
        (
            {"blocks": [], "http_status": 600},
            "http_status precisa ser inteiro entre 100 e 599",
        ),
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

    # O falso padrao emite o bloco de thinking da API real na frente (1b-2).
    pensamento, texto, ferramenta = final.content
    assert pensamento.type == "thinking"
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


def test_put_sem_content_length_responde_400_com_o_motivo(
    controlado: ServidorAnthropicFalso,
) -> None:
    """Sem `content-length` o tamanho do corpo e desconhecido: o controle
    responde 400 com o motivo, e nao derruba o tratador com um `TypeError`
    (que o cliente veria como conexao fechada, sem explicacao)."""
    conexao = http.client.HTTPConnection(
        "127.0.0.1", int(controlado.url.rsplit(":", 1)[1])
    )
    try:
        # `putrequest` + `endheaders`, e nao `request`: o `request` acrescenta
        # `Content-Length: 0` sozinho num PUT sem corpo.
        conexao.putrequest("PUT", "/_control/script")
        conexao.endheaders()
        resposta = conexao.getresponse()
        assert resposta.status == 400
        assert "content-length" in json.loads(resposta.read())["error"]
    finally:
        conexao.close()
    assert controlado.roteiro == Roteiro()


def test_put_em_rota_errada_responde_404_e_nao_troca_o_roteiro(
    controlado: ServidorAnthropicFalso,
) -> None:
    resposta = httpx.put(
        f"{controlado.url}/_control/scripts", json={"blocks": [{"text": ["x"]}]}
    )
    assert resposta.status_code == 404
    assert controlado.roteiro == Roteiro()


def test_as_requisicoes_recebidas_sao_lidas_pelo_controle_com_a_chave(
    controlado: ServidorAnthropicFalso,
) -> None:
    """E o que deixa o cenario provar que a API do E2E falou com o FALSO, e
    com a chave FICTICIA -- nao com a Anthropic, nem com uma chave de verdade
    que estivesse no ambiente por engano."""
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
        # Presa depois do primeiro pedaco ("um"), antes de "dois".
        json={
            "blocks": [{"text": ["um", "dois"]}],
            "hold_after_events": APOS_O_PRIMEIRO_PEDACO,
        },
    )
    primeiro = threading.Event()
    terminou = threading.Event()

    def consumir() -> None:
        with _sdk(controlado).messages.stream(
            model="claude-opus-5",
            max_tokens=7,
            messages=[{"role": "user", "content": "oi"}],
        ) as stream:
            pedacos = stream.text_stream
            assert next(pedacos) == "um"
            primeiro.set()
            for _ in pedacos:
                pass
        terminou.set()

    threading.Thread(target=consumir, daemon=True).start()
    # O primeiro pedaco no cliente: o tratador ja o escreveu e segue para o
    # ponto de espera (antes do evento `APOS_O_PRIMEIRO_PEDACO`). `recebidas`
    # nao serviria:
    # a requisicao e registrada ANTES de o tratador chegar la.
    assert primeiro.wait(timeout=5)

    httpx.post(f"{controlado.url}/_control/reset")

    # Solto na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert terminou.wait(timeout=5)
    assert not controlado.liberar.is_set()


def test_reset_entre_o_registro_e_a_espera_solta_o_tratador(
    controlado: ServidorAnthropicFalso, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A corrida do reset, reproduzida sem depender de sorte.

    O tratador captura o roteiro no inicio da requisicao. Se ele lesse o
    `liberar` so na hora de esperar, um reset que chegasse ENTRE as duas
    leituras o deixaria esperando no `Event` NOVO -- que ninguem aciona --
    com o roteiro VELHO, que manda segurar: preso ate o teto de 30 s.

    Para segurar o tratador exatamente nessa janela, o roteiro pede
    `atrasar_cabecalhos` (a pausa fica depois do registro e antes de qualquer
    evento) e o `time` do falso e trocado por um que, em vez de dormir,
    avisa o teste e espera ele fazer o reset.
    """
    na_janela = threading.Event()
    seguir = threading.Event()

    def segurar(_segundos: float) -> None:
        na_janela.set()
        assert seguir.wait(timeout=5)

    monkeypatch.setattr(provedor_falso, "time", SimpleNamespace(sleep=segurar))
    controlado.roteiro = Roteiro(
        blocos=(Texto(("um", "dois")),),
        # O mesmo ponto dos outros testes de espera: depois de "um". Com o
        # thinking na frente, o 3 de antes seguraria ainda dentro dele.
        segurar_apos_eventos=APOS_O_PRIMEIRO_PEDACO,
        atrasar_cabecalhos=1.0,
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
    assert na_janela.wait(timeout=5)
    httpx.post(f"{controlado.url}/_control/reset")
    seguir.set()

    assert terminou.wait(timeout=5)


def test_segurar_e_liberar_pelo_controle(controlado: ServidorAnthropicFalso) -> None:
    """A resposta fica presa depois de N eventos ate o `release`. E o que deixa o
    axe auditar o estado "escrevendo" com o texto comprovadamente no meio."""
    httpx.put(
        f"{controlado.url}/_control/script",
        # Presa depois do primeiro pedaco ("um"), antes de "dois".
        json={
            "blocks": [{"text": ["um", "dois"]}],
            "hold_after_events": APOS_O_PRIMEIRO_PEDACO,
        },
    )
    with _sdk(controlado).messages.stream(
        model="claude-opus-5",
        max_tokens=7,
        messages=[{"role": "user", "content": "oi"}],
    ) as stream:
        pedacos = stream.text_stream
        assert next(pedacos) == "um"
        # O proximo pedaco e lido noutra thread, para o teste poder provar
        # que ele NAO chega antes do release: sem essa prova, um falso que
        # ignorasse o `hold_after_events` passaria aqui do mesmo jeito.
        proximo: queue.Queue[str] = queue.Queue()
        threading.Thread(target=lambda: proximo.put(next(pedacos)), daemon=True).start()
        with pytest.raises(queue.Empty):
            proximo.get(timeout=0.5)
        antes = time.monotonic()
        httpx.post(f"{controlado.url}/_control/release")
        assert proximo.get(timeout=5) == "dois"
    # O release destravou na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert time.monotonic() - antes < 5


def test_rota_desconhecida_responde_404(controlado: ServidorAnthropicFalso) -> None:
    """Um SDK apontado para o caminho errado precisa reprovar alto."""
    assert httpx.post(f"{controlado.url}/v1/complete", json={}).status_code == 404
    assert httpx.get(f"{controlado.url}/qualquer").status_code == 404


@pytest.mark.parametrize("metodo", ["DELETE", "PATCH"])
def test_metodo_sem_tratador_responde_501(
    controlado: ServidorAnthropicFalso, metodo: str
) -> None:
    """O falso so trata GET, PUT e POST. Outro metodo recebe o 501 padrao do
    `http.server` ("metodo nao implementado") -- tambem um erro alto, que e o
    que importa para um cliente mal apontado; o HANDOFF registra assim."""
    resposta = httpx.request(metodo, f"{controlado.url}/_control/script")
    assert resposta.status_code == 501


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


def test_o_e2e_segura_e_corta_no_mesmo_ponto_que_o_pytest() -> None:
    """O cenario TypeScript nao importa `APOS_O_PRIMEIRO_PEDACO` e escreve o
    numero literal. Se o falso mudar a quantidade de eventos antes do texto
    (como o thinking do 1b-2 mudou), o E2E seguraria ou cortaria no lugar
    errado sem reprovar pelo motivo certo; esta guarda acusa a divergencia."""
    fonte = (RAIZ / "frontend" / "tests" / "e2e" / "tutoring.spec.ts").read_text()
    assert f"hold_after_events: {APOS_O_PRIMEIRO_PEDACO}," in fonte
    assert f"cut_after_events: {APOS_O_PRIMEIRO_PEDACO}," in fonte
