"""O ciclo inteiro usa um snapshot, inclusive com ORM previamente carregada."""

import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Connection, Engine, ExecutionContext, delete, event, select, text
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.cycle_schemas import CycleRead
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
    ler_ciclo,
)
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import (
    Mission,
    MissionOperation,
    WeeklyPlan,
)
from focusquest.modules.missions.service import NovaEvidencia, concluir_missao
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.users.models import User

SEGUNDA = date(2026, 9, 21)
SEGUNDOS_LIMITE = 30


def _meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


def _plano(sessao: Session, user_id: int, semana: date = SEGUNDA) -> None:
    criar_plano(
        sessao,
        user_id=user_id,
        semana=semana,
        diarias=[NovaDiaria(f"Diaria {i}", f"Resumo {i}", 2, 30) for i in range(7)],
        especial=NovaEspecial("Revisar snapshots", "Prova entregue", 120),
        clock=lambda: _meio_dia(semana),
    )


def _diaria(sessao: Session, user_id: int, dia: date) -> Mission:
    return sessao.scalars(
        select(Mission).where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == dia,
        )
    ).one()


def _concluir(sessao: Session, user_id: int, dia: date) -> None:
    missao = _diaria(sessao, user_id, dia)
    concluir_missao(
        sessao,
        user_id,
        missao.id,
        f"ciclo-consistencia-{missao.id}",
        clock=lambda: _meio_dia(dia),
    )


@pytest.fixture
def usuario_commitado(banco_migrado: Engine) -> Iterator[int]:
    """A limpeza apaga apenas o dono desta execucao e suas FKs com CASCADE.

    ID proprio explicito: nextval nao e transacional, e o teste de migracao
    executado depois exige a sequence ainda imediatamente apos o id semeado.
    Nao reiniciamos a sequence nem mudamos aquele teste para esta fixture.
    """
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        assert sessao.get(User, -11001) is None, "ID proprio ja usado"
        usuario = User(id=-11001, display_name="Teste de snapshot do ciclo")
        sessao.add(usuario)
        sessao.commit()
        user_id = usuario.id
    try:
        yield user_id
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(text("SET LOCAL lock_timeout = '2s'"))
            mission_ids = limpeza.scalars(
                select(Mission.id).where(Mission.user_id == user_id)
            ).all()
            limpeza.execute(delete(User).where(User.id == user_id))
            limpeza.commit()
            assert limpeza.get(User, user_id) is None
            assert not limpeza.scalars(
                select(WeeklyPlan.id).where(WeeklyPlan.user_id == user_id)
            ).all()
            assert not limpeza.scalars(
                select(Mission.id).where(Mission.user_id == user_id)
            ).all()
            assert not limpeza.scalars(
                select(MissionOperation.id).where(
                    MissionOperation.mission_id.in_(mission_ids)
                )
            ).all()
            assert not limpeza.scalars(
                select(XpEntry.id).where(XpEntry.user_id == user_id)
            ).all()
            assert not limpeza.scalars(
                select(UserAchievement.code).where(UserAchievement.user_id == user_id)
            ).all()


