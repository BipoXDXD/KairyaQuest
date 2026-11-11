"""Saldo e conquistas refletem o mesmo instante, mesmo com conclusao concorrente."""

import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Connection, Engine, ExecutionContext, delete, event, select, text
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission, MissionOperation, User
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression.domain import PAINEL, Codigo, FaixaDoNivel
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.progression.service import Progresso, ler_progresso

AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)
SEGUNDOS_LIMITE = 30


def _avulsa(sessao: Session, user_id: int) -> Mission:
    return criar_missao(
        sessao,
        user_id=user_id,
        instructions="Estudar snapshots de leitura",
        completion_criterion="Resumo entregue",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )


@pytest.fixture
def usuario_commitado(banco_migrado: Engine) -> Iterator[int]:
    """Dono proprio: a limpeza nunca depende do saldo do usuario semeado."""
    with Session(bind=banco_migrado, expire_on_commit=False) as sessao:
        usuario = User(display_name="Teste de consistencia do progresso")
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
                select(MissionOperation.id).where(
                    MissionOperation.mission_id.in_(mission_ids)
                )
            ).all()
            assert not limpeza.scalars(
                select(Mission.id).where(Mission.user_id == user_id)
            ).all()
            assert not limpeza.scalars(
                select(XpEntry.id).where(XpEntry.user_id == user_id)
            ).all()
            assert not limpeza.scalars(
                select(UserAchievement.code).where(UserAchievement.user_id == user_id)
            ).all()


def test_conclusao_entre_leituras_nao_mistura_saldo_antigo_e_conquista_nova(
    banco_migrado: Engine, usuario_commitado: int
) -> None:
    """Restaurar os dois SELECTs falha por first_steps nova com saldo zero.

    O cursor ja executou o primeiro SELECT quando o escritor recebe o sinal.
    A barreira funciona tambem com a consulta unica: seu resultado inteiro
    ja pertence ao snapshot anterior. Nenhum sleep ou Session compartilhada.
    """
    with Session(bind=banco_migrado, expire_on_commit=False) as preparo:
        missao = _avulsa(preparo, usuario_commitado)
        preparo.commit()
        mission_id = missao.id
    operation_id = f"consistencia-{mission_id}"
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
            and "xp_entries" in statement
            and not leitura_efetuada.is_set()
        ):
            leitura_efetuada.set()
            assert escritor_finalizou.wait(SEGUNDOS_LIMITE), (
                "escritor nao terminou depois do snapshot do leitor"
            )

    def ler() -> tuple[Progresso, int]:
        with (
            banco_migrado.connect().execution_options(
                isolation_level="READ COMMITTED"
            ) as conexao,
            Session(bind=conexao) as leitor,
        ):
            leitor.execute(text("SET LOCAL statement_timeout = '30s'"))
            pid = leitor.scalars(text("SELECT pg_backend_pid()")).one()
            assert conexao.get_isolation_level() == "READ COMMITTED"
            prontos.wait()
            event.listen(conexao, "after_cursor_execute", pausar_apos_snapshot)
            try:
                return ler_progresso(leitor, usuario_commitado), pid
            finally:
                event.remove(conexao, "after_cursor_execute", pausar_apos_snapshot)

    def concluir() -> tuple[MissionState, int]:
        try:
            with (
                banco_migrado.connect().execution_options(
                    isolation_level="READ COMMITTED"
                ) as conexao,
                Session(bind=conexao) as escritor,
            ):
                escritor.execute(text("SET LOCAL statement_timeout = '30s'"))
                escritor.execute(text("SET LOCAL lock_timeout = '2s'"))
                pid = escritor.scalars(text("SELECT pg_backend_pid()")).one()
                prontos.wait()
                assert leitura_efetuada.wait(SEGUNDOS_LIMITE), (
                    "leitor nao estabeleceu o snapshot"
                )
                resultado = concluir_missao(
                    escritor,
                    usuario_commitado,
                    mission_id,
                    operation_id,
                    clock=lambda: AGORA,
                )
                estado = resultado.state
                escritor.commit()
                return estado, pid
        finally:
            # Libera o leitor tambem em erro; Future.result propaga a causa.
            escritor_finalizou.set()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futuro_leitor = executor.submit(ler)
        futuro_escritor = executor.submit(concluir)
        try:
            estado, pid_escritor = futuro_escritor.result(timeout=SEGUNDOS_LIMITE + 5)
            anterior, pid_leitor = futuro_leitor.result(timeout=SEGUNDOS_LIMITE + 5)
        finally:
            escritor_finalizou.set()
            leitura_efetuada.set()

    assert estado is MissionState.CONCLUIDA
    assert pid_leitor != pid_escritor
    # Prova de commit e persistencia, antes do oraculo que reprova no RED.
    with Session(bind=banco_migrado) as verificacao:
        persistida = verificacao.get(Mission, mission_id)
        assert persistida is not None
        assert persistida.state is MissionState.CONCLUIDA
        assert persistida.completed_at == AGORA
        operacao = verificacao.scalars(
            select(MissionOperation).where(MissionOperation.mission_id == mission_id)
        ).one()
        assert (operacao.operation_id, operacao.kind) == (operation_id, "complete")
        entrada = verificacao.scalars(
            select(XpEntry).where(XpEntry.mission_id == mission_id)
        ).one()
        assert (entrada.user_id, entrada.amount, entrada.credited_at) == (
            usuario_commitado,
            40,
            AGORA,
        )
        conquista = verificacao.scalars(
            select(UserAchievement).where(UserAchievement.user_id == usuario_commitado)
        ).one()
        assert (conquista.code, conquista.unlocked_at, conquista.xp_entry_id) == (
            "first_steps",
            AGORA,
            entrada.id,
        )
        atual = ler_progresso(verificacao, usuario_commitado)
        assert atual.xp_total == 40
        assert atual.faixa == FaixaDoNivel(1, 0, 100)
        assert [c.unlocked_at for c in atual.conquistas] == [
            AGORA,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        ]

    assert anterior.xp_total == 0
    assert anterior.faixa == FaixaDoNivel(1, 0, 100)
    assert [c.conquista for c in anterior.conquistas] == list(PAINEL)
    assert all(c.unlocked_at is None for c in anterior.conquistas), anterior


