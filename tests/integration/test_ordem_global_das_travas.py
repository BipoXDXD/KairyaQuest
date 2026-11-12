"""Ordem global das travas: acao -> missao -> avaliacao -> usuario (pendencia 104).

`test_evaluation_concorrencia.py` ja prova um trecho: com a avaliacao retida,
a escrita dela espera com a missao travada e o usuario livre. Este modulo
prova a matriz de conflitos cruzados da ESCRITA DA AVALIACAO (a transacao 2 de
`avaliar_missao`, a unica que passa por missao, avaliacao e usuario) contra os
dois fluxos de producao que disputam as mesmas linhas, nas duas ordens:

| Quem segura primeiro              | Quem espera            | Linha disputada |
|-----------------------------------|------------------------|-----------------|
| conclusao de outra missao         | escrita da avaliacao   | usuario         |
| confirmacao da Kairya (reagendar) | escrita da avaliacao   | missao          |
| escrita da avaliacao              | confirmacao da Kairya  | missao          |
| escrita da avaliacao              | conclusao de outra     | usuario         |

Em cada caso o PostgreSQL diz quem bloqueia quem (`pg_blocking_pids`) e em
qual tabela a espera esta (`pg_locks`, `locktype = 'tuple'`). So entao uma
sonda com `NOWAIT` confere o que quem espera JA segura e o que ainda nao
tocou: e isso que mostra a ordem. Esperar o usuario segurando a missao e a
avaliacao prova "missao, avaliacao antes do usuario"; esperar a missao
segurando a acao prova "acao antes da missao" -- a ordem que a arquitetura
dava como nao observavel. Depois o dono libera, as duas transacoes terminam
sem `DeadlockDetected` e o estado final mostra a serializacao.

Sem `sleep` cego: as threads param em eventos (o provedor falso segura a
resposta; a sessao da transacao 2 pode segurar o proprio commit) e o teste so
avanca quando o banco confirma a espera.
"""

import threading
import time
from collections.abc import Callable, Generator, Iterator, Sequence
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Self

import pytest
from psycopg.errors import LockNotAvailable
from sqlalchemy import Connection, Engine, Select, delete, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from focusquest.modules.evaluation.service import ResultadoDaAvaliacao, avaliar_missao
from focusquest.modules.missions.domain import EstadoDaAvaliacao, Veredito
from focusquest.modules.missions.models import (
    Mission,
    MissionEvaluation,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
)
from focusquest.modules.progression.models import FONTE_BONUS, FONTE_CONCLUSAO, XpEntry
from focusquest.modules.tutoring.domain import (
    REAGENDAMENTO_INVALIDO,
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import EventoDoProvedor, Ferramenta, Turno
from focusquest.modules.tutoring.service import (
    ReagendamentoInvalido,
    ResultadoDaConfirmacao,
    Tutoria,
    confirmar_acao,
)
from focusquest.modules.users.models import User

ESTUDANTE = 1
AGORA = datetime(2026, 9, 25, 15, tzinfo=UTC)
PRAZO = AGORA + timedelta(days=1)
SEGUNDOS_LIMITE = 15
TEMPO_DE_COMANDO = "15s"
LIMITE_DE_TRAVA = "2s"
MODELO = "modelo-da-ordem-global"
FEEDBACK = "O resumo atende ao criterio informado."
XP_DA_CONCLUSAO = 40
XP_DO_BONUS = 20


@dataclass(frozen=True)
class Cenario:
    """`avaliada`: concluida com evidencia, pronta para avaliar. `outra`: do
    mesmo usuario, pendente. `acao`: proposta da Kairya de reagendar a
    `avaliada` -- que, ja concluida, o `reagendar_missao` recusa DEPOIS de
    travar a missao."""

    avaliada: int
    outra: int
    acao: int


@pytest.fixture
def cenario(banco_migrado: Engine) -> Iterator[Cenario]:
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        avaliada = _avulsa(sessao, "Ler o capitulo 3")
        outra = _avulsa(sessao, "Ler o capitulo 4")
        concluir_missao(
            sessao,
            ESTUDANTE,
            avaliada.id,
            f"op-104-conclusao-{avaliada.id}",
            clock=lambda: AGORA,
            evidencia=NovaEvidencia("Fiz o resumo", None),
        )
        pergunta = TutorMessage(
            user_id=ESTUDANTE,
            role=Papel.USUARIO,
            content="Estou sem tempo",
            status=StatusDaMensagem.COMPLETA,
            client_message_id=f"ordem-global-104-{avaliada.id}",
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
                "mission_id": avaliada.id,
                "new_deadline": (AGORA + timedelta(days=5)).isoformat(),
                "reason": "falta_de_tempo",
                "instructions": avaliada.instructions,
                "previous_deadline": PRAZO.isoformat(),
            },
            state=EstadoDaAcao.PROPOSTA,
            created_at=AGORA,
        )
        sessao.add(acao)
        sessao.commit()
    try:
        yield Cenario(avaliada=avaliada.id, outra=outra.id, acao=acao.id)
    finally:
        # Mensagens (e a acao, por CASCADE) antes das missoes: a FK da acao
        # para a missao nao tem CASCADE. Creditos, conquistas, evidencia e
        # avaliacao saem com a missao.
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            limpeza.execute(delete(TutorMessage).where(TutorMessage.id == pergunta.id))
            limpeza.execute(
                delete(Mission).where(Mission.id.in_((avaliada.id, outra.id)))
            )
            limpeza.commit()


