"""As restricoes de `mission_evidence` e `mission_evaluations` dizendo nao,
uma por INSERT, cada uma pelo nome (padrao de `test_cycle_models.py`)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import MetaData, UniqueConstraint, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    Veredito,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvaluation,
    MissionEvidence,
)
from focusquest.modules.missions.service import criar_missao
from focusquest.modules.progression.models import XpEntry

ESTUDANTE = 1
AGORA = datetime(2026, 9, 28, 15, tzinfo=UTC)


@pytest.fixture
def missao_id(session: Session) -> int:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=3,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    return missao.id


def _recusa(
    session: Session, sql: str, parametros: dict[str, object], nome: str
) -> None:
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(text(sql), parametros)
    assert nome in str(erro.value.orig)


_EVIDENCIA = (
    "INSERT INTO mission_evidence (mission_id, text, link, submitted_at) "
    "VALUES (:m, :t, :l, :s)"
)


@pytest.mark.parametrize(
    ("texto", "link", "nome"),
    [
        pytest.param("", None, "ck_mission_evidence_text", id="texto-vazio"),
        pytest.param(
            "x" * 4001, None, "ck_mission_evidence_text", id="texto-4001-caracteres"
        ),
        pytest.param(
            "ok", "ftp://exemplo.com", "ck_mission_evidence_link", id="link-ftp"
        ),
        pytest.param(
            "ok",
            "https://" + "a" * 1993,
            "ck_mission_evidence_link",
            id="link-2001-caracteres",
        ),
        pytest.param("ok", "https://", "ck_mission_evidence_link", id="link-sem-host"),
        pytest.param(
            "ok", "https://a b", "ck_mission_evidence_link", id="link-com-espaco"
        ),
    ],
)
def test_evidencia_recusada(
    session: Session, missao_id: int, texto: str, link: str | None, nome: str
) -> None:
    _recusa(
        session, _EVIDENCIA, {"m": missao_id, "t": texto, "l": link, "s": AGORA}, nome
    )


@pytest.mark.parametrize("link", [None, "https://exemplo.com", "HTTPS://Exemplo.com/x"])
def test_evidencia_aceita(session: Session, missao_id: int, link: str | None) -> None:
    session.execute(
        text(_EVIDENCIA), {"m": missao_id, "t": "x" * 4000, "l": link, "s": AGORA}
    )


def test_evidencia_aceita_o_link_de_2000_caracteres(
    session: Session, missao_id: int
) -> None:
    session.execute(
        text(_EVIDENCIA),
        {"m": missao_id, "t": "ok", "l": "https://" + "a" * 1992, "s": AGORA},
    )


_AVALIACAO = (
    "INSERT INTO mission_evaluations (mission_id, state, attempt, verdict, feedback, "
    "error_code, model, requested_at, finished_at) "
    "VALUES (:m, :st, :a, :v, :f, :e, 'claude-opus-5', :r, :fim)"
)


@pytest.mark.parametrize(
    ("campos", "nome"),
    [
        ({"st": "pensando", "fim": AGORA}, "ck_mission_evaluations_state"),
        ({"a": 0}, "ck_mission_evaluations_attempt"),
        (
            {"st": "concluida", "v": "otimo", "f": "ok", "fim": AGORA},
            "ck_mission_evaluations_verdict",
        ),
        (
            {"st": "falhou", "e": "desconhecida", "fim": AGORA},
            "ck_mission_evaluations_error_code",
        ),
        (
            {"st": "concluida", "v": "atende", "f": "", "fim": AGORA},
            "ck_mission_evaluations_feedback",
        ),
        (
            {"st": "concluida", "v": None, "f": "ok", "fim": AGORA},
            "ck_mission_evaluations_concluida_com_veredito",
        ),
        (
            {"st": "falhou", "e": None, "fim": AGORA},
            "ck_mission_evaluations_falha_com_codigo",
        ),
        ({"st": "avaliando", "fim": AGORA}, "ck_mission_evaluations_avaliando_sem_fim"),
        # A outra metade de cada CHECK biconditional: o campo preenchido em
        # estado que nao o admite. Uma implicacao simples deixaria todos passarem.
        pytest.param(
            {"st": "avaliando", "v": "atende", "f": "ok"},
            "ck_mission_evaluations_concluida_com_veredito",
            id="avaliando-com-veredito",
        ),
        pytest.param(
            {
                "st": "falhou",
                "v": "atende",
                "f": "ok",
                "e": "tempo_esgotado",
                "fim": AGORA,
            },
            "ck_mission_evaluations_concluida_com_veredito",
            id="falhou-com-veredito",
        ),
        pytest.param(
            {"st": "concluida", "v": "atende", "f": None, "fim": AGORA},
            "ck_mission_evaluations_concluida_com_veredito",
            id="concluida-com-veredito-sem-feedback",
        ),
        pytest.param(
            {
                "st": "concluida",
                "v": "atende",
                "f": "ok",
                "e": "tempo_esgotado",
                "fim": AGORA,
            },
            "ck_mission_evaluations_falha_com_codigo",
            id="concluida-com-codigo",
        ),
        pytest.param(
            {"st": "avaliando", "e": "tempo_esgotado"},
            "ck_mission_evaluations_falha_com_codigo",
            id="avaliando-com-codigo",
        ),
        pytest.param(
            {"st": "concluida", "v": "atende", "f": "ok", "fim": None},
            "ck_mission_evaluations_avaliando_sem_fim",
            id="concluida-sem-fim",
        ),
        pytest.param(
            {"st": "falhou", "e": "tempo_esgotado", "fim": None},
            "ck_mission_evaluations_avaliando_sem_fim",
            id="falhou-sem-fim",
        ),
        pytest.param(
            {"st": "concluida", "v": "atende", "f": "x" * 1501, "fim": AGORA},
            "ck_mission_evaluations_feedback",
            id="feedback-1501",
        ),
    ],
)
def test_avaliacao_recusada(
    session: Session, missao_id: int, campos: dict[str, object], nome: str
) -> None:
    base: dict[str, object] = {
        "m": missao_id,
        "st": "avaliando",
        "a": 1,
        "v": None,
        "f": None,
        "e": None,
        "r": AGORA,
        "fim": None,
    }
    _recusa(session, _AVALIACAO, base | campos, nome)


@pytest.mark.parametrize(
    "campos",
    [
        pytest.param({}, id="avaliando"),
        pytest.param(
            {"st": "concluida", "v": "parcial", "f": "x" * 1500, "fim": AGORA},
            id="concluida-feedback-1500",
        ),
        pytest.param(
            {"st": "falhou", "e": "avaliacao_invalida", "fim": AGORA}, id="falhou"
        ),
    ],
)
def test_avaliacao_aceita(
    session: Session, missao_id: int, campos: dict[str, object]
) -> None:
    """Os tres estados legitimos e a borda de 1500: os CHECKs nao recusam o
    que e valido."""
    base: dict[str, object] = {
        "m": missao_id,
        "st": "avaliando",
        "a": 1,
        "v": None,
        "f": None,
        "e": None,
        "r": AGORA,
        "fim": None,
    }
    session.execute(text(_AVALIACAO), base | campos)


def test_uma_avaliacao_por_missao(session: Session, missao_id: int) -> None:
    base = {
        "m": missao_id,
        "st": "avaliando",
        "a": 1,
        "v": None,
        "f": None,
        "e": None,
        "r": AGORA,
        "fim": None,
    }
    session.execute(text(_AVALIACAO), base)
    _recusa(session, _AVALIACAO, base, "uq_mission_evaluations_mission_id")


def _checks(session: Session, tabela: str) -> dict[str, str]:
    linhas = session.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE contype = 'c' AND conrelid = CAST(:tabela AS regclass)"
        ),
        {"tabela": tabela},
    ).all()
    return {nome: definicao for nome, definicao in linhas}


@pytest.mark.parametrize(
    "tabela",
    [
        "mission_evidence",
        "mission_evaluations",
        "xp_entries",
        # Incremento F: os CHECKs de `reason`, `origin` e `kind` DERIVAM dos
        # enums no modelo, e a 0006 tem copias congeladas. Um membro novo no
        # enum sem migracao descreveria um CHECK que o banco nao tem.
        "mission_operations",
        "mission_reschedules",
    ],
)
def test_o_modelo_descreve_os_mesmos_checks_que_a_migracao(
    session: Session, tabela: str
) -> None:
    """O PostgreSQL descreve a tabela do modelo e a da migracao, e as duas
    descricoes tem de bater (mesmo espelho de `test_tutoring_models.py`).
    `mission_operations` entra tambem como alvo: o historico de prazos tem FK
    para ela."""
    metadados = MetaData()
    for alvo in ("users", "missions", "mission_operations"):
        Mission.metadata.tables[alvo].to_metadata(metadados)
    espelho = Mission.metadata.tables[tabela].to_metadata(
        metadados, name=f"espelho_{tabela}"
    )
    espelho.indexes.clear()
    # O indice que sustenta uma UNIQUE tem nome unico no SCHEMA inteiro e
    # colidiria com o da tabela real; `_checks` olha so CHECK, entao tirar as
    # UNIQUE do espelho nao tira nada do que e comparado.
    for restricao in list(espelho.constraints):
        if isinstance(restricao, UniqueConstraint):
            espelho.constraints.discard(restricao)
    espelho.create(session.connection())
    assert _checks(session, f"espelho_{tabela}") == _checks(session, tabela)


def test_o_modelo_do_livro_razao_descreve_a_unicidade_da_migracao(
    session: Session,
) -> None:
    """O espelho de CHECKs acima nao olha UNIQUE; a unicidade do E14 tem o
    seu proprio confronto entre o modelo e o banco migrado."""
    no_banco = {
        u["name"]: tuple(u["column_names"])
        for u in inspect(session.connection()).get_unique_constraints("xp_entries")
    }
    no_modelo = {
        c.name: tuple(col.name for col in c.columns)
        for c in XpEntry.metadata.tables["xp_entries"].constraints
        if isinstance(c, UniqueConstraint)
    }
    assert (
        no_modelo
        == no_banco
        == {"uq_xp_entries_mission_id_source": ("mission_id", "source")}
    )


def _avaliacao(missao_id: int, **campos: object) -> MissionEvaluation:
    base: dict[str, object] = {
        "mission_id": missao_id,
        "state": EstadoDaAvaliacao.AVALIANDO,
        "attempt": 1,
        "model": "claude-opus-5",
        "requested_at": AGORA,
    }
    return MissionEvaluation(**(base | campos))


def test_estado_veredito_e_falha_voltam_do_banco_como_enum(
    session: Session, missao_id: int
) -> None:
    concluida = _avaliacao(
        missao_id,
        state=EstadoDaAvaliacao.CONCLUIDA,
        verdict=Veredito.PARCIAL,
        feedback="Falta o segundo criterio.",
        finished_at=AGORA,
    )
    session.add(concluida)
    session.flush()
    session.expire(concluida)
    assert concluida.state is EstadoDaAvaliacao.CONCLUIDA
    assert concluida.verdict is Veredito.PARCIAL
    assert concluida.error_code is None

    session.delete(concluida)
    session.flush()
    falhou = _avaliacao(
        missao_id,
        state=EstadoDaAvaliacao.FALHOU,
        error_code=FalhaDaAvaliacao.TEMPO_ESGOTADO,
        finished_at=AGORA,
    )
    session.add(falhou)
    session.flush()
    session.expire(falhou)
    assert falhou.error_code is FalhaDaAvaliacao.TEMPO_ESGOTADO
    assert falhou.verdict is None


def test_a_missao_enxerga_a_evidencia_e_a_avaliacao_e_apagar_leva_as_duas(
    session: Session, missao_id: int
) -> None:
    missao = session.get_one(Mission, missao_id)
    assert missao.evidence is None
    assert missao.evaluation is None

    missao.evidence = MissionEvidence(text="feito", link=None, submitted_at=AGORA)
    missao.evaluation = _avaliacao(missao_id)
    session.flush()
    session.expire(missao)
    assert missao.evidence is not None
    assert missao.evidence.text == "feito"
    assert missao.evaluation is not None
    assert missao.evaluation.state is EstadoDaAvaliacao.AVALIANDO

    session.delete(missao)
    session.flush()
    restam = session.execute(
        text(
            "SELECT (SELECT count(*) FROM mission_evidence WHERE mission_id = :m), "
            "(SELECT count(*) FROM mission_evaluations WHERE mission_id = :m)"
        ),
        {"m": missao_id},
    ).one()
    assert tuple(restam) == (0, 0)
