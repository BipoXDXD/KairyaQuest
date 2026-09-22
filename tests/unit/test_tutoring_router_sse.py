"""Prova por mutacao do `finally: eventos.close()` de `_em_sse`.

O par de guardas do stream SSE (fix round 1/5 e 2/5 da Task 7) e:

1. O invoucro `fechando_ao_cancelar`, provado em
   `tests/unit/test_tutoring_sse.py::test_cancelar_o_consumo_fecha_o_gerador`
   -- a mutacao 2 do brief (apagar o `close()` de dentro dele) o faz
   reprovar.
2. O `finally: eventos.close()` de `_em_sse`, provado AQUI.

As duas guardas se cobrem quando testadas juntas contra um cliente real
desconectando (`tests/integration/test_tutoring_desconexao.py`): medido,
nesta maquina, o teste de integracao continua passando mesmo com as duas
removidas ao mesmo tempo, so que TARDE (3 a 11s, contra ~1ms com as duas
presentes) -- a causa e a falha da escrita no socket ja fechado, que aciona
sozinha a finalizacao automatica de generator do CPython. Um teste por
TEMPO ("fecha em menos de X segundos") foi descartado de proposito: seria
intermitente sob carga, e o projeto exige alternativa deterministica quando
ela existe. Este arquivo e essa alternativa para a guarda 2: chama `_em_sse`
DIRETO, sem HTTP, sem thread e sem SO no meio.

Guarda uma referencia externa ao gerador de eventos (`eventos`) de
proposito -- o mesmo cuidado do teste do invoucro em `test_tutoring_sse.py`:
sem ela, o coletor do CPython fecharia `eventos` sozinho ao perder a ultima
referencia quando `_em_sse` termina, e a asserção passaria mesmo com o
`finally` removido.
"""

from collections.abc import Generator
from datetime import UTC, datetime

from focusquest.modules.tutoring.domain import Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.router import _em_sse
from focusquest.modules.tutoring.service import EventoDoTurno, PerguntaGravada, Trecho

AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)


def _mensagem() -> TutorMessage:
    """Uma `TutorMessage` transiente (nunca vai ao banco): so precisa validar
    contra `MessageRead`, que e o que `_em_sse` faz com um `PerguntaGravada`."""
    return TutorMessage(
        id=1,
        user_id=1,
        role=Papel.USUARIO,
        content="oi",
        status=StatusDaMensagem.COMPLETA,
        client_message_id="cid",
        reply_to_id=None,
        error_code=None,
        created_at=AGORA,
        actions=[],
    )


def _eventos_falsos(registro: list[str]) -> Generator[EventoDoTurno]:
    try:
        yield PerguntaGravada(_mensagem())
        yield Trecho("oi")
        yield Trecho("nunca chega aqui")
        registro.append("terminou")
    except GeneratorExit:
        registro.append("fechado")
        raise


def test_fechar_o_em_sse_fecha_o_gerador_de_eventos() -> None:
    registro: list[str] = []
    eventos = _eventos_falsos(registro)

    gerador = _em_sse(eventos)
    next(gerador)  # consome o PerguntaGravada -> "event: user_message..."
    next(gerador)  # consome o primeiro Trecho -> "event: delta..."
    gerador.close()

    assert registro == ["fechado"]
