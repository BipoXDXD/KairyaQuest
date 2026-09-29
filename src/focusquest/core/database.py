"""Criacao da engine e da sessao do SQLAlchemy.

As duas dependencias que as rotas consomem moram aqui, e nao em `main.py`, por
uma razao estrutural: `main.py` importa o router para registra-lo, entao um
router que precisasse importar `main.py` de volta fecharia um ciclo de imports
-- e o `get_engine` nasceu em `main.py` porque `/ready` era o unico
consumidor. Agora ha dois modulos consumindo, que e exatamente a condicao que o
`docs/ARCHITECTURE.md` poe para uma peca viver em `core/`: "configuracao,
conexao e infraestrutura comum a todos os modulos".

O preco e o `Depends` do FastAPI aparecer em `core/`. E o preco certo: a
dependencia de sessao E a fronteira da transacao da requisicao, e a fronteira
pertence a camada que abre a conexao, nao a cada modulo que a usa.
"""

from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import ConnectionPoolEntry, Pool

from focusquest.core.config import Settings


def _fixar_sessao_em_utc(conexao_dbapi: Any, _registro: ConnectionPoolEntry) -> None:
    """Poe a sessao do PostgreSQL em UTC, em toda conexao nova do pool.

    O `timestamptz` volta no `TimeZone` da SESSAO, e o psycopg nao le um
    instante que, nesse fuso, cai fora dos anos 1 a 9999: com a sessao em
    `Asia/Tokyo`, `9999-12-31T23:59:59Z` vira ano 10000 na leitura, e com ela
    em `America/Sao_Paulo`, `0001-01-01T00:00:00Z` cai antes do ano 1
    (medido). A guarda do schema confere a faixa EM UTC; e esta funcao que
    torna UTC o fuso em que a leitura de fato acontece -- e, de quebra, faz
    todo instante lido do banco sair com `Z`.

    Por que um `SET` depois de conectar, e nao `options=-c timezone=UTC` na
    URL: a `libpq` manda a variavel `PGTZ` do ambiente no pacote de partida, e
    o servidor a aplica DEPOIS das `options` -- com `PGTZ` definido, o
    `options` perde (medido: `SHOW TimeZone` responde o fuso do `PGTZ`). O
    `SET` roda depois de tudo que o ambiente, o `postgresql.conf`, o
    `ALTER DATABASE` e o `ALTER ROLE` possam ter escolhido.

    O `autocommit` ligado durante o `SET` nao e detalhe: sem ele o `SET` roda
    na transacao implicita do psycopg, o pool faz rollback ao receber a
    conexao de volta, e o rollback desfaz o `SET` -- a partir do segundo uso a
    sessao voltava ao fuso do ambiente (medido).
    """
    autocommit_anterior = conexao_dbapi.autocommit
    conexao_dbapi.autocommit = True
    try:
        with conexao_dbapi.cursor() as cursor:
            cursor.execute("SET TIME ZONE 'UTC'")
    finally:
        conexao_dbapi.autocommit = autocommit_anterior


def create_engine_from_url(url: str, poolclass: type[Pool] | None = None) -> Engine:
    """Cria a engine -- e e o UNICO lugar onde uma engine desta base nasce: a
    aplicacao, a suite de testes e o Alembic passam por aqui, e por isso
    conectam todos com a mesma configuracao (sessao em UTC, ver
    `_fixar_sessao_em_utc`). Uma engine montada por outro caminho seria uma
    configuracao que os testes nao exercitam.

    `pool_pre_ping` testa a `connection` antes de entrega-la: sem isso o pool
    reaproveita uma que morreu quando o banco reiniciou, o que acontece com
    frequencia em desenvolvimento. `poolclass` existe para o Alembic, que usa
    `NullPool` -- um processo de migracao nao tem por que manter conexao
    aberta; `None` fica com o pool padrao do dialeto.

    O listener nao abre conexao: roda so quando o pool cria uma. A engine
    continua preguicosa, e os testes que dependem disso (a guarda do banco de
    teste so le `engine.url`) continuam valendo."""
    engine = create_engine(url, pool_pre_ping=True, poolclass=poolclass)
    event.listen(engine, "connect", _fixar_sessao_em_utc)
    return engine


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


# A sessao da requisicao, escrita uma vez. Repetir o `Annotated` em cada
# assinatura convidaria a divergirem.
SessaoDaRequisicao = Annotated[Session, Depends(get_session)]
