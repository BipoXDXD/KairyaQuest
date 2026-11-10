"""Contrato HTTP real do adaptador, com transporte em memoria e chave ficticia.

Regressoes: trocar destino/modelo, perder deltas ou aceitar uma ferramenta
incompleta poderia enviar dados ao lugar errado ou executar uma proposta indevida.
"""

import json
import logging
import uuid
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


LOGGER = "focusquest.modules.tutoring.groq_provider"
FALHA_GENERICA = "o provedor nao concluiu uma resposta valida"
TEMPO_ESGOTADO = "o provedor demorou alem do limite"

LIMITES_DO_GROQ = {
    "retry-after": "7",
    "x-ratelimit-limit-requests": "1000",
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "2m59.56s",
    "x-ratelimit-limit-tokens": "8000",
    "x-ratelimit-remaining-tokens": "0",
    "x-ratelimit-reset-tokens": "7.66s",
}


def registros_do_groq(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == LOGGER]


def falhar_com(
    status: int, cabecalhos: dict[str, str] | list[tuple[str, str]]
) -> tuple[ProvedorIndisponivelError, int]:
    recebidas: list[httpx2.Request] = []

    def tratar(r: httpx2.Request) -> httpx2.Response:
        recebidas.append(r)
        return httpx2.Response(status, headers=cabecalhos, text="corpo")

    with pytest.raises(ProvedorIndisponivelError) as erro:
        list(provedor(tratar).responder(TURNO))
    return erro.value, len(recebidas)


def test_429_registra_status_e_todos_os_limites_na_ordem(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)
    erro, pedidos = falhar_com(
        429,
        LIMITES_DO_GROQ
        | {"location": "https://outro.invalido", "x-groq-region": "us-east-1"},
    )

    (registro,) = registros_do_groq(caplog)
    assert registro.levelno == logging.WARNING
    assert registro.getMessage() == (
        "Falha HTTP do provedor Groq: status=429 retry-after=7"
        " x-ratelimit-limit-requests=1000 x-ratelimit-remaining-requests=0"
        " x-ratelimit-reset-requests=2m59.56s x-ratelimit-limit-tokens=8000"
        " x-ratelimit-remaining-tokens=0 x-ratelimit-reset-tokens=7.66s"
    )
    assert registro.exc_info is None
    assert registro.stack_info is None
    assert type(erro) is ProvedorIndisponivelError
    assert str(erro) == FALHA_GENERICA
    assert pedidos == 1


@pytest.mark.parametrize("status", [301, 307, 400, 401, 403, 404, 413, 500, 503])
def test_falha_http_sem_limites_registra_so_o_status(
    status: int, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)
    erro, pedidos = falhar_com(status, {"location": "https://outro.invalido"})

    (registro,) = registros_do_groq(caplog)
    assert registro.getMessage() == f"Falha HTTP do provedor Groq: status={status}"
    assert "outro.invalido" not in caplog.text
    assert str(erro) == FALHA_GENERICA
    assert pedidos == 1


@pytest.mark.parametrize(
    ("bruto", "saneado"),
    [
        ("1 status=200", "1?status?200"),
        ("1\tx", "1?x"),
        ("1\x1b[2J", "1??2J"),
        ("1\r\nCRITICAL forjado", "1??CRITICAL?forjado"),
    ],
)
def test_valor_de_cabecalho_hostil_sai_saneado_numa_linha(
    bruto: str, saneado: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)
    falhar_com(429, [("retry-after", bruto)])

    (registro,) = registros_do_groq(caplog)
    mensagem = registro.getMessage()
    assert mensagem == f"Falha HTTP do provedor Groq: status=429 retry-after={saneado}"
    assert "\n" not in mensagem
    assert "\r" not in mensagem


def test_valor_longo_e_cortado_em_64(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)
    falhar_com(429, {"x-ratelimit-reset-tokens": "9" * 200})

    (registro,) = registros_do_groq(caplog)
    assert registro.getMessage() == (
        "Falha HTTP do provedor Groq: status=429 x-ratelimit-reset-tokens=" + "9" * 64
    )


