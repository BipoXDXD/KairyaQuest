"""O teto de cada texto do plano da semana e o mesmo nos dois lados (#142).

O backend recusa acima de `TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO` com 422 e o
formulario do frontend avisa antes de enviar (`MAX_TEXT_LENGTH`). O frontend
nao tem como importar Python, entao este teste le o arquivo TypeScript como
texto, no molde de `test_limite_da_pergunta.py`.

As contagens diferem de proposito, e no sentido seguro: o front conta
unidades UTF-16 (`String.length`, o mesmo do `maxLength` do campo) e o back
conta pontos de codigo (`len` do Python). Um caractere fora do BMP vale 2 no
front e 1 no back, entao todo texto que o front aceita o back tambem aceita.
"""

import re
from pathlib import Path

import pytest

from focusquest.modules.missions import cycle_schemas
from focusquest.modules.missions.cycle_schemas import (
    TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO,
)

RAIZ = Path(__file__).resolve().parents[2]
ARQUIVO_DO_FRONT = RAIZ / "frontend/src/features/campaigns/weekPlanDraft.ts"
ARQUIVO_DO_BACK = Path(cycle_schemas.__file__).resolve()

DECLARACAO_DO_FRONT = re.compile(r"^export const MAX_TEXT_LENGTH = (\d[\d_]*)$")
DECLARACAO_DO_BACK = re.compile(r"^TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO = ")


def _relativo(caminho: Path) -> Path:
    return caminho.relative_to(RAIZ) if caminho.is_relative_to(RAIZ) else caminho


def _linhas_numeradas(caminho: Path) -> list[tuple[int, str]]:
    return list(enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1))


def _ler_limite_do_front(caminho: Path) -> tuple[int, int]:
    """Devolve (valor, numero da linha) da declaracao de `MAX_TEXT_LENGTH`."""
    for numero, texto in _linhas_numeradas(caminho):
        achado = DECLARACAO_DO_FRONT.match(texto.strip())
        if achado:
            return int(achado.group(1)), numero
    pytest.fail(
        f"{_relativo(caminho)}: nao achei `export const MAX_TEXT_LENGTH = <inteiro>`; "
        "a constante mudou de nome, de forma ou de arquivo"
    )


def _linha_do_back(caminho: Path) -> int:
    for numero, texto in _linhas_numeradas(caminho):
        if DECLARACAO_DO_BACK.match(texto):
            return numero
    pytest.fail(
        f"{_relativo(caminho)}: nao achei a declaracao de "
        "`TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO`"
    )


def test_front_e_back_usam_o_mesmo_teto_do_texto_do_plano() -> None:
    valor_do_front, linha_do_front = _ler_limite_do_front(ARQUIVO_DO_FRONT)
    linha_do_back = _linha_do_back(ARQUIVO_DO_BACK)

    assert valor_do_front == TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO, (
        f"teto do texto do plano divergente: "
        f"{_relativo(ARQUIVO_DO_FRONT)}:{linha_do_front} diz {valor_do_front}, "
        f"{_relativo(ARQUIVO_DO_BACK)}:{linha_do_back} diz "
        f"{TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO}"
    )


def test_leitura_do_front_devolve_valor_e_linha(tmp_path: Path) -> None:
    arquivo = tmp_path / "weekPlanDraft.ts"
    arquivo.write_text(
        "/** doc */\nexport const MAX_TEXT_LENGTH = 500\n", encoding="utf-8"
    )

    assert _ler_limite_do_front(arquivo) == (500, 2)


@pytest.mark.parametrize(
    "conteudo",
    [
        "",
        "export const MAX_LENGTH = 500\n",
        "export const MAX_TEXT_LENGTH = LIMITE\n",
        "// export const MAX_TEXT_LENGTH = 500\n",
    ],
    ids=["vazio", "outro-nome", "nao-literal", "comentado"],
)
def test_leitura_do_front_falha_com_o_arquivo_quando_nao_acha_a_constante(
    tmp_path: Path, conteudo: str
) -> None:
    arquivo = tmp_path / "weekPlanDraft.ts"
    arquivo.write_text(conteudo, encoding="utf-8")

    with pytest.raises(pytest.fail.Exception, match=re.escape(str(arquivo))):
        _ler_limite_do_front(arquivo)


def test_leitura_do_back_falha_com_o_arquivo_quando_nao_acha_a_constante(
    tmp_path: Path,
) -> None:
    arquivo = tmp_path / "cycle_schemas.py"
    arquivo.write_text("OUTRO = 500\n", encoding="utf-8")

    with pytest.raises(pytest.fail.Exception, match=re.escape(str(arquivo))):
        _linha_do_back(arquivo)
