"""Fitness function: toda exclusao de cobertura do front exclui algo de fato.

Uma exclusao em `coverage.exclude` do `frontend/vite.config.ts` que nao casa
com nenhum arquivo nao tem efeito hoje, mas tira do denominador, sem
justificativa escrita, o primeiro arquivo futuro que casar com ela. Cada
exclusao precisa casar com ao menos um arquivo de `frontend/src`; a
justificativa de cada uma mora no `docs/QUALITY.md` §3.
"""

import re
from pathlib import Path, PurePosixPath

RAIZ = Path(__file__).resolve().parents[2]
FRONT = RAIZ / "frontend"

_BLOCO_DE_COBERTURA = re.compile(
    r"coverage:\s*\{.*?exclude:\s*\[(?P<lista>[^\]]*)\]", re.S
)
_TEXTO_ENTRE_ASPAS = re.compile(r"'([^']*)'")
_CHAVES = re.compile(r"\{([^{}]*)\}")


def _exclusoes_de_cobertura() -> list[str]:
    configuracao = (FRONT / "vite.config.ts").read_text(encoding="utf-8")
    bloco = _BLOCO_DE_COBERTURA.search(configuracao)
    assert bloco is not None, "coverage.exclude nao encontrado no vite.config.ts"
    return _TEXTO_ENTRE_ASPAS.findall(bloco.group("lista"))


def _expandir_chaves(padrao: str) -> list[str]:
    """`a.{ts,tsx}` vira `a.ts` e `a.tsx`; o `full_match` nao entende chaves."""
    grupo = _CHAVES.search(padrao)
    if grupo is None:
        return [padrao]
    inicio, fim = padrao[: grupo.start()], padrao[grupo.end() :]
    return [
        expandido
        for opcao in grupo.group(1).split(",")
        for expandido in _expandir_chaves(inicio + opcao + fim)
    ]


def _arquivos_de_src() -> list[PurePosixPath]:
    """Os arquivos de `frontend/src`, relativos a `frontend/` (como no config).

    Lidos do disco, e nao do `git ls-files`: dentro do hook de commit o git
    exporta `GIT_DIR`/`GIT_INDEX_FILE`, e o `ls-files` rodado em `frontend/`
    nao devolvia nada (medido: todas as exclusoes pareciam mortas).
    """
    return [
        PurePosixPath(arquivo.relative_to(FRONT).as_posix())
        for arquivo in (FRONT / "src").rglob("*")
        if arquivo.is_file()
    ]


def test_o_parser_le_as_exclusoes_conhecidas() -> None:
    # Sentinela: sem ela, um parser que nao achasse nada aprovaria o teste
    # abaixo por vacuidade.
    assert "src/test/**" in _exclusoes_de_cobertura()


def test_a_expansao_de_chaves_gera_cada_opcao() -> None:
    assert _expandir_chaves("src/**/*.test.{ts,tsx}") == [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
    ]


def test_toda_exclusao_de_cobertura_casa_com_algum_arquivo() -> None:
    arquivos = _arquivos_de_src()

    sem_efeito = [
        exclusao
        for exclusao in _exclusoes_de_cobertura()
        if not any(
            arquivo.full_match(padrao)
            for padrao in _expandir_chaves(exclusao)
            for arquivo in arquivos
        )
    ]

    assert sem_efeito == []
