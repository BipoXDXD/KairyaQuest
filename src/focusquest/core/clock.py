"""O relogio da aplicacao: a unica fonte do instante atual.

Nenhum modulo da aplicacao chama `datetime.now` direto: quem precisa da hora
recebe um `Clock` -- o servico, como argumento; a rota, pela dependencia
`get_clock`. (O `created_at` das tabelas vem do `now()` do banco, por
`server_default`: e registro de auditoria, e nao regra.) Os testes substituem
a dependencia por um relogio fixo (README s8: relogio injetado nos testes), e
nao existe gancho de teste neste arquivo: nenhuma variavel de ambiente, nenhum
"modo de teste", nenhuma global para trocar.

A dependencia devolve o RELOGIO, e nao o instante, por uma razao de ordem. Um
instante resolvido pelo FastAPI seria lido ANTES de a rota comecar -- portanto
antes de o servico travar a linha da missao. Duas conclusoes simultaneas
leriam a hora, e a segunda esperaria a trava com um instante ja velho. Com o
relogio na mao, o servico le a hora DEPOIS da trava, e a leitura fica dentro
da secao serializada (spec do ciclo diario, decisao C13).
"""

from collections.abc import Callable
from datetime import UTC, datetime

# Um relogio e uma funcao sem argumentos que devolve o instante atual, COM
# fuso. Uma funcao, e nao uma classe com metodo `now()`: e a menor coisa que
# resolve, e um teste o substitui com `lambda: INSTANTE`.
Clock = Callable[[], datetime]


def system_now() -> datetime:
    """O instante atual, em UTC. E o relogio de producao."""
    return datetime.now(UTC)


def get_clock() -> Clock:
    """Dependencia do FastAPI: entrega o relogio real.

    Os testes a substituem por `app.dependency_overrides[get_clock]`. Ela
    precisa ser uma funcao, e nao o proprio `system_now` passado ao `Depends`:
    com `Depends(system_now)` o FastAPI chamaria o relogio e injetaria o
    INSTANTE, que e exatamente o que o paragrafo de cima recusa.
    """
    return system_now
