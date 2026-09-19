"""A montagem do turno: o que o modelo recebe, e em que forma."""

from datetime import UTC, datetime, timedelta

from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import MensagemDoTurno

AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)


def _msg(
    papel: Papel, texto: str, acoes: list[TutorAction] | None = None
) -> TutorMessage:
    return TutorMessage(
        role=papel,
        content=texto,
        status=StatusDaMensagem.COMPLETA,
        created_at=AGORA,
        actions=acoes or [],
    )


def test_o_sistema_traz_persona_agora_e_missoes_pendentes() -> None:
    pendente = Mission(
        id=7,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
        state=MissionState.PENDENTE,
    )
    turno = montar_turno(
        persona="PERSONA", agora=AGORA, pendentes=[pendente], historico=[]
    )
    assert turno.sistema.startswith("PERSONA")
    assert "2026-09-19T12:00:00+00:00" in turno.sistema
    assert "#7" in turno.sistema
    assert "Ler o capitulo 3" in turno.sistema


def test_sem_missoes_pendentes_o_sistema_diz_nenhuma() -> None:
    turno = montar_turno(persona="P", agora=AGORA, pendentes=[], historico=[])
    assert "nenhuma" in turno.sistema


def test_papeis_viram_user_e_assistant() -> None:
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        historico=[_msg(Papel.USUARIO, "oi"), _msg(Papel.TUTORA, "ola!")],
    )
    assert turno.mensagens == (
        MensagemDoTurno("user", "oi"),
        MensagemDoTurno("assistant", "ola!"),
    )


def test_mensagens_seguidas_do_mesmo_papel_sao_fundidas() -> None:
    """Uma pergunta cuja resposta falhou deixa duas perguntas seguidas."""
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        historico=[_msg(Papel.USUARIO, "primeira"), _msg(Papel.USUARIO, "segunda")],
    )
    assert turno.mensagens == (MensagemDoTurno("user", "primeira\n\nsegunda"),)


def test_o_historico_nunca_comeca_pela_tutora() -> None:
    """O corte das ultimas N mensagens pode cair numa resposta; a API exige
    que a conversa comece pelo usuario."""
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        historico=[_msg(Papel.TUTORA, "resto"), _msg(Papel.USUARIO, "oi")],
    )
    assert turno.mensagens == (MensagemDoTurno("user", "oi"),)


def test_acoes_antigas_entram_como_texto_com_o_estado_real() -> None:
    """Sem `tool_result`, um `tool_use` antigo deixaria o historico mal
    formado; como texto, o modelo sabe o que foi confirmado ou recusado."""
    acao = TutorAction(
        id=12,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={"instructions": "Revisar funcoes"},
        state=EstadoDaAcao.EXECUTADA,
    )
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        historico=[
            _msg(Papel.USUARIO, "me da uma missao"),
            _msg(Papel.TUTORA, "Toma!", [acao]),
        ],
    )
    assert turno.mensagens[1].texto == (
        "Toma!\n\n[Proposta de missao #12: Revisar funcoes -- executada]"
    )