def _avulsa(sessao: Session, instrucoes: str) -> Mission:
    return criar_missao(
        sessao,
        user_id=ESTUDANTE,
        instructions=instrucoes,
        completion_criterion="Resumo de uma pagina",
        difficulty=2,
        estimated_minutes=30,
        deadline=PRAZO,
    )


class AvaliacaoControlada:
    """`avaliar_missao` de producao numa thread, com dois pontos de parada.

    O provedor segura a resposta ate `devolver_resposta`: a transacao 1 ja
    commitou e a 2 ainda nao abriu. A primeira sessao aberta depois de o
    provedor DEVOLVER a resposta (`modelo_respondeu`, marcado dentro da propria
    thread da avaliacao) e a transacao 2 -- e nao depois de o teste ligar
    `devolver_resposta`, que pode acontecer antes de a transacao 1 abrir.
    Guarda o PID dela e, com `segurar_commit`, para no `commit` com tudo o que
    travou (`tx2_pronta`) ate `liberar_commit`.
    """

    def __init__(self, engine: Engine, *, segurar_commit: bool) -> None:
        self.entrou_modelo = threading.Event()
        self.devolver_resposta = threading.Event()
        self.modelo_respondeu = threading.Event()
        self.tx2_conectou = threading.Event()
        self.tx2_pronta = threading.Event()
        self.liberar_commit = threading.Event()
        self.pid_tx2: int | None = None
        self.sessao_tx2: Session | None = None
        controle = self

        class ProvedorRetido:
            def responder(self, turno: Turno) -> Generator[EventoDoProvedor]:
                raise AssertionError("esta prova usa apenas a avaliacao")

            def avaliar(self, turno: Turno, ferramenta: Ferramenta) -> dict[str, Any]:
                controle.entrou_modelo.set()
                assert controle.devolver_resposta.wait(SEGUNDOS_LIMITE), (
                    "resposta nao liberada"
                )
                controle.modelo_respondeu.set()
                return {"verdict": "atende", "feedback": FEEDBACK}

        class SessaoObservada(Session):
            def __enter__(self) -> Self:
                sessao = super().__enter__()
                if controle.modelo_respondeu.is_set() and controle.sessao_tx2 is None:
                    self.execute(
                        text(f"SET LOCAL statement_timeout = '{TEMPO_DE_COMANDO}'")
                    )
                    controle.pid_tx2 = _pid(self)
                    controle.sessao_tx2 = self
                    controle.tx2_conectou.set()
                return sessao

            def commit(self) -> None:
                if segurar_commit and self is controle.sessao_tx2:
                    controle.tx2_pronta.set()
                    assert controle.liberar_commit.wait(SEGUNDOS_LIMITE), (
                        "commit da transacao 2 nao liberado"
                    )
                super().commit()

        self.fabrica = sessionmaker[Session](
            bind=engine, expire_on_commit=False, class_=SessaoObservada
        )
        self.tutoria = Tutoria(
            provedor=ProvedorRetido(),
            historico=20,
            limite=timedelta(seconds=60),
            modelo=MODELO,
            turnos_por_dia=60,
        )

    def iniciar(
        self, executor: ThreadPoolExecutor, mission_id: int
    ) -> Future[ResultadoDaAvaliacao]:
        return executor.submit(
            avaliar_missao,
            self.fabrica,
            self.tutoria,
            user_id=ESTUDANTE,
            mission_id=mission_id,
            clock=lambda: AGORA,
        )

    def soltar_tudo(self) -> None:
        """Para o `finally`: nenhuma thread fica parada num evento."""
        self.devolver_resposta.set()
        self.liberar_commit.set()


