"""A leitura e serializacao da trilha nao pagam uma consulta por missao (166)."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from functools import partial
from typing import Any

import pytest
from sqlalchemy import Connection, event, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.cycle_schemas import PlanRead
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
    ler_plano_atual,
)
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    MissionState,
    MissionType,
    Veredito,
    Verificacao,
)
from focusquest.modules.missions.models import Mission, MissionEvaluation
from focusquest.modules.missions.service import NovaEvidencia, concluir_missao

SEGUNDA = date(2026, 9, 21)
ESTUDANTE = 1
# Plano, missoes, historico e uma consulta por relacao (entrega/avaliacao/prazos).
CONSULTAS_DA_TRILHA = 6


def _meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


@contextmanager
def _contando_consultas(conexao: Connection) -> Iterator[list[str]]:
    consultas: list[str] = []

    def registrar(*args: Any) -> None:
        consultas.append(args[2])

    event.listen(conexao, "before_cursor_execute", registrar)
    try:
        yield consultas
    finally:
        event.remove(conexao, "before_cursor_execute", registrar)


def _preparar(session: Session, domingo: bool) -> tuple[list[int], int]:
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=SEGUNDA,
        diarias=[NovaDiaria(f"Diaria {i}", f"Resumo {i}", 2, 30) for i in range(7)],
        especial=NovaEspecial("Prova semanal", "Resumo da semana", 120),
        clock=lambda: _meio_dia(SEGUNDA),
    )
    diarias = list(
        session.scalars(
            select(Mission)
            .where(Mission.mission_type == MissionType.DIARIA)
            .order_by(Mission.day)
        )
    )
    especial = session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)
    ).one()
    ids = [missao.id for missao in diarias]
    especial_id = especial.id
    if domingo:
        for indice, missao in enumerate(diarias):
            agora = _meio_dia(SEGUNDA + timedelta(days=indice))
            concluir_missao(
                session,
                ESTUDANTE,
                missao.id,
                f"plano-consultas-{indice}",
                clock=partial(_meio_dia, SEGUNDA + timedelta(days=indice)),
                evidencia=NovaEvidencia(f"Entrega {indice}", None),
            )
            if indice < 2:
                session.add(
                    MissionEvaluation(
                        mission_id=missao.id,
                        state=EstadoDaAvaliacao.CONCLUIDA,
                        attempt=1,
                        verdict=Veredito.ATENDE if indice == 0 else Veredito.NAO_ATENDE,
                        feedback=f"Feedback {indice}",
                        model="modelo-falso",
                        requested_at=agora,
                        finished_at=agora,
                    )
                )
    session.flush()
    # Uma leitura nova nao herda as relacoes carregadas ao criar/concluir.
    session.expunge_all()
    return ids, especial_id


@pytest.mark.parametrize("domingo", [False, True], ids=["segunda", "domingo"])
def test_leitura_e_serializacao_da_trilha_custam_seis_consultas(
    session: Session, domingo: bool
) -> None:
    ids, especial_id = _preparar(session, domingo)
    hoje = SEGUNDA + timedelta(days=6 if domingo else 0)
    conexao = session.connection()
    with _contando_consultas(conexao) as consultas:
        lido = ler_plano_atual(session, ESTUDANTE, clock=lambda: _meio_dia(hoje))
        assert lido is not None
        publicado = PlanRead.da_leitura(lido)
        publicado.model_dump(mode="json")

    assert publicado.week_start == SEGUNDA
    assert [dia.day for dia in publicado.days] == [
        SEGUNDA + timedelta(days=i) for i in range(7)
    ]
    reveladas = [dia.mission for dia in publicado.days if dia.mission is not None]
    assert [missao.id for missao in reveladas] == (ids if domingo else ids[:1])
    assert [missao.instructions for missao in reveladas] == [
        f"Diaria {i}" for i in range(7 if domingo else 1)
    ]
    assert [missao.deadline for missao in reveladas] == [
        datetime(2026, 9, 22, 3, tzinfo=UTC) + timedelta(days=i)
        for i in range(7 if domingo else 1)
    ]
    assert all(missao.reschedules == [] for missao in reveladas)

    if domingo:
        assert [dia.availability for dia in publicado.days] == [
            Availability.CONCLUIDA
        ] * 7
        assert all(missao.state is MissionState.CONCLUIDA for missao in reveladas)
        assert all(
            missao.verification is Verificacao.COM_EVIDENCIA for missao in reveladas
        )
        assert [missao.evidence.text for missao in reveladas if missao.evidence] == [
            f"Entrega {i}" for i in range(7)
        ]
        assert [
            missao.evaluation.feedback if missao.evaluation else None
            for missao in reveladas
        ] == ["Feedback 0", "Feedback 1", None, None, None, None, None]
        assert [
            missao.evaluation.verdict for missao in reveladas if missao.evaluation
        ] == [Veredito.ATENDE, Veredito.NAO_ATENDE]
        assert publicado.special.availability is Availability.DISPONIVEL
        assert publicado.special.progress == 0
        especial = publicado.special.mission
        assert especial is not None and especial.id == especial_id
        assert especial.instructions == "Prova semanal"
        assert especial.deadline == datetime(2026, 9, 29, 3, tzinfo=UTC)
        assert especial.state is MissionState.PENDENTE
        assert especial.verification is None
        assert especial.evidence is None and especial.evaluation is None
        assert especial.reschedules == []
    else:
        assert [dia.availability for dia in publicado.days] == [
            Availability.DISPONIVEL,
            *([Availability.BLOQUEADA] * 6),
        ]
        assert all(dia.mission is None for dia in publicado.days[1:])
        (primeira,) = reveladas
        assert primeira.state is MissionState.PENDENTE
        assert primeira.verification is None
        assert primeira.evidence is None and primeira.evaluation is None
        assert publicado.special.availability is Availability.BLOQUEADA
        assert publicado.special.progress == 0
        assert publicado.special.mission is None

    assert not session.new and not session.dirty and not session.deleted
    assert len(consultas) == CONSULTAS_DA_TRILHA, consultas
