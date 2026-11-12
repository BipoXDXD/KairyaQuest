"""O reset do E2E e o pedido do cenario anterior que ainda esta em voo na API
(pendencia P-e2e-flaky-1, a cascata do cenario (c) da tutoria).

O defeito: um cenario que estoura o proprio tempo deixa um pedido a meio
caminho (navegador -> API -> falso). O cenario seguinte reinicia o falso, e o
pedido atrasado chega ao falso DEPOIS do reset: encontra o roteiro VAZIO,
a avaliacao grava `falhou` no banco compartilhado, e o quadro de missoes do
cenario seguinte mostra um botao "Tentar de novo" que nao e dele.

Aqui a corrida e feita deterministica, sem `sleep`: o pedido ja esta DENTRO da
API e so segue para o falso quando o falso recebe o sinal do reset (o `Event`
`liberar`, o mesmo que o tratador do falso captura). Antes do reset ele
estava preso; depois do sinal ele chega -- exatamente a ordem do defeito.
"""

import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Final

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from integration import reset_do_e2e
from integration.falso_do_e2e import TratadorComControle
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
)
from integration.relogio_do_e2e import RelogioDoE2E, montar_app_do_e2e

FERRAMENTA_DA_AVALIACAO: Final = "record_evaluation"
# O roteiro do cenario A: o veredito que a API espera de uma avaliacao.
ROTEIRO_DO_CENARIO_A: Final = Roteiro(
    blocos=(
        ChamadaDeFerramenta(
            {"verdict": "atende", "feedback": "ok"}, nome=FERRAMENTA_DA_AVALIACAO
        ),
    )
)


@dataclass
class Cenario:
    """A API do E2E sobre um app de producao falso, e os sinais do teste."""

    api: TestClient
    falso: ServidorAnthropicFalso
    # O que a rota `/api/avaliar` gravou: `concluida` ou `falhou`.
    banco: list[str] = field(default_factory=list)
    # O pedido ja esta dentro da API.
    dentro: threading.Event = field(default_factory=threading.Event)
    # O pedido de `/api/preso` so termina quando o teste da este sinal.
    soltar_preso: threading.Event = field(default_factory=threading.Event)


@pytest.fixture
def falso() -> Iterator[ServidorAnthropicFalso]:
    with ServidorAnthropicFalso(tratador=TratadorComControle) as servidor:
        yield servidor


def _producao_falsa(
    falso: ServidorAnthropicFalso,
    banco: list[str],
    dentro: threading.Event,
    soltar_preso: threading.Event,
) -> FastAPI:
    """Um app de producao FALSO, com duas rotas.

    `/api/avaliar` faz o que a avaliacao faz: um pedido ao falso, e o resultado
    gravado conforme a resposta. O pedido ja esta na API (`dentro`) e espera o
    sinal do reset antes de chegar ao falso. `/api/preso` so termina quando o
    teste da o sinal.
    """
    producao = FastAPI()

    @producao.post("/api/avaliar")
    def avaliar() -> dict[str, str]:
        liberar = falso.liberar
        dentro.set()
        assert liberar.wait(timeout=10), "o reset nunca sinalizou o falso"
        resposta = httpx.post(f"{falso.url}/v1/messages", json={"messages": []})
        resultado = (
            "concluida" if FERRAMENTA_DA_AVALIACAO in resposta.text else "falhou"
        )
        banco.append(resultado)
        return {"avaliacao": resultado}

    @producao.post("/api/preso")
    def preso() -> dict[str, str]:
        dentro.set()
        assert soltar_preso.wait(timeout=10), "o teste nunca soltou o pedido"
        return {"estado": "solto"}

    return producao


@pytest.fixture
def cenario(falso: ServidorAnthropicFalso) -> Iterator[Cenario]:
    banco: list[str] = []
    dentro = threading.Event()
    soltar_preso = threading.Event()
    app = montar_app_do_e2e(
        _producao_falsa(falso, banco, dentro, soltar_preso),
        RelogioDoE2E(),
        falso_url=falso.url,
    )
    with TestClient(app) as client:
        yield Cenario(client, falso, banco, dentro, soltar_preso)
    soltar_preso.set()


