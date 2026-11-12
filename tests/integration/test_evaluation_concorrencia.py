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
from collections.abc import Callable, Generator, Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager, suppress
from datetime import UTC, datetime, timedelta
from typing import Any, Self

import pytest
from psycopg.errors import LockNotAvailable
from sqlalchemy import Engine, delete, event, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.errors import AvaliacaoEmAndamentoError
from focusquest.modules.evaluation.service import ResultadoDaAvaliacao, avaliar_missao
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MissionState,
    Veredito,
)
from focusquest.modules.missions.evaluation_records import (
    ResultadoGravado,
    Tentativa,
    abrir_tentativa,
    registrar_falha,
    registrar_resultado,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvaluation,
    MissionOperation,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
)
from focusquest.modules.progression.models import FONTE_BONUS, FONTE_CONCLUSAO, XpEntry
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.provider import EventoDoProvedor, Ferramenta, Turno
from focusquest.modules.tutoring.service import Tutoria
from focusquest.modules.users.models import User
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
    e o listener deixar de casar. `primeira` avisa quando a
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
            fallback=True,
            esforco="low",
            esforco_da_avaliacao="medium",
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


def _tentativa_1_aberta(engine: Engine, mission_id: int) -> Tentativa:
    with Session(bind=engine, expire_on_commit=False) as abertura:
        aberta = abrir_tentativa(
            abertura,
            ESTUDANTE,
            mission_id,
            clock=lambda: AGORA,
            modelo="claude-opus-5",
            limite_do_orfao=timedelta(seconds=90),
        )
        abertura.commit()
    assert isinstance(aberta, Tentativa)
    return aberta


def _falhar_em_outra_conexao(engine: Engine, aberta: Tentativa) -> None:
    with Session(bind=engine) as outra:
        assert registrar_falha(
            outra, aberta, falha=FalhaDaAvaliacao.TEMPO_ESGOTADO, clock=lambda: AGORA
        )
        outra.commit()


def _avaliacao_velha(sessao: Session, mission_id: int) -> MissionEvaluation:
    """A missao e a avaliacao carregadas nesta sessao ANTES da trava, com uma
    referencia forte a avaliacao: sem ela, o identity map (referencias
    fracas) a soltaria e a carga seguinte criaria um objeto novo, e o teste
    passaria sem provar releitura nenhuma."""
    missao = sessao.get(Mission, mission_id)
    assert missao is not None and missao.evaluation is not None
    velha = missao.evaluation
    assert velha.state is EstadoDaAvaliacao.AVALIANDO
    return velha


def test_a_avaliacao_ja_carregada_na_sessao_e_relida_depois_da_trava(
    banco_migrado: Engine, missao_com_evidencia: int
) -> None:
    """`_corrente` decide sobre a avaliacao lida DEPOIS da trava da missao.
    Hoje nenhum caminho de producao carrega a avaliacao antes
    (`avaliar_missao` abre sessao nova), entao o teste a carrega de proposito
    e guarda a referencia: outra conexao encerra a tentativa como `falhou` e
    commita, e o resultado atrasado tem de ser tentativa superada (`None`) --
    e nao gravar `concluida` por cima da falha."""
    aberta = _tentativa_1_aberta(banco_migrado, missao_com_evidencia)

    with Session(bind=banco_migrado) as atrasada:
        velha = _avaliacao_velha(atrasada, missao_com_evidencia)
        _falhar_em_outra_conexao(banco_migrado, aberta)
        gravada = registrar_resultado(
            atrasada,
            aberta,
            veredito=Veredito.ATENDE,
            feedback="Bom resumo.",
            clock=lambda: AGORA,
        )
        assert gravada is None
        # A MESMA instancia foi atualizada pela releitura.
        assert velha.state is EstadoDaAvaliacao.FALHOU
        atrasada.commit()

    with Session(bind=banco_migrado) as leitura:
        avaliacao = leitura.scalars(
            select(MissionEvaluation).where(
                MissionEvaluation.mission_id == missao_com_evidencia
            )
        ).one()
        assert avaliacao.state is EstadoDaAvaliacao.FALHOU
        assert avaliacao.error_code is FalhaDaAvaliacao.TEMPO_ESGOTADO


