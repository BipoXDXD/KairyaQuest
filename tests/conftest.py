"""Guardas que valem para a suite inteira, unidade e integracao."""

from collections.abc import Iterator

import pytest

# A porta 9 e a do servico "discard", fechada em qualquer maquina de
# desenvolvimento e no runner do CI: uma conexao ali e recusada na hora.
ANTHROPIC_INALCANCAVEL = "http://127.0.0.1:9"


@pytest.fixture(autouse=True, scope="session")
def _nenhum_teste_alcanca_a_anthropic() -> Iterator[None]:
    """Aponta o provedor para uma porta fechada durante a suite inteira.

    A chave de verdade mora no Keychain do macOS (decisao D-a, emenda E1 do
    1b-2), nunca no .env nem no ambiente do shell. Esta guarda protege contra
    o erro: uma chave posta por engano no ambiente ou no .env local do dono, e
    contra o `pre-push`, que exporta toda `FOCUSQUEST_*` do .env para o
    worktree do gate (docs/QUALITY.md s6). Sem esta guarda, um teste que
    esquecesse de trocar o provedor pelo servidor falso faria uma chamada PAGA
    nesse cenario -- e passaria, o que e pior. Com ela, o esquecimento vira
    erro de conexao.

    A variavel de ambiente vence o .env (ordem de fontes do pydantic-settings),
    e o escopo de sessao a instala antes do primeiro teste.
    """
    with pytest.MonkeyPatch.context() as ambiente:
        ambiente.setenv("FOCUSQUEST_ANTHROPIC_BASE_URL", ANTHROPIC_INALCANCAVEL)
        yield
