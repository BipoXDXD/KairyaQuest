"""Confirmacao de reagendamento da Tifa x conclusao, nas duas ordens (167).

Conexoes reais, missao commitada e pre-carregada na sessao que espera.
O PostgreSQL confirma quem bloqueia quem antes de liberar o vencedor:
o teste nao depende de uma corrida favoravel do escalonador. Remover
populate_existing de buscar_para_escrever deve reprovar ambos os casos.
"""

import threading
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Literal

import pytest
from sqlalchemy import Engine, delete, select, text
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState, OrigemDoReagendamento
from focusquest.modules.missions.models import (
    Mission,
    MissionOperation,
    MissionReschedule,
)
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression.models import XpEntry
from focusquest.modules.tutoring.domain import (
    REAGENDAMENTO_INVALIDO,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import (
    Executada,
    ReagendamentoInvalido,
    ResultadoDaConfirmacao,
    confirmar_acao,
)

ESTUDANTE = 1
AGORA = datetime(2026, 9, 19, 12, tzinfo=UTC)
PRAZO_ATUAL = AGORA + timedelta(days=2)
NOVO_PRAZO = AGORA + timedelta(days=5)
PRIMEIRO_EM = AGORA + timedelta(minutes=1)
SEGUNDO_EM = AGORA + timedelta(minutes=2)
SEGUNDOS_LIMITE = 10
OPERACAO_TIFA = "op-167-tifa"
OPERACAO_CONCLUSAO = "op-167-conclusao"
Operacao = Literal["tifa", "conclusao"]


@pytest.fixture
def proposta_commitada(banco_migrado: Engine) -> Iterator[tuple[int, int]]:
    """Grava o cenario; apaga mensagens antes da missao e dos seus creditos."""
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina",
            difficulty=2,
            estimated_minutes=30,
            deadline=PRAZO_ATUAL,
        )
        pergunta = TutorMessage(
            user_id=ESTUDANTE,
            role=Papel.USUARIO,
            content="Estou sem tempo",
            status=StatusDaMensagem.COMPLETA,
            client_message_id="concorrencia-167",
            created_at=AGORA,
        )
        sessao.add(pergunta)
        sessao.flush()
        resposta = TutorMessage(
            user_id=ESTUDANTE,
            role=Papel.TUTORA,
            content="Vamos reagendar.",
            status=StatusDaMensagem.COMPLETA,
            reply_to_id=pergunta.id,
            created_at=AGORA,
        )
        sessao.add(resposta)
        sessao.flush()
        acao = TutorAction(
            message_id=resposta.id,
            kind=TipoDeAcao.REAGENDAR_MISSAO,
            payload={
                "mission_id": missao.id,
                "new_deadline": NOVO_PRAZO.isoformat(),
                "reason": "falta_de_tempo",
                "instructions": missao.instructions,
                "previous_deadline": PRAZO_ATUAL.isoformat(),
            },
            state=EstadoDaAcao.PROPOSTA,
            created_at=AGORA,
        )
        sessao.add(acao)
        sessao.commit()

    try:
        yield missao.id, acao.id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text("SET LOCAL lock_timeout = '2s'"))
            limpeza.execute(delete(TutorMessage).where(TutorMessage.id == pergunta.id))
            limpeza.execute(delete(Mission).where(Mission.id == missao.id))
            limpeza.commit()


def _operar(
    sessao: Session, operacao: Operacao, missao_id: int, acao_id: int, agora: datetime
) -> Mission | ResultadoDaConfirmacao:
    if operacao == "conclusao":
        return concluir_missao(
            sessao,
            ESTUDANTE,
            missao_id,
            OPERACAO_CONCLUSAO,
            clock=lambda: agora,
        )
    return confirmar_acao(
        sessao, ESTUDANTE, acao_id, OPERACAO_TIFA, clock=lambda: agora
    )


def _esperar_bloqueio(engine: Engine, esperando: int, vencedor: int) -> None:
    """Observa a dependencia exata entre os dois backends, com prazo maximo."""
    limite = time.monotonic() + SEGUNDOS_LIMITE
    with engine.connect() as observador:
        while time.monotonic() < limite:
            bloqueadores = observador.execute(
                text("SELECT pg_blocking_pids(:pid)"), {"pid": esperando}
            ).scalar_one()
            observador.commit()
            if vencedor in bloqueadores:
                return
            time.sleep(0.01)
    pytest.fail(f"backend {esperando} nao esperou pelo vencedor {vencedor}")


