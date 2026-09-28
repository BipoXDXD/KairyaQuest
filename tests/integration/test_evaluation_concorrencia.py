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
import time
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Engine, delete, event, func, select, text
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.errors import AvaliacaoEmAndamentoError
from focusquest.modules.evaluation.service import avaliar_missao
from focusquest.modules.missions.domain import EstadoDaAvaliacao, Veredito
from focusquest.modules.missions.evaluation_records import (
    ResultadoGravado,
    Tentativa,
    abrir_tentativa,
    registrar_resultado,
)
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


class Encontro:
    """Segura cada thread logo depois da PRIMEIRA leitura de
    `mission_evaluations` que ela faz, ate `partes` threads chegarem ou o
    encontro expirar (`ESPERA_DO_ENCONTRO`).

    `chegadas` conta as threads que passaram pelo ponto: o teste afirma que
    foram todas, e por isso nao fica verde por engano se a forma do SQL mudar
    e o listener deixar de casar (m3 da revisao). `primeira` avisa quando a
    primeira thread chegou, para o teste soltar a segunda so depois.
    """

    def __init__(self, partes: int) -> None:
        self._barreira = threading.Barrier(partes, timeout=ESPERA_DO_ENCONTRO)
        self._local = threading.local()
        self._trava = threading.Lock()
        self.chegadas = 0
        self.primeira = threading.Event()

    def depois(
        self,
        conexao: Any,
        cursor: Any,
        sql: str,
        parametros: Any,
        contexto: Any,
        varios: bool,
    ) -> None:
        if "FROM mission_evaluations" not in sql or getattr(
            self._local, "passou", False
        ):
            return
        self._local.passou = True
        with self._trava:
            self.chegadas += 1
        self.primeira.set()
        # A outra thread nao chegar e o caso certo: ela esta parada no
        # `FOR UPDATE` da missao.
        with suppress(threading.BrokenBarrierError):
            self._barreira.wait()


@contextmanager
def _encontro_na_leitura(engine: Engine, partes: int) -> Iterator[Encontro]:
    encontro = Encontro(partes)
    event.listen(engine, "after_cursor_execute", encontro.depois)
    try:
        yield encontro
    finally:
        event.remove(engine, "after_cursor_execute", encontro.depois)


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
    with _encontro_na_leitura(banco_migrado, 2) as encontro:
        for thread in threads:
            thread.start()
        # So solta a resposta depois que UM dos dois terminou: quem terminou
        # primeiro foi recusado com a outra tentativa ainda em curso.
        assert alguem_terminou.wait(timeout=SEGUNDOS_LIMITE)
        falso.liberar.set()
        for thread in threads:
            thread.join(timeout=SEGUNDOS_LIMITE)
            assert not thread.is_alive(), "thread travada: houve espera circular"

    # A disputa aconteceu: as duas threads passaram pelo ponto de encontro.
    assert encontro.chegadas == 2
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


@pytest.fixture
def missao_pendente(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 4",
            completion_criterion="Resumo de uma pagina",
            difficulty=2,
            estimated_minutes=30,
            deadline=AGORA + timedelta(days=1),
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


def _esperar_alguem_na_trava(engine: Engine) -> None:
    """Espera ate uma conexao deste banco estar parada numa trava."""
    limite = time.monotonic() + SEGUNDOS_LIMITE
    with engine.connect() as conexao:
        while time.monotonic() < limite:
            parados = conexao.execute(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND wait_event_type = 'Lock'"
                )
            ).scalar_one()
            if parados:
                return
            time.sleep(0.01)
    pytest.fail("ninguem parou na trava da missao")


