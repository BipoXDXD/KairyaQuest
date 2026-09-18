"""Criacao da engine e da sessao do SQLAlchemy.

As duas dependencias que as rotas consomem moram aqui, e nao em `main.py`, por
uma razao estrutural: `main.py` importa o router para registra-lo, entao um
router que precisasse importar `main.py` de volta fecharia um ciclo de imports
-- e o `get_engine` nasceu em `main.py` porque, na Task 4, `/ready` era o unico
consumidor. Agora ha dois modulos consumindo, que e exatamente a condicao que o
`docs/ARCHITECTURE.md` poe para uma peca viver em `core/`: "configuracao,
conexao e infraestrutura comum a todos os modulos".

O preco e o `Depends` do FastAPI aparecer em `core/`. E o preco certo: a
dependencia de sessao E a fronteira da transacao da requisicao, e a fronteira
pertence a camada que abre a conexao, nao a cada modulo que a usa.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from focusquest.core.config import Settings


def create_engine_from_url(url: str) -> Engine:
    """Cria a engine. `pool_pre_ping` testa a `connection` antes de entrega-la:
    sem isso o pool reaproveita uma que morreu quando o banco reiniciou, o que
    acontece com frequencia em desenvolvimento."""
    return create_engine(url, pool_pre_ping=True)


_engine: Engine | None = None


def get_engine() -> Engine:
    """Engine compartilhada, criada na primeira chamada.

    Os testes substituem esta dependencia; por isso ela e uma funcao e nao
    uma variavel de modulo lida diretamente.
    """
    global _engine
    if _engine is None:
        _engine = create_engine_from_url(Settings().database_url)
    return _engine


def get_session(engine: Annotated[Engine, Depends(get_engine)]) -> Iterator[Session]:
    """Uma sessao -- e uma transacao -- por requisicao.

    Quem commita e a ROTA, nao esta dependencia. A diferenca aparece no caso
    que importa: um commit escrito depois do `yield` roda quando a resposta ja
    foi montada, e um commit que falhasse ali nao teria mais como mudar o
    status -- o cliente receberia 201 sobre nada gravado. Commitando na rota,
    a falha do commit ainda vira 500, que e a verdade.

    O que esta dependencia garante e o outro lado: o `with` fecha a sessao ao
    final da requisicao, tenha ela dado certo ou nao. Uma excecao na rota e
    relancada aqui dentro pelo FastAPI, o `with` sai pelo caminho de erro e o
    que estava pela metade e revertido antes de qualquer handler responder.
    Sem isso a conexao ficaria fora do pool, e algumas requisicoes com erro
    pendurariam a aplicacao inteira.

    `expire_on_commit=False` nao e otimizacao. Com o padrao (`True`), cada
    atributo lido depois do commit -- e a resposta e montada depois dele --
    dispararia um SELECT novo, em uma transacao NOVA: o corpo devolvido
    poderia mostrar o que outra transacao escreveu no intervalo, em vez do que
    esta requisicao fez. O payload precisa ser o resultado do proprio pedido.
    """
    with Session(bind=engine, expire_on_commit=False) as session:
        yield session
