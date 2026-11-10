"""Codigo e documentacao corrente nao citam a franquia de terceiros.

A restricao do produto: nenhum prompt, nome de arquivo, comentario ou texto
cita a personagem nem o jogo de origem. O alcance e o codigo-fonte, o
frontend, a documentacao corrente e o README. `tests/` fica fora porque este
proprio arquivo precisa escrever os termos para procura-los.
"""

import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

# Os nomes so contam no inicio de palavra: "artifact" contem a sequencia e e
# vocabulario legitimo. O "_" nao conta como letra, para "tifa_partnership"
# continuar casando. "ff7" exige limite alfanumerico dos dois lados, para nao
# casar com cor hexadecimal nem hash, mas casa em "ff7_capa".
TERMO_DE_DUAS_PALAVRAS = re.compile(r"final[\s_-]*fantasy", re.IGNORECASE)
TERMOS_PROIBIDOS = re.compile(
    rf"(?<![a-z])tifa|{TERMO_DE_DUAS_PALAVRAS.pattern}|lockhart"
    r"|(?<![a-z0-9])ff7(?![a-z0-9])",
    re.IGNORECASE,
)

PASTAS_VARRIDAS = ("src", "frontend/src", "docs")
ARQUIVOS_VARRIDOS = ("README.md",)
PASTA_DE_NOMES_PUBLICOS = "frontend/public"

# Conteudo binario nao e texto do produto: so o nome desses arquivos e checado.
SUFIXOS_BINARIOS = frozenset(
    {
        ".webp",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".ico",
        ".woff",
        ".woff2",
        ".mp3",
        ".ogg",
        ".wav",
        ".pdf",
    }
)

# Registro historico: specs, planos e o handoff antigo descrevem o que existia
# quando foram escritos, e o historico nao e reescrito.
EXCLUSOES = ("docs/HANDOFF.md", "docs/superpowers/")

# Temporaria. O tolerant reader da migracao 0008 precisa do valor antigo para
# ler linhas legadas. A Tarefa 2.2 (migracao 0010_contract_tifa) remove o
# reader e, junto, esta allowlist; o teste de entrada morta obriga a isso.
# Cada entrada e (caminho, trecho literal da linha), nunca o numero da linha.
ALLOWLIST_TEMPORARIA: tuple[tuple[str, str], ...] = (
    (
        "src/focusquest/modules/missions/models.py",
        '"tifa": OrigemDoReagendamento.KAIRYA,',
    ),
    (
        "src/focusquest/modules/progression/models.py",
        '{"tifa_partnership": Codigo.KAIRYA_PARTNERSHIP}',
    ),
)


def test_codigo_e_docs_nao_citam_franquia() -> None:
    ocorrencias = _ocorrencias_em_texto() + _ocorrencias_em_nomes_binarios()

    assert ocorrencias == [], "\n".join(ocorrencias)


def test_nomes_de_arquivo_publicos_nao_citam_franquia() -> None:
    pasta = RAIZ / PASTA_DE_NOMES_PUBLICOS
    assert pasta.is_dir(), PASTA_DE_NOMES_PUBLICOS
    # So o nome importa: o conteudo sao imagens e SVGs, nao texto do produto.
    nomes = sorted(
        arquivo.relative_to(RAIZ).as_posix()
        for arquivo in pasta.rglob("*")
        if _cita_franquia(arquivo.relative_to(pasta).as_posix())
    )

    assert nomes == [], "\n".join(nomes)


def test_allowlist_de_franquia_nao_tem_entrada_morta() -> None:
    mortas = [
        f"{caminho}: {trecho}"
        for caminho, trecho in ALLOWLIST_TEMPORARIA
        if not any(
            trecho in linha
            for linha in (RAIZ / caminho).read_text(encoding="utf-8").splitlines()
        )
    ]

    assert mortas == [], "\n".join(mortas)