def _pid(sessao: Session) -> int:
    return int(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())


def _aguardar(
    condicao: Callable[[], bool], tarefas: Sequence[Future[Any]], descricao: str
) -> None:
    """Espera uma condicao observavel; a falha de uma thread chega com o
    proprio erro (um `DeadlockDetected`, por exemplo), e nao como timeout."""
    fim = time.monotonic() + SEGUNDOS_LIMITE
    intervalo = threading.Event()
    while not condicao():
        for tarefa in tarefas:
            if tarefa.done():
                tarefa.result()
                pytest.fail(f"uma thread terminou antes de {descricao}")
        restante = fim - time.monotonic()
        assert restante > 0, f"tempo esgotado esperando {descricao}"
        intervalo.wait(min(0.01, restante))


def _bloqueia(observador: Connection, dono: int, esperando: int) -> bool:
    bloqueadores = observador.execute(
        text("SELECT pg_blocking_pids(:pid)"), {"pid": esperando}
    ).scalar_one()
    observador.commit()
    return dono in bloqueadores


def _tabelas_em_espera(observador: Connection, pid: int) -> set[str]:
    """As tabelas das linhas que `pid` disputa: quem espera uma linha travada
    segura (ou espera) a trava de tupla dela."""
    tabelas = observador.execute(
        text(
            "SELECT DISTINCT relation::regclass::text FROM pg_locks "
            "WHERE pid = :pid AND locktype = 'tuple'"
        ),
        {"pid": pid},
    ).scalars()
    resultado = set(tabelas)
    observador.commit()
    return resultado


def _esperar_bloqueio(
    observador: Connection,
    dono: int,
    esperando: int,
    tarefas: Sequence[Future[Any]],
    tabela: str,
) -> None:
    _aguardar(
        lambda: _bloqueia(observador, dono, esperando),
        tarefas,
        f"o backend {esperando} esperar o {dono}",
    )
    assert _tabelas_em_espera(observador, esperando) == {tabela}


def _recusa(sonda: Session, consulta: Select[int]) -> None:
    """A linha esta travada por alguem: a sonda `NOWAIT` e recusada."""
    try:
        with pytest.raises(OperationalError) as travada:
            sonda.execute(consulta).scalar_one()
        assert isinstance(travada.value.orig, LockNotAvailable)
    finally:
        sonda.rollback()


def _aceita(sonda: Session, consulta: Select[int]) -> None:
    """Ninguem segura a linha num modo conflitante."""
    try:
        sonda.execute(consulta).scalar_one()
    finally:
        sonda.rollback()


# As sondas. KEY SHARE so conflita com FOR UPDATE -- a trava da missao e da
# acao. SHARE conflita com o UPDATE da avaliacao e com o FOR NO KEY UPDATE do
# usuario (o `_travar_usuario` da progressao).
def _missao(mission_id: int) -> Select[int]:
    return (
        select(Mission.id)
        .where(Mission.id == mission_id)
        .with_for_update(read=True, key_share=True, nowait=True)
    )