@pytest.mark.parametrize("numero_do_dia", [1, 7], ids=["primeira", "marco"])
@pytest.mark.parametrize(
    "precarregar", [False, True], ids=["sessao-vazia", "orm-carregada"]
)
def test_conclusao_entre_leituras_nao_mistura_missao_sequencia_e_especial(
    banco_migrado: Engine, usuario_commitado: int, numero_do_dia: int, precarregar: bool
) -> None:
    """Voltar aos SELECTs separados fornece concluida com streak antigo.

    SELECT por entidades tambem falha na proxima leitura se a Session retiver
    identidades antigas. A barreira funciona antes e depois da correcao:
    commit externo ocorre depois do primeiro SELECT real do ciclo.
    """
    hoje = SEGUNDA + timedelta(days=numero_do_dia - 1)
    agora = _meio_dia(hoje)
    with Session(bind=banco_migrado, expire_on_commit=False) as preparo:
        _plano(preparo, usuario_commitado)
        for indice in range(numero_do_dia - 1):
            _concluir(preparo, usuario_commitado, SEGUNDA + timedelta(days=indice))
        mission_id = _diaria(preparo, usuario_commitado, hoje).id
        preparo.commit()
        antes = CycleRead.da_leitura(
            ler_ciclo(preparo, usuario_commitado, clock=lambda: agora)
        )
    assert antes.mission is not None
    assert antes.mission.state is MissionState.PENDENTE
    assert antes.mission.availability is Availability.DISPONIVEL
    assert (antes.streak, antes.days_to_milestone, antes.special) == (
        numero_do_dia - 1,
        8 - numero_do_dia,
        None,
    )

    prontos = threading.Barrier(2, timeout=SEGUNDOS_LIMITE)
    leitura_efetuada = threading.Event()
    escritor_finalizou = threading.Event()

    def pausar_apos_snapshot(
        conexao: Connection,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: ExecutionContext,
        executemany: bool,
    ) -> None:
        if (
            statement.lstrip().upper().startswith("SELECT")
            and "missions" in statement
            and not leitura_efetuada.is_set()
        ):
            leitura_efetuada.set()
            assert escritor_finalizou.wait(SEGUNDOS_LIMITE), "escritor nao terminou"

    def ler() -> tuple[CycleRead, CycleRead, int]:
        with (
            banco_migrado.connect().execution_options(
                isolation_level="READ COMMITTED"
            ) as conexao,
            Session(bind=conexao) as leitor,
        ):
            leitor.execute(text("SET LOCAL statement_timeout = '30s'"))
            pid = int(leitor.scalars(text("SELECT pg_backend_pid()")).one())
            # Lista retida deliberadamente: o resultado nao pode depender do GC.
            carregadas = (
                list(
                    leitor.scalars(
                        select(Mission).where(Mission.user_id == usuario_commitado)
                    )
                )
                if precarregar
                else []
            )
            planos = (
                list(
                    leitor.scalars(
                        select(WeeklyPlan).where(
                            WeeklyPlan.user_id == usuario_commitado
                        )
                    )
                )
                if precarregar
                else []
            )
            prontos.wait()
            event.listen(conexao, "after_cursor_execute", pausar_apos_snapshot)
            try:
                durante = CycleRead.da_leitura(
                    ler_ciclo(leitor, usuario_commitado, clock=lambda: agora)
                )
                seguinte = CycleRead.da_leitura(
                    ler_ciclo(leitor, usuario_commitado, clock=lambda: agora)
                )
                assert len(carregadas) == (8 if precarregar else 0)
                assert len(planos) == (1 if precarregar else 0)
                return durante, seguinte, pid
            finally:
                event.remove(conexao, "after_cursor_execute", pausar_apos_snapshot)

    def concluir() -> int:
        try:
            with (
                banco_migrado.connect().execution_options(
                    isolation_level="READ COMMITTED"
                ) as conexao,
                Session(bind=conexao) as escritor,
            ):
                escritor.execute(text("SET LOCAL statement_timeout = '30s'"))
                escritor.execute(text("SET LOCAL lock_timeout = '2s'"))
                pid = int(escritor.scalars(text("SELECT pg_backend_pid()")).one())
                prontos.wait()
                assert leitura_efetuada.wait(SEGUNDOS_LIMITE), (
                    "leitor nao estabeleceu snapshot"
                )
                concluir_missao(
                    escritor,
                    usuario_commitado,
                    mission_id,
                    f"ciclo-consistencia-{mission_id}",
                    clock=lambda: agora,
                    evidencia=NovaEvidencia("Entrega commitada com a conclusao", None),
                )
                escritor.commit()
                return pid
        finally:
            escritor_finalizou.set()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futuro_leitor = executor.submit(ler)
        futuro_escritor = executor.submit(concluir)
        try:
            pid_escritor = futuro_escritor.result(timeout=SEGUNDOS_LIMITE + 5)
            durante, seguinte, pid_leitor = futuro_leitor.result(
                timeout=SEGUNDOS_LIMITE + 5
            )
        finally:
            leitura_efetuada.set()
            escritor_finalizou.set()
    assert pid_leitor != pid_escritor
    with Session(bind=banco_migrado) as verificacao:
        persistida = verificacao.get(Mission, mission_id)
        assert persistida is not None
        assert persistida.state is MissionState.CONCLUIDA
        assert persistida.completed_at == agora
        operacao = verificacao.scalars(
            select(MissionOperation).where(MissionOperation.mission_id == mission_id)
        ).one()
        assert (operacao.operation_id, operacao.kind) == (
            f"ciclo-consistencia-{mission_id}",
            "complete",
        )
        entrada = verificacao.scalars(
            select(XpEntry).where(XpEntry.mission_id == mission_id)
        ).one()
        assert (entrada.user_id, entrada.amount, entrada.credited_at) == (
            usuario_commitado,
            40,
            agora,
        )
        depois = CycleRead.da_leitura(
            ler_ciclo(verificacao, usuario_commitado, clock=lambda: agora)
        )
    assert depois.mission is not None
    assert depois.mission.evidence is not None
    assert depois.mission.evidence.text == "Entrega commitada com a conclusao"
    assert depois.mission.evaluation is None
    assert (
        depois.mission.state,
        depois.mission.completed_at,
        depois.mission.availability,
    ) == (MissionState.CONCLUIDA, agora, Availability.CONCLUIDA)
    assert (depois.streak, depois.days_to_milestone) == (
        numero_do_dia,
        7 if numero_do_dia == 7 else 6,
    )
    if numero_do_dia == 7:
        assert depois.special is not None
        assert depois.special.availability is Availability.DISPONIVEL
        assert depois.special.xp == 660
    else:
        assert depois.special is None
    # Oraculo de resposta inteira: permite snapshot anterior OU posterior.
    assert durante in (antes, depois), (antes, durante, depois)
    assert seguinte == depois


