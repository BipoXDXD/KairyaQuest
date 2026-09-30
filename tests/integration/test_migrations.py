"""A migracao precisa aplicar em banco VAZIO (README s10)."""

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from alembic import command
from sqlalchemy import Engine, delete, inspect, make_url, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, WeeklyPlan

from .banco_de_teste import exigir_banco_de_teste
from .conftest import alembic_config

# As TABELAS que a migracao cria, sem `alembic_version` -- essa e do proprio
# Alembic e sobrevive ao `downgrade base`.
TABELAS_DA_MIGRACAO = frozenset(
    {"users", "missions", "mission_operations", "weekly_plans"}
)


def test_migracao_aplica_em_banco_vazio(banco_migrado: Engine) -> None:
    tabelas = set(inspect(banco_migrado).get_table_names())
    assert {
        "users",
        "missions",
        "mission_operations",
        "weekly_plans",
        "alembic_version",
    } <= tabelas


def test_migracao_cria_o_usuario_unico(banco_migrado: Engine) -> None:
    with banco_migrado.connect() as conexao:
        total = conexao.execute(text("SELECT count(*) FROM users")).scalar_one()
    assert total == 1


def test_alembic_cria_a_engine_pela_fabrica_da_aplicacao(
    monkeypatch: pytest.MonkeyPatch, banco_migrado: Engine
) -> None:
    """`alembic/env.py` precisa criar a engine por `create_engine_from_url`,
    e nao por `engine_from_config`: e so pela fabrica que a migracao herda o
    `SET TIME ZONE 'UTC'` (ver `core/database.py`). Nenhuma migracao atual
    depende do fuso da sessao, entao um `env.py` que voltasse a
    `engine_from_config` continuaria migrando com sucesso -- so nao herdaria
    a configuracao, e nada mais na suite denunciaria isso.

    O Alembic reexecuta `env.py` do zero a cada comando (`load_module_py`
    da o modulo do `env.py` a `exec_module` num objeto novo, nunca por
    `sys.modules`), entao o `from focusquest.core.database import
    create_engine_from_url` do `env.py` busca, a cada execucao, o atributo
    ATUAL de `focusquest.core.database` -- e e por isso que o monkeypatch no
    MODULO `focusquest.core.database`, e nao numa copia importada aqui, e
    suficiente para o espiao ser visto pelo `env.py`.

    `command.current` basta: ele passa pelo `run_migrations_online` do
    `env.py` -- que e onde a engine nasce -- sem alterar o esquema, contra o
    banco de TESTE (a `alembic_config` da fixture usa `-x test=true`).
    """
    chamadas: list[str] = []
    original = create_engine_from_url

    def espiao(url: str, poolclass: object = None) -> Engine:
        chamadas.append(url)
        return original(url, poolclass=poolclass)  # type: ignore[arg-type]

    monkeypatch.setattr("focusquest.core.database.create_engine_from_url", espiao)

    command.current(alembic_config())

    assert chamadas, "env.py nao chamou create_engine_from_url"
    assert make_url(chamadas[0]) == banco_migrado.url


def test_check_de_estado_rejeita_valor_invalido(banco_migrado: Engine) -> None:
    """Prova que a restricao vive no BANCO, e nao so no Python: este INSERT
    nao passa pelo dominio, e um UPDATE direto no psql seria rejeitado
    igual."""
    with pytest.raises(IntegrityError), banco_migrado.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO missions "
                "(user_id, instructions, completion_criterion, difficulty, "
                " estimated_minutes, deadline, state) VALUES "
                "(1, 'x', 'y', 1, 30, now(), 'estado_invalido')"
            )
        )