def _acao(action_id: int) -> Select[int]:
    return (
        select(TutorAction.id)
        .where(TutorAction.id == action_id)
        .with_for_update(read=True, key_share=True, nowait=True)
    )


def _avaliacao(mission_id: int) -> Select[int]:
    return (
        select(MissionEvaluation.id)
        .where(MissionEvaluation.mission_id == mission_id)
        .with_for_update(read=True, nowait=True)
    )


def _usuario() -> Select[int]:
    return (
        select(User.id)
        .where(User.id == ESTUDANTE)
        .with_for_update(read=True, nowait=True)
    )


def _concluir_outra(sessao: Session, cenario: Cenario) -> None:
    concluir_missao(
        sessao,
        ESTUDANTE,
        cenario.outra,
        f"op-104-outra-{cenario.outra}",
        clock=lambda: AGORA,
    )


def _confirmar(sessao: Session, cenario: Cenario) -> ResultadoDaConfirmacao:
    return confirmar_acao(
        sessao,
        ESTUDANTE,
        cenario.acao,
        f"op-104-kairya-{cenario.acao}",
        clock=lambda: AGORA,
    )


def _com_pid(
    fabrica: sessionmaker[Session],
    pid: list[int],
    operar: Callable[[Session], Any],
) -> Any:
    """Roda `operar` numa sessao propria, commitando, e publica o PID dela."""
    with fabrica() as sessao:
        sessao.execute(text(f"SET LOCAL statement_timeout = '{TEMPO_DE_COMANDO}'"))
        pid.append(_pid(sessao))
        resultado = operar(sessao)
        sessao.commit()
        return resultado


def _conferir_avaliacao_concluida(resultado: ResultadoDaAvaliacao) -> None:
    assert resultado.avaliacao.state is EstadoDaAvaliacao.CONCLUIDA
    assert resultado.avaliacao.attempt == 1
    assert resultado.avaliacao.model == MODELO
    assert resultado.avaliacao.verdict is Veredito.ATENDE
    assert resultado.avaliacao.feedback == FEEDBACK
    assert resultado.recompensa is not None
    assert resultado.recompensa.xp_awarded == XP_DO_BONUS


def _creditos(engine: Engine, cenario: Cenario) -> list[tuple[int, str, int]]:
    """(missao, fonte, valor) das duas missoes, na ordem em que foram gravados."""
    with Session(bind=engine) as leitura:
        linhas = leitura.execute(
            select(XpEntry.mission_id, XpEntry.source, XpEntry.amount)
            .where(XpEntry.mission_id.in_((cenario.avaliada, cenario.outra)))
            .order_by(XpEntry.id)
        ).all()
    return [(missao, fonte, valor) for missao, fonte, valor in linhas]


def _acao_recusada(engine: Engine, cenario: Cenario) -> None:
    with Session(bind=engine) as leitura:
        acao = leitura.get(TutorAction, cenario.acao)
        assert acao is not None
        assert (acao.state, acao.error_code, acao.mission_id) == (
            EstadoDaAcao.FALHOU,
            REAGENDAMENTO_INVALIDO,
            None,
        )
        missao = leitura.get(Mission, cenario.avaliada)
        assert missao is not None
        assert missao.deadline == PRAZO