@pytest.mark.parametrize(
    "texto",
    [
        "final-fantasy-bg.webp",
        "final_fantasy",
        "FinalFantasy",
        "ff7_capa.webp",
        "capa_ff7.webp",
        "Tifa",
        "tifa_partnership",
        "LOCKHART",
    ],
)
def test_predicado_acusa_citacao(texto: str) -> None:
    assert _cita_franquia(texto)


@pytest.mark.parametrize("texto", ["artifacts", "#ff7a00", "0xff7", "stiff7"])
def test_predicado_ignora_falso_positivo(texto: str) -> None:
    assert not _cita_franquia(texto)


def test_termo_de_duas_palavras_quebrado_entre_linhas_e_acusado() -> None:
    linhas = ["inspirada em Final", "Fantasy e outras", "linha limpa"]

    assert _numeros_com_citacao(linhas) == [1]


def test_achado_na_linha_isolada_nao_se_repete_no_par() -> None:
    linhas = ["Final Fantasy no fim de Final", "Fantasy no comeco"]

    assert _numeros_com_citacao(linhas) == [1]


def test_termo_inteiro_na_linha_seguinte_nao_acusa_a_anterior() -> None:
    linhas = ["linha limpa", "Final Fantasy"]

    assert _numeros_com_citacao(linhas) == [2]


def _cita_franquia(texto: str) -> bool:
    return TERMOS_PROIBIDOS.search(texto) is not None


def _cita_franquia_entre_linhas(linha: str, proxima: str) -> bool:
    """O termo de duas palavras comeca em `linha` e termina em `proxima`."""
    juncao = len(linha)
    return any(
        achado.start() < juncao and achado.end() > juncao + 1
        for achado in TERMO_DE_DUAS_PALAVRAS.finditer(f"{linha} {proxima}")
    )


def _numeros_com_citacao(linhas: list[str]) -> list[int]:
    """Numeros (a partir de 1) das linhas que citam a franquia.

    Um termo quebrado entre duas linhas e reportado na primeira do par, e uma
    linha que ja cita sozinha nao aparece duas vezes.
    """
    numeros: list[int] = []
    for indice, linha in enumerate(linhas):
        proxima = linhas[indice + 1] if indice + 1 < len(linhas) else ""
        if _cita_franquia(linha) or _cita_franquia_entre_linhas(linha, proxima):
            numeros.append(indice + 1)
    return numeros


def _ocorrencias_em_texto() -> list[str]:
    ocorrencias: list[str] = []
    for arquivo in _arquivos_varridos():
        if arquivo.suffix.lower() in SUFIXOS_BINARIOS:
            continue
        caminho = arquivo.relative_to(RAIZ).as_posix()
        linhas = arquivo.read_text(encoding="utf-8").splitlines()
        ocorrencias.extend(
            f"{caminho}:{numero}: {linhas[numero - 1].strip()}"
            for numero in _numeros_com_citacao(linhas)
            if not _permitida(caminho, linhas[numero - 1])
        )
    return ocorrencias


def _ocorrencias_em_nomes_binarios() -> list[str]:
    caminhos = (
        arquivo.relative_to(RAIZ).as_posix()
        for arquivo in _arquivos_varridos()
        if arquivo.suffix.lower() in SUFIXOS_BINARIOS
    )
    return [f"{c} (nome de arquivo)" for c in caminhos if _cita_franquia(c)]


def _arquivos_varridos() -> list[Path]:
    arquivos = [RAIZ / nome for nome in ARQUIVOS_VARRIDOS]
    for pasta in PASTAS_VARRIDAS:
        assert (RAIZ / pasta).is_dir(), pasta
        arquivos.extend(
            arquivo
            for arquivo in (RAIZ / pasta).rglob("*")
            if arquivo.is_file() and "__pycache__" not in arquivo.parts
        )
    return sorted(a for a in arquivos if not _excluido(a.relative_to(RAIZ).as_posix()))


def _excluido(caminho: str) -> bool:
    return caminho.startswith(EXCLUSOES)


def _permitida(caminho: str, linha: str) -> bool:
    return any(
        caminho == permitido and trecho in linha
        for permitido, trecho in ALLOWLIST_TEMPORARIA
    )
