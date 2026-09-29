"""Os endpoints da missao: contrato de entrada, de saida e de erro.

Cada status HTTP deste arquivo e um RAMO do tradutor de erros, e nenhum deles
tem como ser exercitado pelo servico -- `service.py` nao conhece HTTP de
proposito. Por isso a traducao precisa de teste proprio aqui, e nao de um
teste de servico a mais.

Quase todos os testes usam a fixture `session`, que reverte tudo no final: a
sessao do teste E a sessao da requisicao, via `dependency_overrides`. A
excecao deliberada e `test_a_requisicao_commita_de_verdade`, que roda com a
dependencia REAL -- e o unico jeito de provar que a requisicao commita, ja que
uma sessao compartilhada com o teste mostraria os dados commitados ou nao.
"""

import logging
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine, get_session
from focusquest.main import app
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    xp_para_dificuldade,
)
from focusquest.modules.missions.models import Mission, MissionOperation, User
from focusquest.modules.missions.schemas import (
    DIFICULDADE_MAXIMA,
    MAIOR_INTEIRO_DA_COLUNA,
    TAMANHO_MAXIMO_DO_IDENTIFICADOR,
)

# O usuario unico semeado pela migracao (README s8) -- o mesmo que o router
# assume enquanto nao houver autenticacao.
ESTUDANTE = 1
# Um segundo usuario, criado dentro da transacao do teste que precisa de um
# dono diferente. Sem ele o handler de NaoPertenceAoUsuarioError seria
# inalcancavel pela API, e um ramo inalcancavel e um ramo descoberto.
OUTRO = 2