@pytest.fixture
def engine_de_desenvolvimento(settings: Settings) -> Iterator[Engine]:
    """Engine apontada para o banco de DESENVOLVIMENTO, so para provar que a
    guarda a recusa.

    ATENCAO a uma dependencia implicita: este teste e seguro APENAS porque a
    guarda nunca abre conexao -- ela so le `engine.url`, e `create_engine` e
    preguicoso. Se um dia alguem puser um `engine.connect()` dentro da
    guarda, esta fixture passa a abrir conexao de verdade contra o banco de
    DESENVOLVIMENTO, e nada na leitura do teste denunciaria isso. Quem mexer
    na guarda precisa reler este paragrafo.

    O `dispose()` vive na fixture pela mesma regra de sempre -- escrito
    depois do assert, nao roda quando o assert cai.
    """
    engine = create_engine_from_url(settings.database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def engine_em_outro_servidor(settings: Settings) -> Iterator[Engine]:
    """Engine com nome de banco aceitavel e SERVIDOR errado.

    Derivada da URL de teste, trocando so a porta e o nome: mesma credencial,
    nome terminando em `_test` -- e apontando para a 5432, a instalacao local
    do PostgreSQL que nao pertence a este projeto. E exatamente a brecha que
    a guarda antiga deixava passar.

    Vale aqui a mesma ressalva da fixture acima, e com mais peso: nada nunca
    deve conectar nesta URL. A guarda recusa antes, porque so le `engine.url`.
    """
    alvo = make_url(settings.test_database_url).set(port=5432, database="qualquer_test")
    engine = create_engine_from_url(alvo.render_as_string(hide_password=False))
    yield engine
    engine.dispose()


def test_guarda_recusa_servidor_diferente_do_configurado(
    engine_em_outro_servidor: Engine,
) -> None:
    """Condicao 1: nome plausivel nao basta, o alvo precisa ser O configurado.

    Este e o teste que a guarda antiga nao passaria: `qualquer_test` termina
    em `_test`, e ela aprovava -- mandando o `DROP SCHEMA public CASCADE`
    para um servidor alheio a uma porta de distancia.
    """
    with pytest.raises(RuntimeError) as excecao:
        exigir_banco_de_teste(engine_em_outro_servidor)

    mensagem = str(excecao.value)
    assert "nao e o banco de teste configurado" in mensagem
    # A recusa precisa dizer QUAL alvo foi recusado -- inclusive a porta, que
    # e o que difere aqui -- e nao pode vazar a senha no traceback.
    assert ":5432/qualquer_test" in mensagem
    assert "focusquest_local" not in mensagem


def test_guarda_recusa_o_banco_de_desenvolvimento(
    engine_de_desenvolvimento: Engine,
) -> None:
    """A guarda precisa MORDER, e este e o teste que prova que ela morde.

    Sem esta assercao, `exigir_banco_de_teste` poderia estar quebrada --
    aceitando qualquer alvo -- e a suite continuaria verde, porque o caminho
    feliz nunca a exercita. Uma guarda sem teste do caso que ela bloqueia e
    uma guarda que so parece existir.
    """
    with pytest.raises(RuntimeError) as excecao:
        exigir_banco_de_teste(engine_de_desenvolvimento)

    mensagem = str(excecao.value)
    assert "recusando rodar teste destrutivo" in mensagem
    # O alvo recusado precisa aparecer: uma recusa que nao diz CONTRA QUE
    # banco ela foi obriga quem le o traceback a adivinhar.
    assert "/focusquest'" in mensagem


def test_guarda_recusa_configuracao_de_teste_apontada_para_o_banco_errado(
    monkeypatch: pytest.MonkeyPatch, engine_de_desenvolvimento: Engine
) -> None:
    """Condicao 2: a camada que sobrevive a uma configuracao errada.

    Aqui a propria FOCUSQUEST_TEST_DATABASE_URL aponta para o banco de
    desenvolvimento. A condicao 1 APROVA -- a URL bate com a configuracao,
    porque quem esta errado e a configuracao. E a convencao de nome, conferida
    sem consultar Settings, que pega o caso. Este teste e a razao de as duas
    condicoes serem independentes em vez de uma so.
    """
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL",
        engine_de_desenvolvimento.url.render_as_string(hide_password=False),
    )

    with pytest.raises(RuntimeError) as excecao:
        exigir_banco_de_teste(engine_de_desenvolvimento)

    mensagem = str(excecao.value)
    assert "termine em '_test'" in mensagem
    assert "FOCUSQUEST_TEST_DATABASE_URL" in mensagem


def test_guarda_permite_o_banco_de_teste_configurado(engine: Engine) -> None:
    """O caso feliz tambem precisa de teste: uma guarda que recusa TUDO
    deixaria a suite vermelha por um motivo certo e uma razao errada, e o
    conserto obvio -- afrouxa-la -- desfaria a protecao."""
    exigir_banco_de_teste(engine)


def test_sequence_de_users_avanca_apos_a_migracao(banco_migrado: Engine) -> None:
    """O proximo usuario recebe um id DEPOIS do id=1 semeado, sem colidir.

    `bulk_insert` com id explicito nao mexe na sequence; a migracao chama
    `setval` justamente por isso. Sem esse ajuste, este INSERT levantaria
    violacao de chave primaria -- e so levantaria no dia em que existisse um
    segundo usuario, longe da migracao que causou o problema.

    O INSERT roda dentro de uma transacao revertida para nao deixar linha
    para tras. A sequence em si nao volta atras no rollback -- sequence nao e
    transacional. Por isso a assercao e "maior que o maior id gravado", e nao
    "igual a 2": o `banco_migrado` e de sessao, e qualquer teste anterior que
    inseriu um usuario e reverteu ja consumiu valores da sequence (com
    `test_tutoring_models.py` antes deste arquivo, o id entregue era 3).
    """
    with banco_migrado.connect() as conexao:
        transacao = conexao.begin()
        maior_gravado = conexao.execute(text("SELECT max(id) FROM users")).scalar_one()
        novo_id = conexao.execute(
            text("INSERT INTO users (display_name) VALUES ('Segundo') RETURNING id")
        ).scalar_one()
        transacao.rollback()

    assert maior_gravado == 1
    assert novo_id > maior_gravado


