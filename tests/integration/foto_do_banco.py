"""A "foto" do banco: todas as linhas de todas as tabelas do esquema.

Compartilhada pelas provas de que uma recusa nao escreve nada
(`test_recusas_sem_escrita.py`, para as operacoes da missao, e
`test_rejeitar_sem_escrita.py`, para a recusa da acao da Kairya).
"""

from sqlalchemy import Connection, inspect, text

Foto = dict[str, list[str]]


def foto_do_banco(conexao: Connection) -> Foto:
    """Todas as linhas de todas as tabelas do esquema, como texto JSON ordenado.

    Descobre as tabelas pelo proprio banco: uma tabela nova entra na prova
    sozinha, sem ninguem lembrar de acrescenta-la. So `alembic_version` fica de
    fora (nao e dado do produto).
    """
    citar = conexao.dialect.identifier_preparer.quote
    tabelas = sorted(
        nome for nome in inspect(conexao).get_table_names() if nome != "alembic_version"
    )
    return {
        nome: sorted(
            conexao.execute(
                text(f"SELECT to_jsonb(t)::text FROM {citar(nome)} AS t")
            ).scalars()
        )
        for nome in tabelas
    }
