"""A guarda do banco de teste e o recomeco do esquema, compartilhados.

Dois consumidores: as fixtures `engine` e `banco_migrado` (suite pytest) e o
`make reset-test-db`, pre-requisito do `check-e2e` desde o Incremento B (spec
do ciclo diario, C17: o plano e unico por semana, e um `check-e2e` repetido
reprovaria com `409 plano_existente`). O `scripts/e2e-env.sh` tambem usa a
guarda, no lugar da copia que tinha num heredoc.

Mora em tests/, e nao em src/ (decisao P7 do plano do B): e infraestrutura
DESTRUTIVA de teste, e nenhum caminho da aplicacao deve poder chama-la. Como
comando: `PYTHONPATH=tests uv run python -m integration.banco_de_teste`, o
mesmo arranjo do servidor falso do E2E.
"""

from sqlalchemy import Engine, make_url, text
from sqlalchemy.engine import URL

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url


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


# O PostgreSQL trunca em silencio um identificador acima de 63 bytes
# (NAMEDATALEN - 1). Um nome de banco truncado deixaria de terminar em `_test`
# -- e a guarda de nome teria aprovado a string ANTES do corte.
LIMITE_DO_IDENTIFICADOR = 63

# O banco de MANUTENCAO do servidor: existe em toda instalacao do PostgreSQL
# (inclusive no servico do CI e no container do compose), e e dele que se
# cria um banco novo -- nao da para conectar no banco que ainda nao existe.
BANCO_DE_MANUTENCAO = "postgres"


def _url_de_manutencao(url: URL) -> str:
    """A mesma URL -- servidor, credencial e opcoes -- no banco de manutencao.

    Derivada da propria URL de teste, e nao configurada a parte: uma segunda
    variavel seria uma segunda chance de apontar para o servidor errado.
    `hide_password=False` porque o valor vai para o driver, nao para log.
    """
    return url.set(database=BANCO_DE_MANUTENCAO).render_as_string(hide_password=False)


def criar_banco_se_ausente(engine: Engine) -> None:
    """Cria o banco de teste do `engine` se ele ainda nao existir.

    Pendencia 19: cada worktree aponta o seu `.env` para um banco de teste
    proprio (`focusquest_<nome>_test`), e o pre-push usa outro
    (`..._push_test`). Esses bancos nao nascem no `init-test-db.sql`, que so
    roda na criacao do volume -- nascem aqui, no primeiro uso.

    A guarda vem ANTES de qualquer conexao, e e a MESMA de `recriar_esquema`:
    um nome que nao termine em `_test`, ou um alvo que nao seja o banco de
    teste configurado, nunca e criado. Depois dela, o limite de 63 bytes do
    identificador, pelo mesmo motivo (ver `LIMITE_DO_IDENTIFICADOR`).

    `CREATE DATABASE` nao roda dentro de transacao, dai o `AUTOCOMMIT`; e o
    nome vai entre aspas pelo preparador do dialeto, porque o
    `novo-worktree.sh` aceita hifen (`focusquest_meu-tema_test`), que sem aspas
    seria erro de sintaxe. Nao ha `DROP DATABASE` em lugar nenhum deste modulo.
    """
    exigir_banco_de_teste(engine)
    nome = engine.url.database or ""
    if len(nome.encode()) > LIMITE_DO_IDENTIFICADOR:
        raise RuntimeError(
            f"recusando criar o banco '{nome}': o nome passa de "
            f"{LIMITE_DO_IDENTIFICADOR} bytes, e o PostgreSQL o truncaria em "
            "silencio -- escolha um nome de worktree mais curto"
        )

    manutencao = create_engine_from_url(_url_de_manutencao(engine.url))
    try:
        with manutencao.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as conexao:
            existe = conexao.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :nome"),
                {"nome": nome},
            ).first()
            if existe is None:
                identificador = conexao.dialect.identifier_preparer.quote(nome)
                conexao.execute(text(f"CREATE DATABASE {identificador}"))
    finally:
        manutencao.dispose()


def recriar_esquema(engine: Engine) -> None:
    """Apaga e recria o schema `public` do banco de teste.

    A guarda vem ANTES do DROP: uma verificacao depois do comando destrutivo
    nao e verificacao, e autopsia.
    """
    exigir_banco_de_teste(engine)
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))


def main() -> None:
    engine = create_engine_from_url(Settings().test_database_url)
    try:
        criar_banco_se_ausente(engine)
        recriar_esquema(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
