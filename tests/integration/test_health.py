"""Liveness nao toca no banco; readiness toca de verdade."""

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import Engine

from focusquest.core import database
from focusquest.core.config import Settings
from focusquest.core.database import (
    create_engine_from_url,
    get_engine,
    get_engine_se_configurada,
)
from focusquest.main import app


@pytest.fixture
def override_engine() -> Iterator[Callable[[Engine], None]]:
    """Substitui a engine e restaura SEMPRE, inclusive se o teste falhar.

    `app.dependency_overrides` e estado global do app, e limpeza escrita no
    corpo do teste so roda se o teste chegar ate ela: um assert que cai antes
    vaza o override para os testes seguintes, e o defeito reaparece longe da
    causa. O `yield` da fixture roda no teardown, tenha o teste passado ou
    nao -- por isso restaurar estado global e trabalho de fixture, nao do
    corpo do teste.
    """

    def _aplicar(engine: Engine) -> None:
        # As DUAS portas por onde uma rota recebe a engine: `get_engine` (as
        # rotas de negocio) e `get_engine_se_configurada` (o /ready, desde a
        # pendencia 28). Substituir so uma deixaria o /ready no banco real.
        app.dependency_overrides[get_engine] = lambda: engine
        app.dependency_overrides[get_engine_se_configurada] = lambda: engine

    yield _aplicar
    app.dependency_overrides.clear()