def test_ciclo_nao_revela_plano_futuro_nem_avulsa_e_le_clock_uma_vez(
    session: Session,
) -> None:
    """Remover filtros de tipo/dia ou consultar o clock de novo vaza o futuro."""
    from focusquest.modules.missions.service import criar_missao

    _plano(session, 1, SEGUNDA + timedelta(days=7))
    criar_missao(
        session,
        user_id=1,
        instructions="Avulsa separada do ciclo",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=_meio_dia(SEGUNDA),
    )
    chamadas = 0

    def clock() -> datetime:
        nonlocal chamadas
        chamadas += 1
        assert chamadas == 1, "o ciclo releu o clock"
        return _meio_dia(SEGUNDA)

    ciclo = CycleRead.da_leitura(ler_ciclo(session, 1, clock=clock))
    assert ciclo == CycleRead(
        today=SEGUNDA,
        mission=None,
        streak=0,
        days_to_milestone=7,
        special=None,
        late_daily=None,
    )
    assert chamadas == 1
    assert not session.new and not session.dirty and not session.deleted


def test_snapshot_filtra_diarias_historico_e_especial_por_usuario(
    session: Session,
) -> None:
    """Um filtro de dono ausente mistura dias iguais e especiais alheias."""
    assert session.get(User, -11002) is None, "ID do outro dono ja usado"
    outro = User(id=-11002, display_name="Outro dono no teste do ciclo")
    session.add(outro)
    session.flush()
    _plano(session, 1)
    _plano(session, outro.id)
    hoje = SEGUNDA + timedelta(days=6)
    for indice in range(4, 7):
        _concluir(session, 1, SEGUNDA + timedelta(days=indice))
    for indice in range(7):
        _concluir(session, outro.id, SEGUNDA + timedelta(days=indice))
    propria = _diaria(session, 1, hoje)
    alheia = _diaria(session, outro.id, hoje)
    especial_alheia = session.scalars(
        select(Mission).where(
            Mission.user_id == outro.id,
            Mission.mission_type == MissionType.ESPECIAL,
        )
    ).one()

    ciclo = CycleRead.da_leitura(ler_ciclo(session, 1, clock=lambda: _meio_dia(hoje)))
    assert ciclo.mission is not None
    assert ciclo.mission.id == propria.id
    assert (ciclo.streak, ciclo.days_to_milestone, ciclo.special) == (3, 4, None)
    outro_ciclo = CycleRead.da_leitura(
        ler_ciclo(session, outro.id, clock=lambda: _meio_dia(hoje))
    )
    assert outro_ciclo.mission is not None
    assert outro_ciclo.mission.id == alheia.id
    assert (outro_ciclo.streak, outro_ciclo.days_to_milestone) == (7, 7)
    assert outro_ciclo.special is not None
    assert outro_ciclo.special.id == especial_alheia.id
    assert outro_ciclo.special.availability is Availability.DISPONIVEL


