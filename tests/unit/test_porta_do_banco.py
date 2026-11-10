"""A porta do PostgreSQL no host concorda em todas as fontes (pendencia 11).

A porta aparece repetida em compose, `.env.example`, workflow do CI e
documentacao. A referencia e o padrao de `Settings.db_port`; cada fonte
funcional tem um extrator com contagem esperada, para que uma linha
reformatada nao faca o teste passar por nao achar nada. Uma varredura confere
mencoes em comentarios dos arquivos listados, e um `git grep` recusa arquivo
rastreado novo que repita a porta fora da lista.

Residuo conhecido: uma porta DIFERENTE num arquivo novo fora da lista nao e
detectada. A lista e o que se declarou como fonte.
"""

import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import make_url

from focusquest.core.config import Settings


@dataclass(frozen=True)
class Ocorrencia:
    arquivo: str
    linha: int
    porta: int

    def __str__(self) -> str:
        return f"{self.arquivo}:{self.linha}: {self.porta}"


def ocorrencias_em(
    arquivo: str, texto: str, padrao: str, converter: Callable[[str], int]
) -> list[Ocorrencia]:
    """Converte o grupo 1 de cada casamento de `padrao`, linha a linha (1-based)."""
    achadas: list[Ocorrencia] = []
    for numero, linha in enumerate(texto.splitlines(), start=1):
        for casamento in re.finditer(padrao, linha):
            try:
                porta = converter(casamento.group(1))
            except ValueError as erro:
                raise ValueError(f"{arquivo}:{numero}: {erro}") from erro
            achadas.append(Ocorrencia(arquivo, numero, porta))
    return achadas


def porta_da_url(url: str) -> int:
    porta = make_url(url).port
    if porta is None:
        raise ValueError("URL sem porta explicita")
    return porta


def test_ocorrencia_aponta_arquivo_linha_e_porta() -> None:
    texto = "# comentario\nFOCUSQUEST_DB_PORT=55433\n"
    achadas = ocorrencias_em(".env.example", texto, r"^FOCUSQUEST_DB_PORT=(\d+)$", int)
    assert achadas == [Ocorrencia(".env.example", 2, 55433)]
    assert str(achadas[0]) == ".env.example:2: 55433"


def test_porta_vem_da_url_do_banco() -> None:
    url = "postgresql+psycopg://u:p@127.0.0.1:55432/focusquest_test"
    assert porta_da_url(url) == 55432


def test_url_sem_porta_e_recusada_com_o_local() -> None:
    texto = "FOCUSQUEST_DATABASE_URL=postgresql+psycopg://u:p@127.0.0.1/focusquest\n"
    with pytest.raises(ValueError, match=r"^\.env\.example:1: URL sem porta"):
        ocorrencias_em(
            ".env.example", texto, r"^FOCUSQUEST_DATABASE_URL=(\S+)$", porta_da_url
        )


RAIZ = Path(__file__).resolve().parents[2]


def _padrao() -> int:
    padrao = Settings.model_fields["db_port"].default
    assert isinstance(padrao, int)
    return padrao


PADRAO = _padrao()


@dataclass(frozen=True)
class Extrator:
    arquivo: str
    padrao: str
    esperadas: int
    converter: Callable[[str], int] = int


# Contagem esperada de proposito: uma linha reformatada que o regex deixe de
# achar reprova aqui, em vez de passar por nao haver nada para comparar.
EXTRATORES = (
    Extrator("compose.yaml", r"\$\{FOCUSQUEST_DB_PORT:-(\d+)\}:5432", 1),
    Extrator(".env.example", r"^FOCUSQUEST_DB_PORT=(\d+)$", 1),
    Extrator(
        ".env.example", r"^FOCUSQUEST_(?:TEST_)?DATABASE_URL=(\S+)$", 2, porta_da_url
    ),
    Extrator(".github/workflows/quality.yml", r"^\s*-\s*(\d+):5432\s*$", 2),
    Extrator(
        ".github/workflows/quality.yml",
        r"FOCUSQUEST_(?:TEST_)?DATABASE_URL:\s*(\S+)",
        4,
        porta_da_url,
    ),
    Extrator(".github/workflows/quality.yml", r"\bpsql\b.*\s-p\s+(\d+)\b", 2),
)

# Arquivos que FALAM da porta, inclusive em comentario. Toda mencao `55xxx`
# neles precisa ser a porta padrao.
ARQUIVOS_QUE_CITAM_A_PORTA = (
    "src/focusquest/core/config.py",
    ".env.example",
    "compose.yaml",
    ".github/workflows/quality.yml",
    "docs/QUALITY.md",
    "frontend/tests/e2e/servers.ts",
)

# Fora da varredura do git grep: dados de teste (URLs de exemplo sao entrada
# de parser, nao configuracao), a narrativa do HANDOFF e os lockfiles.
FORA_DA_VARREDURA = (
    ":!tests/",
    ":!docs/HANDOFF.md",
    ":!uv.lock",
    ":!frontend/package-lock.json",
)


def test_padrao_do_settings_e_a_porta_documentada() -> None:
    assert PADRAO == 55432


@pytest.mark.parametrize(
    "extrator", EXTRATORES, ids=lambda e: f"{e.arquivo}:{e.padrao}"
)
def test_fonte_declara_a_porta_padrao_na_quantidade_esperada(
    extrator: Extrator,
) -> None:
    texto = (RAIZ / extrator.arquivo).read_text(encoding="utf-8")
    achadas = ocorrencias_em(
        extrator.arquivo, texto, extrator.padrao, extrator.converter
    )
    assert len(achadas) == extrator.esperadas, (
        f"{extrator.arquivo}: esperadas {extrator.esperadas} ocorrencias de "
        f"{extrator.padrao!r}, achadas {len(achadas)} -- o formato mudou?"
    )
    divergentes = [str(o) for o in achadas if o.porta != PADRAO]
    assert divergentes == [], (
        f"porta diferente de Settings.db_port ({PADRAO}): {divergentes}"
    )


def test_mencoes_de_porta_nos_arquivos_que_citam_a_porta_concordam() -> None:
    divergentes = [
        str(o)
        for arquivo in ARQUIVOS_QUE_CITAM_A_PORTA
        for o in ocorrencias_em(
            arquivo,
            (RAIZ / arquivo).read_text(encoding="utf-8"),
            r"\b(55\d{3})\b",
            int,
        )
        if o.porta != PADRAO
    ]
    assert divergentes == [], f"mencao divergente de {PADRAO}: {divergentes}"


def test_nenhum_arquivo_fora_da_lista_repete_a_porta() -> None:
    resultado = subprocess.run(
        ["git", "grep", "-lwI", str(PADRAO), "--", ".", *FORA_DA_VARREDURA],
        cwd=RAIZ,
        capture_output=True,
        text=True,
        check=False,
    )
    # git grep: 0 = achou, 1 = nada achado; qualquer outro codigo e erro real.
    assert resultado.returncode in (0, 1), resultado.stderr
    desconhecidos = sorted(
        set(resultado.stdout.split()) - set(ARQUIVOS_QUE_CITAM_A_PORTA)
    )
    assert desconhecidos == [], (
        f"arquivos que repetem {PADRAO} sem estar em ARQUIVOS_QUE_CITAM_A_PORTA "
        f"(acrescente-os e, se funcionais, um Extrator): {desconhecidos}"
    )
