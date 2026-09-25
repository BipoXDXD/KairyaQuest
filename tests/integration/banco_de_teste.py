"""A guarda do banco de teste e o recomeco do esquema, compartilhados.

Dois consumidores: a fixture `banco_migrado` (suite pytest) e o
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
        recriar_esquema(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
