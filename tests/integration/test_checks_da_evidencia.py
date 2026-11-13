"""Os CHECKs de tamanho da evidencia no banco batem com os limites do schema (#187).

O 422 da borda (`TAMANHO_MAXIMO_DA_EVIDENCIA`, `TAMANHO_MAXIMO_DO_LINK`) e o
CHECK da tabela `mission_evidence` sao duas declaracoes do mesmo limite. O
teste le a definicao do CHECK no banco MIGRADO, e nao no modelo: e o banco que
recusa de fato, e o autogenerate do Alembic nao compara texto de CHECK.
"""

import re

import pytest
from sqlalchemy import Engine, text

from focusquest.modules.missions.schemas import (
    TAMANHO_MAXIMO_DA_EVIDENCIA,
    TAMANHO_MAXIMO_DO_LINK,
)

DEFINICAO_DO_CHECK = text(
    "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = :nome"
)


def _teto_do_check(banco: Engine, nome: str, coluna: str) -> int:
    with banco.connect() as conexao:
        definicao = conexao.execute(DEFINICAO_DO_CHECK, {"nome": nome}).scalar_one()
    achado = re.search(rf"char_length\({coluna}\) <= (\d+)", definicao)
    assert achado is not None, (
        f"{nome}: sem teto de char_length({coluna}) em {definicao}"
    )
    return int(achado.group(1))


@pytest.mark.parametrize(
    ("nome", "coluna", "limite_do_schema"),
    [
        ("ck_mission_evidence_text", "text", TAMANHO_MAXIMO_DA_EVIDENCIA),
        ("ck_mission_evidence_link", "link", TAMANHO_MAXIMO_DO_LINK),
    ],
)
def test_check_do_banco_usa_o_limite_do_schema(
    banco_migrado: Engine, nome: str, coluna: str, limite_do_schema: int
) -> None:
    assert _teto_do_check(banco_migrado, nome, coluna) == limite_do_schema
