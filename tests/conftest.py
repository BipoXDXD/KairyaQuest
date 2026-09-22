"""Guardas que valem para a suite inteira, unidade e integracao."""

from collections.abc import Iterator

import pytest

# A porta 9 e a do servico "discard", fechada em qualquer maquina de
# desenvolvimento e no runner do CI: uma conexao ali e recusada na hora.
ANTHROPIC_INALCANCAVEL = "http://127.0.0.1:9"


@pytest.fixture(autouse=True, scope="session")
def _nenhum_teste_alcanca_a_anthropic() -> Iterator[None]:
    """Aponta o provedor para uma porta fechada durante a suite inteira.

    O .env local do dono tem a chave de verdade (spec do 1b, decisao D1), o
    `Settings()` dos testes le esse .env, e o `pre-push` exporta toda
    `FOCUSQUEST_*` dele para o worktree do gate. Sem esta guarda, um teste que
    esquecesse de trocar o provedor pelo servidor falso faria uma chamada PAGA
    -- e passaria, o que e pior. Com ela, o esquecimento vira erro de conexao.

    A variavel de ambiente vence o .env (ordem de fontes do pydantic-settings),
    e o escopo de sessao a instala antes do primeiro teste.
    """
    with pytest.MonkeyPatch.context() as ambiente:
        ambiente.setenv("FOCUSQUEST_ANTHROPIC_BASE_URL", ANTHROPIC_INALCANCAVEL)
        yield
