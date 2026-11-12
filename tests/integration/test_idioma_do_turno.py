"""O idioma gravado em `users.locale` escolhe a persona e a rubrica que vao ao
modelo, contra PostgreSQL real e o falso da Anthropic.

A tutoria le o idioma em `preparar_turno`, depois da trava do usuario; a
avaliacao, no bloco transacional que abre a tentativa. Nao ha teste de
"leitura antes do commit" na avaliacao: `montar_turno_da_avaliacao` recebe o
idioma pronto e nao recebe sessao, e por isso nao tem como reler o banco.
"""

import dataclasses
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, select, update
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.database import get_engine
from focusquest.core.idioma import Idioma
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.main import app
from focusquest.modules.evaluation.rubric import rubrica_do_idioma
from focusquest.modules.evaluation.service import avaliar_missao
from focusquest.modules.missions.models import (
    Mission,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
)
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.domain import StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.persona import persona_do_idioma
from focusquest.modules.tutoring.service import (
    JaRespondida,
    ParaGerar,
    RespostaConcluida,
    Trecho,
    Tutoria,
    preparar_turno,
    transmitir,
)
from focusquest.modules.users.models import User
from integration.conftest import Conversa
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

# Um dia so destes testes: o teto diario conta por dia de Sao Paulo.
AGORA = datetime(2026, 11, 3, 15, tzinfo=UTC)
# A espera do stream segurado e a do teste, e nao o timeout curto do
# `tutoria`, que estouraria enquanto o falso espera o `liberar`.
SEGUNDOS_PACIENTES = 30


def _cabecalho_1(idioma: Idioma) -> str:
    """A linha inteira do `## 1.` do arquivo: os dois idiomas tem `## 1.`, e
    so a linha completa os distingue."""
    return next(
        linha
        for linha in persona_do_idioma(idioma).splitlines()
        if linha.startswith("## 1. ")
    )


def _sistema(corpo: dict[str, Any]) -> str:
    """O `system` do pedido como texto: a conversa manda blocos (o prefixo
    cacheado e o contexto), a avaliacao manda uma string."""
    sistema: str | list[dict[str, Any]] = corpo["system"]
    if isinstance(sistema, str):
        return sistema
    return "\n\n".join(bloco["text"] for bloco in sistema)


@pytest.fixture
def sem_idioma(banco_migrado: Engine) -> Iterator[None]:
    """Comeca e termina com `locale IS NULL`: o idioma e do usuario unico,
    compartilhado com os outros testes que commitam."""

    def limpar() -> None:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(
                update(User).where(User.id == USUARIO_UNICO).values(locale=None)
            )
            sessao.commit()

    limpar()
    try:
        yield
    finally:
        limpar()


@pytest.fixture
def api(banco_migrado: Engine) -> Iterator[TestClient]:
    """A API de verdade, commitando no banco de teste (o PATCH precisa ser
    visto pela transacao do proximo turno)."""
    app.dependency_overrides[get_engine] = lambda: banco_migrado
    try:
        with TestClient(app) as cliente:
            yield cliente
    finally:
        app.dependency_overrides.pop(get_engine, None)


def _gravar_idioma(api: TestClient, idioma: Idioma) -> None:
    resposta = api.patch("/api/me", json={"locale": idioma.value})
    assert resposta.status_code == 200


def _preparar(
    fabrica: sessionmaker[Session], tutoria: Tutoria, cid: str
) -> JaRespondida | ParaGerar:
    """Prepara e COMMITA, como a rota faz antes de abrir o stream."""
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=USUARIO_UNICO,
            client_message_id=cid,
            conteudo="Me ajuda a estudar?",
            tutoria=tutoria,
            clock=lambda: AGORA,
        )
        sessao.commit()
    return preparo


def _perguntar(
    fabrica: sessionmaker[Session], tutoria: Tutoria, cid: str
) -> list[object]:
    preparo = _preparar(fabrica, tutoria, cid)
    return list(transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA))


