"""Contrato HTTP real do adaptador, com transporte em memoria e chave ficticia.

Regressoes: trocar destino/modelo, perder deltas ou aceitar uma ferramenta
incompleta poderia enviar dados ao lugar errado ou executar uma proposta indevida.
"""

import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest

from focusquest.modules.tutoring.provider import (
    Delta,
    Ferramenta,
    Fim,
    MensagemDoTurno,
    Parada,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)

TURNO = Turno("Voce e Kairya", (MensagemDoTurno("user", "oi"),))
FERRAMENTA = Ferramenta("record_evaluation", "Avalia", {"type": "object"})


def fragmento(
    delta: dict[str, Any] | None = None, motivo: str | None = None
) -> dict[str, Any]:
    return {
        "model": "openai/gpt-oss-20b",
        "choices": [{"index": 0, "delta": delta or {}, "finish_reason": motivo}],
    }


def chamada(nome: str | None, argumentos: str) -> dict[str, Any]:
    return {
        "tool_calls": [
            {"index": 0, "function": {"name": nome, "arguments": argumentos}}
        ]
    }


def sse(*fragmentos: dict[str, Any] | str) -> bytes:
    return (
        "\n\n".join(
            "data: " + (f if isinstance(f, str) else json.dumps(f)) for f in fragmentos
        )
        + "\n\n"
    ).encode()


def provedor(
    tratar: Callable[[httpx2.Request], httpx2.Response],
) -> Any:
    from focusquest.modules.tutoring.groq_provider import ProvedorGroq

    return ProvedorGroq(
        chave="groq-chave-ficticia",
        max_tokens=1024,
        timeout_segundos=2,
        transporte=httpx2.MockTransport(tratar),
    )


def com_resposta(conteudo: bytes, status: int = 200) -> Any:
    return provedor(lambda r: httpx2.Response(status, content=conteudo))