def test_avaliacao_espera_o_usuario_ja_segurando_missao_e_avaliacao(
    banco_migrado: Engine, cenario: Cenario
) -> None:
    """Conclusao de outra missao (segura o usuario) x escrita da avaliacao."""
    avaliacao = AvaliacaoControlada(banco_migrado, segurar_commit=False)
    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        banco_migrado.connect() as observador,
        Session(bind=banco_migrado) as dono,
        Session(bind=banco_migrado) as sonda,
    ):
        tarefa = avaliacao.iniciar(executor, cenario.avaliada)
        try:
            _aguardar(avaliacao.entrou_modelo.is_set, [tarefa], "a entrada no modelo")
            dono.execute(text(f"SET LOCAL statement_timeout = '{TEMPO_DE_COMANDO}'"))
            pid_dono = _pid(dono)
            _concluir_outra(dono, cenario)

            avaliacao.devolver_resposta.set()
            _aguardar(avaliacao.tx2_conectou.is_set, [tarefa], "a transacao 2")
            assert avaliacao.pid_tx2 is not None
            _esperar_bloqueio(
                observador, pid_dono, avaliacao.pid_tx2, [tarefa], "users"
            )

            # Esperando o usuario, a escrita JA segura a missao e a avaliacao.
            _recusa(sonda, _missao(cenario.avaliada))
            _recusa(sonda, _avaliacao(cenario.avaliada))

            dono.commit()
            resultado = tarefa.result(timeout=SEGUNDOS_LIMITE)
        finally:
            avaliacao.soltar_tudo()
            dono.rollback()
            sonda.rollback()

    _conferir_avaliacao_concluida(resultado)
    assert _creditos(banco_migrado, cenario) == [
        (cenario.avaliada, FONTE_CONCLUSAO, XP_DA_CONCLUSAO),
        (cenario.outra, FONTE_CONCLUSAO, XP_DA_CONCLUSAO),
        (cenario.avaliada, FONTE_BONUS, XP_DO_BONUS),
    ]


def test_avaliacao_espera_a_missao_sem_tocar_avaliacao_nem_usuario(
    banco_migrado: Engine, cenario: Cenario
) -> None:
    """Confirmacao da Kairya (segura acao e missao) x escrita da avaliacao."""
    avaliacao = AvaliacaoControlada(banco_migrado, segurar_commit=False)
    with (
        ThreadPoolExecutor(max_workers=1) as executor,
        banco_migrado.connect() as observador,
        Session(bind=banco_migrado) as dono,
        Session(bind=banco_migrado) as sonda,
    ):
        tarefa = avaliacao.iniciar(executor, cenario.avaliada)
        try:
            _aguardar(avaliacao.entrou_modelo.is_set, [tarefa], "a entrada no modelo")
            dono.execute(text(f"SET LOCAL statement_timeout = '{TEMPO_DE_COMANDO}'"))
            pid_dono = _pid(dono)
            assert isinstance(_confirmar(dono, cenario), ReagendamentoInvalido)

            avaliacao.devolver_resposta.set()
            _aguardar(avaliacao.tx2_conectou.is_set, [tarefa], "a transacao 2")
            assert avaliacao.pid_tx2 is not None
            _esperar_bloqueio(
                observador, pid_dono, avaliacao.pid_tx2, [tarefa], "missions"
            )

            # Esperando a missao, a escrita ainda nao tocou o que vem depois.
            _aceita(sonda, _avaliacao(cenario.avaliada))
            _aceita(sonda, _usuario())

            dono.commit()
            resultado = tarefa.result(timeout=SEGUNDOS_LIMITE)
        finally:
            avaliacao.soltar_tudo()
            dono.rollback()
            sonda.rollback()

    _conferir_avaliacao_concluida(resultado)
    _acao_recusada(banco_migrado, cenario)
    assert _creditos(banco_migrado, cenario) == [
        (cenario.avaliada, FONTE_CONCLUSAO, XP_DA_CONCLUSAO),
        (cenario.avaliada, FONTE_BONUS, XP_DO_BONUS),
    ]


