"""Valores `kairya` e `kairya_partnership`: expand + backfill.

Revision ID: 0008
Revises: 0007

Duas colunas guardam o valor antigo: `mission_reschedules.origin` e
`user_achievements.code`. Expand: os CHECKs passam a aceitar o valor novo e o
antigo, e o `UPDATE` troca todo valor antigo pelo novo. Um backup de antes
desta revisao, restaurado e migrado, termina sem nenhuma linha antiga e sem
violar CHECK. O contract (CHECK so com os valores novos) e a Tarefa 2.2, depois
de um deploy desta: ate la a leitura da aplicacao normaliza o valor antigo.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copias CONGELADAS, NAO import (D8): migracao e historico. A ordem dos
# valores e a do modelo, para o PostgreSQL descrever os dois CHECKs igual.
ORIGEM = ("mission_reschedules", "origin", "ck_mission_reschedules_origin")
CODIGO = ("user_achievements", "code", "ck_user_achievements_code")
ORIGENS_DA_0007 = ("usuario", "tifa")
ORIGENS_EXPANDIDAS = ("usuario", "kairya", "tifa")
CODIGOS_COMUNS = (
    "first_steps",
    "streak_7",
    "streak_30",
    "veteran_10",
    "veteran_50",
    "veteran_100",
)
CODIGOS_DA_0007 = (*CODIGOS_COMUNS, "tifa_partnership")
CODIGOS_EXPANDIDOS = (*CODIGOS_COMUNS, "kairya_partnership", "tifa_partnership")
# (coluna, valor antigo, valor novo)
TROCAS = (
    (ORIGEM, "tifa", "kairya"),
    (CODIGO, "tifa_partnership", "kairya_partnership"),
)


def _lista(valores: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def _recriar_check(alvo: tuple[str, str, str], valores: Sequence[str]) -> None:
    tabela, coluna, nome = alvo
    op.drop_constraint(nome, tabela, type_="check")
    op.create_check_constraint(nome, tabela, f"{coluna} IN ({_lista(valores)})")


def _trocar(alvo: tuple[str, str, str], de: str, para: str) -> None:
    tabela, coluna, _ = alvo
    op.execute(f"UPDATE {tabela} SET {coluna} = '{para}' WHERE {coluna} = '{de}'")


# O par (antigo + novo) do mesmo usuario nao fere a PK, mas o `UPDATE` de
# qualquer sentido a feriria. Ele nasce depois do expand: codigo antigo no ar
# entre a migracao e o restart, ou restore so de dados. Fica a linha com o
# `unlocked_at` mais antigo (no empate, a de codigo menor). Sem par, nada muda;
# o XP fica, porque a cascata vai de `xp_entries` para a conquista.
DEDUPLICAR_CONQUISTAS = """
DELETE FROM user_achievements AS a
 USING user_achievements AS b
 WHERE a.user_id = b.user_id
   AND a.code IN ('tifa_partnership', 'kairya_partnership')
   AND b.code IN ('tifa_partnership', 'kairya_partnership')
   AND a.code <> b.code
   AND (a.unlocked_at, a.code) > (b.unlocked_at, b.code)
"""


def _trocar_todos(de_para: Sequence[tuple[tuple[str, str, str], str, str]]) -> None:
    op.execute(DEDUPLICAR_CONQUISTAS)
    for alvo, de, para in de_para:
        _trocar(alvo, de, para)


def upgrade() -> None:
    _recriar_check(ORIGEM, ORIGENS_EXPANDIDAS)
    _recriar_check(CODIGO, CODIGOS_EXPANDIDOS)
    _trocar_todos(TROCAS)


def downgrade() -> None:
    # O valor volta antes do CHECK: o expandido aceita os dois, o da 0007 nao.
    _trocar_todos([(alvo, novo, antigo) for alvo, antigo, novo in TROCAS])
    _recriar_check(ORIGEM, ORIGENS_DA_0007)
    _recriar_check(CODIGO, CODIGOS_DA_0007)
