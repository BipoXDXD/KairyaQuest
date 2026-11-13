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
from dataclasses import dataclass
from functools import partial
from typing import Annotated, Any

from fastapi import Depends
from pydantic import ValidationError
from pydantic_core import ErrorDetails
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.exc import TimeoutError as PoolEsgotadoError
from sqlalchemy.orm import Session
from sqlalchemy.pool import ConnectionPoolEntry, Pool

from focusquest.core.config import Settings


@dataclass(frozen=True)
class LimitesDaSessao:
    """Os tetos que o PostgreSQL impoe a cada sessao da aplicacao, em ms.

    Decisao e valores em `docs/adr/0001-tetos-de-sessao-do-banco.md`. Quem
    estoura um deles recebe 55P03 (trava), 57014 (comando) ou 25P03
    (transacao ociosa): `main.py` os traduz em 503 `banco_ocupado` e a
    tutoria, com o stream ja aberto, no evento `error` de mesmo codigo
    (`e_falha_transitoria_do_banco`).
    """

    lock_timeout_ms: int
    statement_timeout_ms: int
    idle_in_transaction_timeout_ms: int

    @classmethod
    def da_configuracao(cls, settings: Settings) -> LimitesDaSessao:
        return cls(
            lock_timeout_ms=settings.db_lock_timeout_ms,
            statement_timeout_ms=settings.db_statement_timeout_ms,
            idle_in_transaction_timeout_ms=settings.db_idle_in_transaction_timeout_ms,
        )


def _configurar_sessao(
    conexao_dbapi: Any,
    _registro: ConnectionPoolEntry,
    *,
    limites: LimitesDaSessao | None,
) -> None:
    """Poe a sessao do PostgreSQL em UTC e, com `limites`, aplica os tetos,
    em toda conexao nova do pool.

    Os tetos vao por `set_config(..., false)` (valor da SESSAO), com o numero
    como parametro: o `SET` nao aceita parametro, e montar a string seria
    abrir uma injecao por configuracao. Numero sem unidade e lido em ms. Rodam
    no mesmo bloco em `autocommit` do fuso, pelo mesmo motivo (abaixo): o
    rollback do pool nao os desfaz. Sem `limites` (Alembic, suite), nenhum teto.

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
            if limites is not None:
                cursor.execute(
                    "SELECT set_config('lock_timeout', %s, false),"
                    " set_config('statement_timeout', %s, false),"
                    " set_config('idle_in_transaction_session_timeout', %s, false)",
                    (
                        str(limites.lock_timeout_ms),
                        str(limites.statement_timeout_ms),
                        str(limites.idle_in_transaction_timeout_ms),
                    ),
                )
    finally:
        conexao_dbapi.autocommit = autocommit_anterior


# As falhas em que o banco cortou uma espera por um teto da sessao (ADR 0001):
# 55P03 lock_not_available, 57014 query_canceled (statement_timeout), 40P01
# deadlock_detected e 25P03 idle_in_transaction_session_timeout. A transacao
# foi revertida, nada foi gravado, e repetir pode dar certo. Moram aqui, e nao
# em `main.py`, porque dois consumidores as classificam: os handlers HTTP e a
# gravacao final da tutoria, que roda dentro de um stream ja aberto (#177) e
# nao pode importar `main.py`.
SQLSTATE_DA_TRANSACAO_OCIOSA = "25P03"
SQLSTATES_TRANSITORIOS = frozenset(
    {"55P03", "57014", "40P01", SQLSTATE_DA_TRANSACAO_OCIOSA}
)


def sqlstate_de(erro: BaseException) -> str | None:
    """O SQLSTATE do erro do driver, ou None quando nao ha um."""
    if not isinstance(erro, DBAPIError):
        return None
    return getattr(erro.orig, "sqlstate", None)


def e_falha_transitoria_do_banco(erro: BaseException) -> bool:
    """Um corte por teto da sessao, ou o pool que nao entregou conexao no
    `pool_timeout` -- o `TimeoutError` do pool nao e `DBAPIError`, mas e o
    mesmo "tente de novo em instantes"."""
    return (
        isinstance(erro, PoolEsgotadoError)
        or sqlstate_de(erro) in SQLSTATES_TRANSITORIOS
    )


def motivo_da_falha_transitoria(erro: BaseException) -> str:
    """O que um log pode dizer da falha: so o SQLSTATE, ou "pool esgotado".

    Nunca `str(erro)`: a mensagem do SQLAlchemy traz a instrucao SQL."""
    sqlstate = sqlstate_de(erro)
    return "pool esgotado" if sqlstate is None else f"sqlstate {sqlstate}"


# Quanto uma rota espera por uma conexao quando o pool (5 + 10 de overflow) esta
# esgotado, antes de falhar. O padrao do SQLAlchemy e 30 s, acima dos 20 s que
# o navegador da as rotas de leitura e mutacao: ele desistiria primeiro, e a
# rota ainda esperaria. 4 s porque a espera do pool soma com o
# `statement_timeout` (15 s) de um comando: 19 s, ainda abaixo dos 20 s (ADR
# 0001). Julgamento, sem medida; `tests/unit/test_prazos_coerentes.py` confere
# a relacao com os prazos do frontend.
POOL_TIMEOUT_SEGUNDOS = 4


def create_engine_from_url(
    url: str,
    poolclass: type[Pool] | None = None,
    limites: LimitesDaSessao | None = None,
) -> Engine:
    """Cria a engine -- e e o UNICO lugar onde uma engine desta base nasce: a
    aplicacao, a suite de testes e o Alembic passam por aqui, e por isso
    conectam todos com a mesma configuracao (sessao em UTC, ver
    `_configurar_sessao`). Uma engine montada por outro caminho seria uma
    configuracao que os testes nao exercitam.

    `pool_pre_ping` testa a `connection` antes de entrega-la: sem isso o pool
    reaproveita uma que morreu quando o banco reiniciou, o que acontece com
    frequencia em desenvolvimento. `poolclass` existe para o Alembic, que usa
    `NullPool` -- um processo de migracao nao tem por que manter conexao
    aberta; `None` fica com o pool padrao do dialeto, com o `pool_timeout` de
    `POOL_TIMEOUT_SEGUNDOS`.

    `limites` so chega preenchido por `get_engine`: a aplicacao tem tetos de
    sessao, e o Alembic e a suite nao (uma migracao longa nao pode ser cortada).

    O listener nao abre conexao: roda so quando o pool cria uma. A engine
    continua preguicosa, e os testes que dependem disso (a guarda do banco de
    teste so le `engine.url`) continuam valendo."""
    # `pool_timeout` e argumento do QueuePool: o NullPool do Alembic o recusa.
    # `poolclass` so chega preenchido pelo Alembic; `None` e o QueuePool do
    # dialeto, o unico pool que tem fila para esperar.
    argumentos_do_pool = (
        {"pool_timeout": POOL_TIMEOUT_SEGUNDOS} if poolclass is None else {}
    )
    # `hide_parameters`: a mensagem de um erro de banco traria os valores
    # ligados a instrucao -- o texto da missao, a pergunta --, e essa mensagem
    # chega ao log de um 500 (#166).
    engine = create_engine(
        url,
        pool_pre_ping=True,
        poolclass=poolclass,
        hide_parameters=True,
        **argumentos_do_pool,
    )
    event.listen(engine, "connect", partial(_configurar_sessao, limites=limites))
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
                settings = Settings()
                _engine = create_engine_from_url(
                    settings.database_url,
                    limites=LimitesDaSessao.da_configuracao(settings),
                )
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