def test_confirmacao_espera_a_missao_ja_segurando_a_acao(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    cenario: Cenario,
) -> None:
    """Escrita da avaliacao retida no commit x confirmacao da Kairya: a acao
    vem antes da missao (F14), observada pela primeira vez."""
    avaliacao = AvaliacaoControlada(banco_migrado, segurar_commit=True)
    pid_kairya: list[int] = []
    with (
        ThreadPoolExecutor(max_workers=2) as executor,
        banco_migrado.connect() as observador,
        Session(bind=banco_migrado) as sonda,
    ):
        tarefa = avaliacao.iniciar(executor, cenario.avaliada)
        try:
            _aguardar(avaliacao.entrou_modelo.is_set, [tarefa], "a entrada no modelo")
            avaliacao.devolver_resposta.set()
            _aguardar(avaliacao.tx2_pronta.is_set, [tarefa], "o commit da tx2")
            assert avaliacao.pid_tx2 is not None
            # A escrita retida segura missao, avaliacao e usuario.
            _recusa(sonda, _missao(cenario.avaliada))
            _recusa(sonda, _avaliacao(cenario.avaliada))
            _recusa(sonda, _usuario())

            confirmacao: Future[ResultadoDaConfirmacao] = executor.submit(
                _com_pid, fabrica, pid_kairya, lambda s: _confirmar(s, cenario)
            )
            tarefas: list[Future[Any]] = [tarefa, confirmacao]
            _aguardar(lambda: bool(pid_kairya), tarefas, "o PID da confirmacao")
            _esperar_bloqueio(
                observador, avaliacao.pid_tx2, pid_kairya[0], tarefas, "missions"
            )

            # Esperando a missao, a confirmacao JA segura a acao.
            _recusa(sonda, _acao(cenario.acao))

            avaliacao.liberar_commit.set()
            resultado = tarefa.result(timeout=SEGUNDOS_LIMITE)
            confirmada = confirmacao.result(timeout=SEGUNDOS_LIMITE)
        finally:
            avaliacao.soltar_tudo()
            sonda.rollback()

    _conferir_avaliacao_concluida(resultado)
    assert isinstance(confirmada, ReagendamentoInvalido)
    _acao_recusada(banco_migrado, cenario)


def test_conclusao_espera_o_usuario_ja_segurando_a_propria_missao(
    banco_migrado: Engine,
    fabrica: sessionmaker[Session],
    cenario: Cenario,
) -> None:
    """Escrita da avaliacao retida no commit x conclusao de outra missao do
    mesmo usuario: a conclusao trava a missao dela e espera o usuario."""
    avaliacao = AvaliacaoControlada(banco_migrado, segurar_commit=True)
    pid_conclusao: list[int] = []
    with (
        ThreadPoolExecutor(max_workers=2) as executor,
        banco_migrado.connect() as observador,
        Session(bind=banco_migrado) as sonda,
    ):
        tarefa = avaliacao.iniciar(executor, cenario.avaliada)
        try:
            _aguardar(avaliacao.entrou_modelo.is_set, [tarefa], "a entrada no modelo")
            avaliacao.devolver_resposta.set()
            _aguardar(avaliacao.tx2_pronta.is_set, [tarefa], "o commit da tx2")
            assert avaliacao.pid_tx2 is not None

            conclusao: Future[None] = executor.submit(
                _com_pid, fabrica, pid_conclusao, lambda s: _concluir_outra(s, cenario)
            )
            tarefas: list[Future[Any]] = [tarefa, conclusao]
            _aguardar(lambda: bool(pid_conclusao), tarefas, "o PID da conclusao")
            _esperar_bloqueio(
                observador, avaliacao.pid_tx2, pid_conclusao[0], tarefas, "users"
            )

            # Esperando o usuario, a conclusao JA segura a propria missao.
            _recusa(sonda, _missao(cenario.outra))

            avaliacao.liberar_commit.set()
            resultado = tarefa.result(timeout=SEGUNDOS_LIMITE)
            conclusao.result(timeout=SEGUNDOS_LIMITE)
        finally:
            avaliacao.soltar_tudo()
            sonda.rollback()

    _conferir_avaliacao_concluida(resultado)
    assert _creditos(banco_migrado, cenario) == [
        (cenario.avaliada, FONTE_CONCLUSAO, XP_DA_CONCLUSAO),
        (cenario.avaliada, FONTE_BONUS, XP_DO_BONUS),
        (cenario.outra, FONTE_CONCLUSAO, XP_DA_CONCLUSAO),
    ]