def test_abrir_tentativa_rele_a_avaliacao_ja_carregada_na_sessao(
    banco_migrado: Engine, missao_com_evidencia: int
) -> None:
    """O mesmo em `abrir_tentativa`: com a `avaliando` velha na sessao e a
    tentativa ja encerrada por outra conexao, abrir de novo e a tentativa 2 --
    e nao `AvaliacaoEmAndamentoError` por uma `avaliando` que o banco nao tem
    mais."""
    aberta = _tentativa_1_aberta(banco_migrado, missao_com_evidencia)

    with Session(bind=banco_migrado) as sessao:
        velha = _avaliacao_velha(sessao, missao_com_evidencia)
        _falhar_em_outra_conexao(banco_migrado, aberta)
        nova = abrir_tentativa(
            sessao,
            ESTUDANTE,
            missao_com_evidencia,
            clock=lambda: AGORA,
            modelo="claude-opus-5",
            limite_do_orfao=timedelta(seconds=90),
        )
        assert isinstance(nova, Tentativa)
        assert nova.attempt == 2
        assert velha.state is EstadoDaAvaliacao.AVALIANDO
        assert velha.attempt == 2
        sessao.commit()


def _aguardar_etapa_da_ordem(
    condicao: Callable[[], bool],
    tarefa: Future[ResultadoDaAvaliacao],
    descricao: str,
) -> None:
    """Espera uma condicao observavel; falha da thread chega sem virar timeout."""
    fim = time.monotonic() + SEGUNDOS_LIMITE
    intervalo = threading.Event()
    while not condicao():
        if tarefa.done():
            tarefa.result()
            pytest.fail(f"a avaliacao terminou antes de {descricao}")
        restante = fim - time.monotonic()
        assert restante > 0, f"tempo esgotado esperando {descricao}"
        intervalo.wait(min(0.01, restante))


