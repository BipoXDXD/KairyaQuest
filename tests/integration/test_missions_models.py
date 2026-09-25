"""Persistencia da missao, contra PostgreSQL real."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import MetaData, UniqueConstraint, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, MissionOperation

# Nome da copia da tabela que o teste de divergencia cria. Explicito no que e:
# ninguem deve confundi-lo com uma tabela do esquema.
ESPELHO_DO_MODELO = "missions_espelho_do_modelo"


def _missao(**kwargs: object) -> Mission:
    base: dict[str, object] = {
        "user_id": 1,
        "mission_type": MissionType.AVULSA,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 3,
        "estimated_minutes": 60,
        "deadline": datetime.now(UTC) + timedelta(days=1),
        "state": MissionState.PENDENTE,
    }
    base.update(kwargs)
    return Mission(**base)


def test_persiste_e_recupera(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    assert missao.id is not None
    assert missao.state is MissionState.PENDENTE


def test_estado_volta_do_banco_como_enum(session: Session) -> None:
    """A ida e volta, nao so a ida.

    O teste acima ainda enxerga o objeto que o Python criou -- `flush` nao
    expira nada, entao `missao.state` continua sendo o enum que foi
    atribuido, mesmo que o banco devolvesse outra coisa. Aqui o atributo e
    expirado de proposito: o valor tem de ser lido do PostgreSQL de novo, e e
    so isso que prova que a coluna TEXT volta como MissionState em vez da str
    crua. Sem esta assercao, `Mapped[MissionState]` seria uma anotacao que
    mente depois do primeiro refresh.
    """
    missao = _missao()
    session.add(missao)
    session.flush()
    session.expire(missao)

    assert missao.state is MissionState.PENDENTE
    assert isinstance(missao.state, MissionState)


def test_instante_volta_com_timezone(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.refresh(missao)
    assert missao.deadline is not None
    assert missao.deadline.tzinfo is not None


# ---------------------------------------------------------------------------
# Restricoes. Cada teste afirma o NOME da restricao que recusou, e nao apenas
# que houve IntegrityError: `IntegrityError` sozinho tambem seria levantado
# por um NOT NULL esquecido ou por uma PK duplicada, e o teste continuaria
# verde enquanto provava outra coisa. O nome e o que amarra a assercao a
# regra especifica que a migracao escreveu.
# ---------------------------------------------------------------------------


def test_dificuldade_menor_que_um_e_rejeitada(session: Session) -> None:
    """Dificuldade zero e recusada pelo BANCO.

    `xp_para_dificuldade` ja levanta ValueError para dificuldade < 1, mas
    isso so vale para quem passa pelo dominio. Esta missao e escrita direto
    na tabela, como um UPDATE no psql faria: quem recusa aqui e o
    ck_missions_difficulty.
    """
    session.add(_missao(difficulty=0))
    with pytest.raises(IntegrityError) as excecao:
        session.flush()
    assert "ck_missions_difficulty" in str(excecao.value.orig)


def test_duracao_estimada_nao_positiva_e_rejeitada(session: Session) -> None:
    """Zero minuto estimado e recusado pelo BANCO.

    Uma missao de duracao zero nao e so um numero estranho: ela quebraria a
    comparacao entre estimativa e duracao real (README s8), que e o dado que
    o usuario usa para calibrar as proximas estimativas.
    """
    session.add(_missao(estimated_minutes=0))
    with pytest.raises(IntegrityError) as excecao:
        session.flush()
    assert "ck_missions_estimated_minutes" in str(excecao.value.orig)


def test_usuario_inexistente_e_rejeitado(session: Session) -> None:
    session.add(_missao(user_id=9999))
    with pytest.raises(IntegrityError) as excecao:
        session.flush()
    assert "missions_user_id_fkey" in str(excecao.value.orig)


def test_identificador_de_operacao_e_unico(session: Session) -> None:
    missao = _missao()
    session.add(missao)
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    with pytest.raises(IntegrityError) as excecao:
        session.flush()
    assert "uq_mission_operations_operation_id" in str(excecao.value.orig)


def test_operacao_de_missao_inexistente_e_rejeitada(session: Session) -> None:
    """A FK de mission_operations tambem morde.

    Sem esta assercao, `ForeignKey("missions.id")` no modelo poderia estar
    apontando para lugar nenhum -- o mapeamento carregaria igual, e a
    idempotencia passaria a aceitar operacoes orfas.
    """
    session.add(MissionOperation(operation_id="op-1", mission_id=9999, kind="complete"))
    with pytest.raises(IntegrityError) as excecao:
        session.flush()
    assert "mission_operations_mission_id_fkey" in str(excecao.value.orig)


def test_apagar_a_missao_leva_as_operacoes_junto(session: Session) -> None:
    """O `ondelete="CASCADE"` e do BANCO, e e o banco que este teste exercita.

    Nao ha `relationship()` entre Mission e MissionOperation, entao o ORM nao
    tem como cascatear nada: ele emite um unico DELETE na tabela missions. Se
    a linha de mission_operations some depois disso, quem a removeu foi o
    PostgreSQL. Sem o CASCADE, este DELETE nem passaria -- seria a propria FK
    a recusa-lo.
    """
    missao = _missao()
    session.add(missao)
    session.flush()
    session.add(
        MissionOperation(operation_id="op-1", mission_id=missao.id, kind="complete")
    )
    session.flush()

    session.delete(missao)
    session.flush()

    restantes = session.execute(
        select(func.count()).select_from(MissionOperation)
    ).scalar_one()
    assert restantes == 0


# ---------------------------------------------------------------------------
# Divergencia entre o modelo e a migracao.
# ---------------------------------------------------------------------------


def _checks_do_postgres(session: Session, tabela: str) -> dict[str, str]:
    """As restricoes CHECK de uma tabela, como o PostgreSQL as descreve."""
    linhas = session.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE contype = 'c' AND conrelid = CAST(:tabela AS regclass)"
        ),
        {"tabela": tabela},
    ).all()
    return {nome: definicao for nome, definicao in linhas}


def test_o_modelo_descreve_os_mesmos_checks_que_a_migracao_criou(
    session: Session,
) -> None:
    """O `__table_args__` e a migracao nao podem divergir em silencio.

    O risco e concreto e assimetrico: `_ESTADOS_SQL` DERIVA de MissionState,
    enquanto a migracao CONGELOU a tupla de estados. No dia em que entrar um
    quarto estado, o modelo passa a descrever um CHECK que o banco nao tem --
    e, sem este teste, nada fica vermelho ate um INSERT legitimo ser recusado
    em producao.

    Por que nao `compare_metadata` do Alembic: ele NAO compara restricoes
    CHECK -- o autogenerate nao as detecta. Um teste de autogenerate seria
    cego justamente onde mora o risco.

    A comparacao e feita pelo proprio PostgreSQL, e isso e o ponto. Confrontar
    texto na mao nao funcionaria: o modelo declara `state IN (...)` e o banco
    devolve `state = ANY (ARRAY[...])` para a MESMA regra. Em vez de escrever
    um normalizador -- que envelheceria a cada mudanca de formatacao do PG, e
    que erraria em silencio para o lado de aprovar --, o teste cria uma copia
    da tabela A PARTIR DO MODELO e pede ao PostgreSQL a descricao das duas.
    Passando pelo mesmo parser, o que sobra e diferenca de verdade.

    A copia nasce e morre dentro da transacao do teste: DDL no PostgreSQL e
    transacional, entao o rollback da fixture a remove.
    """
    metadados = MetaData()
    # A tabela `users` entra so para a FK do espelho ter alvo -- ela nao e
    # criada. E o mesmo NoReferencedTableError que obrigou a existir o modelo
    # User, agora no metadata da copia.
    Mission.metadata.tables["users"].to_metadata(metadados)
    # Alvo da FK composta: sem ela, o espelho de `missions` nao resolveria
    # `fk_missions_plano_do_usuario`.
    Mission.metadata.tables["weekly_plans"].to_metadata(metadados)
    espelho = Mission.metadata.tables["missions"].to_metadata(
        metadados, name=ESPELHO_DO_MODELO
    )
    # Nome de indice e unico por schema (nome de restricao, nao): manter
    # `ix_missions_user_id` colidiria com o indice que a migracao ja criou.
    espelho.indexes.clear()
    # Restricao UNIQUE nasce com um indice de mesmo nome, e nome de indice e
    # unico por schema: `uq_missions_plan_id_day` colidiria com o da tabela
    # real. Este teste compara so os CHECK (pendencia 9); os UNIQUE, o indice
    # parcial e a FK composta sao provados pelos testes de recusa nomeada de
    # `test_cycle_models.py`.
    for restricao in [
        r for r in espelho.constraints if isinstance(r, UniqueConstraint)
    ]:
        espelho.constraints.remove(restricao)
    espelho.create(session.connection())

    assert _checks_do_postgres(session, ESPELHO_DO_MODELO) == _checks_do_postgres(
        session, "missions"
    )


def test_o_modelo_de_weekly_plans_descreve_os_checks_da_migracao(
    session: Session,
) -> None:
    """O mesmo espelho, para a tabela nova: o CHECK da segunda-feira."""
    metadados = MetaData()
    Mission.metadata.tables["users"].to_metadata(metadados)
    espelho = Mission.metadata.tables["weekly_plans"].to_metadata(
        metadados, name="weekly_plans_espelho_do_modelo"
    )
    for restricao in [
        r for r in espelho.constraints if isinstance(r, UniqueConstraint)
    ]:
        espelho.constraints.remove(restricao)
    espelho.create(session.connection())

    assert _checks_do_postgres(
        session, "weekly_plans_espelho_do_modelo"
    ) == _checks_do_postgres(session, "weekly_plans")


# ---------------------------------------------------------------------------
# Isolamento entre testes.
# ---------------------------------------------------------------------------


def _escrever_e_commitar_exigindo_tabela_vazia(session: Session) -> None:
    """Exige a tabela vazia, escreve uma missao e COMMITA.

    O commit e o ponto. Com `flush` sozinho, o savepoint da propria Session
    ja desfaria a escrita no `close()`, e o teste passaria mesmo com a
    transacao externa quebrada -- provaria o isolamento errado. Commitando,
    a linha sobe do savepoint para a transacao externa, e so o
    `transacao.rollback()` da fixture pode desfaze-la. E tambem o caso real:
    o servico que vier nas proximas tarefas vai commitar.
    """
    antes = session.execute(select(func.count()).select_from(Mission)).scalar_one()
    assert antes == 0

    session.add(_missao())
    session.commit()

    depois = session.execute(select(func.count()).select_from(Mission)).scalar_one()
    assert depois == 1


# Os dois testes abaixo sao deliberadamente iguais, e e por isso que eles
# funcionam: cada um escreve e commita uma missao depois de exigir que a
# tabela esteja vazia. Se a fixture `session` parasse de reverter a transacao
# externa, o segundo a rodar encontraria a linha commitada pelo primeiro e
# falharia -- independentemente de qual dos dois o pytest execute antes. Um
# unico teste nao poderia provar isso, porque o vazamento so aparece no teste
# SEGUINTE.


def test_isolamento_entre_testes_primeira_escrita(session: Session) -> None:
    _escrever_e_commitar_exigindo_tabela_vazia(session)


def test_isolamento_entre_testes_segunda_escrita(session: Session) -> None:
    _escrever_e_commitar_exigindo_tabela_vazia(session)
