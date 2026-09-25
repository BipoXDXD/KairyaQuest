"""A conclusao concorrente perto da meia-noite (spec, "Testes", integracao).

Duas conexoes disputam a diaria de quarta com relogios dos dois lados da
meia-noite de Sao Paulo. Qualquer que seja a ordem do escalonador, o
resultado tem de ser UMA conclusao: se a das 23:59:59 trava primeiro, ela
conclui e a outra recebe `transicao_ilegal`; se a das 00:00:01 trava
primeiro, ela recebe `missao_expirada` e a outra conclui.
"""

import threading
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.missions.service import concluir_missao

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"
ANTES = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)
DEPOIS = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)


@pytest.fixture
def diaria_de_quarta(banco_migrado: Engine) -> Iterator[int]:
    """Plano REALMENTE commitado; apagado ao sair, mesmo com o teste vermelho."""
    with Session(bind=banco_migrado) as sessao:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=SEGUNDA,
            diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
            especial=NovaEspecial("E", "c", 60),
            clock=lambda: datetime(2026, 9, 23, 15, tzinfo=UTC),
        )
        sessao.commit()
        plano_id = sessao.scalars(select(WeeklyPlan.id)).one()
        mission_id = sessao.scalars(
            select(Mission.id).where(
                Mission.mission_type == MissionType.DIARIA, Mission.day == QUARTA
            )
        ).one()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.plan_id == plano_id))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            sessao.commit()


def test_conclusao_concorrente_na_virada_do_dia_conclui_uma_vez(
    banco_migrado: Engine, diaria_de_quarta: int
) -> None:
    barreira = threading.Barrier(2, timeout=SEGUNDOS_LIMITE)
    resultados: dict[str, object] = {}

    def concluir(nome: str, instante: datetime) -> None:
        with Session(bind=banco_migrado) as sessao:
            # Conexao aberta ANTES da barreira: sem isso a largada e falsa
            # (ver `test_missions_concorrencia.py`).
            sessao.connection()
            barreira.wait()
            try:
                concluir_missao(
                    sessao,
                    ESTUDANTE,
                    diaria_de_quarta,
                    f"op-{nome}",
                    clock=lambda: instante,
                )
                sessao.commit()
                resultados[nome] = "ok"
            except (TransicaoIlegalError, MissaoExpiradaError) as erro:
                sessao.rollback()
                resultados[nome] = type(erro)

    threads = [
        threading.Thread(target=concluir, args=("antes", ANTES)),
        threading.Thread(target=concluir, args=("depois", DEPOIS)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(SEGUNDOS_LIMITE)
        assert not thread.is_alive()

    assert list(resultados.values()).count("ok") == 1
    assert resultados["antes"] == "ok" or resultados["depois"] == "ok"
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, diaria_de_quarta)
        assert missao is not None
        assert missao.state is MissionState.CONCLUIDA
        assert (
            sessao.scalar(
                select(func.count())
                .select_from(MissionOperation)
                .where(MissionOperation.mission_id == diaria_de_quarta)
            )
            == 1
        )
