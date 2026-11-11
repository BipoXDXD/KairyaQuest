"""Fitness function: nenhum par novo de pacotes em `modules/` se importa mutuamente.

A convencao de fronteira 2 (docs/ARCHITECTURE.md §5) proibe dependencia
circular. Dois pares de pacotes ja dependem um do outro e estao registrados na
pendencia 88; este teste impede um terceiro e impede que a allowlist envelheca
quando um dos dois sumir.

A prova e estatica (`ast`): conta todo `import` escrito no arquivo, inclusive
os de dentro de funcao e de `if TYPE_CHECKING`, porque todos criam a
dependencia de codigo-fonte. Chamadas a `importlib.import_module` e
`__import__` ficam fora, como em `test_core_sem_modulos.py`.
"""

import ast
from collections import defaultdict
from pathlib import Path

import pytest

import focusquest.modules

MODULOS = Path(focusquest.modules.__file__).parent
PREFIXO = "focusquest.modules"

Par = frozenset[str]
Arestas = dict[tuple[str, str], list[str]]

PARES_CONHECIDOS: dict[Par, str] = {
    frozenset({"missions", "progression"}): (
        "missions credita a conclusao e mostra a recompensa (D3, D10); "
        "progression le os fatos da missao e o Veredito. Pendencia 88."
    ),
    frozenset({"progression", "tutoring"}): (
        "tutoring le o progresso para o turno da Kairya (D15); progression "
        "le TutorAction para contar as acoes executadas. Pendencia 88."
    ),
}


def pacote_alvo(nome: str) -> str | None:
    """O pacote de `modules/` que o nome absoluto `nome` alcanca, se algum."""
    if not nome.startswith(f"{PREFIXO}."):
        return None
    return nome.removeprefix(f"{PREFIXO}.").split(".")[0]


def nomes_importados(no: ast.Import | ast.ImportFrom, pacote: str) -> set[str]:
    """Nomes absolutos que o `import` alcanca; `pacote` resolve o relativo.

    Em `from a import b`, o `b` pode ser um submodulo, entao `a.b` tambem conta.
    """
    if isinstance(no, ast.Import):
        return {a.name for a in no.names}
    base = no.module or ""
    if no.level:
        partes = pacote.split(".")
        raiz = ".".join(partes[: len(partes) - (no.level - 1)])
        base = f"{raiz}.{base}" if base else raiz
    return {base, *(f"{base}.{a.name}" for a in no.names)}


def arestas_entre_pacotes(raiz: Path) -> Arestas:
    """(origem, destino) -> lista de `arquivo:linha` dos imports que a criam.

    `raiz` e a pasta `modules/`; cada subpasta direta e um pacote.
    """
    arestas: Arestas = defaultdict(list)
    for arquivo in sorted(raiz.rglob("*.py")):
        relativo = arquivo.relative_to(raiz)
        if len(relativo.parts) < 2:
            continue
        origem = relativo.parts[0]
        pacote = ".".join((PREFIXO, *relativo.parent.parts))
        for no in ast.walk(ast.parse(arquivo.read_text())):
            if not isinstance(no, ast.Import | ast.ImportFrom):
                continue
            destinos = {pacote_alvo(n) for n in nomes_importados(no, pacote)}
            for destino in sorted(d for d in destinos if d and d != origem):
                arestas[(origem, destino)].append(f"{relativo}:{no.lineno}")
    return dict(arestas)


def pares_mutuos(arestas: Arestas) -> set[Par]:
    return {frozenset(par) for par in arestas if (par[1], par[0]) in arestas}


def descrever(par: Par, arestas: Arestas) -> str:
    a, b = sorted(par)
    linhas = [f"{a} <-> {b}:"]
    for origem, destino in ((a, b), (b, a)):
        for local in arestas[(origem, destino)]:
            linhas.append(f"  {origem} -> {destino} em {local}")
    return "\n".join(linhas)


def violacoes(arestas: Arestas, conhecidos: set[Par]) -> list[str]:
    """Uma mensagem por par mutuo novo e por par conhecido que deixou de existir."""
    achados = pares_mutuos(arestas)
    novos = sorted(achados - conhecidos, key=sorted)
    velhos = sorted(conhecidos - achados, key=sorted)
    return [
        *(f"par novo nos dois sentidos, {descrever(p, arestas)}" for p in novos),
        *(
            f"par {' <-> '.join(sorted(p))} sumiu: tire-o de PARES_CONHECIDOS"
            for p in velhos
        ),
    ]