def test_texto_em_stream_e_contrato_sem_fallback_pago() -> None:
    recebidas: list[httpx2.Request] = []

    def tratar(r: httpx2.Request) -> httpx2.Response:
        recebidas.append(r)
        return httpx2.Response(
            200,
            content=b": heartbeat\n\nevent: message\n\n"
            + sse(
                fragmento({"role": "assistant"}),
                fragmento({"content": "Ola, "}),
                fragmento({"content": "sou Kairya!"}),
                fragmento(motivo="stop"),
                {
                    "model": "openai/gpt-oss-20b",
                    "choices": [],
                    "x_groq": {"error": None},
                },
                "[DONE]",
            ),
        )

    assert list(provedor(tratar).responder(TURNO)) == [
        Delta("Ola, "),
        Delta("sou Kairya!"),
        Fim(),
    ]
    assert len(recebidas) == 1
    r = recebidas[0]
    assert str(r.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert r.headers["authorization"] == "Bearer groq-chave-ficticia"
    corpo = json.loads(r.content)
    assert corpo["model"] == "openai/gpt-oss-20b"
    assert corpo["messages"] == [
        {"role": "system", "content": "Voce e Kairya"},
        {"role": "user", "content": "oi"},
    ]
    assert corpo["max_completion_tokens"] == 1024
    assert corpo["stream"] is True
    assert corpo["parallel_tool_calls"] is False
    assert corpo["tool_choice"] == "auto"
    assert [t["function"]["name"] for t in corpo["tools"]] == [
        "create_mission",
        "reschedule_mission",
    ]
    assert not {"fallbacks", "service_tier", "built_in_tools"} & corpo.keys()


def test_ferramenta_so_sai_com_json_inteiro_e_fim_comprovado() -> None:
    p = com_resposta(
        sse(
            fragmento(chamada("create_mission", '{"difficulty":')),
            fragmento(chamada(None, "2}")),
            fragmento(motivo="tool_calls"),
            "[DONE]",
        )
    )
    assert list(p.responder(TURNO)) == [
        Proposta("create_mission", {"difficulty": 2}),
        Fim(),
    ]


@pytest.mark.parametrize(
    ("motivo", "parada"),
    [("length", Parada.CORTADA), ("content_filter", Parada.RECUSADA)],
)
def test_descarta_ferramenta_quando_cortada_ou_recusada(
    motivo: str, parada: Parada
) -> None:
    p = com_resposta(
        sse(
            fragmento(chamada("create_mission", "{")),
            fragmento(motivo=motivo),
            "[DONE]",
        )
    )
    assert list(p.responder(TURNO)) == [Fim(parada)]


@pytest.mark.parametrize(
    "dados",
    [
        sse(fragmento({"content": "parcial"})),
        sse(fragmento(motivo="stop")),
        sse("[DONE]"),
        sse("{nao-json", "[DONE]"),
        sse({"model": "outro-modelo", "choices": []}),
        sse({"model": "openai/gpt-oss-20b", "choices": [{}, {}]}),
        sse(fragmento(motivo="desconhecido")),
        sse(fragmento(motivo="stop"), fragmento({"content": "tardio"}), "[DONE]"),
        sse(fragmento(motivo="tool_calls"), "[DONE]"),
        sse(fragmento(chamada(None, "{}")), fragmento(motivo="tool_calls"), "[DONE]"),
        sse(
            fragmento(chamada("create_mission", "{")),
            fragmento(motivo="tool_calls"),
            "[DONE]",
        ),
        sse(
            fragmento(chamada("create_mission", "[]")),
            fragmento(motivo="tool_calls"),
            "[DONE]",
        ),
        sse(fragmento({"tool_calls": [{"index": 1, "function": {"name": "x"}}]})),
        sse(
            fragmento(
                {
                    "tool_calls": [
                        {"index": 0, "function": {}},
                        {"index": 1, "function": {}},
                    ]
                }
            )
        ),
    ],
)
def test_resposta_incompleta_ou_invalida_falha_sem_proposta(dados: bytes) -> None:
    eventos: list[Any] = []
    with pytest.raises(ProvedorIndisponivelError):
        for evento in com_resposta(dados).responder(TURNO):
            eventos.append(evento)
    assert not any(isinstance(e, (Proposta, Fim)) for e in eventos)


@pytest.mark.parametrize("status", [301, 307, 400, 401, 429, 500, 503])
def test_erro_http_nao_redireciona_repete_ou_troca_provedor(
    status: int, caplog: pytest.LogCaptureFixture
) -> None:
    recebidas: list[httpx2.Request] = []

    def tratar(r: httpx2.Request) -> httpx2.Response:
        recebidas.append(r)
        return httpx2.Response(
            status,
            headers={"location": "https://api.anthropic.com/v1/messages"},
            text="corpo-confidencial groq-chave-ficticia",
        )

    with pytest.raises(ProvedorIndisponivelError) as erro:
        list(provedor(tratar).responder(TURNO))
    assert len(recebidas) == 1
    assert "confidencial" not in str(erro.value) + caplog.text
    assert "groq-chave-ficticia" not in str(erro.value) + caplog.text


@pytest.mark.parametrize(
    ("tipo", "esperado"),
    [
        (httpx2.ReadTimeout, TempoEsgotadoError),
        (httpx2.ConnectError, ProvedorIndisponivelError),
    ],
)
def test_traduz_erros_de_transporte_sem_reenvio(
    tipo: type[Exception], esperado: type[Exception]
) -> None:
    tentativas = 0

    def tratar(r: httpx2.Request) -> httpx2.Response:
        nonlocal tentativas
        tentativas += 1
        raise tipo("segredo")

    with pytest.raises(esperado) as erro:
        list(provedor(tratar).responder(TURNO))
    assert tentativas == 1
    assert "segredo" not in str(erro.value)


def test_avaliacao_forca_somente_ferramenta_da_rubrica() -> None:
    recebidas: list[dict[str, Any]] = []

    def tratar(r: httpx2.Request) -> httpx2.Response:
        recebidas.append(json.loads(r.content))
        return httpx2.Response(
            200,
            content=sse(
                fragmento(
                    chamada(
                        "record_evaluation",
                        '{"verdict":"atende","feedback":"Bom trabalho"}',
                    )
                ),
                fragmento(motivo="tool_calls"),
                "[DONE]",
            ),
        )

    assert provedor(tratar).avaliar(TURNO, FERRAMENTA) == {
        "verdict": "atende",
        "feedback": "Bom trabalho",
    }
    assert recebidas[0]["max_completion_tokens"] == 2048
    assert recebidas[0]["tool_choice"] == {
        "type": "function",
        "function": {"name": "record_evaluation"},
    }
    assert recebidas[0]["tools"] == [
        {
            "type": "function",
            "function": {
                "name": "record_evaluation",
                "description": "Avalia",
                "parameters": {"type": "object"},
            },
        }
    ]


@pytest.mark.parametrize(
    ("nome", "motivo"),
    [
        ("outra", "tool_calls"),
        ("record_evaluation", "length"),
        ("record_evaluation", "content_filter"),
        (None, "stop"),
    ],
)
def test_avaliacao_inadequada_nao_e_entregue_ao_dominio(
    nome: str | None, motivo: str
) -> None:
    p = com_resposta(
        sse(
            fragmento({"content": "texto"} if nome is None else chamada(nome, "{}")),
            fragmento(motivo=motivo),
            "[DONE]",
        )
    )
    assert p.avaliar(TURNO, FERRAMENTA) is None


def test_cancelar_fecha_o_corpo_do_stream() -> None:
    class Corpo(httpx2.SyncByteStream):
        fechado = False

        def __iter__(self) -> Any:
            yield sse(fragmento({"content": "oi"}))
            raise AssertionError("nao deveria ler depois do cancelamento")

        def close(self) -> None:
            self.fechado = True

    corpo = Corpo()
    eventos = provedor(lambda r: httpx2.Response(200, stream=corpo)).responder(TURNO)
    assert next(eventos) == Delta("oi")
    eventos.close()
    assert corpo.fechado


def test_campos_nulos_do_contrato_groq_e_sse_sem_espaco() -> None:
    """O contrato Groq declara tool_calls/function/arguments como opcionais."""
    dados = sse(
        fragmento({"role": "assistant", "content": None, "tool_calls": None}),
        fragmento({"tool_calls": [{"index": 0, "id": "c1", "function": None}]}),
        fragmento(chamada("create_mission", "")),
        fragmento({"tool_calls": [{"index": 0, "function": {"arguments": None}}]}),
        fragmento(chamada(None, "{}")),
        fragmento(motivo="tool_calls"),
        "[DONE]",
    ).replace(b"data: ", b"data:")
    assert list(com_resposta(dados).responder(TURNO)) == [
        Proposta("create_mission", {}),
        Fim(),
    ]


@pytest.mark.parametrize("ferramenta", [False, True])
def test_recusa_explicita_descarta_proposta_mesmo_com_parada_normal(
    ferramenta: bool,
) -> None:
    dados = sse(
        fragmento({"content": "parcial", "refusal": "recusado"}),
        fragmento(chamada("record_evaluation", "{}") if ferramenta else {}),
        fragmento(motivo="tool_calls" if ferramenta else "stop"),
        "[DONE]",
    )
    assert list(com_resposta(dados).responder(TURNO)) == [
        Delta("parcial"),
        Fim(Parada.RECUSADA),
    ]
    assert com_resposta(dados).avaliar(TURNO, FERRAMENTA) is None


def test_erro_no_metadado_final_nao_conclui_resposta_ou_avaliacao() -> None:
    metadado = fragmento(motivo="tool_calls") | {
        "x_groq": {"error": "detalhe-confidencial"}
    }
    dados = sse(fragmento(chamada("record_evaluation", "{}")), metadado, "[DONE]")
    with pytest.raises(ProvedorIndisponivelError) as erro:
        com_resposta(dados).avaliar(TURNO, FERRAMENTA)
    assert "confidencial" not in str(erro.value)
