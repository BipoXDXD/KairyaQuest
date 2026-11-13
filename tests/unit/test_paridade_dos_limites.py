"""Os limites de formulario sao os mesmos no front e no back (#187).

O frontend avisa antes de enviar; o backend recusa com 422. Os dois lados
declaram cada limite UMA vez, com constante nomeada, e este teste os prende.
O frontend nao tem como importar Python, entao o arquivo TypeScript e lido
como texto, no molde de `test_limite_do_texto_do_plano.py`.
"""

import re
from pathlib import Path

import pytest

from focusquest.modules.missions.cycle_domain import MINUTOS_DO_DIA
from focusquest.modules.missions.schemas import (
    DIFICULDADE_MAXIMA,
    DIFICULDADE_MINIMA,
    MINUTOS_MINIMOS,
    TAMANHO_MAXIMO_DA_EVIDENCIA,
    TAMANHO_MAXIMO_DO_LINK,
)

RAIZ = Path(__file__).resolve().parents[2]
FONTES_DO_FRONT = RAIZ / "frontend/src"
TIPOS_DA_MISSAO = FONTES_DO_FRONT / "shared/types/mission.ts"
RASCUNHO_DO_PLANO = FONTES_DO_FRONT / "features/campaigns/weekPlanDraft.ts"
LIMITES_DA_EVIDENCIA = FONTES_DO_FRONT / "features/missions/evidenceLimit.ts"


def _ler_constante(caminho: Path, nome: str) -> int:
    """O valor de `export const <nome> = <inteiro>` no arquivo TypeScript."""
    declaracao = re.compile(rf"^export const {nome} = (\d[\d_]*)$")
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        achado = declaracao.match(linha.strip())
        if achado:
            return int(achado.group(1).replace("_", ""))
    pytest.fail(
        f"{caminho.relative_to(RAIZ)}: nao achei `export const {nome} = <inteiro>`;"
        " a constante mudou de nome, de forma ou de arquivo"
    )


@pytest.mark.parametrize(
    ("arquivo", "nome", "valor_do_back"),
    [
        (TIPOS_DA_MISSAO, "MAX_DIFFICULTY", DIFICULDADE_MAXIMA),
        (RASCUNHO_DO_PLANO, "MIN_DIFFICULTY", DIFICULDADE_MINIMA),
        (RASCUNHO_DO_PLANO, "MIN_MINUTES", MINUTOS_MINIMOS),
        (RASCUNHO_DO_PLANO, "MAX_MINUTES", MINUTOS_DO_DIA),
        (LIMITES_DA_EVIDENCIA, "MAX_EVIDENCE_LENGTH", TAMANHO_MAXIMO_DA_EVIDENCIA),
        (LIMITES_DA_EVIDENCIA, "MAX_LINK_LENGTH", TAMANHO_MAXIMO_DO_LINK),
    ],
)
def test_front_espelha_o_limite_do_back(
    arquivo: Path, nome: str, valor_do_back: int
) -> None:
    assert _ler_constante(arquivo, nome) == valor_do_back


def test_max_difficulty_e_declarada_uma_vez_no_front() -> None:
    declaracao = re.compile(r"\bconst MAX_DIFFICULTY\b")
    declarantes = sorted(
        str(caminho.relative_to(FONTES_DO_FRONT))
        for caminho in FONTES_DO_FRONT.rglob("*.ts*")
        if ".test." not in caminho.name
        and declaracao.search(caminho.read_text(encoding="utf-8"))
    )

    assert declarantes == ["shared/types/mission.ts"]


def test_leitura_da_constante_aceita_separador_de_milhar(tmp_path: Path) -> None:
    arquivo = tmp_path / "limites.ts"
    arquivo.write_text("export const MAX_MINUTES = 1_440\n", encoding="utf-8")

    assert _ler_constante(arquivo, "MAX_MINUTES") == 1440
