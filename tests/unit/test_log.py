"""A configuracao de logging do app (pendencia 13).

Tres promessas, cada uma com o seu teste:

1. o nivel vem do `.env`/ambiente (`FOCUSQUEST_LOG_LEVEL`, padrao INFO) e NAO
   exige configuracao de banco para ser lido;
2. o nivel vale so para o logger `focusquest`: pedir DEBUG nao liga o DEBUG
   do `httpx`, do SDK da Anthropic nem do SQLAlchemy -- que e por onde
   cabecalho com chave e URL de banco vazariam;
3. convive com o uvicorn: nenhuma linha sai duas vezes, e chamar a
   configuracao de novo nao empilha handler.
"""

import logging
import os
import subprocess
import sys
import textwrap
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from focusquest.core.config import ConfiguracaoDeLog
from focusquest.core.log import configurar_logging
from focusquest.main import app


@contextmanager
def _raiz_limpa() -> Iterator[logging.Logger]:
    """A raiz sem handler nenhum, como num processo recem-aberto.

    O pytest poe os handlers de captura dele na raiz, e com eles la o
    `configurar_logging` nao teria o que instalar -- o teste nao provaria
    nada. E um gerenciador de contexto usado DENTRO do teste, e nao uma
    fixture, de proposito: o pytest troca os handlers de captura a cada fase
    (preparo, chamada, desmontagem), e uma fixture que os guardasse no preparo
    devolveria, na desmontagem, handlers de uma fase que ja acabou. O estado
    e global do processo: o `finally` o devolve inclusive se o teste falhar.
    """
    raiz = logging.getLogger()
    app_logger = logging.getLogger("focusquest")
    handlers, nivel_da_raiz = raiz.handlers[:], raiz.level
    nivel_do_app = app_logger.level
    raiz.handlers = []
    # O nivel de um processo recem-aberto, fixado aqui: um `--log-level` na
    # linha de comando do pytest (ou `log_level` no pyproject) muda o nivel da
    # raiz, e os testes reprovariam pelo ambiente, nao por defeito.
    raiz.setLevel(logging.WARNING)
    try:
        yield raiz
    finally:
        for handler in raiz.handlers:
            handler.close()
        raiz.handlers = handlers
        raiz.setLevel(nivel_da_raiz)
        app_logger.setLevel(nivel_do_app)


