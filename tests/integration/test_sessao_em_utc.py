"""A sessao do PostgreSQL fica em UTC, mesmo quando o ambiente pede outro fuso.

O `timestamptz` volta no `TimeZone` da SESSAO, e o psycopg nao le um instante
que, nesse fuso, cai fora dos anos 1 a 9999. A guarda do schema recusa o prazo
cujo instante EM UTC sai da faixa; ela so basta se a leitura acontecer em UTC.
Sem a sessao fixada, um prazo aceito com 201 deixava o `GET /api/missions` em
500 para sempre (medido: `9999-12-31T23:59:59Z` com a sessao em `Asia/Tokyo`,
`0001-01-01T00:00:00Z` com ela em `America/Sao_Paulo`).

O fuso e pedido pela variavel `PGTZ`, que a `libpq` le a cada conexao nova, e
por isso cada teste cria a SUA engine depois de defini-la: a engine da suite ja
tem conexoes no pool, abertas antes. A engine nasce por
`create_engine_from_url`, o mesmo caminho da aplicacao -- um teste com engine
montada a parte provaria uma configuracao que nao e a que roda.

Os fusos sao um a leste e um a oeste de UTC de proposito: o defeito aparecia
numa borda diferente em cada lado, e a suite antiga so reprovava a leste.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete, text
from sqlalchemy.orm import Session

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url, get_engine
from focusquest.main import app
from focusquest.modules.missions.models import Mission

LESTE = "Asia/Tokyo"
OESTE = "America/Sao_Paulo"


@pytest.fixture
def engine_com_pgtz(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    banco_migrado: Engine,
) -> Iterator[Engine]:
    """Engine da aplicacao criada com `PGTZ` apontando para `request.param`.

    Depende de `banco_migrado` so para garantir o esquema; a engine devolvida
    e outra, nova, cujas conexoes todas nascem com o `PGTZ` definido.
    """
    monkeypatch.setenv("PGTZ", request.param)
    engine = create_engine_from_url(settings.test_database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def cliente(engine_com_pgtz: Engine, banco_migrado: Engine) -> Iterator[TestClient]:
    """Cliente com a dependencia de sessao REAL sobre a engine com `PGTZ`.

    Real, e nao a sessao do teste: com uma sessao compartilhada, o GET
    devolveria o objeto que o POST deixou no mapa de identidade, e o prazo
    serializado seria o do pedido, nao o que o banco devolveu. Aqui cada
    requisicao abre a sua sessao, e toda leitura sai de fato do banco.

    Como a requisicao commita de verdade, o teardown apaga as missoes -- a
    suite exige a tabela vazia em outros modulos. A limpeza usa a engine da
    suite, e `mission_operations` vai junto pelo `ondelete=CASCADE`.
    """
    app.dependency_overrides[get_engine] = lambda: engine_com_pgtz
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_engine, None)
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(delete(Mission))
            limpeza.commit()


def _fuso_da_sessao(engine: Engine) -> str:
    with engine.connect() as conexao:
        fuso = conexao.execute(text("SHOW TimeZone")).scalar_one()
    assert isinstance(fuso, str)
    return fuso


def _corpo(prazo: str) -> dict[str, Any]:
    return {
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 2,
        "estimated_minutes": 30,
        "deadline": prazo,
    }


@pytest.mark.parametrize("engine_com_pgtz", [LESTE, OESTE], indirect=True)
def test_sessao_fica_em_utc_mesmo_com_pgtz_em_outro_fuso(
    engine_com_pgtz: Engine, settings: Settings, request: pytest.FixtureRequest
) -> None:
    """`SHOW TimeZone` responde `UTC` na engine da aplicacao, com `PGTZ` em
    outro fuso -- e continua respondendo no SEGUNDO uso da mesma conexao.

    A segunda leitura nao e redundancia. O `SET` que fixa o fuso roda dentro
    de uma transacao se ninguem cuidar do `autocommit`, e o pool faz rollback
    ao receber a conexao de volta: o primeiro uso responde `UTC` e o segundo
    volta ao fuso do ambiente (medido). O pool padrao reaproveita a mesma
    conexao, entao a segunda leitura e a que pega esse defeito -- e so este
    teste o pega: nos testes de API abaixo a primeira requisicao commita, o
    commit preserva o `SET`, e eles passam com o defeito (medido por mutacao).

    A premissa e conferida antes: uma engine SEM o caminho da aplicacao tem de
    responder o fuso do `PGTZ`. Se a `libpq` ignorasse a variavel, `UTC` nas
    duas leituras de baixo nao provaria nada.
    """
    fuso_pedido = request.node.callspec.params["engine_com_pgtz"]
    crua = create_engine(settings.test_database_url)
    try:
        assert _fuso_da_sessao(crua) == fuso_pedido
    finally:
        crua.dispose()

    assert _fuso_da_sessao(engine_com_pgtz) == "UTC"
    assert _fuso_da_sessao(engine_com_pgtz) == "UTC"


@pytest.mark.parametrize(
    ("engine_com_pgtz", "prazo"),
    [(LESTE, "9999-12-31T23:59:59Z"), (OESTE, "0001-01-01T00:00:00Z")],
    ids=["ultimo instante pedindo leste", "primeiro instante pedindo oeste"],
    indirect=["engine_com_pgtz"],
)
def test_prazo_na_borda_aceito_e_lido_em_qualquer_fuso_do_ambiente(
    cliente: TestClient, prazo: str
) -> None:
    """O par que quebrava: prazo aceito com 201 e a listagem em 500 para sempre.

    Cada borda so estourava de um lado de UTC -- o ultimo instante a leste, o
    primeiro a oeste --, e por isso cada uma e testada no lado em que quebrava.

    O prazo listado e comparado como TEXTO, e isso e deliberado: a leitura sai
    do banco com a sessao em UTC, entao o instante volta com `Z`, na mesma
    grafia do pedido. Com a sessao no fuso do ambiente ele voltaria com o
    offset de la, ou nem voltaria.
    """
    criacao = cliente.post("/api/missions", json=_corpo(prazo))
    assert criacao.status_code == 201, criacao.text

    listagem = cliente.get("/api/missions")

    assert listagem.status_code == 200, listagem.text
    [listada] = listagem.json()
    assert listada["id"] == criacao.json()["id"]
    assert listada["deadline"] == prazo


@pytest.mark.parametrize("engine_com_pgtz", [LESTE, OESTE], indirect=True)
def test_reenvio_da_conclusao_devolve_o_mesmo_corpo_em_qualquer_fuso_do_ambiente(
    cliente: TestClient,
) -> None:
    """O reenvio idempotente devolve o MESMO corpo, byte a byte.

    A primeira conclusao serializa o `completed_at` que o Python acabou de
    gerar, em UTC; o reenvio o le do banco. Com a sessao no fuso do ambiente,
    o primeiro saia com `Z` e o reenvio com o offset do ambiente (`-03:00`
    em Sao Paulo, medido): o mesmo instante, em outra grafia -- e um cliente
    que comparasse as respostas veria duas conclusoes diferentes.
    """
    criacao = cliente.post("/api/missions", json=_corpo("2027-02-16T00:00:00Z"))
    assert criacao.status_code == 201, criacao.text
    caminho = f"/api/missions/{criacao.json()['id']}/complete"

    primeira = cliente.post(caminho, json={"operation_id": "op-fuso"})
    reenvio = cliente.post(caminho, json={"operation_id": "op-fuso"})

    assert primeira.status_code == 200, primeira.text
    assert reenvio.status_code == 200, reenvio.text
    assert reenvio.json() == primeira.json()
