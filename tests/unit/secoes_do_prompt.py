"""As secoes numeradas (`## N. Titulo`) de um prompt em Markdown.

Compartilhado pelos testes da persona e da concordancia entre idiomas: as
invariantes de estrutura se escrevem pelo NUMERO da secao, que e o mesmo nos
dois idiomas, e nao pelo titulo, que muda com a lingua.
"""

import re

SECAO = re.compile(r"^## (\d+)\. .*$", re.M)


def secoes(texto: str) -> dict[str, str]:
    """Numero da secao -> corpo, do fim do cabecalho ate o proximo cabecalho
    numerado. Um cabecalho sem numero seria engolido pelo corpo; por isso
    `test_todo_cabecalho_e_numerado` o proibe nos prompts."""
    cabecalhos = list(SECAO.finditer(texto))
    corpos: dict[str, str] = {}
    for atual, seguinte in zip(cabecalhos, [*cabecalhos[1:], None], strict=True):
        fim = len(texto) if seguinte is None else seguinte.start()
        corpos[atual[1]] = texto[atual.end() : fim]
    return corpos