def test_o_relogio_e_lido_depois_da_trava_da_missao(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    missao_pendente: int,
) -> None:
    """C13, spec (Servicos, passo 1): o pedido que espera a trava de uma
    conclusao da mesma missao le a hora DEPOIS dela. Lida antes, o
    `requested_at` ficaria anterior a conclusao que o proprio pedido esperou."""
    antes = AGORA
    conclusao = AGORA + timedelta(minutes=1)
    depois = AGORA + timedelta(minutes=2)
    instante = [antes]
    falso.roteiro = Roteiro(
        blocos=(
            ChamadaDeFerramenta(
                {"verdict": "parcial", "feedback": "ok"}, nome="record_evaluation"
            ),
        )
    )
    resultado: list[BaseException | None] = [None]

    def pedir() -> None:
        try:
            avaliar_missao(
                fabrica,
                tutoria,
                user_id=ESTUDANTE,
                mission_id=missao_pendente,
                clock=lambda: instante[0],
            )
        except BaseException as erro:  # vai para a assercao abaixo
            resultado[0] = erro

    with Session(bind=banco_migrado) as concluindo:
        concluir_missao(
            concluindo,
            ESTUDANTE,
            missao_pendente,
            f"op-relogio-{missao_pendente}",
            clock=lambda: conclusao,
            evidencia=NovaEvidencia("Fiz o resumo", None),
        )
        pedido = threading.Thread(target=pedir)
        pedido.start()
        _esperar_alguem_na_trava(banco_migrado)
        instante[0] = depois
        concluindo.commit()
    pedido.join(timeout=SEGUNDOS_LIMITE)
    assert not pedido.is_alive()
    assert resultado[0] is None, resultado[0]

    with fabrica() as sessao:
        avaliacao = sessao.scalars(
            select(MissionEvaluation).where(
                MissionEvaluation.mission_id == missao_pendente
            )
        ).one()
    assert avaliacao.requested_at == depois


def test_a_resposta_atrasada_e_a_retomada_disputam_a_segunda_transacao(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    missao_com_evidencia: int,
) -> None:
    """E10 sob concorrencia real: a resposta atrasada da tentativa 1 (A, na
    transacao 2) e um pedido novo que a toma por orfa (B) chegam juntos.

    A trava de `_corrente` e o que decide: A trava a missao ANTES de ler a
    avaliacao, e B, que chega depois de A ler, espera. A grava `concluida`, e
    B encontra a concluida e a devolve sem retomar nada. Sem a trava, B le a
    mesma `avaliando` que A leu, retoma como tentativa 2, e o UPDATE de A cai
    sobre a linha nova (READ COMMITTED): a superada sobrescreve.
    """
    with fabrica() as sessao:
        primeira = abrir_tentativa(
            sessao,
            ESTUDANTE,
            missao_com_evidencia,
            clock=lambda: AGORA,
            modelo="claude-opus-5",
            limite_do_orfao=timedelta(0),
        )
        sessao.commit()
    assert isinstance(primeira, Tentativa)

    resultado_de_a: list[ResultadoGravado | None | BaseException] = [None]
    resultado_de_b: list[object] = [None]

    def responder_atrasado() -> None:
        try:
            with fabrica() as sessao:
                resultado_de_a[0] = registrar_resultado(
                    sessao,
                    primeira,
                    veredito=Veredito.ATENDE,
                    feedback="de A",
                    clock=lambda: AGORA + timedelta(minutes=1),
                )
                sessao.commit()
        except BaseException as erro:  # vai para a assercao abaixo
            resultado_de_a[0] = erro

    def retomar() -> None:
        try:
            with fabrica() as sessao:
                aberta = abrir_tentativa(
                    sessao,
                    ESTUDANTE,
                    missao_com_evidencia,
                    clock=lambda: AGORA + timedelta(hours=1),
                    modelo="quem-retomou",
                    limite_do_orfao=timedelta(minutes=1),
                )
                sessao.commit()
                resultado_de_b[0] = aberta
        except BaseException as erro:  # vai para a assercao abaixo
            resultado_de_b[0] = erro

    atrasada = threading.Thread(target=responder_atrasado)
    retomada = threading.Thread(target=retomar)
    with _encontro_na_leitura(banco_migrado, 2) as encontro:
        atrasada.start()
        # B so larga depois que A leu a avaliacao na transacao 2.
        assert encontro.primeira.wait(timeout=SEGUNDOS_LIMITE)
        retomada.start()
        for thread in (atrasada, retomada):
            thread.join(timeout=SEGUNDOS_LIMITE)
            assert not thread.is_alive(), "thread travada: houve espera circular"

    assert encontro.chegadas == 2
    assert isinstance(resultado_de_a[0], ResultadoGravado), resultado_de_a[0]
    assert isinstance(resultado_de_b[0], MissionEvaluation), resultado_de_b[0]
    with fabrica() as sessao:
        avaliacao = sessao.scalars(
            select(MissionEvaluation).where(
                MissionEvaluation.mission_id == missao_com_evidencia
            )
        ).one()
    assert (avaliacao.state, avaliacao.attempt, avaliacao.model) == (
        EstadoDaAvaliacao.CONCLUIDA,
        1,
        "claude-opus-5",
    )
    assert (avaliacao.verdict, avaliacao.feedback) == (Veredito.ATENDE, "de A")
