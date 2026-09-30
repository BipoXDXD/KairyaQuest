"""O credito da progressao sob concorrencia real: conexoes e commits de verdade.

Segue o padrao de `test_missions_concorrencia.py`: a fixture `session` prende
tudo numa transacao so, e duas threads nela nao disputam nada -- cada teste
aqui abre a propria conexao e commita de verdade. `threading.Barrier` faz as
threads partirem juntas, e `sessao.connection()` ANTES da barreira e o que
torna a largada real (mesmo motivo do modulo de missoes).
"""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from focusquest.core.clock import system_now
from focusquest.modules.missions.domain import MissionState, MissionType, xp_da_missao
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression import service as progression_service
from focusquest.modules.progression.domain import Codigo
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.progression.service import registrar_conclusao

# O usuario unico semeado pela migracao (README s8). Repetido, e nao
# importado de outro modulo de teste, pelo mesmo motivo de
# `test_missions_concorrencia.py`.
ESTUDANTE = 1
AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)

SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"


@contextmanager
def _missao_commitada(engine: Engine, *, dificuldade: int = 2) -> Iterator[int]:
    """Cria uma missao REALMENTE commitada e a apaga ao sair.

    A limpeza apaga so a missao criada aqui; `ON DELETE CASCADE` leva junto
    o lancamento de XP e as conquistas que essa missao tiver gerado.
    """
    with Session(bind=engine) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo entregue",
            difficulty=dificuldade,
            estimated_minutes=30,
            deadline=datetime.now(UTC) + timedelta(days=1),
        )
        sessao.commit()
        mission_id = missao.id

    try:
        yield mission_id
    finally:
        with Session(bind=engine) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


@pytest.fixture
def missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    with _missao_commitada(banco_migrado) as mission_id:
        yield mission_id


@pytest.fixture
def outra_missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    with _missao_commitada(banco_migrado) as mission_id:
        yield mission_id


def _concluir_em_paralelo(
    engine: Engine, tentativas: list[tuple[int, str]]
) -> list[str]:
    barreira = threading.Barrier(len(tentativas), timeout=SEGUNDOS_LIMITE)
    resultados: list[str | None] = [None] * len(tentativas)

    def tentar(indice: int, mission_id: int, operation_id: str) -> None:
        with Session(bind=engine) as sessao:
            # Sem esta linha a largada e falsa (ver test_missions_concorrencia.py).
            sessao.connection()
            barreira.wait()
            concluir_missao(
                sessao, ESTUDANTE, mission_id, operation_id, clock=system_now
            )
            sessao.commit()
            resultados[indice] = "concluiu"

    threads = [
        threading.Thread(target=tentar, args=(i, mission_id, operation_id))
        for i, (mission_id, operation_id) in enumerate(tentativas)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "thread travada: houve espera circular"

    assert None not in resultados, f"alguma thread morreu sem resultado: {resultados}"
    return [resultado for resultado in resultados if resultado is not None]


def test_duas_primeiras_conclusoes_em_paralelo_destravam_uma_conquista(
    banco_migrado: Engine, missao_commitada: int, outra_missao_commitada: int
) -> None:
    """As duas primeiras missoes da vida, concluidas em paralelo.

    As duas ganham XP, `first_steps` existe uma vez so (a restricao
    `pk_user_achievements` garante), e nenhuma das duas explode.
    """
    resultados = _concluir_em_paralelo(
        banco_migrado,
        [(missao_commitada, "op-a"), (outra_missao_commitada, "op-b")],
    )
    assert resultados == ["concluiu", "concluiu"]

    with Session(bind=banco_migrado) as sessao:
        lancamentos = sessao.scalar(
            select(func.count())
            .select_from(XpEntry)
            .where(XpEntry.mission_id.in_([missao_commitada, outra_missao_commitada]))
        )
        assert lancamentos == 2

        conquistas = sessao.scalars(
            select(UserAchievement).where(
                UserAchievement.user_id == ESTUDANTE,
                UserAchievement.code == Codigo.FIRST_STEPS.value,
            )
        ).all()
        assert len(conquistas) == 1

        ids_dos_lancamentos = set(
            sessao.scalars(
                select(XpEntry.id).where(
                    XpEntry.mission_id.in_([missao_commitada, outra_missao_commitada])
                )
            )
        )
        assert conquistas[0].xp_entry_id in ids_dos_lancamentos


def test_falha_no_credito_desfaz_a_conclusao_e_o_reenvio_funciona(
    banco_migrado: Engine, missao_commitada: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """O banco falha no meio do credito.

    A primeira chamada de `_inserir_lancamento` levanta `OperationalError`
    (simula uma falha real do banco durante o credito, ja dentro da mesma
    transacao da conclusao). A missao nao pode ficar `concluida` sem
    lancamento -- e o reenvio, com a MESMA chave, tem de conseguir concluir e
    creditar depois.
    """
    original = progression_service._inserir_lancamento
    chamadas = {"n": 0}

    def _falha_na_primeira(
        sessao: Session, missao: Mission, agora: datetime
    ) -> XpEntry:
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            raise OperationalError(
                "insert into xp_entries", {}, Exception("falha simulada")
            )
        return original(sessao, missao, agora)

    monkeypatch.setattr(progression_service, "_inserir_lancamento", _falha_na_primeira)

    with Session(bind=banco_migrado) as sessao, pytest.raises(OperationalError):
        concluir_missao(
            sessao, ESTUDANTE, missao_commitada, "op-1", clock=lambda: AGORA
        )

    with Session(bind=banco_migrado) as verificacao:
        missao = verificacao.get(Mission, missao_commitada)
        assert missao is not None
        assert missao.state is MissionState.PENDENTE
        assert (
            verificacao.scalar(
                select(func.count())
                .select_from(XpEntry)
                .where(XpEntry.mission_id == missao_commitada)
            )
            == 0
        )
        assert (
            verificacao.scalar(
                select(func.count())
                .select_from(MissionOperation)
                .where(MissionOperation.mission_id == missao_commitada)
            )
            == 0
        )

    with Session(bind=banco_migrado) as sessao2:
        resultado = concluir_missao(
            sessao2, ESTUDANTE, missao_commitada, "op-1", clock=lambda: AGORA
        )
        sessao2.commit()
        assert resultado.state is MissionState.CONCLUIDA

    with Session(bind=banco_migrado) as verificacao2:
        entrada = verificacao2.scalars(
            select(XpEntry).where(XpEntry.mission_id == missao_commitada)
        ).one()
        assert entrada.amount == xp_da_missao(MissionType.AVULSA, 2)


def test_a_trava_do_usuario_e_tomada(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A prova do mecanismo (P2): `FOR SHARE` e o modo discriminante.

    `FOR SHARE`, numa conexao a parte, conflita com o `FOR NO KEY UPDATE` que
    `_travar_usuario` emite -- e nao conflita com o `FOR KEY SHARE` que todo
    INSERT com FK para `users` toma. Sem a trava, `registrar_conclusao`
    passaria reto e este teste ficaria vermelho.
    """
    with banco_migrado.connect() as dono_da_trava:
        dono_da_trava.execute(
            text("SELECT id FROM users WHERE id = :id FOR SHARE"), {"id": ESTUDANTE}
        )

        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            missao = sessao.get(Mission, missao_commitada)
            assert missao is not None
            missao.state = MissionState.CONCLUIDA
            missao.completed_at = AGORA

            with pytest.raises(OperationalError) as excecao:
                registrar_conclusao(sessao, missao, AGORA)
            sessao.rollback()

        assert isinstance(excecao.value.orig, psycopg.errors.LockNotAvailable)
