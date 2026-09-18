"""Fixtures de integracao. Usam PostgreSQL real, nunca SQLite (README s10)."""

from argparse import Namespace
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, make_url, text
from sqlalchemy.orm import Session

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
def engine(settings: Settings) -> Iterator[Engine]:
    engine = create_engine_from_url(settings.test_database_url)
    yield engine
    engine.dispose()


def exigir_banco_de_teste(engine: Engine) -> None:
    """Recusa-se a rodar se o alvo nao for, comprovadamente, o banco de teste.

    Os testes de migracao apagam o schema inteiro. A protecao do
    `-x test=true` e convencao: qualquer modulo pode montar um Config sem
    ele, e quem estiver com pressa monta. Esta guarda transforma a convencao
    em estrutura -- o comando destrutivo passa a depender do que se pode
    verificar sobre o alvo, nao da memoria de quem escreve o teste.

    Sao DUAS condicoes independentes, e as duas precisam valer. Elas cobrem
    erros de configuracao diferentes, e por isso nenhuma substitui a outra:

    1. **O alvo e exatamente o banco de teste configurado.** Esta e a
       verificacao forte, e e ela que recusa *servidor* errado. Conferir so
       o nome nao bastava: `...@127.0.0.1:5432/qualquer_test` termina em
       `_test` e mesmo assim aponta para a instalacao local do PostgreSQL da
       porta 5432, que NAO pertence a este projeto. Um
       FOCUSQUEST_TEST_DATABASE_URL mal configurado levaria o
       `DROP SCHEMA public CASCADE` para o banco de outra pessoa.

    2. **O nome termina em `_test`.** A condicao 1 sozinha aprovaria alguem
       que apontasse a propria FOCUSQUEST_TEST_DATABASE_URL para o banco de
       desenvolvimento -- a URL bateria com a configuracao, porque a
       configuracao e que esta errada. Esta segunda camada nao consulta a
       configuracao; e a convencao de nome que o .env.example estabelece,
       conferida por fora dela.

    Juntas: a 1 impede apontar para outro servidor, a 2 impede apontar a
    variavel de teste para o banco errado.
    """
    esperado = make_url(Settings().test_database_url)

    # Condicao 1: alvo igual ao configurado. A comparacao e entre objetos URL,
    # nao entre strings, para nao depender de detalhe de formatacao. A
    # mensagem mostra as duas URLs REDIGIDAS (`render_as_string()` esconde a
    # senha por padrao): um traceback nao e lugar de credencial.
    if engine.url != esperado:
        raise RuntimeError(
            "recusando rodar teste destrutivo: o alvo "
            f"'{engine.url.render_as_string()}' nao e o banco de teste "
            f"configurado ('{esperado.render_as_string()}')"
        )

    # Condicao 2: convencao de nome, conferida sem consultar a configuracao.
    nome = engine.url.database or ""
    if not nome.endswith("_test"):
        raise RuntimeError(
            f"recusando rodar teste destrutivo contra o banco '{nome}'; "
            "esperado um banco cujo nome termine em '_test' -- confira "
            "FOCUSQUEST_TEST_DATABASE_URL"
        )


def alembic_config() -> Config:
    """Configuracao do Alembic apontada para o banco de TESTE.

    `cmd_opts` e o mesmo objeto que a linha de comando preenche: e dali que
    `context.get_x_argument()` le o `-x`. Passar um Namespace no construtor,
    em vez de remendar o atributo depois, e o caminho tipado -- o campo ja e
    declarado como `Namespace | None`, entao nao ha `type: ignore` nenhum.
    Sem esse `x`, o env.py cairia no banco de DESENVOLVIMENTO, e o
    `DROP SCHEMA` de `banco_migrado` destruiria dados reais.
    """
    return Config("alembic.ini", cmd_opts=Namespace(x=["test=true"]))


@pytest.fixture(scope="session")
def banco_migrado(engine: Engine) -> Engine:
    """Banco de teste zerado e migrado do zero.

    Esta fixture existe para que os testes nao dependam da ordem em que o
    pytest os executa: cada um declara o estado de que precisa, em vez de
    torcer para o primeiro teste ter rodado antes. Ela vive no conftest --
    e nao no modulo que a criou -- porque agora ha DOIS consumidores: os
    testes de migracao e os de persistencia. Duplicar o `DROP SCHEMA` no
    segundo modulo seria duplicar justamente o trecho destrutivo, que e o
    ultimo lugar onde se quer duas versoes divergindo.

    O escopo e `session`, nao `module`: a migracao roda uma vez por suite em
    vez de uma vez por arquivo de teste, e os dois modulos compartilham o
    mesmo esquema ja aplicado.

    A guarda vem ANTES do `DROP SCHEMA`, nao depois: uma verificacao que roda
    depois do comando destrutivo nao e verificacao, e autopsia.
    """
    exigir_banco_de_teste(engine)
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))

    command.upgrade(alembic_config(), "head")
    return engine


@pytest.fixture
def session(banco_migrado: Engine) -> Iterator[Session]:
    """Sessao com rollback ao final: um teste nunca ve o que outro escreveu.

    A dependencia e `banco_migrado`, nao `engine`: sem ela, os testes de
    persistencia so passariam quando o pytest tivesse rodado o modulo de
    migracao antes -- ou seja, por ordem alfabetica de nome de arquivo.
    Depender do esquema explicitamente e o que faz `pytest
    tests/integration/test_missions_models.py` sozinho funcionar.

    A transacao externa com rollback e o que torna os testes independentes
    sem truncar tabelas entre eles: mais rapido, e sem nenhum comando
    destrutivo por teste.

    `join_transaction_mode="create_savepoint"` nao e detalhe: e o que faz a
    transacao externa sobreviver aos testes de restricao. No modo padrao
    ("conditional_savepoint"), uma Session ligada a uma conexao que ja esta
    em transacao cai em "rollback_only" -- e o rollback automatico que ela
    dispara depois de um IntegrityError desfaz a transacao EXTERNA, a mesma
    que esta fixture ainda precisa reverter no teardown. O sintoma visivel
    era um `SAWarning: transaction already deassociated from connection` em
    todo teste que espera IntegrityError; o sintoma invisivel seria uma
    fixture que so PARECE estar revertendo. Com o savepoint, a falha volta
    ate ele e a transacao externa continua de pe.
    """
    conexao = banco_migrado.connect()
    transacao = conexao.begin()
    sessao = Session(
        bind=conexao,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    yield sessao
    sessao.close()
    transacao.rollback()
    conexao.close()
