"""O que funciona fora da raiz do repositorio (pendencia 29).

A decisao foi MANTER a leitura do `.env` pelo diretorio corrente (motivo no
docs/HANDOFF.md, pendencia 29) e documentar a receita para rodar de outro
lugar: `uv run --project <raiz> --env-file <raiz>/.env ...` e, no Alembic,
`-c <raiz>/alembic.ini`. A metade da receita que depende deste repositorio --
e nao do `uv` -- e o `alembic.ini` achar os scripts pelo caminho DELE, e nao
pelo diretorio corrente. E isso que este teste prende.
"""

from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

RAIZ = Path(__file__).resolve().parents[2]


def test_o_alembic_ini_acha_os_scripts_de_qualquer_diretorio(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """`script_location = %(here)s/alembic`: com o `-c` apontando para o
    arquivo, o diretorio corrente nao importa. Com `script_location =
    alembic` (relativo), este teste reprova -- o Alembic procuraria
    `alembic/` dentro de `tmp_path`.

    `heads` le so os scripts, sem abrir o `env.py`: por isso nao precisa de
    banco nem de `.env`. Os comandos que abrem o `env.py` (`upgrade`,
    `current`) precisam tambem da configuracao do banco, que vem do
    `--env-file` da receita."""
    monkeypatch.chdir(tmp_path)
    config = Config(str(RAIZ / "alembic.ini"))
    cabecas = ScriptDirectory.from_config(config).get_heads()
    assert len(cabecas) == 1