def test_snapshot_preserva_historico_antes_de_semana_sem_plano(
    session: Session,
) -> None:
    """Restringir a consulta a semana atual/anterior apaga a sequencia antiga.

    A semana sem plano e pulada; depois do prazo a especial some mesmo que
    nenhum plano mais novo exista. O marco da semana anterior segue visivel
    na segunda sem missao de hoje.
    """
    _plano(session, 1)
    for indice in range(7):
        _concluir(session, 1, SEGUNDA + timedelta(days=indice))
    especial_id = session.scalars(
        select(Mission.id).where(
            Mission.user_id == 1, Mission.mission_type == MissionType.ESPECIAL
        )
    ).one()
    primeira_sem_plano = SEGUNDA + timedelta(days=7)
    vigente = CycleRead.da_leitura(
        ler_ciclo(session, 1, clock=lambda: _meio_dia(primeira_sem_plano))
    )
    assert vigente.mission is None
    assert (vigente.streak, vigente.days_to_milestone) == (7, 7)
    assert vigente.special is not None
    assert vigente.special.id == especial_id
    segunda_sem_plano = SEGUNDA + timedelta(days=14)
    expirada = CycleRead.da_leitura(
        ler_ciclo(session, 1, clock=lambda: _meio_dia(segunda_sem_plano))
    )
    assert (expirada.mission, expirada.streak, expirada.special) == (None, 7, None)
    _plano(session, 1, segunda_sem_plano)
    _concluir(session, 1, segunda_sem_plano)
    depois = CycleRead.da_leitura(
        ler_ciclo(session, 1, clock=lambda: _meio_dia(segunda_sem_plano))
    )
    assert depois.mission is not None
    assert depois.mission.availability is Availability.CONCLUIDA
    assert (depois.streak, depois.days_to_milestone, depois.special) == (8, 6, None)


def test_snapshot_inclui_alteracoes_proprias_sem_commit_e_nao_muda_com_refresh(
    banco_migrado: Engine, usuario_commitado: int
) -> None:
    """Desligar autoflush perde valores pendentes; reutilizar ORM altera a
    leitura anterior quando o chamador conclui ou atualiza sua identidade.
    Um commit/sessao interna quebraria o isolamento e o rollback do chamador.
    """
    with Session(bind=banco_migrado, expire_on_commit=False) as preparo:
        _plano(preparo, usuario_commitado)
        mission_id = _diaria(preparo, usuario_commitado, SEGUNDA).id
        preparo.commit()
    agora = _meio_dia(SEGUNDA)
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        missao.instructions = "Conteudo proprio ainda nao commitado"
        missao.state = MissionState.EM_ANDAMENTO
        missao.started_at = agora - timedelta(minutes=20)
        assert missao in sessao.dirty
        transacao = sessao.get_transaction()
        assert transacao is not None
        lido = ler_ciclo(sessao, usuario_commitado, clock=lambda: agora)
        anterior = CycleRead.da_leitura(lido)
        assert anterior.mission is not None
        assert anterior.mission.instructions == "Conteudo proprio ainda nao commitado"
        assert anterior.mission.state is MissionState.EM_ANDAMENTO
        assert anterior.mission.started_at == agora - timedelta(minutes=20)
        assert (anterior.streak, anterior.days_to_milestone) == (0, 7)
        assert sessao.get_transaction() is transacao and transacao.is_active
        with Session(bind=banco_migrado) as outra:
            persistida = outra.get(Mission, mission_id)
            assert persistida is not None
            assert (
                persistida.instructions,
                persistida.state,
                persistida.started_at,
            ) == ("Diaria 0", MissionState.PENDENTE, None)
        _concluir(sessao, usuario_commitado, SEGUNDA)
        sessao.refresh(missao)
        sessao.expire_all()
        assert CycleRead.da_leitura(lido) == anterior
        atual = CycleRead.da_leitura(
            ler_ciclo(sessao, usuario_commitado, clock=lambda: agora)
        )
        assert atual.mission is not None
        assert atual.mission.state is MissionState.CONCLUIDA
        assert atual.mission.actual_duration_minutes == 20
        assert (atual.streak, atual.days_to_milestone, atual.special) == (1, 6, None)
        assert sessao.get_transaction() is transacao and transacao.is_active
        sessao.rollback()
    with Session(bind=banco_migrado) as verificacao:
        persistida = verificacao.get(Mission, mission_id)
        assert persistida is not None
        assert (
            persistida.instructions,
            persistida.state,
            persistida.started_at,
            persistida.completed_at,
        ) == ("Diaria 0", MissionState.PENDENTE, None, None)
        assert not verificacao.scalars(
            select(MissionOperation.id).where(MissionOperation.mission_id == mission_id)
        ).all()
        assert not verificacao.scalars(
            select(XpEntry.id).where(XpEntry.mission_id == mission_id)
        ).all()
        assert not verificacao.scalars(
            select(UserAchievement.code).where(
                UserAchievement.user_id == usuario_commitado
            )
        ).all()


