"""O prompt de sistema da Kairya (README s5), um arquivo por idioma.

Os textos moram em `prompts/persona.<idioma>.md`, versionados com o codigo, e
sao texto de produto: vao para o modelo, nao para quem mantem o codigo. As
falas sao originais; nenhuma frase dos jogos. A estrutura (secoes numeradas,
ferramentas, regra anti-injecao no fim) e a mesma nos dois arquivos, e
`tests/unit/test_prompts_concordancia.py` a confere.

O pacote instalado le os `.md` por `importlib.resources`: eles PRECISAM estar
no wheel (`make check-wheel`).
"""

from collections.abc import Mapping
from functools import cache
from importlib.resources import files

from focusquest.core.idioma import Idioma
from focusquest.core.prompts import carregar_prompts


@cache
def personas() -> Mapping[Idioma, str]:
    """A persona de todo idioma, lida e validada uma vez por processo.

    A partida do app chama esta funcao (`main._ciclo_de_vida`): um arquivo
    ausente ou vazio derruba o boot, nao o primeiro turno.
    """
    return carregar_prompts(files(__package__) / "prompts", "persona")


def persona_do_idioma(idioma: Idioma) -> str:
    """A persona inteira do idioma.

    O texto e o prefixo cacheado do provedor (Tarefa 1.2): o mesmo objeto a
    cada turno do mesmo idioma, sem nada variavel dentro dele.
    """
    return personas()[idioma]