def test_reset_do_e2e_espera_o_pedido_em_voo_do_cenario_anterior(
    cenario: Cenario,
) -> None:
    cenario.falso.roteiro = ROTEIRO_DO_CENARIO_A

    with ThreadPoolExecutor(max_workers=1) as pool:
        atrasado = pool.submit(cenario.api.post, "/api/avaliar")
        assert cenario.dentro.wait(timeout=10)

        # O reset que o cenario seguinte faz (`reiniciar()` de `falso.ts`).
        resposta = cenario.api.post(reset_do_e2e.ROTA_DO_RESET)
        atrasado.result(timeout=10)

    assert resposta.status_code == 204
    # O pedido era do cenario A e foi respondido pelo roteiro do A.
    assert cenario.banco == ["concluida"]
    # E o cenario B comeca limpo: nenhum pedido do A aparece para ele.
    assert cenario.falso.recebidas == []
    assert cenario.falso.roteiro == Roteiro()


def test_reiniciar_so_o_falso_deixa_o_pedido_atrasado_chegar_depois_do_reset(
    cenario: Cenario,
) -> None:
    """O mecanismo do defeito, mantido como prova de que o reset do harness e
    necessario: o reset do falso sozinho (o que o E2E fazia) deixa o pedido
    do cenario A encontrar o roteiro vazio do cenario B."""
    cenario.falso.roteiro = ROTEIRO_DO_CENARIO_A

    with ThreadPoolExecutor(max_workers=1) as pool:
        atrasado = pool.submit(cenario.api.post, "/api/avaliar")
        assert cenario.dentro.wait(timeout=10)

        assert httpx.post(f"{cenario.falso.url}/_control/reset").status_code == 204
        atrasado.result(timeout=10)

    assert cenario.banco == ["falhou"]


def test_reset_recusa_com_409_se_a_api_nao_fica_ociosa_e_nao_mexe_no_falso(
    cenario: Cenario, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Uma API presa nao e reiniciada em silencio: o reset reprova com o
    numero de pedidos que restaram, e o roteiro do falso continua o que era."""
    monkeypatch.setattr(reset_do_e2e, "LIMITE_DA_OCIOSIDADE_SEGUNDOS", 0.05)
    cenario.falso.roteiro = ROTEIRO_DO_CENARIO_A

    with ThreadPoolExecutor(max_workers=1) as pool:
        preso = pool.submit(cenario.api.post, "/api/preso")
        assert cenario.dentro.wait(timeout=10)

        resposta = cenario.api.post(reset_do_e2e.ROTA_DO_RESET)

        cenario.soltar_preso.set()
        preso.result(timeout=10)

    assert resposta.status_code == 409
    assert resposta.json() == {"em_voo": 1}
    assert cenario.falso.roteiro == ROTEIRO_DO_CENARIO_A


def test_reset_sem_nada_em_voo_so_reinicia_o_falso(cenario: Cenario) -> None:
    cenario.falso.roteiro = ROTEIRO_DO_CENARIO_A
    assert httpx.post(f"{cenario.falso.url}/v1/messages", json={}).status_code == 200
    assert len(cenario.falso.recebidas) == 1

    resposta = cenario.api.post(reset_do_e2e.ROTA_DO_RESET)

    assert resposta.status_code == 204
    assert cenario.falso.recebidas == []
    assert cenario.falso.roteiro == Roteiro()


def test_o_reset_conta_so_pedidos_http_e_o_proprio_nao_conta(
    cenario: Cenario,
) -> None:
    """Se o reset se contasse, esperaria por si mesmo e nunca terminaria."""
    resposta = cenario.api.post(reset_do_e2e.ROTA_DO_RESET)

    assert resposta.status_code == 204


def test_o_app_sem_falso_nao_publica_o_reset() -> None:
    """O reset so existe quando a entrada do E2E diz qual e o falso."""
    app = montar_app_do_e2e(FastAPI(), RelogioDoE2E())

    with TestClient(app) as client:
        assert client.post(reset_do_e2e.ROTA_DO_RESET).status_code == 404