def test_avaliacao_aguarda_escrita_com_missao_retida_e_usuario_livre(
    banco_migrado: Engine, missao_com_evidencia: int
) -> None:
    """Durante a escrita bloqueada, a missao esta travada e o usuario ainda nao."""
    entrou_modelo = threading.Event()
    devolver_resposta = threading.Event()
    tx2_conectou = threading.Event()
    pid_da_tx2: int | None = None
    feedback = "O resumo atende ao criterio informado."
    modelo = "modelo-da-prova-de-ordem"

    class ProvedorDaOrdem:
        def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
            raise AssertionError("esta prova usa apenas a avaliacao")

        def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any]:
            entrou_modelo.set()
            assert devolver_resposta.wait(SEGUNDOS_LIMITE), "resposta nao liberada"
            return {"verdict": "atende", "feedback": feedback}

    class SessaoObservada(Session):
        def __enter__(self) -> Self:
            nonlocal pid_da_tx2
            sessao = super().__enter__()
            if devolver_resposta.is_set() and not tx2_conectou.is_set():
                self.execute(text("SET LOCAL statement_timeout = '15s'"))
                pid_da_tx2 = int(
                    self.execute(text("SELECT pg_backend_pid()")).scalar_one()
                )
                tx2_conectou.set()
            return sessao

    fabrica_observada = sessionmaker[Session](
        bind=banco_migrado, expire_on_commit=False, class_=SessaoObservada
    )
    paciente = Tutoria(
        provedor=ProvedorDaOrdem(),
        historico=20,
        turnos_por_dia=60,
        limite=timedelta(seconds=60),
        modelo=modelo,
    )
    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        Session(bind=banco_migrado) as holder,
        Session(bind=banco_migrado) as sonda,
    ):
        tarefa = executor.submit(
            avaliar_missao,
            fabrica_observada,
            paciente,
            user_id=ESTUDANTE,
            mission_id=missao_com_evidencia,
            clock=lambda: AGORA,
        )
        try:
            _aguardar_etapa_da_ordem(entrou_modelo.is_set, tarefa, "entrada no modelo")
            holder.execute(text("SET LOCAL statement_timeout = '15s'"))
            pid_holder = int(
                holder.execute(text("SELECT pg_backend_pid()")).scalar_one()
            )
            avaliando = holder.scalars(
                select(MissionEvaluation)
                .where(MissionEvaluation.mission_id == missao_com_evidencia)
                .with_for_update()
            ).one()
            assert (avaliando.state, avaliando.attempt) == (
                EstadoDaAvaliacao.AVALIANDO,
                1,
            )
            assert avaliando.requested_at == AGORA

            devolver_resposta.set()
            _aguardar_etapa_da_ordem(
                tx2_conectou.is_set, tarefa, "conexao da transacao2"
            )
            assert pid_da_tx2 is not None
            pid_sonda = int(sonda.execute(text("SELECT pg_backend_pid()")).scalar_one())
            assert len({pid_holder, pid_da_tx2, pid_sonda}) == 3
            _aguardar_etapa_da_ordem(
                lambda: (
                    pid_holder
                    in sonda.execute(
                        text("SELECT pg_blocking_pids(:pid)"), {"pid": pid_da_tx2}
                    ).scalar_one()
                ),
                tarefa,
                "bloqueio da escrita da avaliacao pelo holder",
            )

            try:
                with pytest.raises(OperationalError) as travada:
                    sonda.execute(
                        select(Mission.id)
                        .where(Mission.id == missao_com_evidencia)
                        .with_for_update(read=True, key_share=True, nowait=True)
                    ).scalar_one()
                assert isinstance(travada.value.orig, LockNotAvailable)
            finally:
                sonda.rollback()

            try:
                # SHARE conflita com NO KEY UPDATE do bonus; KEY SHARE nao.
                assert (
                    sonda.execute(
                        select(User.id)
                        .where(User.id == ESTUDANTE)
                        .with_for_update(read=True, nowait=True)
                    ).scalar_one()
                    == ESTUDANTE
                )
            finally:
                sonda.rollback()

            holder.rollback()
            resultado = tarefa.result(timeout=SEGUNDOS_LIMITE)
        finally:
            devolver_resposta.set()
            holder.rollback()
            sonda.rollback()
            # O executor so aguarda a thread depois de liberar as travas.

    assert resultado.avaliacao.state is EstadoDaAvaliacao.CONCLUIDA
    assert resultado.avaliacao.attempt == 1
    assert resultado.avaliacao.model == modelo
    assert resultado.avaliacao.verdict is Veredito.ATENDE
    assert resultado.avaliacao.feedback == feedback
    assert resultado.avaliacao.finished_at == AGORA
    assert resultado.recompensa is not None
    assert resultado.recompensa.xp_awarded == 20
    with Session(bind=banco_migrado) as leitura:
        missao = leitura.get(Mission, missao_com_evidencia)
        assert missao is not None
        assert missao.state is MissionState.CONCLUIDA
        assert missao.completed_at == AGORA
        assert missao.instructions == "Ler o capitulo 3"
        assert missao.difficulty == 2
        assert missao.deadline == AGORA + timedelta(days=1)
        assert missao.evidence is not None
        assert missao.evidence.text == "Fiz o resumo"
        assert missao.evidence.link is None
        assert missao.evidence.submitted_at == AGORA
        assert missao.evaluation is not None
        assert missao.evaluation.id == resultado.avaliacao.id
        assert (
            missao.evaluation.state,
            missao.evaluation.attempt,
            missao.evaluation.model,
            missao.evaluation.verdict,
            missao.evaluation.feedback,
            missao.evaluation.requested_at,
            missao.evaluation.finished_at,
            missao.evaluation.error_code,
        ) == (
            EstadoDaAvaliacao.CONCLUIDA,
            1,
            modelo,
            Veredito.ATENDE,
            feedback,
            AGORA,
            AGORA,
            None,
        )
        operacoes = leitura.scalars(
            select(MissionOperation).where(
                MissionOperation.mission_id == missao_com_evidencia
            )
        ).all()
        assert [(operacao.kind, operacao.operation_id) for operacao in operacoes] == [
            ("complete", f"op-concorrencia-avaliacao-{missao_com_evidencia}")
        ]
        creditos = leitura.scalars(
            select(XpEntry)
            .where(XpEntry.mission_id == missao_com_evidencia)
            .order_by(XpEntry.id)
        ).all()
        assert [
            (credito.source, credito.amount, credito.credited_at)
            for credito in creditos
        ] == [
            (FONTE_CONCLUSAO, 40, AGORA),
            (FONTE_BONUS, 20, AGORA),
        ]