def test_downgrade_apaga_e_upgrade_devolve_o_esquema(banco_migrado: Engine) -> None:
    """Ida e volta completa: uma migracao que nao volta e uma migracao da qual
    nao da para se recuperar.

    Verifiquei o round-trip a mao uma vez; a mao nao escala. Este teste poe a
    reversibilidade no gate, para o `downgrade()` da proxima migracao nao
    apodrecer em silencio.
    """
    command.downgrade(alembic_config(), "base")
    apos_downgrade = set(inspect(banco_migrado).get_table_names())
    assert not (TABELAS_DA_MIGRACAO & apos_downgrade)

    command.upgrade(alembic_config(), "head")
    apos_upgrade = set(inspect(banco_migrado).get_table_names())
    assert apos_upgrade >= TABELAS_DA_MIGRACAO


TABELAS_DA_TUTORIA = {"tutor_messages", "tutor_actions"}


def test_downgrade_da_0002_leva_so_a_tutoria(banco_migrado: Engine) -> None:
    """Voltar para a 0001 apaga a tutoria e preserva as missoes: um downgrade
    que levasse junto o que nao criou destruiria dado alheio."""
    command.downgrade(alembic_config(), "0001")
    try:
        tabelas = set(inspect(banco_migrado).get_table_names())
        assert not (TABELAS_DA_TUTORIA & tabelas)
        # `weekly_plans` some junto: e da 0003, e a 0001 nao a criou.
        assert tabelas >= {"users", "missions", "mission_operations"}
    finally:
        command.upgrade(alembic_config(), "head")
    assert set(inspect(banco_migrado).get_table_names()) >= TABELAS_DA_TUTORIA


def test_a_0003_transforma_as_missoes_existentes_em_avulsas(
    banco_migrado: Engine,
) -> None:
    """A linha do 1a atravessa a 0003 como avulsa, com plano e dia nulos."""
    command.downgrade(alembic_config(), "0002")
    try:
        with banco_migrado.begin() as conexao:
            conexao.execute(
                text(
                    "INSERT INTO missions (user_id, instructions, "
                    "completion_criterion, difficulty, estimated_minutes, "
                    "deadline) VALUES (1, 'da 0002', 'y', 1, 30, now())"
                )
            )
        command.upgrade(alembic_config(), "head")
        with banco_migrado.connect() as conexao:
            linha = conexao.execute(
                text(
                    "SELECT mission_type, plan_id, day FROM missions "
                    "WHERE instructions = 'da 0002'"
                )
            ).one()
        assert tuple(linha) == ("avulsa", None, None)
    finally:
        command.upgrade(alembic_config(), "head")
        with banco_migrado.begin() as conexao:
            conexao.execute(text("DELETE FROM missions WHERE instructions = 'da 0002'"))


def test_o_downgrade_da_0003_recusa_quando_existe_diaria(banco_migrado: Engine) -> None:
    """Falha ALTO, e a transacao do Alembic desfaz tudo: o esquema continua em head."""
    with Session(bind=banco_migrado) as sessao:
        plano = WeeklyPlan(
            user_id=1,
            week_start=date(2026, 9, 21),
            created_at=datetime(2026, 9, 21, 15, tzinfo=UTC),
        )
        sessao.add(plano)
        sessao.flush()
        sessao.add(
            Mission(
                user_id=1,
                instructions="diaria do downgrade",
                completion_criterion="y",
                difficulty=1,
                estimated_minutes=30,
                state=MissionState.PENDENTE,
                mission_type=MissionType.DIARIA,
                plan_id=plano.id,
                day=date(2026, 9, 21),
                deadline=None,
            )
        )
        sessao.commit()
        plano_id = plano.id
    try:
        with pytest.raises(RuntimeError, match="downgrade da 0003 recusado"):
            command.downgrade(alembic_config(), "0002")
        assert "weekly_plans" in inspect(banco_migrado).get_table_names()
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.plan_id == plano_id))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            sessao.commit()


def test_o_downgrade_da_0003_leva_so_o_ciclo(banco_migrado: Engine) -> None:
    command.downgrade(alembic_config(), "0002")
    try:
        tabelas = set(inspect(banco_migrado).get_table_names())
        colunas_da_missao = inspect(banco_migrado).get_columns("missions")
        nomes_das_colunas = {c["name"] for c in colunas_da_missao}
        (deadline,) = [c for c in colunas_da_missao if c["name"] == "deadline"]
        assert "weekly_plans" not in tabelas
        assert {"tutor_messages", "tutor_actions", "missions"} <= tabelas
        assert not ({"mission_type", "plan_id", "day"} & nomes_das_colunas)
        # O downgrade da 0003 devolve o NOT NULL que a 0002 exigia: sem esta
        # assercao, remover o `alter_column(..., nullable=False)` do
        # downgrade nao reprovaria teste nenhum.
        assert deadline["nullable"] is False
    finally:
        command.upgrade(alembic_config(), "head")