def _configuracao_do_arquivo(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, conteudo: str
) -> ConfiguracaoDeLog:
    """Le a configuracao de log SO de um .env escrito pelo teste (sem nenhuma
    `FOCUSQUEST_*` do processo, que venceria o arquivo)."""
    for chave in list(os.environ):
        if chave.startswith("FOCUSQUEST_"):
            monkeypatch.delenv(chave, raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(conteudo)
    return ConfiguracaoDeLog()


def test_o_nivel_padrao_e_info(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    assert _configuracao_do_arquivo(monkeypatch, tmp_path, "").log_level == "INFO"


@pytest.mark.parametrize("valor", ["DEBUG", "debug", "Warning"])
def test_o_nivel_vem_do_env_sem_diferenciar_caixa(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, valor: str
) -> None:
    """`debug` e `DEBUG` sao o mesmo pedido; o valor sai sempre em caixa alta,
    que e o nome que o `logging` conhece."""
    configuracao = _configuracao_do_arquivo(
        monkeypatch, tmp_path, f"FOCUSQUEST_LOG_LEVEL={valor}\n"
    )
    assert configuracao.log_level == valor.upper()


@pytest.mark.parametrize("valor", ["VERBOSE", "10", "NOTSET"])
def test_nivel_desconhecido_reprova_na_leitura(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, valor: str
) -> None:
    """Um erro de digitacao no nivel falha na partida, e nao vira um nivel
    qualquer em silencio. `NOTSET` fica de fora de proposito: no logger do app
    ele significa "herde da raiz", que e o comportamento de antes (so WARNING
    ou acima), e nao um nivel que alguem escolheria."""
    with pytest.raises(ValidationError) as erro:
        _configuracao_do_arquivo(
            monkeypatch, tmp_path, f"FOCUSQUEST_LOG_LEVEL={valor}\n"
        )
    assert [e["loc"] for e in erro.value.errors()] == [("log_level",)]


def test_o_nivel_e_lido_sem_configuracao_de_banco(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A partida configura o log ANTES de qualquer coisa tocar no banco, e o
    `/health` responde sem configuracao de banco (test_health). Se ler o nivel
    exigisse `FOCUSQUEST_DATABASE_URL`, o app sem banco nem subiria.

    O .env traz as outras chaves do projeto, e elas sao ignoradas aqui: quem
    as recusa, se forem desconhecidas, e o `Settings`."""
    configuracao = _configuracao_do_arquivo(
        monkeypatch,
        tmp_path,
        "FOCUSQUEST_TUTOR_MODEL=claude-opus-5\nFOCUSQUEST_LOG_LEVEL=ERROR\n",
    )
    assert configuracao.log_level == "ERROR"


def test_configurar_instala_um_handler_so_na_raiz() -> None:
    """Chamado duas vezes -- a partida de novo num mesmo processo, por
    exemplo --, continua com UM handler: dois handlers seriam cada linha
    escrita duas vezes."""
    with _raiz_limpa() as raiz:
        configurar_logging("INFO")
        configurar_logging("DEBUG")
        assert len(raiz.handlers) == 1
        formatador = raiz.handlers[0].formatter
        nivel_do_app = logging.getLogger("focusquest").level
    assert formatador is not None
    registro = logging.LogRecord(
        "focusquest.x", logging.INFO, __file__, 1, "mensagem", None, None
    )
    assert formatador.format(registro).endswith(" INFO focusquest.x: mensagem")
    assert nivel_do_app == logging.DEBUG


def test_configurar_respeita_um_handler_que_ja_esta_na_raiz() -> None:
    """Quem ja configurou a raiz (um `--log-config` do uvicorn, o pytest) nao
    ganha um segundo handler por cima do seu."""
    existente = logging.NullHandler()
    with _raiz_limpa() as raiz:
        raiz.addHandler(existente)
        configurar_logging("INFO")
        handlers = raiz.handlers[:]
    assert handlers == [existente]


def test_debug_do_app_nao_liga_debug_de_terceiros() -> None:
    """O nivel pedido vale para `focusquest` e so para ele.

    E esta a guarda contra vazar segredo: em DEBUG, o `httpx` e o SDK da
    Anthropic registram as requisicoes, e o `sqlalchemy.engine` em INFO
    registra cada SQL. Pedir DEBUG para depurar o app nao pode abrir essas
    torneiras -- a raiz continua em WARNING.
    """
    terceiros = ("httpx", "httpcore", "anthropic", "sqlalchemy.engine")
    with _raiz_limpa() as raiz:
        configurar_logging("DEBUG")
        app_em_debug = logging.getLogger("focusquest.x").isEnabledFor(logging.DEBUG)
        nivel_da_raiz = raiz.level
        ligados = [
            t for t in terceiros if logging.getLogger(t).isEnabledFor(logging.INFO)
        ]
    assert app_em_debug
    assert nivel_da_raiz == logging.WARNING
    assert ligados == []


def test_a_partida_do_app_aplica_o_nivel_configurado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """O `lifespan` do app e quem chama a configuracao: o uvicorn (e o
    `TestClient` como gerenciador de contexto) o executa na partida. O
    estado e lido DENTRO do `with`, enquanto o app esta de pe."""
    monkeypatch.setenv("FOCUSQUEST_LOG_LEVEL", "DEBUG")
    with _raiz_limpa() as raiz, TestClient(app) as cliente:
        assert cliente.get("/health").status_code == 200
        nivel_do_app = logging.getLogger("focusquest").level
        quantos_handlers = len(raiz.handlers)
    assert nivel_do_app == logging.DEBUG
    assert quantos_handlers == 1


def test_o_desligamento_do_app_devolve_o_logging_como_estava(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sair do `lifespan` desfaz o que a partida fez: o nivel do `focusquest`
    volta ao de antes e o handler que ela pos na raiz sai.

    Sem isso, cada `with TestClient(app)` da suite deixava o `focusquest` no
    nivel da partida pelo resto do processo -- e um `caplog.set_level(DEBUG)`
    na raiz passaria a perder, em silencio, o DEBUG do app.
    """
    monkeypatch.setenv("FOCUSQUEST_LOG_LEVEL", "ERROR")
    app_logger = logging.getLogger("focusquest")
    with _raiz_limpa() as raiz:
        app_logger.setLevel(logging.NOTSET)
        with TestClient(app) as cliente:
            assert cliente.get("/health").status_code == 200
        nivel_depois = app_logger.level
        handlers_depois = raiz.handlers[:]
    assert nivel_depois == logging.NOTSET
    assert handlers_depois == []


def test_o_desligamento_do_app_nao_tira_handler_de_quem_configurou_antes() -> None:
    """So sai o handler que a partida pos. Um handler que ja estava na raiz
    (o `--log-config` de quem roda, os de captura do pytest) continua la."""
    existente = logging.NullHandler()
    with _raiz_limpa() as raiz:
        raiz.addHandler(existente)
        with TestClient(app) as cliente:
            assert cliente.get("/health").status_code == 200
        handlers_depois = raiz.handlers[:]
    assert handlers_depois == [existente]


# O que roda nos subprocessos abaixo. Um processo novo e o unico jeito de ver
# a saida de verdade no stderr: dentro do pytest a raiz ja tem os handlers de
# captura dele.
_SOB_O_UVICORN = textwrap.dedent(
    """
    import logging, logging.config
    from uvicorn.config import LOGGING_CONFIG
    from focusquest.core.log import configurar_logging

    logging.config.dictConfig(LOGGING_CONFIG)
    configurar_logging("INFO")
    configurar_logging("INFO")
    logging.getLogger("focusquest.main").info("marca-do-app")
    logging.getLogger("uvicorn.error").info("marca-do-uvicorn")
    logging.getLogger("httpx").debug("marca-de-terceiro")
    """
)


def _rodar(
    script: str, ambiente: dict[str, str] | None = None, cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    """Roda `script` num Python novo, sem nenhuma `FOCUSQUEST_*` herdada.

    Sem `check=True` de proposito: a falha do subprocesso vira um `assert`
    com o stderr dele na mensagem, e nao um `CalledProcessError` mudo.
    Precisa do pacote instalado (editavel, como o `uv sync` deixa): o
    `focusquest` e importado pelo `sys.executable`, e com `cwd` fora da raiz.
    """
    env = {k: v for k, v in os.environ.items() if not k.startswith("FOCUSQUEST_")}
    env.update(ambiente or {})
    resultado = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env=env,
        cwd=cwd,
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr
    return resultado


def test_sob_a_configuracao_do_uvicorn_cada_linha_sai_uma_vez() -> None:
    """A configuracao de log que o uvicorn aplica ANTES de importar o app
    (`uvicorn.config.LOGGING_CONFIG`) poe handler nos loggers `uvicorn*`, com
    `propagate: false`, e nenhum na raiz. O handler do app, na raiz, nao
    duplica as linhas do uvicorn, e as do app saem uma vez, no formato do
    projeto."""
    stderr = _rodar(_SOB_O_UVICORN).stderr
    linhas = stderr.splitlines()
    do_app = [linha for linha in linhas if "marca-do-app" in linha]
    assert len(do_app) == 1
    assert do_app[0].endswith(" INFO focusquest.main: marca-do-app")
    assert sum("marca-do-uvicorn" in linha for linha in linhas) == 1
    assert "marca-de-terceiro" not in stderr


_PARTIDA_EM_DEBUG = textwrap.dedent(
    """
    from fastapi.testclient import TestClient
    from focusquest.main import app

    with TestClient(app) as cliente:
        assert cliente.get("/health").status_code == 200
        assert cliente.get("/ready").status_code == 503
    """
)

CHAVE = "sk-ant-api03-segredo-do-teste-de-log"
SENHA = "senha-do-banco-do-teste-de-log"


def test_em_debug_a_partida_e_o_ready_nao_logam_segredo(tmp_path: Path) -> None:
    """Com o nivel mais verboso, a chave da Anthropic e a senha da URL do
    banco nao aparecem no stderr -- na partida, que e onde a configuracao e
    lida, nem no `/ready` com o banco fora, que e onde a URL esta em jogo.

    O banco aponta para a porta 1 (nada escuta): o `/ready` tenta conectar de
    verdade e responde 503. A linha da partida PRECISA aparecer: sem ela, um
    stderr vazio passaria este teste sem provar que o log estava ligado.
    """
    url = f"postgresql+psycopg://focusquest:{SENHA}@127.0.0.1:1/qualquer_test"
    resultado = _rodar(
        _PARTIDA_EM_DEBUG,
        {
            "FOCUSQUEST_LOG_LEVEL": "DEBUG",
            "FOCUSQUEST_ANTHROPIC_API_KEY": CHAVE,
            "FOCUSQUEST_ANTHROPIC_BASE_URL": "http://127.0.0.1:9",
            "FOCUSQUEST_DATABASE_URL": url,
            "FOCUSQUEST_TEST_DATABASE_URL": url,
        },
        cwd=tmp_path,
    )
    saida = resultado.stdout + resultado.stderr
    assert "focusquest.main: log configurado no nivel DEBUG" in saida
    assert CHAVE not in saida
    assert SENHA not in saida