def _lancamento(sessao: Session, user_id: int, amount: int) -> XpEntry:
    """Estado permitido pelo schema, inclusive XP ainda sem conquista."""
    missao = _avulsa(sessao, user_id)
    entrada = XpEntry(
        user_id=user_id,
        mission_id=missao.id,
        amount=amount,
        source="mission_completed",
        credited_at=AGORA,
    )
    sessao.add(entrada)
    sessao.flush()
    return entrada


@pytest.mark.parametrize("saldo", [0, 40])
def test_saldo_sem_conquistas_preserva_o_catalogo(session: Session, saldo: int) -> None:
    """INNER JOIN ou filtro externo de conquista perderiam estes estados."""
    if saldo:
        _lancamento(session, 1, saldo)
    progresso = ler_progresso(session, 1)
    assert progresso.xp_total == saldo
    assert progresso.faixa == FaixaDoNivel(1, 0, 100)
    assert [c.conquista for c in progresso.conquistas] == list(PAINEL)
    assert [c.unlocked_at for c in progresso.conquistas] == [None] * len(PAINEL)


def test_varios_lancamentos_e_conquistas_nao_multiplicam_o_saldo(
    session: Session,
) -> None:
    """Somar apos juntar ao catalogo daria 360, em vez de 40 + 80."""
    primeira = _lancamento(session, 1, 40)
    segunda = _lancamento(session, 1, 80)
    datas = [AGORA, AGORA + timedelta(days=1), AGORA + timedelta(days=2)]
    # A ordem de insercao difere da do catalogo, que e a ordem publica.
    for codigo, data, entrada in [
        (Codigo.VETERAN_10, datas[2], segunda),
        (Codigo.STREAK_7, datas[1], segunda),
        (Codigo.FIRST_STEPS, datas[0], primeira),
    ]:
        session.add(
            UserAchievement(
                user_id=1, code=codigo.value, unlocked_at=data, xp_entry_id=entrada.id
            )
        )
    session.flush()
    progresso = ler_progresso(session, 1)
    assert progresso.xp_total == 120
    assert progresso.faixa == FaixaDoNivel(2, 100, 300)
    assert [c.conquista for c in progresso.conquistas] == list(PAINEL)
    assert [c.unlocked_at for c in progresso.conquistas] == [
        datas[0],
        datas[1],
        None,
        datas[2],
        None,
        None,
        None,
        None,
        None,
        None,
    ]