@pytest.mark.parametrize("campo", ["mission", "late_daily", "special"])
def test_snapshot_preserva_entrega_e_avaliacao_das_missoes_do_ciclo(
    session: Session, campo: str
) -> None:
    """As copias devem conservar os dados do E, incluindo a tardia da F25.

    A leitura e um unico comando mesmo com entrega/avaliacao. Atualizar as
    identidades originais nao pode modificar o snapshot ja devolvido.
    """
    from focusquest.modules.missions.cycle_service import ler_missao
    from focusquest.modules.missions.domain import EstadoDaAvaliacao, Veredito
    from focusquest.modules.missions.models import MissionEvaluation
    from focusquest.modules.missions.schemas import MissionRead
    from focusquest.modules.missions.service import iniciar_missao

    _plano(session, 1)
    agora = _meio_dia(SEGUNDA)
    missao = _diaria(session, 1, SEGUNDA)
    if campo == "late_daily":
        iniciar_missao(session, 1, missao.id, "inicio-tardia", clock=lambda: agora)
        agora += timedelta(days=1)
    elif campo == "special":
        for indice in range(7):
            _concluir(session, 1, SEGUNDA + timedelta(days=indice))
        agora += timedelta(days=6)
        missao = session.scalars(
            select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
        ).one()
    concluir_missao(
        session,
        1,
        missao.id,
        f"com-evidencia-{missao.id}",
        clock=lambda: agora,
        evidencia=NovaEvidencia("Entrega original 🗡️", "https://example.com/evidencia"),
    )
    avaliacao = MissionEvaluation(
        mission_id=missao.id,
        state=EstadoDaAvaliacao.CONCLUIDA,
        attempt=1,
        verdict=Veredito.ATENDE,
        feedback="A entrega cumpre o criterio.",
        model="modelo-falso",
        requested_at=agora,
        finished_at=agora,
    )
    session.add(avaliacao)
    session.flush()
    session.expire(missao, ["evaluation"])
    esperado = MissionRead.da_leitura(ler_missao(session, missao, agora))
    assert esperado.evidence is not None and esperado.evaluation is not None

    comandos: list[str] = []

    def registrar(
        conexao: Connection,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: ExecutionContext,
        executemany: bool,
    ) -> None:
        comandos.append(statement)

    conexao = session.connection()
    event.listen(conexao, "after_cursor_execute", registrar)
    try:
        lido = ler_ciclo(session, 1, clock=lambda: agora)
        leitura = CycleRead.da_leitura(lido)
    finally:
        event.remove(conexao, "after_cursor_execute", registrar)
    assert len(comandos) == 1
    assert getattr(leitura, campo) == esperado
    assert not session.new and not session.dirty and not session.deleted

    assert missao.evidence is not None
    missao.evidence.text = "Entrega posteriormente modificada"
    avaliacao.feedback = "Feedback posteriormente modificado"
    session.flush()
    session.expire_all()
    assert CycleRead.da_leitura(lido) == leitura
    atual = getattr(
        CycleRead.da_leitura(ler_ciclo(session, 1, clock=lambda: agora)), campo
    )
    assert atual is not None and atual.evidence is not None
    assert atual.evidence.text == "Entrega posteriormente modificada"
    assert atual.evaluation is not None
    assert atual.evaluation.feedback == "Feedback posteriormente modificado"
