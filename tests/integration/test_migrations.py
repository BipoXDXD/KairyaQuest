"""A migracao precisa aplicar em banco VAZIO (README s10)."""

from argparse import Namespace
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

# As TABELAS que a migracao cria, sem `alembic_version` -- essa e do proprio
# Alembic e sobrevive ao `downgrade base`.
TABELAS_DA_MIGRACAO = frozenset({"users", "missions", "mission_operations"})


def _exigir_banco_de_teste(engine: Engine) -> None:
    """Recusa-se a rodar se o alvo nao for o banco de teste.

    Os testes de migracao apagam o schema inteiro. Apontar isso para o banco
    de desenvolvimento destroi dados, e a protecao do `-x test=true` e
    convencao: qualquer modulo pode montar um Config sem ele, e quem estiver
    com pressa monta. Esta guarda transforma a convencao em estrutura -- o
    comando destrutivo passa a depender do NOME do alvo, nao da memoria de
    quem escreve o teste.

    O sufixo `_test` e a convencao que o .env.example ja estabelece.
    """
    nome = engine.url.database or ""
    if not nome.endswith("_test"):
        raise RuntimeError(
            f"recusando rodar teste destrutivo contra o banco '{nome}'; "
            "esperado um banco cujo nome termine em '_test'"
        )


def _alembic_config() -> Config:
    """Configuracao do Alembic apontada para o banco de TESTE.

    `cmd_opts` e o mesmo objeto que a linha de comando preenche: e dali que
    `context.get_x_argument()` le o `-x`. Passar um Namespace no construtor,
    em vez de remendar o atributo depois, e o caminho tipado -- o campo ja e
    declarado como `Namespace | None`, entao nao ha `type: ignore` nenhum.
    Sem esse `x`, o env.py cairia no banco de DESENVOLVIMENTO, e o
    `DROP SCHEMA` abaixo destruiria dados reais.
    """
    return Config("alembic.ini", cmd_opts=Namespace(x=["test=true"]))


@pytest.fixture(scope="module")
def banco_migrado(engine: Engine) -> Engine:
    """Banco de teste zerado e migrado do zero.

    Esta fixture existe para que os testes nao dependam da ordem em que o
    pytest os executa: cada um declara o estado de que precisa, em vez de
    torcer para o primeiro teste ter rodado antes. Custa uma migracao por
    modulo, nao por teste, porque o escopo e `module`.

    A guarda vem ANTES do `DROP SCHEMA`, nao depois: uma verificacao que roda
    depois do comando destrutivo nao e verificacao, e autopsia.
    """
    _exigir_banco_de_teste(engine)
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))

    command.upgrade(_alembic_config(), "head")
    return engine


def test_migracao_aplica_em_banco_vazio(banco_migrado: Engine) -> None:
    tabelas = set(inspect(banco_migrado).get_table_names())
    assert {"users", "missions", "mission_operations", "alembic_version"} <= tabelas


def test_migracao_cria_o_usuario_unico(banco_migrado: Engine) -> None:
    with banco_migrado.connect() as conexao:
        total = conexao.execute(text("SELECT count(*) FROM users")).scalar_one()
    assert total == 1


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

    Nenhuma conexao chega a ser aberta: `create_engine` e preguicoso e a
    guarda so le `engine.url`. O `dispose()` vive na fixture pela mesma regra
    de sempre -- escrito depois do assert, nao roda quando o assert cai.
    """
    engine = create_engine_from_url(settings.database_url)
    yield engine
    engine.dispose()


def test_guarda_recusa_o_banco_de_desenvolvimento(
    engine_de_desenvolvimento: Engine,
) -> None:
    """A guarda precisa MORDER, e este e o teste que prova que ela morde.

    Sem esta assercao, `_exigir_banco_de_teste` poderia estar quebrada --
    aceitando qualquer nome -- e a suite continuaria verde, porque o caminho
    feliz nunca a exercita. Uma guarda sem teste do caso que ela bloqueia e
    uma guarda que so parece existir.
    """
    with pytest.raises(RuntimeError) as excecao:
        _exigir_banco_de_teste(engine_de_desenvolvimento)

    mensagem = str(excecao.value)
    assert "recusando rodar teste destrutivo" in mensagem
    # O nome do alvo recusado precisa aparecer: uma recusa que nao diz CONTRA
    # QUE banco ela foi obriga quem le o traceback a adivinhar.
    assert "'focusquest'" in mensagem
    assert "'_test'" in mensagem


def test_sequence_de_users_avanca_apos_a_migracao(banco_migrado: Engine) -> None:
    """O proximo usuario recebe id=2, nao colide com o id=1 semeado.

    `bulk_insert` com id explicito nao mexe na sequence; a migracao chama
    `setval` justamente por isso. Sem esse ajuste, este INSERT levantaria
    violacao de chave primaria -- e so levantaria no dia em que existisse um
    segundo usuario, longe da migracao que causou o problema.

    O INSERT roda dentro de uma transacao revertida para nao deixar linha
    para tras. A sequence em si nao volta atras no rollback -- sequence nao e
    transacional --, e tudo bem: o que importa e que o valor entregue tenha
    vindo DEPOIS do id=1.
    """
    with banco_migrado.connect() as conexao:
        transacao = conexao.begin()
        novo_id = conexao.execute(
            text("INSERT INTO users (display_name) VALUES ('Segundo') RETURNING id")
        ).scalar_one()
        transacao.rollback()

    assert novo_id == 2


def test_downgrade_apaga_e_upgrade_devolve_o_esquema(banco_migrado: Engine) -> None:
    """Ida e volta completa: uma migracao que nao volta e uma migracao da qual
    nao da para se recuperar.

    Verifiquei o round-trip a mao uma vez; a mao nao escala. Este teste poe a
    reversibilidade no gate, para o `downgrade()` da proxima migracao nao
    apodrecer em silencio.
    """
    command.downgrade(_alembic_config(), "base")
    apos_downgrade = set(inspect(banco_migrado).get_table_names())
    assert not (TABELAS_DA_MIGRACAO & apos_downgrade)

    command.upgrade(_alembic_config(), "head")
    apos_upgrade = set(inspect(banco_migrado).get_table_names())
    assert apos_upgrade >= TABELAS_DA_MIGRACAO