@pytest.mark.parametrize(
    ("tipo", "esperado", "mensagem", "publica"),
    [
        (
            httpx2.ReadTimeout,
            TempoEsgotadoError,
            "Tempo esgotado no provedor Groq: tipo=ReadTimeout",
            TEMPO_ESGOTADO,
        ),
        (
            httpx2.ConnectTimeout,
            TempoEsgotadoError,
            "Tempo esgotado no provedor Groq: tipo=ConnectTimeout",
            TEMPO_ESGOTADO,
        ),
        (
            httpx2.ConnectError,
            ProvedorIndisponivelError,
            "Falha do provedor Groq: tipo=ConnectError",
            FALHA_GENERICA,
        ),
        (
            httpx2.RemoteProtocolError,
            ProvedorIndisponivelError,
            "Falha do provedor Groq: tipo=RemoteProtocolError",
            FALHA_GENERICA,
        ),
    ],
)
def test_erro_de_transporte_registra_so_o_tipo(
    tipo: type[Exception],
    esperado: type[Exception],
    mensagem: str,
    publica: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)

    def tratar(r: httpx2.Request) -> httpx2.Response:
        raise tipo("detalhe-do-transporte")

    with pytest.raises(esperado) as erro:
        list(provedor(tratar).responder(TURNO))

    (registro,) = registros_do_groq(caplog)
    assert registro.levelno == logging.WARNING
    assert registro.getMessage() == mensagem
    assert registro.exc_info is None
    assert "detalhe-do-transporte" not in caplog.text
    assert type(erro.value) is esperado
    assert str(erro.value) == publica


@pytest.mark.parametrize(
    ("dados", "tipo"),
    [
        (sse("[DONE]"), "ValueError"),
        (sse("{nao-json", "[DONE]"), "ValidationError"),
        (sse({"model": "outro-modelo", "choices": []}), "ValidationError"),
    ],
)
def test_stream_invalido_registra_so_o_tipo(
    dados: bytes, tipo: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger=LOGGER)
    with pytest.raises(ProvedorIndisponivelError) as erro:
        list(com_resposta(dados).responder(TURNO))

    (registro,) = registros_do_groq(caplog)
    assert registro.getMessage() == f"Falha do provedor Groq: tipo={tipo}"
    assert "outro-modelo" not in caplog.text
    assert str(erro.value) == FALHA_GENERICA


def test_sucesso_nao_registra_nada(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG, logger="focusquest")
    dados = sse(fragmento({"content": "oi"}), fragmento(motivo="stop"), "[DONE]")
    assert list(com_resposta(dados).responder(TURNO)) == [Delta("oi"), Fim()]
    assert registros_do_groq(caplog) == []


def _canario_por_http(canario: str) -> Callable[[httpx2.Request], httpx2.Response]:
    def tratar(r: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            429,
            headers=LIMITES_DO_GROQ
            | {"x-groq-debug": canario, "set-cookie": f"s={canario}"},
            text=f'{{"error":{{"message":"{canario}"}}}}',
        )

    return tratar


def _canario_por_transporte(
    canario: str,
) -> Callable[[httpx2.Request], httpx2.Response]:
    def tratar(r: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError(canario)

    return tratar


def _canario_por_stream(canario: str) -> Callable[[httpx2.Request], httpx2.Response]:
    def tratar(r: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, content=sse({"model": canario, "choices": []}))

    return tratar


@pytest.mark.parametrize(
    "cenario", [_canario_por_http, _canario_por_transporte, _canario_por_stream]
)
def test_canario_nunca_aparece_no_log(
    cenario: Callable[[str], Callable[[httpx2.Request], httpx2.Response]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Chave, sistema, mensagem do usuario, corpo, cabecalho fora da allowlist e
    mensagem da excecao levam o mesmo canario; com `focusquest` em DEBUG, nenhum
    deles chega ao log."""
    canario = f"CANARY-{uuid.uuid4()}"
    from focusquest.modules.tutoring.groq_provider import ProvedorGroq

    p = ProvedorGroq(
        chave=canario,
        max_tokens=1024,
        timeout_segundos=2,
        transporte=httpx2.MockTransport(cenario(canario)),
    )
    turno = Turno(f"sistema {canario}", (MensagemDoTurno("user", canario),))
    caplog.set_level(logging.DEBUG, logger="focusquest")

    with pytest.raises(ProvedorIndisponivelError) as erro:
        list(p.responder(turno))

    assert len(registros_do_groq(caplog)) == 1
    assert canario not in caplog.text
    assert "Bearer" not in caplog.text
    assert all(r.exc_info is None for r in caplog.records)
    assert canario not in str(erro.value)
