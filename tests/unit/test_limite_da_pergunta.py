"""O limite da pergunta a tutora e o mesmo nos dois lados (pendencia 41).

O dono decidiu 4000 caracteres. O backend recusa acima disso
(`TAMANHO_MAXIMO_DA_PERGUNTA`) e o frontend avisa antes de enviar
(`MAX_QUESTION_LENGTH`). Se um lado mudar sem o outro, a tela aceita o que a
API recusa com 422, ou recusa o que a API aceitaria. O frontend nao tem como
importar Python, entao este teste le o arquivo TypeScript como texto.
"""

import re
from pathlib import Path

import pytest

from focusquest.modules.tutoring import schemas
from focusquest.modules.tutoring.schemas import TAMANHO_MAXIMO_DA_PERGUNTA

RAIZ = Path(__file__).resolve().parents[2]
ARQUIVO_DO_FRONT = RAIZ / "frontend/src/features/tutoring/questionLimit.ts"
ARQUIVO_DO_BACK = Path(schemas.__file__).resolve()

# O TypeScript aceita separador numerico (`4_000`), e o `int` do Python tambem.
DECLARACAO_DO_FRONT = re.compile(r"^export const MAX_QUESTION_LENGTH = (\d[\d_]*)$")
DECLARACAO_DO_BACK = re.compile(r"^TAMANHO_MAXIMO_DA_PERGUNTA = ")

LIMITE_DECIDIDO = 4000


def _relativo(caminho: Path) -> Path:
    return caminho.relative_to(RAIZ) if caminho.is_relative_to(RAIZ) else caminho


def _onde(caminho: Path, linha: int) -> str:
    return f"{_relativo(caminho)}:{linha}"


def _linhas_numeradas(caminho: Path) -> list[tuple[int, str]]:
    return list(enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1))


def _ler_limite_do_front(caminho: Path) -> tuple[int, int]:
    """Devolve (valor, numero da linha) da declaracao de `MAX_QUESTION_LENGTH`."""
    for numero, texto in _linhas_numeradas(caminho):
        achado = DECLARACAO_DO_FRONT.match(texto.strip())
        if achado:
            return int(achado.group(1)), numero
    pytest.fail(
        f"{_relativo(caminho)}: nao achei "
        "`export const MAX_QUESTION_LENGTH = <inteiro>`; "
        "a constante mudou de nome, de forma ou de arquivo"
    )


def _linha_do_back(caminho: Path) -> int:
    for numero, texto in _linhas_numeradas(caminho):
        if DECLARACAO_DO_BACK.match(texto):
            return numero
    pytest.fail(
        f"{_relativo(caminho)}: nao achei a declaracao de `TAMANHO_MAXIMO_DA_PERGUNTA`"
    )


def test_front_e_back_usam_o_mesmo_limite_da_pergunta() -> None:
    valor_do_front, linha_do_front = _ler_limite_do_front(ARQUIVO_DO_FRONT)
    linha_do_back = _linha_do_back(ARQUIVO_DO_BACK)

    assert valor_do_front == TAMANHO_MAXIMO_DA_PERGUNTA, (
        f"limite da pergunta divergente: {_onde(ARQUIVO_DO_FRONT, linha_do_front)} diz "
        f"{valor_do_front}, {_onde(ARQUIVO_DO_BACK, linha_do_back)} diz "
        f"{TAMANHO_MAXIMO_DA_PERGUNTA}"
    )


def test_o_limite_e_o_decidido_pelo_dono() -> None:
    # Mudar o numero e decisao de produto (pendencia 41), nao ajuste de codigo.
    assert TAMANHO_MAXIMO_DA_PERGUNTA == LIMITE_DECIDIDO


def test_leitura_do_front_devolve_valor_e_linha(tmp_path: Path) -> None:
    arquivo = tmp_path / "questionLimit.ts"
    arquivo.write_text(
        "/** doc */\n\nexport const MAX_QUESTION_LENGTH = 4_000\n", encoding="utf-8"
    )

    assert _ler_limite_do_front(arquivo) == (4000, 3)


@pytest.mark.parametrize(
    "conteudo",
    [
        "",
        "export const MAX_LENGTH = 4000\n",
        "export const MAX_QUESTION_LENGTH = LIMITE\n",
        "// export const MAX_QUESTION_LENGTH = 4000\n",
    ],
    ids=["vazio", "outro-nome", "nao-literal", "comentado"],
)
def test_leitura_do_front_falha_com_o_arquivo_quando_nao_acha_a_constante(
    tmp_path: Path, conteudo: str
) -> None:
    arquivo = tmp_path / "questionLimit.ts"
    arquivo.write_text(conteudo, encoding="utf-8")

    with pytest.raises(pytest.fail.Exception, match=re.escape(str(arquivo))):
        _ler_limite_do_front(arquivo)
