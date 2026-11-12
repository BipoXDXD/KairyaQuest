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

import threading
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends
from pydantic import ValidationError
from pydantic_core import ErrorDetails
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


# Quanto uma rota espera por uma conexao quando o pool (5 + 10 de overflow) esta
# esgotado, antes de falhar. O padrao do SQLAlchemy e 30 s, acima dos 20 s que
# o navegador da as rotas de leitura e mutacao: ele desistiria primeiro, e a
# rota ainda esperaria. 10 s deixa metade dessa janela para a consulta e a volta
# pela rede depois que a conexao chega. Julgamento, sem medida;
# `tests/unit/test_prazos_coerentes.py` confere a relacao com os prazos do
# frontend.
POOL_TIMEOUT_SEGUNDOS = 10


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
    aberta; `None` fica com o pool padrao do dialeto, com o `pool_timeout` de
    `POOL_TIMEOUT_SEGUNDOS`.

    O listener nao abre conexao: roda so quando o pool cria uma. A engine
    continua preguicosa, e os testes que dependem disso (a guarda do banco de
    teste so le `engine.url`) continuam valendo."""
    # `pool_timeout` e argumento do QueuePool: o NullPool do Alembic o recusa.
    # `poolclass` so chega preenchido pelo Alembic; `None` e o QueuePool do
    # dialeto, o unico pool que tem fila para esperar.
    argumentos_do_pool = (
        {"pool_timeout": POOL_TIMEOUT_SEGUNDOS} if poolclass is None else {}
    )
    engine = create_engine(
        url, pool_pre_ping=True, poolclass=poolclass, **argumentos_do_pool
    )
    event.listen(engine, "connect", _fixar_sessao_em_utc)
    return engine


_engine: Engine | None = None
_trava_da_criacao = threading.Lock()


def get_engine() -> Engine:
    """Engine compartilhada, criada na primeira chamada.

    Os testes substituem esta dependencia; por isso ela e uma funcao e nao
    uma variavel de modulo lida diretamente.

    A trava existe porque o FastAPI roda dependencias sincronas no
    threadpool: sem ela, duas requisicoes na partida viam `_engine is None`
    juntas e criavam duas engines, com dois pools, e a perdedora ficava orfa
    com as conexoes que abrisse (pendencia 14). A primeira leitura e sem
    trava para o caminho comum -- engine ja criada -- nao disputar lock; a
    segunda, ja com a trava, decide quem cria. O `with` solta a trava tambem
    quando o `Settings` levanta, e a proxima chamada tenta de novo.
    """
    global _engine
    if _engine is None:
        with _trava_da_criacao:
            if _engine is None:
                _engine = create_engine_from_url(Settings().database_url)
    return _engine


def descartar_engine() -> None:
    """Fecha o pool da engine compartilhada, se ela chegou a ser criada.

    Chamada pelo lifespan no desligamento (pendencia 14). Sem efeito quando a
    engine nunca nasceu -- e ela e preguicosa, entao um processo que so serviu
    `/health` nao tem o que fechar -- e idempotente: a referencia volta a
    None, e o `get_engine` seguinte cria outra, o que serve ao processo que
    sobe o app mais de uma vez (a suite, com `with TestClient(app)`).

    So a leitura e a troca de `_engine` rodam sob a trava do `get_engine`
    (para nao ler `_engine` no meio de uma criacao em andamento); o `dispose`
    roda FORA dela, com a engine ja desligada da variavel, para nao segurar a
    trava enquanto o pool fecha as conexoes.
    """
    global _engine
    with _trava_da_criacao:
        engine, _engine = _engine, None
    if engine is not None:
        engine.dispose()


def get_engine_se_configurada() -> Engine | None:
    """A engine, ou None quando a `database_url` nao esta configurada.

    So o `/ready` usa (pendencia 28): ali "sem configuracao" e um estado a
    responder com 503, e nao um 500. Com `Depends(get_engine)`, o
    `ValidationError` do `Settings` estoura na resolucao da dependencia, antes
    de a rota poder traduzi-lo. As rotas de negocio continuam em `get_engine`:
    para elas, faltar configuracao e defeito de implantacao, e 500 e a verdade.
    A engine continua preguicosa e global (pendencia 14): nada aqui a cria na
    partida, e o `/health` segue sem tocar em nada disto.

    So a AUSENCIA da `database_url` vira None (revisao I1 do lote back): um
    outro campo invalido -- `tutor_max_tokens=0`, chave desconhecida no .env,
    a URL de teste faltando -- nao e "banco nao configurado", e sobe como
    antes, com o traceback que nomeia o campo. "Contem", e nao "e so": sem
    configuracao nenhuma, a URL de teste falta junto, e o banco de fato nao
    esta configurado.
    """
    try:
        return get_engine()
    except ValidationError as erro:
        if any(_falta_a_url_do_banco(falha) for falha in erro.errors()):
            return None
        raise


def _falta_a_url_do_banco(falha: ErrorDetails) -> bool:
    return falha["loc"] == ("database_url",) and falha["type"] == "missing"


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