@pytest.fixture
def client(
    engine: Engine, override_engine: Callable[[Engine], None]
) -> Iterator[TestClient]:
    override_engine(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def engine_quebrada() -> Iterator[Engine]:
    """Engine apontada para uma porta onde nada escuta.

    O `dispose()` tambem e limpeza de estado, entao tambem vive aqui: no
    corpo do teste ele deixaria de rodar assim que algo falhasse antes dele.
    """
    engine = create_engine_from_url(
        "postgresql+psycopg://focusquest:focusquest_local@127.0.0.1:1/inexistente"
    )
    yield engine
    engine.dispose()


@pytest.fixture
def descartar_engines() -> Iterator[list[Engine]]:
    """Recolhe engines criadas dentro do teste e as descarta SEMPRE.

    Mesma regra da `override_engine`: `dispose()` escrito depois do assert
    nao roda quando o assert cai, e a engine fica pendurada.
    """
    engines: list[Engine] = []
    yield engines
    for engine in engines:
        engine.dispose()


def test_health_responde_mesmo_com_o_banco_fora_do_ar(
    engine_quebrada: Engine, override_engine: Callable[[Engine], None]
) -> None:
    """Liveness nao toca no banco -- e e esta assercao que prova isso.

    O override da engine quebrada e essencial, nao cenario: com o banco no ar,
    /health e /ready devolvem 200 os dois, e a assercao nao distingue as duas
    rotas -- um `Depends(get_engine)` pendurado no /health amanha passaria
    verde. Com o banco comprovadamente inalcancavel, 200 so e possivel se a
    rota de fato nao o tocar.
    """
    override_engine(engine_quebrada)
    with TestClient(app) as c:
        resposta = c.get("/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_health_responde_sem_configuracao_de_banco(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Liveness nao depende nem da CONFIGURACAO do banco, nao so do banco.

    O teste acima, com a engine quebrada, nao pega um `Depends(get_engine)`
    pendurado no /health sem uso: resolver a dependencia nao abre nenhuma
    `connection` --
    `create_engine` e preguicoso --, entao a rota responderia 200 do mesmo
    jeito. Aqui, sem .env e sem variaveis no ambiente, resolver essa
    dependencia executaria `Settings()` e estouraria ValidationError. Com o
    /health limpo, 200.
    """
    monkeypatch.setattr(database, "_engine", None)
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    # Sem o chdir, o .env do repositorio supriria a configuracao e o teste
    # pararia de testar o que promete (mesmo motivo do tests/unit/test_config.py).
    monkeypatch.chdir(tmp_path)

    with TestClient(app) as c:
        resposta = c.get("/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_ready_confirma_o_banco(client: TestClient) -> None:
    resposta = client.get("/ready")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "database": "ok"}


def test_ready_falha_quando_o_banco_nao_responde(
    engine_quebrada: Engine, override_engine: Callable[[Engine], None]
) -> None:
    override_engine(engine_quebrada)
    with TestClient(app) as c:
        resposta = c.get("/ready")

    assert resposta.status_code == 503
    assert resposta.json() == {"status": "unavailable", "database": "unavailable"}


def test_ready_sem_configuracao_de_banco_responde_503(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Pendencia 28: sem configuracao, "nao pronto" e 503, como com o banco
    fora do ar -- e nao o 500 do `ValidationError` estourando na resolucao da
    dependencia. O corpo separa os dois casos: `not_configured` aqui,
    `unavailable` quando o banco configurado nao responde.

    Mesmo cenario do teste do /health sem configuracao: sem .env (o chdir) e
    sem as variaveis no ambiente, `Settings()` falha.
    """
    monkeypatch.setattr(database, "_engine", None)
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    monkeypatch.chdir(tmp_path)

    with TestClient(app) as c:
        resposta = c.get("/ready")

    assert resposta.status_code == 503
    assert resposta.json() == {"status": "unavailable", "database": "not_configured"}


@pytest.mark.parametrize(
    ("variavel", "valor"),
    [
        # Um campo que nao e do banco, invalido, com a URL presente.
        ("FOCUSQUEST_TUTOR_MAX_TOKENS", "0"),
        # Falta so a URL de TESTE: tambem nao e "banco nao configurado".
        ("FOCUSQUEST_TEST_DATABASE_URL", None),
    ],
)
def test_ready_com_outra_configuracao_invalida_sobe_o_erro(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    settings: Settings,
    variavel: str,
    valor: str | None,
) -> None:
    """So a AUSENCIA da `database_url` vira `not_configured` (revisao I1).
    Qualquer outro erro do `Settings` continua subindo como antes -- 500 com o
    traceback que nomeia o campo --, em vez de um 503 que aponta o banco."""
    monkeypatch.setattr(database, "_engine", None)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", settings.database_url)
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", settings.test_database_url)
    if valor is None:
        monkeypatch.delenv(variavel)
    else:
        monkeypatch.setenv(variavel, valor)

    with TestClient(app) as c, pytest.raises(ValidationError) as erro:
        c.get("/ready")

    (falha,) = erro.value.errors()
    assert falha["loc"] != ("database_url",)


def test_get_engine_se_configurada_devolve_a_engine_compartilhada(
    monkeypatch: pytest.MonkeyPatch, descartar_engines: list[Engine]
) -> None:
    """Com configuracao, a dependencia do /ready e a MESMA engine das rotas de
    negocio: o /ready precisa provar o banco que a aplicacao usa, e nao outro."""
    monkeypatch.setattr(database, "_engine", None)
    engine = database.get_engine_se_configurada()
    assert engine is not None
    descartar_engines.append(engine)
    assert engine is database.get_engine()


def test_get_engine_cria_uma_vez_e_reaproveita(
    monkeypatch: pytest.MonkeyPatch,
    descartar_engines: list[Engine],
    settings: Settings,
) -> None:
    """get_engine() e substituida nos testes de rota, entao o corpo dela
    precisa de um teste proprio -- senao fica descoberto.

    Substituir uma dependencia nos testes nao a testa. Aqui o modulo e
    importado como objeto porque o cache vive em uma variavel global dele:
    so com o modulo em maos da para zerar e restaurar esse estado. O
    monkeypatch restaura no teardown, valendo a mesma regra da fixture
    override_engine.

    O modulo em questao e `core/database.py`, e nao `main.py`: a dependencia
    mudou de casa quando ganhou um segundo consumidor (o router das
    missoes) -- um router que importasse `main.py` de volta fecharia um ciclo de
    imports. O cache global, e a corrida que ele permite, continuam identicos aos
    de antes; so o arquivo e outro.
    """
    monkeypatch.setattr(database, "_engine", None)
    primeira = database.get_engine()
    descartar_engines.append(primeira)
    segunda = database.get_engine()

    assert primeira is segunda
    # De qual URL a engine nasce faz parte do contrato: sem esta assercao,
    # trocar database_url por test_database_url na implementacao -- apontar a
    # aplicacao para o banco de teste -- passaria verde.
    assert primeira.url.render_as_string(hide_password=False) == settings.database_url


def test_ready_nao_oculta_erro_inesperado_na_resolucao(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def falhar() -> Engine:
        raise RuntimeError("defeito inesperado na engine")

    monkeypatch.setattr(database, "get_engine", falhar)
    with TestClient(app) as c, pytest.raises(RuntimeError, match="defeito inesperado"):
        c.get("/ready")


def test_ready_nao_oculta_erro_inesperado_na_conexao(
    engine_quebrada: Engine,
    override_engine: Callable[[Engine], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def falhar() -> None:
        raise RuntimeError("defeito inesperado na conexao")

    override_engine(engine_quebrada)
    monkeypatch.setattr(engine_quebrada, "connect", falhar)
    with TestClient(app) as c, pytest.raises(RuntimeError, match="defeito inesperado"):
        c.get("/ready")


def test_ready_resolve_engine_real_sem_override_reaproveita_e_descarta_no_fim(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    settings: Settings,
    engine: Engine,
    descartar_engines: list[Engine],
) -> None:
    # A fixture engine garante que o banco proprio existe. NUNCA usar a URL
    # de desenvolvimento para o caminho real sem override, nem para SELECT 1.
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", settings.test_database_url)
    monkeypatch.setenv("FOCUSQUEST_TEST_DATABASE_URL", settings.test_database_url)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(database, "_engine", None)
    try:
        with TestClient(app) as c:
            primeira_resposta = c.get("/ready")
            primeira_engine = database._engine
            segunda_resposta = c.get("/ready")
            # Reaproveita: a segunda requisicao nao criou outra engine.
            assert database._engine is primeira_engine
        assert primeira_resposta.status_code == 200
        assert primeira_resposta.json() == {"status": "ok", "database": "ok"}
        assert segunda_resposta.status_code == 200
        assert segunda_resposta.json() == {"status": "ok", "database": "ok"}
        assert primeira_engine is not None
        assert primeira_engine.url == engine.url
        # O desligamento do app descarta a engine (pendencia 14): a
        # referencia global volta a None, e a proxima chamada cria outra.
        assert database._engine is None
    finally:
        if database._engine is not None:
            descartar_engines.append(database._engine)