@pytest.mark.parametrize("primeira", ["conclusao", "tifa"])
def test_confirmacao_da_tifa_e_conclusao_releem_a_missao_apos_a_espera(
    banco_migrado: Engine, proposta_commitada: tuple[int, int], primeira: Operacao
) -> None:
    """Conclusao primeiro invalida a proposta; Tifa primeiro muda o prazo lido."""
    missao_id, acao_id = proposta_commitada
    segunda: Operacao = "tifa" if primeira == "conclusao" else "conclusao"
    carregou = threading.Event()
    iniciar_pedido = threading.Event()
    pids: list[int] = []

    def esperar() -> Mission | ResultadoDaConfirmacao:
        with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
            sessao.execute(text("SET LOCAL statement_timeout = '15s'"))
            pids.append(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())
            # Reter a referencia e essencial: o identity map usa referencias fracas.
            carregada = sessao.get(Mission, missao_id)
            assert carregada is not None
            assert carregada.state is MissionState.PENDENTE
            assert carregada.deadline == PRAZO_ATUAL
            carregou.set()
            assert iniciar_pedido.wait(SEGUNDOS_LIMITE), "vencedor nao iniciou"
            resultado = _operar(sessao, segunda, missao_id, acao_id, SEGUNDO_EM)
            sessao.commit()
            if isinstance(resultado, Mission):
                assert resultado is carregada
            return resultado

    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        Session(bind=banco_migrado, expire_on_commit=False) as vencedor,
    ):
        vencedor.execute(text("SET LOCAL statement_timeout = '15s'"))
        pid_vencedor = vencedor.execute(text("SELECT pg_backend_pid()")).scalar_one()
        futuro = executor.submit(esperar)
        try:
            assert carregou.wait(SEGUNDOS_LIMITE), "sessao nao pre-carregou a missao"
            resultado_primeiro = _operar(
                vencedor, primeira, missao_id, acao_id, PRIMEIRO_EM
            )
            assert isinstance(resultado_primeiro, Mission | Executada)
            iniciar_pedido.set()
            assert pids[0] != pid_vencedor
            _esperar_bloqueio(banco_migrado, pids[0], pid_vencedor)
            vencedor.commit()
            resultado_segundo = futuro.result(timeout=SEGUNDOS_LIMITE)
        finally:
            # Libera a trava antes de o executor esperar a thread, inclusive em erro.
            vencedor.rollback()
            iniciar_pedido.set()

    conclusao_em = PRIMEIRO_EM if primeira == "conclusao" else SEGUNDO_EM
    with Session(bind=banco_migrado) as leitura:
        final = leitura.get(Mission, missao_id)
        acao = leitura.get(TutorAction, acao_id)
        assert final is not None and acao is not None
        assert final.state is MissionState.CONCLUIDA
        assert final.completed_at == conclusao_em
        assert acao.operation_id == OPERACAO_TIFA
        operacoes = list(
            leitura.execute(
                select(MissionOperation.operation_id, MissionOperation.kind)
                .where(MissionOperation.mission_id == missao_id)
                .order_by(MissionOperation.operation_id)
            )
        )
        creditos = list(
            leitura.execute(
                select(XpEntry.source, XpEntry.amount, XpEntry.credited_at).where(
                    XpEntry.mission_id == missao_id
                )
            )
        )
        assert creditos == [("mission_completed", 40, conclusao_em)]
        historico = list(
            leitura.scalars(
                select(MissionReschedule).where(
                    MissionReschedule.mission_id == missao_id
                )
            )
        )

        if primeira == "conclusao":
            assert isinstance(resultado_segundo, ReagendamentoInvalido)
            assert acao.state is EstadoDaAcao.FALHOU
            assert acao.error_code == REAGENDAMENTO_INVALIDO
            assert acao.mission_id is None
            assert acao.decided_at == SEGUNDO_EM
            assert final.deadline == PRAZO_ATUAL
            assert historico == []
            assert operacoes == [(OPERACAO_CONCLUSAO, "complete")]
        else:
            assert isinstance(resultado_segundo, Mission)
            assert resultado_segundo.deadline == NOVO_PRAZO
            assert acao.state is EstadoDaAcao.EXECUTADA
            assert acao.error_code is None
            assert acao.mission_id == missao_id
            assert acao.decided_at == PRIMEIRO_EM
            assert final.deadline == NOVO_PRAZO
            (elo,) = historico
            assert elo.operation_id == OPERACAO_TIFA
            assert elo.previous_deadline == PRAZO_ATUAL
            assert elo.new_deadline == NOVO_PRAZO
            assert elo.origin is OrigemDoReagendamento.TIFA
            assert elo.rescheduled_at == PRIMEIRO_EM
            assert elo.rescheduled_at < final.completed_at
            assert operacoes == [
                (OPERACAO_CONCLUSAO, "complete"),
                (OPERACAO_TIFA, "reschedule"),
            ]