def test_leitura_filtra_saldo_e_conquistas_do_outro_usuario(session: Session) -> None:
    """Remover qualquer filtro de dono vazaria saldo ou datas alheias."""
    outro = User(display_name="Outra pessoa na regressao de leitura")
    session.add(outro)
    session.flush()
    propria = _lancamento(session, 1, 40)
    alheia = _lancamento(session, outro.id, 220)
    session.add_all(
        [
            UserAchievement(
                user_id=1,
                code="first_steps",
                unlocked_at=AGORA,
                xp_entry_id=propria.id,
            ),
            UserAchievement(
                user_id=outro.id,
                code="streak_30",
                unlocked_at=AGORA + timedelta(days=1),
                xp_entry_id=alheia.id,
            ),
        ]
    )
    session.flush()
    progresso = ler_progresso(session, 1)
    assert progresso.xp_total == 40
    assert progresso.faixa == FaixaDoNivel(1, 0, 100)
    assert [c.unlocked_at for c in progresso.conquistas] == [
        AGORA,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ]
    progresso_alheio = ler_progresso(session, outro.id)
    assert progresso_alheio.xp_total == 220
    assert progresso_alheio.faixa == FaixaDoNivel(2, 100, 300)
    assert [c.unlocked_at for c in progresso_alheio.conquistas] == [
        None,
        None,
        AGORA + timedelta(days=1),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ]


def test_leitura_ve_as_proprias_alteracoes_sem_commitar_ou_alterar_o_estado(
    banco_migrado: Engine, usuario_commitado: int
) -> None:
    """Uma Session nova/commit interno perderia a fronteira do chamador."""
    with Session(bind=banco_migrado) as sessao:
        missao = _avulsa(sessao, usuario_commitado)
        mission_id = missao.id
        operation_id = f"leitura-sem-commit-{mission_id}"
        concluir_missao(
            sessao, usuario_commitado, mission_id, operation_id, clock=lambda: AGORA
        )
        transacao = sessao.get_transaction()
        assert transacao is not None
        antes = (
            sessao.execute(
                select(Mission.state, Mission.completed_at).where(
                    Mission.id == mission_id
                )
            ).all(),
            sessao.execute(
                select(XpEntry.amount, XpEntry.credited_at).where(
                    XpEntry.user_id == usuario_commitado
                )
            ).all(),
            sessao.execute(
                select(UserAchievement.code, UserAchievement.unlocked_at).where(
                    UserAchievement.user_id == usuario_commitado
                )
            ).all(),
        )
        progresso = ler_progresso(sessao, usuario_commitado)
        assert progresso.xp_total == 40
        assert [c.unlocked_at for c in progresso.conquistas] == [
            AGORA,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        ]
        assert sessao.get_transaction() is transacao
        assert transacao.is_active
        depois = (
            sessao.execute(
                select(Mission.state, Mission.completed_at).where(
                    Mission.id == mission_id
                )
            ).all(),
            sessao.execute(
                select(XpEntry.amount, XpEntry.credited_at).where(
                    XpEntry.user_id == usuario_commitado
                )
            ).all(),
            sessao.execute(
                select(UserAchievement.code, UserAchievement.unlocked_at).where(
                    UserAchievement.user_id == usuario_commitado
                )
            ).all(),
        )
        assert depois == antes
        with Session(bind=banco_migrado) as outra:
            assert outra.get(Mission, mission_id) is None
            assert ler_progresso(outra, usuario_commitado).xp_total == 0
            assert not outra.scalars(
                select(UserAchievement.code).where(
                    UserAchievement.user_id == usuario_commitado
                )
            ).all()
        sessao.rollback()
    with Session(bind=banco_migrado) as depois_do_rollback:
        assert depois_do_rollback.get(Mission, mission_id) is None
        assert not depois_do_rollback.scalars(
            select(MissionOperation.id).where(
                MissionOperation.operation_id == operation_id
            )
        ).all()
        assert ler_progresso(depois_do_rollback, usuario_commitado).xp_total == 0
        assert not depois_do_rollback.scalars(
            select(UserAchievement.code).where(
                UserAchievement.user_id == usuario_commitado
            )
        ).all()
