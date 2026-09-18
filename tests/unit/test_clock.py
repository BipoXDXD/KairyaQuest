"""O relogio da aplicacao: a dependencia que o FastAPI injeta e o relogio real.

Os dois testes existem porque TODO outro teste substitui a dependencia: o
servico recebe um relogio fixo, e a API recebe o relogio fixo por
`dependency_overrides`. Substituir uma dependencia nao a testa -- e a licao do
`get_engine` no Incremento 1a, cujo corpo so foi exercitado quando alguem o
chamou direto.
"""

from datetime import UTC, datetime

from focusquest.core.clock import get_clock, system_now


def test_system_now_devolve_o_instante_atual_em_utc() -> None:
    """Instante com fuso, e o fuso e UTC -- nao so "tem tzinfo".

    `tzinfo is not None` sozinho aprovaria um relogio em `America/Sao_Paulo`,
    e a coluna `timestamptz` gravaria o mesmo instante; o que se exige aqui e
    que a aplicacao trabalhe em UTC e so a TELA converta (README s8).
    """
    antes = datetime.now(UTC)

    agora = system_now()

    assert agora.utcoffset() is not None
    assert agora.tzinfo is UTC
    assert antes <= agora <= datetime.now(UTC)


def test_get_clock_entrega_o_relogio_real() -> None:
    """A dependencia devolve o RELOGIO, nao um instante.

    E o que permite ao servico ler a hora depois de travar a linha: um
    instante resolvido pela dependencia seria lido antes de a rota comecar,
    e portanto antes da trava.
    """
    assert get_clock() is system_now
