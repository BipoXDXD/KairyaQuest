"""Dois pedidos de avaliacao da mesma missao ao mesmo tempo (conexoes reais).

Segue o padrao de `test_progression_concorrencia.py`: commits de verdade e
`threading.Barrier` para as threads partirem juntas. O falso SEGURA a resposta
de quem ganhou a trava ate o outro pedido terminar -- e o que prova que o
segundo foi recusado com a primeira tentativa comprovadamente em curso, e nao
depois de ela acabar.

A barreira da largada sozinha NAO basta (medido: 0 de 5 com a trava da missao
removida). A primeira transacao dura milissegundos, e a thread que larga um
pouco antes commita a tentativa antes de a outra ler qualquer coisa -- a
disputa nunca acontece. Por isso ha um segundo ponto de encontro, logo depois
da LEITURA DA AVALIACAO na primeira transacao (`_encontro_na_leitura`): com a
trava, so uma thread chega ali (a outra espera no `FOR UPDATE` da missao), e o
encontro expira depois de `ESPERA_DO_ENCONTRO`; sem a trava, as duas chegam,
leem "nenhuma avaliacao" juntas, e a segunda esbarra na UNIQUE de
`mission_evaluations` -- um `IntegrityError`, que este teste reprova.
"""

import dataclasses
import threading
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Engine, delete, event, func, select, text
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.errors import AvaliacaoEmAndamentoError
from focusquest.modules.evaluation.service import avaliar_missao
from focusquest.modules.missions.domain import EstadoDaAvaliacao
from focusquest.modules.missions.models import Mission, MissionEvaluation
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
)
from focusquest.modules.progression.models import FONTE_BONUS, XpEntry
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.service import Tutoria
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
)

ESTUDANTE = 1
AGORA = datetime(2026, 9, 25, 15, tzinfo=UTC)
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"
# Quanto a thread que leu a avaliacao espera a outra chegar ao mesmo ponto.
# Com a trava (o caso certo), a outra nunca chega: e o custo do teste verde.
ESPERA_DO_ENCONTRO = 1.0


@contextmanager
def _encontro_na_leitura(engine: Engine, partes: int) -> Iterator[None]:
    """Segura cada thread logo depois da PRIMEIRA leitura de
    `mission_evaluations` que ela faz, ate as `partes` chegarem ou o encontro
    expirar. A primeira leitura de cada thread e a da primeira transacao, com
    a missao ja travada (se houver trava)."""
    encontro = threading.Barrier(partes, timeout=ESPERA_DO_ENCONTRO)
    local = threading.local()

    def depois(
        conexao: Any,
        cursor: Any,
        sql: str,
        parametros: Any,
        contexto: Any,
        varios: bool,
    ) -> None:
        if "FROM mission_evaluations" in sql and not getattr(local, "passou", False):
            local.passou = True
            # A outra thread nao chegar e o caso certo: ela esta parada no
            # `FOR UPDATE` da missao.
            with suppress(threading.BrokenBarrierError):
                encontro.wait()

    event.listen(engine, "after_cursor_execute", depois)
    try:
        yield
    finally:
        event.remove(engine, "after_cursor_execute", depois)


@pytest.fixture
def missao_com_evidencia(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina",
            difficulty=2,
            estimated_minutes=30,
            deadline=AGORA + timedelta(days=1),
        )
        concluir_missao(
            sessao,
            ESTUDANTE,
            missao.id,
            f"op-concorrencia-avaliacao-{missao.id}",
            clock=lambda: AGORA,
            evidencia=NovaEvidencia("Fiz o resumo", None),
        )
        sessao.commit()
        mission_id = missao.id
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def test_dois_pedidos_juntos_um_avalia_e_o_outro_recebe_409(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    missao_com_evidencia: int,
) -> None:
    falso.roteiro = Roteiro(
        segurar_apos_eventos=APOS_O_PRIMEIRO_PEDACO,
        blocos=(
            ChamadaDeFerramenta(
                {"verdict": "atende", "feedback": "ok"}, nome="record_evaluation"
            ),
        ),
    )
    # O timeout de leitura do `tutoria` (0,3 s) estouraria enquanto o falso
    # segura a resposta; aqui a espera e a do teste, e nao a do provedor.
    paciente = dataclasses.replace(
        tutoria,
        provedor=ProvedorAnthropic(
            chave="sk-ant-teste",
            base_url=falso.url,
            modelo="claude-opus-5",
            max_tokens=256,
            timeout_segundos=SEGUNDOS_LIMITE,
        ),
    )
    barreira = threading.Barrier(2, timeout=SEGUNDOS_LIMITE)
    alguem_terminou = threading.Event()
    resultados: list[str | None] = [None, None]

    def pedir(indice: int) -> None:
        barreira.wait()
        try:
            avaliar_missao(
                fabrica,
                paciente,
                user_id=ESTUDANTE,
                mission_id=missao_com_evidencia,
                clock=lambda: AGORA,
            )
            resultados[indice] = "avaliou"
        except AvaliacaoEmAndamentoError:
            resultados[indice] = "em_andamento"
        except Exception as erro:  # o defeito aparece aqui, com o nome
            resultados[indice] = type(erro).__name__
        finally:
            alguem_terminou.set()

    threads = [threading.Thread(target=pedir, args=(i,)) for i in range(2)]
    with _encontro_na_leitura(banco_migrado, 2):
        for thread in threads:
            thread.start()
        # So solta a resposta depois que UM dos dois terminou: quem terminou
        # primeiro foi recusado com a outra tentativa ainda em curso.
        assert alguem_terminou.wait(timeout=SEGUNDOS_LIMITE)
        falso.liberar.set()
        for thread in threads:
            thread.join(timeout=SEGUNDOS_LIMITE)
            assert not thread.is_alive(), "thread travada: houve espera circular"

    assert sorted(r or "" for r in resultados) == ["avaliou", "em_andamento"]
    assert len(falso.recebidas) == 1
    with fabrica() as sessao:
        bonus = sessao.scalar(
            select(func.count())
            .select_from(XpEntry)
            .where(
                XpEntry.mission_id == missao_com_evidencia,
                XpEntry.source == FONTE_BONUS,
            )
        )
        avaliacao = sessao.scalars(
            select(MissionEvaluation).where(
                MissionEvaluation.mission_id == missao_com_evidencia
            )
        ).one()
    assert bonus == 1
    assert (avaliacao.state, avaliacao.attempt) == (EstadoDaAvaliacao.CONCLUIDA, 1)