def test_turno_usa_a_persona_do_idioma_gravado(
    api: TestClient,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    sem_idioma: None,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Sure.",)),))
    _gravar_idioma(api, Idioma.EN)

    _perguntar(fabrica, tutoria, conversa.id("idioma-en"))

    sistema = _sistema(falso.recebidas[-1].corpo)
    assert persona_do_idioma(Idioma.EN) in sistema
    assert _cabecalho_1(Idioma.PT_BR) not in sistema


def test_turno_sem_idioma_escolhido_usa_pt(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    sem_idioma: None,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Claro.",)),))

    _perguntar(fabrica, tutoria, conversa.id("idioma-nulo"))

    recebida = falso.recebidas[-1]
    assert persona_do_idioma(Idioma.PT_BR) in _sistema(recebida.corpo)
    # O prefixo cacheado continua sendo SO a persona (Tarefa 1.2).
    assert recebida.prefixo_cacheado == [persona_do_idioma(Idioma.PT_BR)]


def _respostas(fabrica: sessionmaker[Session], cid: str) -> list[StatusDaMensagem]:
    with fabrica() as sessao:
        pergunta = sessao.scalar(
            select(TutorMessage).where(TutorMessage.client_message_id == cid)
        )
        assert pergunta is not None
        return list(
            sessao.scalars(
                select(TutorMessage.status).where(
                    TutorMessage.reply_to_id == pergunta.id
                )
            )
        )


def test_troca_durante_o_stream_vale_so_no_proximo_turno(
    api: TestClient,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    sem_idioma: None,
) -> None:
    paciente = dataclasses.replace(
        tutoria,
        provedor=ProvedorAnthropic(
            chave="sk-ant-teste",
            base_url=falso.url,
            modelo="claude-opus-5",
            max_tokens=256,
            timeout_segundos=SEGUNDOS_PACIENTES,
            fallback=True,
            esforco="low",
            esforco_da_avaliacao="medium",
        ),
    )
    falso.roteiro = Roteiro(
        blocos=(Texto(("Vamos ", "lá.")),),
        segurar_apos_eventos=APOS_O_PRIMEIRO_PEDACO,
    )
    primeira, segunda = conversa.id("troca-1"), conversa.id("troca-2")
    eventos = transmitir(
        fabrica, _preparar(fabrica, paciente, primeira), paciente, clock=lambda: AGORA
    )
    # Com o primeiro pedaco recebido, o stream esta comprovadamente no meio.
    assert next(e for e in eventos if isinstance(e, Trecho)) == Trecho("Vamos ")
    _gravar_idioma(api, Idioma.EN)
    falso.liberar.set()
    assert isinstance(list(eventos)[-1], RespostaConcluida)

    falso.roteiro = Roteiro(blocos=(Texto(("Sure.",)),))
    _perguntar(fabrica, paciente, segunda)

    na_troca, depois = (_sistema(r.corpo) for r in falso.recebidas[-2:])
    assert persona_do_idioma(Idioma.PT_BR) in na_troca
    assert persona_do_idioma(Idioma.EN) not in na_troca
    assert persona_do_idioma(Idioma.EN) in depois
    assert _cabecalho_1(Idioma.PT_BR) not in depois
    assert _respostas(fabrica, primeira) == [StatusDaMensagem.COMPLETA]
    assert _respostas(fabrica, segunda) == [StatusDaMensagem.COMPLETA]


@pytest.fixture
def missao_com_evidencia(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        missao = criar_missao(
            sessao,
            user_id=USUARIO_UNICO,
            instructions="Read chapter 3",
            completion_criterion="A one-page summary",
            difficulty=2,
            estimated_minutes=30,
            deadline=AGORA + timedelta(days=1),
        )
        concluir_missao(
            sessao,
            USUARIO_UNICO,
            missao.id,
            f"op-idioma-da-avaliacao-{missao.id}",
            clock=lambda: AGORA,
            evidencia=NovaEvidencia("I wrote the summary", None),
        )
        sessao.commit()
        mission_id = missao.id
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def test_avaliacao_usa_a_rubrica_do_idioma_gravado(
    api: TestClient,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    missao_com_evidencia: int,
    sem_idioma: None,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            ChamadaDeFerramenta(
                {"verdict": "atende", "feedback": "Done."}, nome="record_evaluation"
            ),
        )
    )
    _gravar_idioma(api, Idioma.EN)

    avaliar_missao(
        fabrica,
        tutoria,
        user_id=USUARIO_UNICO,
        mission_id=missao_com_evidencia,
        clock=lambda: AGORA,
    )

    sistema = _sistema(falso.recebidas[-1].corpo)
    assert rubrica_do_idioma(Idioma.EN) in sistema
    assert rubrica_do_idioma(Idioma.PT_BR) not in sistema