def _arvore(tmp_path: Path, arquivos: dict[str, str]) -> Path:
    for caminho, fonte in arquivos.items():
        destino = tmp_path / caminho
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(fonte)
    return tmp_path


@pytest.mark.parametrize(
    ("fonte", "pacote", "esperado"),
    [
        (
            "import focusquest.modules.missions.domain",
            "focusquest.modules.x",
            {"missions"},
        ),
        (
            "from focusquest.modules.missions import domain",
            "focusquest.modules.x",
            {"missions"},
        ),
        (
            "from focusquest.modules import missions, tutoring",
            "focusquest.modules.x",
            {"missions", "tutoring"},
        ),
        ("from ..missions import domain", "focusquest.modules.x", {"missions"}),
        ("from .. import missions", "focusquest.modules.x", {"missions"}),
        ("from ...missions import y", "focusquest.modules.x.sub", {"missions"}),
        ("from . import domain", "focusquest.modules.x", {"x"}),
        ("from focusquest.core import errors", "focusquest.modules.x", set()),
        ("import focusquest.modulesx.missions", "focusquest.modules.x", set()),
        ("import focusquest.modules", "focusquest.modules.x", set()),
    ],
)
def test_resolve_o_pacote_alvo_de_cada_forma_de_import(
    fonte: str, pacote: str, esperado: set[str]
) -> None:
    no = ast.parse(fonte).body[0]
    assert isinstance(no, ast.Import | ast.ImportFrom)
    alvos = {pacote_alvo(n) for n in nomes_importados(no, pacote)}
    assert alvos - {None} == esperado


def test_aresta_guarda_arquivo_e_linha_e_ignora_o_proprio_pacote(
    tmp_path: Path,
) -> None:
    raiz = _arvore(
        tmp_path,
        {
            "__init__.py": "import focusquest.modules.a\n",
            "a/x.py": (
                "import os\n"
                "from focusquest.modules.a import y\n"
                "\n"
                "from focusquest.modules.b import z\n"
            ),
            "a/sub/w.py": "def f() -> None:\n    from ...b import q\n",
        },
    )
    assert arestas_entre_pacotes(raiz) == {
        ("a", "b"): ["a/sub/w.py:2", "a/x.py:4"],
    }


def test_par_mutuo_novo_reprova_com_par_e_arquivo_linha(tmp_path: Path) -> None:
    raiz = _arvore(
        tmp_path,
        {
            "a/x.py": "from focusquest.modules.b import y\n",
            "b/y.py": "\n\nimport focusquest.modules.a.x\n",
            "c/z.py": "from focusquest.modules.a import x\n",
        },
    )
    assert violacoes(arestas_entre_pacotes(raiz), set()) == [
        "par novo nos dois sentidos, a <-> b:\n"
        "  a -> b em a/x.py:1\n"
        "  b -> a em b/y.py:3"
    ]


def test_par_conhecido_que_sumiu_reprova(tmp_path: Path) -> None:
    raiz = _arvore(tmp_path, {"a/x.py": "from focusquest.modules.b import y\n"})
    assert violacoes(arestas_entre_pacotes(raiz), {frozenset({"a", "b"})}) == [
        "par a <-> b sumiu: tire-o de PARES_CONHECIDOS"
    ]


def test_par_conhecido_presente_nao_reprova(tmp_path: Path) -> None:
    raiz = _arvore(
        tmp_path,
        {
            "a/x.py": "from focusquest.modules.b import y\n",
            "b/y.py": "from focusquest.modules.a import x\n",
        },
    )
    assert violacoes(arestas_entre_pacotes(raiz), {frozenset({"a", "b"})}) == []


def test_modules_so_tem_os_pares_mutuos_conhecidos() -> None:
    """Fitness function da convencao de fronteira 2 sobre o `modules/` real."""
    arestas = arestas_entre_pacotes(MODULOS)
    assert arestas, "nenhuma aresta entre pacotes: o detector parou de ler o codigo"
    problemas = violacoes(arestas, set(PARES_CONHECIDOS))
    assert problemas == [], "\n\n".join(problemas)
