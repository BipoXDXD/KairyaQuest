"""O helper que gasta o teto diario da tutoria para o E2E
(`integration.teto_do_e2e`).

O modulo fica fora do denominador de cobertura (`source = ["src/focusquest"]`);
estes testes sao o que o prova. Um dia proprio, longe do `AGORA` dos outros
modulos, para a contagem nao somar mensagens que outro teste deixou.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, make_url, select
from sqlalchemy.orm import Session

from focusquest.core.config import Settings
from focusquest.modules.tutoring.domain import Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.service import turnos_de_hoje
from integration.teto_do_e2e import apagar, main, semear

ESTUDANTE = 1
AGORA = datetime(2026, 5, 18, 15, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))


def _respostas(session: Session) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(TutorMessage)
            .where(TutorMessage.role == Papel.TUTORA)
        )
        or 0
    )


def _par_comum(session: Session, cid: str) -> TutorMessage:
    """Uma pergunta e a resposta dela que NAO sao do helper."""
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role=Papel.USUARIO,
        content="Pergunta de verdade",
        status=StatusDaMensagem.COMPLETA,
        client_message_id=cid,
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    session.add(
        TutorMessage(
            user_id=ESTUDANTE,
            role=Papel.TUTORA,
            content="Resposta de verdade",
            status=StatusDaMensagem.COMPLETA,
            reply_to_id=pergunta.id,
            created_at=AGORA,
        )
    )
    session.flush()
    return pergunta


def test_semear_leva_os_turnos_de_hoje_ao_limite(
    session: Session, settings: Settings
) -> None:
    _par_comum(session, "teste-teto-e2e-antes")
    respostas_antes = _respostas(session)
    limite = settings.tutor_daily_turn_limit

    semeados = semear(session, AGORA, limite=limite, user_id=ESTUDANTE)

    assert turnos_de_hoje(session, AGORA, user_id=ESTUDANTE) == limite
    assert semeados == limite - 1
    assert _respostas(session) == respostas_antes + semeados


def test_semear_grava_pares_completos_com_o_prefixo_so_na_pergunta(
    session: Session,
) -> None:
    semear(session, AGORA, limite=2, user_id=ESTUDANTE)

    perguntas = session.scalars(
        select(TutorMessage).where(TutorMessage.client_message_id.like("e2e-teto-%"))
    ).all()
    assert len(perguntas) == 2
    for pergunta in perguntas:
        resposta = session.scalars(
            select(TutorMessage).where(TutorMessage.reply_to_id == pergunta.id)
        ).one()
        assert [pergunta.role, pergunta.status] == [
            Papel.USUARIO,
            StatusDaMensagem.COMPLETA,
        ]
        assert [resposta.role, resposta.status, resposta.client_message_id] == [
            Papel.TUTORA,
            StatusDaMensagem.COMPLETA,
            None,
        ]
        assert resposta.content != ""
        assert resposta.created_at == AGORA


def test_semear_com_o_teto_ja_atingido_nao_insere_nada(session: Session) -> None:
    semear(session, AGORA, limite=3, user_id=ESTUDANTE)
    respostas_antes = _respostas(session)

    semeados = semear(session, AGORA, limite=3, user_id=ESTUDANTE)

    assert semeados == 0
    assert _respostas(session) == respostas_antes


def test_semear_de_novo_depois_de_subir_o_limite_nao_repete_o_id(
    session: Session,
) -> None:
    semear(session, AGORA, limite=2, user_id=ESTUDANTE)

    semeados = semear(session, AGORA, limite=4, user_id=ESTUDANTE)

    assert semeados == 2
    assert turnos_de_hoje(session, AGORA, user_id=ESTUDANTE) == 4


def test_apagar_remove_os_pares_semeados_e_preserva_as_outras_mensagens(
    session: Session,
) -> None:
    real = _par_comum(session, "teste-teto-e2e-real")
    semear(session, AGORA, limite=3, user_id=ESTUDANTE)

    apagados = apagar(session)
    session.expire_all()

    assert apagados == 2
    assert (
        session.scalar(
            select(func.count())
            .select_from(TutorMessage)
            .where(TutorMessage.client_message_id.like("e2e-teto-%"))
        )
        == 0
    )
    assert turnos_de_hoje(session, AGORA, user_id=ESTUDANTE) == 1
    restantes = session.scalars(
        select(TutorMessage.content).where(
            (TutorMessage.id == real.id) | (TutorMessage.reply_to_id == real.id)
        )
    ).all()
    assert sorted(restantes) == ["Pergunta de verdade", "Resposta de verdade"]


def test_apagar_sem_nada_semeado_e_sucesso(session: Session) -> None:
    assert apagar(session) == 0


def test_o_comando_recusa_um_banco_que_nao_e_o_de_teste(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    # Um alvo que comprovadamente nao e o de teste: o mesmo servidor do banco
    # de teste com outro nome de banco. Derivado da URL de teste, e nao da
    # `database_url`, para nao depender do que o ambiente aponta como dev.
    fora_do_teste = (
        make_url(settings.test_database_url)
        .set(database="focusquest_nao_e_teste")
        .render_as_string(hide_password=False)
    )
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", fora_do_teste)

    with pytest.raises(SystemExit, match="banco de teste"):
        main(["apagar"])


def test_o_comando_exige_uma_acao_conhecida() -> None:
    with pytest.raises(SystemExit):
        main(["zerar"])