# O instante que o relogio injetado devolve nos testes que o substituem.
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Cliente cuja requisicao usa a SESSAO DO TESTE.

    A substituicao e do `get_session`, nao do `get_engine`: e ela que amarra a
    requisicao a transacao que a fixture reverte no final. Se a rota tivesse
    aberto uma sessao propria, este override nao teria efeito nenhum -- que e
    o que faz ele valer como prova de que a rota depende de `get_session`.

    A limpeza do dicionario global vive depois do `yield`, portanto no
    teardown: escrita no corpo do teste, ela nao rodaria quando um assert
    caisse antes dela, e o override vazaria para os testes seguintes (a mesma
    licao que `test_health.py` registra).

    E ela remove a PROPRIA chave, nao o dicionario inteiro. `clear()` funciona
    enquanto houver um override por vez e derruba o override alheio no dia em
    que duas fixtures se compuserem: o teardown roda em ordem inversa, entao a
    fixture de dentro apagaria o que a de fora instalou, e o teste seguinte
    falharia longe da causa.
    """
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def cliente_real(banco_migrado: Engine) -> Iterator[TestClient]:
    """Cliente com a dependencia de sessao REAL, apontada para o banco de teste.

    O override do `get_engine` aqui nao e conveniencia: sem ele a dependencia
    real chamaria `Settings().database_url` e a requisicao escreveria no banco
    de DESENVOLVIMENTO. Nenhum teste deste projeto toca aquele banco
    (README s10).

    Remove a propria chave no teardown, pelo motivo escrito em `client`.
    """
    app.dependency_overrides[get_engine] = lambda: banco_migrado
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_engine, None)


@pytest.fixture
def relogio_fixo() -> Iterator[datetime]:
    """Substitui o relogio da API por um que devolve sempre `AGORA`.

    O override devolve uma FUNCAO que devolve o instante -- `get_clock`
    entrega um relogio, nao uma hora (ver `core/clock.py`). Remove a propria
    chave no teardown, pelo motivo escrito em `client`.
    """
    app.dependency_overrides[get_clock] = lambda: lambda: AGORA
    yield AGORA
    app.dependency_overrides.pop(get_clock, None)


def _prazo(dias: int) -> str:
    return (datetime.now(UTC) + timedelta(days=dias)).isoformat()


def _operacoes(session: Session, mission_id: int) -> int:
    """Conta as operacoes registradas DESTA missao.

    Contar a tabela inteira diria "o banco tem uma linha", que continuaria
    verde se a linha fosse de outra missao.
    """
    return session.execute(
        select(func.count())
        .select_from(MissionOperation)
        .where(MissionOperation.mission_id == mission_id)
    ).scalar_one()


def _logado(caplog: pytest.LogCaptureFixture) -> str:
    """So o que a APLICACAO registrou, filtrado pelo nome do logger.

    O filtro nao e capricho, e correcao de um teste que passava sem provar
    nada: o `httpx` do TestClient registra cada requisicao em INFO, com a URL
    inteira -- e a URL contem o id da missao. Procurar o id em
    `caplog.messages` inteiro passava verde com o log da aplicacao REMOVIDO,
    porque encontrava o id na linha do httpx. Medido, nao suposto.
    """
    return "\n".join(
        registro.getMessage()
        for registro in caplog.records
        if registro.name.startswith("focusquest")
    )


def _corpo(**ajustes: Any) -> dict[str, Any]:
    """O corpo de criacao valido, com os ajustes que cada teste precisa variar."""
    corpo: dict[str, Any] = {
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo de uma pagina entregue",
        "difficulty": 2,
        "estimated_minutes": 30,
        "deadline": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
    }
    return corpo | ajustes


def _criar(client: TestClient, **ajustes: Any) -> dict[str, Any]:
    """Cria pela API e devolve o corpo da resposta, exigindo 201."""
    resposta = client.post("/api/missions", json=_corpo(**ajustes))
    assert resposta.status_code == 201, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def _registrar_outro_usuario(session: Session) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()


def _missao_de_outro_usuario(session: Session) -> int:
    """Uma missao cujo dono NAO e o usuario que a API assume.

    Nasce e morre dentro da transacao da fixture `session`, entao nao vaza
    para os outros testes nem para o banco depois da suite.
    """
    _registrar_outro_usuario(session)
    missao = Mission(
        user_id=OUTRO,
        mission_type=MissionType.AVULSA,
        instructions="Missao alheia",
        completion_criterion="Nao e da sua conta",
        difficulty=1,
        estimated_minutes=10,
        deadline=datetime.now(UTC) + timedelta(days=1),
        state=MissionState.PENDENTE,
    )
    session.add(missao)
    session.flush()
    assert missao.id is not None
    return missao.id


# ---------------------------------------------------------------------------
# Criar
# ---------------------------------------------------------------------------


def test_criar_devolve_201_com_a_missao_pendente(client: TestClient) -> None:
    prazo = datetime.now(UTC) + timedelta(days=2)
    corpo = _criar(client, deadline=prazo.isoformat())

    assert isinstance(corpo["id"], int)
    assert corpo["instructions"] == "Ler o capitulo 3"
    assert corpo["completion_criterion"] == "Resumo de uma pagina entregue"
    assert corpo["difficulty"] == 2
    assert corpo["estimated_minutes"] == 30
    # Comparado como instante, nao como texto: o pedido sai do `isoformat()`
    # com `+00:00`, e o 201 devolve o mesmo instante com `Z` (medido). A grafia
    # nao faz parte do contrato -- so o momento no tempo faz.
    assert datetime.fromisoformat(corpo["deadline"]) == prazo
    assert corpo["state"] == MissionState.PENDENTE.value
    assert corpo["started_at"] is None
    assert corpo["completed_at"] is None
    # Campo computado: sem inicio nem fim, nao existe duracao real.
    assert corpo["actual_duration_minutes"] is None


@pytest.mark.parametrize("dificuldade", [1, 2, DIFICULDADE_MAXIMA])
def test_xp_no_corpo_e_derivado_da_dificuldade_enviada(
    client: TestClient, dificuldade: int
) -> None:
    """O XP sai da dificuldade DAQUELA missao, nao de uma constante.

    Tres dificuldades diferentes em vez de uma: com um caso unico, um `xp`
    fixo no schema -- ou derivado do campo errado, como `estimated_minutes` --
    passaria verde.

    A expectativa vem de `xp_para_dificuldade`, e nao de numeros escritos
    aqui, de proposito: a curva e decisao do usuario e mora no dominio, com
    teste proprio em `tests/unit/test_missions_domain.py`. O que ESTE teste
    promete e que o payload expoe o XP daquela dificuldade -- nao que a curva
    seja esta.

    O caso `DIFICULDADE_MAXIMA` fixa tambem a borda ACEITA do teto: se o
    schema usasse `lt` em vez de `le`, este caso devolveria 422 e o teste
    reprovaria.
    """
    corpo = _criar(client, difficulty=dificuldade)

    assert corpo["xp"] == xp_para_dificuldade(dificuldade)


@pytest.mark.parametrize("dificuldade", [0, DIFICULDADE_MAXIMA + 1])
def test_dificuldade_fora_da_faixa_devolve_422(
    client: TestClient, dificuldade: int
) -> None:
    """A faixa e recusada na BORDA, antes de qualquer caso de uso.

    O dominio aceita qualquer inteiro >= 1, e dificuldade 100 produziria um XP
    absurdo sem que nenhuma regra fosse violada. Quem responde "que
    dificuldade eu aceito receber" e o contrato de entrada -- ver
    `MissionCreate`.

    A assercao olha o `loc` do erro, nao so o status: um 422 por qualquer
    outro motivo (um campo obrigatorio que faltasse, por exemplo) satisfaria
    um teste que checasse apenas `status_code == 422`.
    """
    resposta = client.post("/api/missions", json=_corpo(difficulty=dificuldade))

    assert resposta.status_code == 422
    locais = [erro["loc"] for erro in resposta.json()["detail"]]
    assert ["body", "difficulty"] in locais


@pytest.mark.parametrize(
    ("ajuste", "campo"),
    [
        ({"instructions": ""}, "instructions"),
        ({"completion_criterion": ""}, "completion_criterion"),
        ({"estimated_minutes": 0}, "estimated_minutes"),
    ],
    ids=["instrucao vazia", "criterio vazio", "estimativa zero"],
)
def test_campo_invalido_na_criacao_devolve_422(
    client: TestClient, ajuste: dict[str, Any], campo: str
) -> None:
    """Cada restricao de `MissionCreate` tem aqui o teste que a faz dizer NAO.

    Sem isto, `min_length=1` e `gt=0` eram decoracao: uma restricao declarativa
    do pydantic nao tem LINHA para cobrir, entao 100% de cobertura nao prova
    nada sobre ela. Medido: removidas as quatro restricoes, a
    suite inteira continuava verde.

    A assercao olha o `loc`, e nao so o status, pela mesma razao do teste de
    `difficulty`: um 422 por qualquer outro campo satisfaria um teste que
    checasse apenas `status_code == 422`, e ai a troca de uma restricao pela
    outra passaria.

    Instrucao vazia e criterio vazio sao recusados porque uma missao sem o que
    fazer e sem como saber que acabou nao e uma missao; estimativa zero porque o
    campo existe para ser comparado com o realizado, e "zero minuto" nao e uma
    estimativa, e a ausencia dela.
    """
    resposta = client.post("/api/missions", json=_corpo(**ajuste))

    assert resposta.status_code == 422
    locais = [erro["loc"] for erro in resposta.json()["detail"]]
    assert ["body", campo] in locais


def test_prazo_sem_fuso_devolve_422(client: TestClient) -> None:
    """`deadline` naive e RECUSADO, nao normalizado em silencio.

    O defeito que isto fecha foi medido: com `datetime` simples, o mesmo prazo
    saia em duas serializacoes -- `"2026-09-20T10:00:00"` no corpo do 201 e
    `"2026-09-20T10:00:00Z"` no GET seguinte. A causa e a soma de duas
    decisoes corretas: a coluna e `timestamptz`, entao a leitura vem sempre em
    UTC; e `expire_on_commit=False` faz o 201 serializar o objeto como ele
    chegou no pedido, sem offset. Em JavaScript essas duas strings sao
    instantes DIFERENTES -- `new Date` le a primeira como hora local e a
    segunda como UTC --, e o frontend consome exatamente este contrato.

    Normalizar naive para UTC tambem resolveria a divergencia, e foi recusado:
    quem envia "10:00" sem dizer onde nao informou um instante, e escolher um
    fuso por ele e adivinhacao que sai errada em silencio e para sempre.
    Recusar alto custa ao cliente ser explicito uma vez.
    """
    resposta = client.post("/api/missions", json=_corpo(deadline="2026-09-20T10:00:00"))

    assert resposta.status_code == 422
    erros = resposta.json()["detail"]
    assert ["body", "deadline"] in [erro["loc"] for erro in erros]
    # O tipo do erro, e nao so o `loc`: um prazo recusado por estar malformado
    # satisfaria a assercao acima sem provar nada sobre o fuso.
    assert "timezone_aware" in [erro["type"] for erro in erros]


def test_o_prazo_do_201_e_o_mesmo_instante_do_get(client: TestClient) -> None:
    """O MESMO campo, nas duas respostas, e o mesmo instante.

    Nenhum teste comparava o `deadline` do 201 com o do GET, e foi essa
    ausencia que deixou a divergencia de serializacao passar: os dois olhavam
    um lado so. Aqui a comparacao e o proprio contrato.

    A igualdade e de INSTANTE, nao de texto, e isso e deliberado: as duas
    strings podem diferir legitimamente no offset (o pedido manda `-03:00`, o
    `timestamptz` volta em UTC) sem que nada esteja errado. O que nao pode
    diferir e o momento no tempo. Exigir a string identica proibiria o servidor
    de normalizar o fuso -- uma promessa que o contrato nao faz.
    """
    prazo = "2026-09-20T10:00:00-03:00"

    criada = _criar(client, deadline=prazo)
    listada = client.get("/api/missions").json()[0]

    esperado = datetime.fromisoformat(prazo)
    assert datetime.fromisoformat(criada["deadline"]) == esperado
    assert datetime.fromisoformat(listada["deadline"]) == esperado


# ---------------------------------------------------------------------------
# Entrada fora da faixa que o armazenamento representa: 422, nunca 500
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "minutos",
    [MAIOR_INTEIRO_DA_COLUNA + 1, 3_000_000_000, 2**63],
    ids=["um acima do int4", "tres bilhoes", "2 elevado a 63"],
)
def test_estimativa_acima_do_int4_devolve_422(client: TestClient, minutos: int) -> None:
    """Acima do teto TECNICO da coluna, recusa na borda.

    Sem o `le`, os tres valores chegavam ao INSERT e estouravam a coluna int4
    -- 500, medido. O teto nao e de negocio
    ("quanto tempo cabe numa missao" e decisao aberta do dono); e so o maior
    numero que a coluna guarda.
    """
    resposta = client.post("/api/missions", json=_corpo(estimated_minutes=minutos))

    assert resposta.status_code == 422
    locais = [erro["loc"] for erro in resposta.json()["detail"]]
    assert ["body", "estimated_minutes"] in locais


def test_estimativa_no_teto_do_int4_e_aceita(client: TestClient) -> None:
    """A borda ACEITA do teto: prova que ele e `le` e nao `lt`, e que o maior
    valor que a guarda deixa passar cabe mesmo na coluna -- um teto maior que a
    coluna trocaria o 422 de volta por um 500."""
    corpo = _criar(client, estimated_minutes=MAIOR_INTEIRO_DA_COLUNA)

    assert corpo["estimated_minutes"] == MAIOR_INTEIRO_DA_COLUNA


@pytest.mark.parametrize(
    "mission_id",
    [0, -1, MAIOR_INTEIRO_DA_COLUNA + 1, 99_999_999_999],
    ids=["zero", "negativo", "um acima do int4", "onze digitos"],
)
def test_id_de_missao_fora_da_faixa_devolve_422(
    client: TestClient, mission_id: int
) -> None:
    """O id do CAMINHO tambem e entrada, e tambem tem faixa.

    `/api/missions/99999999999/complete` chegava ao banco e estourava o
    parametro int4 -- 500. O `loc` e `["path", "mission_id"]`, e nao `body`: e
    ele que prova que quem recusou foi a guarda da rota, e nao outra validacao
    qualquer do corpo.
    """
    resposta = client.post(
        f"/api/missions/{mission_id}/complete", json={"operation_id": "op-abc"}
    )

    assert resposta.status_code == 422
    locais = [erro["loc"] for erro in resposta.json()["detail"]]
    assert ["path", "mission_id"] in locais


def test_id_de_missao_no_teto_do_int4_chega_ao_caso_de_uso(client: TestClient) -> None:
    """A borda ACEITA: o maior id que a coluna guarda passa pela guarda e recebe
    o 404 de missao inexistente -- nem 422 (guarda estrita demais) nem 500."""
    resposta = client.post(
        f"/api/missions/{MAIOR_INTEIRO_DA_COLUNA}/complete",
        json={"operation_id": "op-abc"},
    )

    assert resposta.status_code == 404


@pytest.mark.parametrize(
    "prazo",
    ["9999-12-31T23:59:59-03:00", "0001-01-01T00:00:00+03:00"],
    ids=["depois do ano 9999 em UTC", "antes do ano 1 em UTC"],
)
def test_prazo_fora_da_faixa_em_utc_devolve_422(client: TestClient, prazo: str) -> None:
    """A data local cabe no `datetime`; o instante, convertido para UTC, nao.

    O primeiro caso e o medido: `AwareDatetime` o aceitava, a API respondia
    201 e o PostgreSQL gravava `10000-01-01 02:59:59+00`. O segundo e o
    espelho na outra borda. O tipo `value_error` na assercao distingue esta
    recusa das outras do mesmo campo (malformado, sem fuso).
    """
    resposta = client.post("/api/missions", json=_corpo(deadline=prazo))

    assert resposta.status_code == 422
    erros = resposta.json()["detail"]
    assert ["body", "deadline"] in [erro["loc"] for erro in erros]
    assert "value_error" in [erro["type"] for erro in erros]


def test_prazo_extremo_recusado_nao_quebra_a_listagem(client: TestClient) -> None:
    """O teste que importa mais que os outros desta secao: o que o usuario ve.

    Antes da guarda, UM prazo extremo aceito deixava o `GET /api/missions`
    respondendo 500 para sempre -- a linha gravada nao podia mais ser lida, e a
    tela do Quartel-General ficava presa no estado de erro ate alguem apagar a
    linha por SQL. Os testes de recusa acima sao meios; este e o fim.
    """
    tentativa = client.post(
        "/api/missions", json=_corpo(deadline="9999-12-31T23:59:59-03:00")
    )

    listagem = client.get("/api/missions")

    # A listagem e conferida ANTES do status da tentativa, de proposito: sem a
    # guarda, e ela que quebra (a leitura da linha estoura no psycopg), e o
    # teste precisa reprovar pelo sintoma que o usuario ve -- nao so pelo 201
    # que o precede. Medido por mutacao.
    assert listagem.status_code == 200
    assert listagem.json() == []
    assert tentativa.status_code == 422


def test_prazo_no_ultimo_instante_representavel_e_aceito_e_lido(
    client: TestClient,
) -> None:
    """A borda ACEITA do prazo, lida de volta: prova que a guarda nao recusa
    mais do que precisa, e que o que ela aceita a listagem consegue ler.

    Este teste NAO vigia o fuso da sessao. Sem o `SET TIME ZONE` de
    `core/database.py`, ele so reprovaria com o ambiente a leste de UTC -- a
    oeste esta borda e lida sem problema, e quem quebra e a outra. Quem vigia e
    `test_sessao_em_utc.py`, que pede um fuso a leste e um a oeste por `PGTZ` e
    le cada borda no lado em que ela estourava.
    """
    criada = _criar(client, deadline="9999-12-31T23:59:59Z")

    listagem = client.get("/api/missions")

    assert listagem.status_code == 200
    assert [missao["id"] for missao in listagem.json()] == [criada["id"]]


# ---------------------------------------------------------------------------
# Listar
# ---------------------------------------------------------------------------


def test_listar_devolve_as_missoes_criadas_em_ordem_de_prazo(
    client: TestClient,
) -> None:
    """Criadas FORA de ordem de prazo de proposito: sem isso a ordem do
    contrato passaria por acidente, na ordem de insercao."""
    daqui_a_tres = _criar(client, deadline=_prazo(3))
    amanha = _criar(client, deadline=_prazo(1))

    resposta = client.get("/api/missions")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert [missao["id"] for missao in corpo] == [amanha["id"], daqui_a_tres["id"]]
    # O item da lista tem o mesmo contrato do item criado, campos computados
    # inclusive -- nao uma versao reduzida.
    assert corpo[0] == amanha


def test_listar_sem_missoes_devolve_lista_vazia(client: TestClient) -> None:
    """Vazio e 200 com `[]`, nao 404: a colecao existe, so esta sem itens. E o
    estado "vazio" que a tela do Quartel-General precisa distinguir de erro."""
    resposta = client.get("/api/missions")

    assert resposta.status_code == 200
    assert resposta.json() == []


# ---------------------------------------------------------------------------
# Concluir: sucesso, reenvio e os tres bloqueios
# ---------------------------------------------------------------------------


def test_concluir_devolve_200_com_o_estado_novo(client: TestClient) -> None:
    criada = _criar(client)

    resposta = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-abc"}
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["id"] == criada["id"]
    assert corpo["state"] == MissionState.CONCLUIDA.value
    assert corpo["completed_at"] is not None
    # E o estado novo tambem esta na listagem: a resposta nao e um objeto
    # solto que ficou certo so na volta da requisicao.
    listadas = client.get("/api/missions").json()
    assert listadas[0]["state"] == MissionState.CONCLUIDA.value


def test_concluir_grava_o_instante_do_relogio_injetado(
    client: TestClient, relogio_fixo: datetime
) -> None:
    """A rota entrega ao servico o relogio da DEPENDENCIA, e nao outro.

    E o teste que prova a ligacao entre `get_clock` e `concluir_missao`: se a
    rota passasse `system_now` direto, ou o servico voltasse a chamar
    `datetime.now(UTC)`, o `completed_at` seria a hora real, e nao o instante
    fixo que o override instalou. Comparado como instante, nao como texto.
    """
    criada = _criar(client)

    resposta = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-abc"}
    )

    assert resposta.status_code == 200, resposta.text
    assert datetime.fromisoformat(resposta.json()["completed_at"]) == relogio_fixo


def test_duracao_real_no_corpo_vem_dos_instantes(
    client: TestClient, session: Session
) -> None:
    """O outro lado do campo computado: com inicio E fim, ha duracao.

    Nao existe caso de uso de INICIAR missao no incremento 1a, entao o
    `started_at` e escrito direto na tabela -- e o unico jeito de alcancar
    este ramo hoje. Sem este teste, o `else` de `actual_duration_minutes` ficaria
    descoberto e a cobertura de ramificacoes reprovaria.
    """
    criada = _criar(client)
    missao = session.get(Mission, criada["id"])
    assert missao is not None
    missao.started_at = datetime.now(UTC) - timedelta(minutes=25)
    session.flush()

    corpo = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-abc"}
    ).json()

    assert corpo["actual_duration_minutes"] == 25


def test_reenviar_a_mesma_operacao_devolve_o_mesmo_200(
    client: TestClient, session: Session
) -> None:
    """Reenviar nao e erro -- e e a MESMA resposta, nao uma nova conclusao.

    A igualdade dos dois corpos e o que carrega a promessa: uma implementacao
    que concluisse de novo devolveria 200 com um `completed_at` diferente, e
    um teste que so conferisse o status passaria.
    """
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/complete"

    primeira = client.post(caminho, json={"operation_id": "op-abc"})
    segunda = client.post(caminho, json={"operation_id": "op-abc"})

    assert primeira.status_code == 200
    assert segunda.status_code == 200
    assert segunda.json() == primeira.json()
    assert _operacoes(session, criada["id"]) == 1


def test_identificador_de_operacao_vazio_devolve_422(client: TestClient) -> None:
    """A quarta guarda que faltava dizer NAO: `operation_id` com `min_length=1`.

    String vazia nao e um identificador -- e, pior, seria um identificador
    COMPARTILHAVEL: dois clientes que a enviassem cairiam na mesma linha de
    `mission_operations`, e o segundo receberia de volta a conclusao do
    primeiro como se fosse a propria. A recusa vale mais na borda do que a
    idempotencia valeria depois.

    422 e nao 409: aqui o corpo esta errado, nao o estado do servidor. A
    diferenca importa para o cliente -- corrigir o corpo versus gerar um
    identificador novo.
    """
    criada = _criar(client)

    resposta = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": ""}
    )

    assert resposta.status_code == 422
    locais = [erro["loc"] for erro in resposta.json()["detail"]]
    assert ["body", "operation_id"] in locais


@pytest.mark.parametrize(
    ("tamanho", "status"),
    [
        (TAMANHO_MAXIMO_DO_IDENTIFICADOR, 200),
        (TAMANHO_MAXIMO_DO_IDENTIFICADOR + 1, 422),
    ],
)
def test_identificador_de_operacao_tem_teto(
    client: TestClient, tamanho: int, status: int
) -> None:
    """O `operation_id` no limite passa; um caractere a mais e 422 na borda.

    Os dois lados do limite, e nao so o de fora: um teto trocado por
    `max_length=TAMANHO - 1` recusaria o identificador valido mais longo, e so
    o caso de dentro ve isso.
    """
    criada = _criar(client)

    resposta = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "o" * tamanho}
    )

    assert resposta.status_code == status, resposta.text
    if status == 422:
        locais = [erro["loc"] for erro in resposta.json()["detail"]]
        assert ["body", "operation_id"] in locais


def test_erro_de_validacao_mantem_o_formato_do_fastapi(client: TestClient) -> None:
    """O 422 de validacao NAO ganha `code` (spec do ciclo diario, secao Erros).

    O `code` e dos erros de DOMINIO. O 422 continua no formato nativo do
    FastAPI -- `detail` como LISTA de erros, com `loc` e `type` --, que e o que
    diz ao cliente qual campo corrigir. Um handler de `RequestValidationError`
    que acrescentasse `code` mudaria esse contrato para todos os endpoints de
    uma vez; este teste e o que recusa essa mudanca.
    """
    resposta = client.post("/api/missions", json=_corpo(difficulty=0))

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert set(corpo) == {"detail"}
    assert isinstance(corpo["detail"], list)


def test_operacao_nova_sobre_missao_concluida_devolve_409(client: TestClient) -> None:
    """Transicao ilegal e conflito de ESTADO do recurso -- 409 --, e a resposta
    explica o bloqueio (README s8) em vez de um 500 generico."""
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/complete"
    client.post(caminho, json={"operation_id": "op-abc"})

    resposta = client.post(caminho, json={"operation_id": "op-xyz"})

    assert resposta.status_code == 409
    detalhe = resposta.json()["detail"]
    # A mensagem diz de onde para onde nao se pode ir, e quais destinos
    # sobram. Conferir so "409" deixaria passar um corpo vazio.
    assert "concluida" in detalhe
    assert "nenhum estado" in detalhe
    # O `code` e o que o cliente le para decidir; a prosa e para quem depura.
    # Os dois 409 desta API so se distinguem por ele, e a acao do cliente e
    # oposta nos dois (aqui, nao ha o que repetir).
    assert resposta.json()["code"] == "transicao_ilegal"


def test_chave_de_operacao_gasta_em_outra_missao_devolve_409(
    client: TestClient,
) -> None:
    """Chave gasta tambem e conflito de estado, e nao entrada invalida: o corpo
    esta perfeito e seria aceito com uma chave nova."""
    primeira = _criar(client)
    segunda = _criar(client)
    client.post(
        f"/api/missions/{primeira['id']}/complete", json={"operation_id": "op-abc"}
    )

    resposta = client.post(
        f"/api/missions/{segunda['id']}/complete", json={"operation_id": "op-abc"}
    )

    assert resposta.status_code == 409
    detalhe = resposta.json()["detail"]
    assert "op-abc" in detalhe
    # A resposta nao revela nada da outra missao -- nem o id. A mensagem nao
    # tem digito nenhum, entao esta assercao so falha se o id vazar mesmo.
    assert str(primeira["id"]) not in detalhe
    # E a segunda missao continua pendente: a recusa nao deixou rastro.
    assert client.get("/api/missions").json()[1]["state"] == MissionState.PENDENTE.value
    # O outro 409, com o outro `code`: aqui o cliente gera um `operation_id`
    # novo e repete o MESMO corpo.
    assert resposta.json()["code"] == "operacao_reutilizada"


def test_missao_inexistente_devolve_404(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """404 com corpo neutro -- e o id pedido registrado no log.

    O corpo nao repete a mensagem do dominio (que nomeia a missao) porque ele
    tem de ser identico ao do 404 de missao alheia. A assercao do log e o que
    impede essa neutralizacao de virar perda de informacao: quem opera continua
    sabendo qual identificador foi pedido.
    """
    with caplog.at_level(logging.INFO):
        resposta = client.post(
            "/api/missions/9999/complete", json={"operation_id": "op-abc"}
        )

    assert resposta.status_code == 404
    # O corpo INTEIRO, e nao so o `code`: uma chave a mais (o id pedido, o
    # motivo) seria informacao que o 404 de missao alheia nao pode dar.
    assert resposta.json() == {
        "detail": "missao nao encontrada",
        "code": "missao_nao_encontrada",
    }
    assert "9999" in _logado(caplog)


def test_missao_de_outro_usuario_responde_o_mesmo_que_missao_inexistente(
    client: TestClient, session: Session, caplog: pytest.LogCaptureFixture
) -> None:
    """404, e 404 IDENTICO -- status e corpo.

    Responder 403, ou um 404 com "nao pertence ao usuario" no corpo, contaria
    ao cliente que o recurso existe. Com usuario unico isso e teorico; o
    habito e que nao e.

    A igualdade byte a byte das duas respostas e o que da dente ao teste: um
    corpo que explicasse o motivo verdadeiro continuaria devolvendo 404 e
    passaria em qualquer assercao que olhasse so o status.

    E o motivo verdadeiro nao se perde: ele vai para o LOG, que e onde
    `NaoPertenceAoUsuarioError` diz que a distincao precisa sobreviver -- quem
    opera precisa saber se o id nunca existiu ou se foi negado.
    """
    alheia = _missao_de_outro_usuario(session)

    with caplog.at_level(logging.WARNING):
        negada = client.post(
            f"/api/missions/{alheia}/complete", json={"operation_id": "op-abc"}
        )
    inexistente = client.post(
        "/api/missions/9999/complete", json={"operation_id": "op-abc"}
    )

    assert negada.status_code == inexistente.status_code == 404
    # Byte a byte, e nao so o JSON interpretado: a ordem das chaves e o
    # espacamento tambem sao observaveis por quem esta do outro lado.
    assert negada.content == inexistente.content
    assert negada.json()["code"] == "missao_nao_encontrada"
    assert str(alheia) not in negada.text
    # O log, sim, diz exatamente o que aconteceu.
    registrado = _logado(caplog)
    assert str(alheia) in registrado
    # O usuario NEGADO aparece dentro da frase que o nomeia. `str(ESTUDANTE)`
    # solto se reduzia a `"1" in registrado`, satisfeito por qualquer id de
    # missao que contivesse o digito 1 -- assercao que nao discriminava.
    assert f"nao pertence ao usuario {ESTUDANTE}" in registrado


# ---------------------------------------------------------------------------
# A dependencia de sessao, exercitada de verdade
# ---------------------------------------------------------------------------


def test_a_requisicao_commita_de_verdade(
    banco_migrado: Engine, cliente_real: TestClient
) -> None:
    """Com a dependencia REAL: a requisicao persiste, e nao vaza conexao.

    Todo teste acima roda com a sessao do teste injetada, e por isso nenhum
    deles consegue provar o `commit`: numa sessao compartilhada, o dado
    aparece commitado ou nao. Aqui outra conexao vai buscar a missao -- e uma
    conexao so ve o que foi commitado.

    E este e tambem o unico teste que EXECUTA `get_session`. Substituir uma
    dependencia nos testes nao a testa; sem este caso, o corpo dela ficaria
    descoberto (a mesma licao do `get_engine`).

    A contagem de conexoes conferidas antes e depois cobre a outra metade do
    contrato da dependencia: uma sessao que nao fechasse deixaria a conexao
    fora do pool, e cinco requisicoes assim pendurariam a aplicacao inteira
    num lugar sem relacao com a causa.

    As DUAS rotas que escrevem sao exercitadas, e nao so a criacao: a promessa
    de que "reenvios nao duplicam conclusoes" (README s8) depende da linha de
    `mission_operations` estar COMMITADA -- se ela morresse com a requisicao,
    o reenvio depois de uma queda concluiria a missao de novo, e o teste de
    reenvio (que compartilha a sessao com o teste) nao veria diferenca nenhuma.

    O fechamento da sessao NAO e verificado aqui, e a tentativa de verificar
    contando conexoes conferidas do pool foi medida e descartada: depois da
    requisicao a sessao fica sem referencia nenhuma, o coletor a recolhe e a
    conexao volta para o pool mesmo com a dependencia mutada para nunca
    fechar. A contagem voltava ao valor original nos dois casos -- assercao
    que passaria sem provar nada. O fechamento tem teste proprio abaixo, com a
    sessao presa numa variavel, que e onde a assercao discrimina.

    O `finally` apaga o que este teste criou -- e obrigacao dele, porque
    escreve fora da rede de protecao do rollback:
    `test_missions_models.py` exige a tabela `missions` vazia, e uma missao
    esquecida aqui o derrubaria a distancia. A linha de `mission_operations`
    vai junto pelo `ondelete=CASCADE`.
    """
    resposta = cliente_real.post("/api/missions", json=_corpo())

    assert resposta.status_code == 201, resposta.text
    mission_id = resposta.json()["id"]
    try:
        with Session(bind=banco_migrado) as outra_conexao:
            persistida = outra_conexao.get(Mission, mission_id)
            assert persistida is not None
            assert persistida.state is MissionState.PENDENTE
            assert persistida.user_id == ESTUDANTE

        conclusao = cliente_real.post(
            f"/api/missions/{mission_id}/complete", json={"operation_id": "op-real"}
        )
        assert conclusao.status_code == 200, conclusao.text

        with Session(bind=banco_migrado) as terceira_conexao:
            concluida = terceira_conexao.get(Mission, mission_id)
            assert concluida is not None
            assert concluida.state is MissionState.CONCLUIDA
            assert _operacoes(terceira_conexao, mission_id) == 1
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(delete(Mission).where(Mission.id == mission_id))
            limpeza.commit()


def test_get_session_fecha_a_sessao_e_devolve_a_conexao(banco_migrado: Engine) -> None:
    """A outra metade do contrato da dependencia: ela fecha o que abriu.

    Uma sessao que nao fechasse manteria a conexao fora do pool enquanto
    houvesse referencia a ela, e a transacao em aberto segurando travas no
    banco. Poucas requisicoes assim esgotam o pool, e a suite -- ou a
    aplicacao -- pendura em um lugar sem relacao com a causa.

    O gerador e consumido a mao, e nao por uma requisicao, por um motivo
    medido: e a variavel `sessao` que impede o coletor de recolher a sessao
    abandonada. Dentro de uma requisicao ela fica sem referencia, o coletor
    devolve a conexao sozinho, e a diferenca entre fechar e nao fechar
    desaparece -- foi assim que a primeira versao deste teste passou verde com
    a dependencia mutada para nunca fechar.

    `get_transaction()` e a assercao que discrimina. `is_active` nao serve:
    ele devolve True nos dois casos.
    """
    assert isinstance(banco_migrado.pool, QueuePool)
    conferidas_antes = banco_migrado.pool.checkedout()

    gerador = get_session(banco_migrado)
    sessao = next(gerador)
    # A sessao entregue e utilizavel e esta ligada a engine que a dependencia
    # recebeu -- nao a uma engine que ela tenha criado por conta propria.
    assert sessao.get_bind() is banco_migrado
    assert sessao.scalar(select(1)) == 1
    assert banco_migrado.pool.checkedout() == conferidas_antes + 1

    # Esgotar o gerador e o que o FastAPI faz no teardown da requisicao. O
    # StopIteration tambem afirma que a dependencia tem UM yield so: um
    # segundo entregaria outra sessao na mesma requisicao.
    with pytest.raises(StopIteration):
        next(gerador)

    assert sessao.get_transaction() is None
    assert banco_migrado.pool.checkedout() == conferidas_antes
