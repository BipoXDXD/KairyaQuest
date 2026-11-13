"""`Idempotency-Key` no POST /api/missions: reenvio, conflito, escopo e validade.

A maior parte usa a fixture `session` (a sessao do teste E a da requisicao) e
um relogio que o proprio teste avanca. A concorrencia mora no fim, com
conexoes proprias e commits de verdade, pelo motivo escrito em
`test_missions_concorrencia.py`: duas threads dentro da mesma transacao nao
disputam nada.

Os valores esperados sao literais: a chave, o instante e o prazo estao
escritos a mao, e nenhum deles e recalculado pela logica sob teste.
"""

import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine, get_session
from focusquest.core.errors import ChaveDeIdempotenciaReutilizadaError
from focusquest.main import app
from focusquest.modules.missions.idempotency import (
    criar_com_chave,
    impressao_do_pedido,
)
from focusquest.modules.missions.models import IdempotencyKey, Mission
from focusquest.modules.missions.schemas import MissionCreate
from focusquest.modules.missions.service import criar_missao
from focusquest.modules.users.models import User

ESTUDANTE = 1
OUTRO = 2
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)
CHAVE = "3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c"
OUTRA_CHAVE = "9b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e"
PRAZO = "2026-09-19T15:00:00Z"
# A mesma hora de `PRAZO`, escrita com outro fuso: o mesmo instante.
PRAZO_EM_SAO_PAULO = "2026-09-19T12:00:00-03:00"
CORPO: dict[str, Any] = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo de uma pagina entregue",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": PRAZO,
}
SEGUNDOS_LIMITE = 30


class Relogio:
    """Relogio que o teste avanca. A rota le `agora` pela dependencia."""

    def __init__(self, instante: datetime) -> None:
        self.instante = instante

    def __call__(self) -> datetime:
        return self.instante


@pytest.fixture
def relogio() -> Iterator[Relogio]:
    relogio = Relogio(AGORA)
    app.dependency_overrides[get_clock] = lambda: relogio
    yield relogio
    app.dependency_overrides.pop(get_clock, None)


@pytest.fixture
def client(session: Session, relogio: Relogio) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


def _postar(client: TestClient, chave: str | None, **ajustes: Any) -> Any:
    cabecalhos = {} if chave is None else {"Idempotency-Key": chave}
    return client.post("/api/missions", json=CORPO | ajustes, headers=cabecalhos)


def _missoes(session: Session, user_id: int = ESTUDANTE) -> int:
    return session.execute(
        select(func.count()).select_from(Mission).where(Mission.user_id == user_id)
    ).scalar_one()


def _chaves(session: Session) -> list[tuple[int, UUID, datetime]]:
    return [
        (linha.user_id, linha.key, linha.created_at)
        for linha in session.scalars(
            select(IdempotencyKey).order_by(IdempotencyKey.user_id, IdempotencyKey.key)
        )
    ]


def test_mesma_chave_e_mesmo_corpo_devolvem_a_mesma_resposta(
    client: TestClient, session: Session
) -> None:
    primeira = _postar(client, CHAVE)
    segunda = _postar(client, CHAVE)

    assert primeira.status_code == 201
    assert segunda.status_code == 201
    assert segunda.json() == primeira.json()
    assert _missoes(session) == 1


def test_o_mesmo_instante_em_outro_fuso_e_o_mesmo_corpo(
    client: TestClient, session: Session
) -> None:
    primeira = _postar(client, CHAVE)
    segunda = _postar(client, CHAVE, deadline=PRAZO_EM_SAO_PAULO)

    assert segunda.status_code == 201
    assert segunda.json()["id"] == primeira.json()["id"]
    assert _missoes(session) == 1


def test_mesma_chave_com_corpo_diferente_responde_409_sem_escrever(
    client: TestClient, session: Session
) -> None:
    primeira = _postar(client, CHAVE)
    chaves_antes = _chaves(session)

    segunda = _postar(client, CHAVE, difficulty=3)

    assert segunda.status_code == 409
    assert segunda.json() == {
        "detail": "chave de idempotencia ja usada com outro corpo",
        "code": "chave_de_idempotencia_reutilizada",
    }
    assert _missoes(session) == 1
    assert _chaves(session) == chaves_antes
    missao = session.get(Mission, primeira.json()["id"])
    assert missao is not None
    assert missao.difficulty == 2


def test_a_impressao_e_versionada_e_tem_o_prazo_em_utc() -> None:
    """Valor fixo, calculado fora do codigo: SHA-256 de `v1:` + o JSON canonico
    com o prazo em `+00:00`. Mudar a canonizacao sem trocar a versao quebra
    este teste -- e e para quebrar."""
    dados = MissionCreate.model_validate(CORPO | {"deadline": PRAZO_EM_SAO_PAULO})

    assert impressao_do_pedido(dados) == (
        "27f42777667da65e36de122eb699484a4aa8d78f2bb1beb8b7bd06d9372efd2a"
    )


def test_chaves_diferentes_criam_missoes_diferentes(
    client: TestClient, session: Session
) -> None:
    primeira = _postar(client, CHAVE)
    segunda = _postar(client, OUTRA_CHAVE)

    assert segunda.status_code == 201
    assert segunda.json()["id"] != primeira.json()["id"]
    assert _missoes(session) == 2


def test_sem_chave_cada_pedido_cria_uma_missao_e_nada_e_reservado(
    client: TestClient, session: Session
) -> None:
    assert _postar(client, None).status_code == 201
    assert _postar(client, None).status_code == 201

    assert _missoes(session) == 2
    assert _chaves(session) == []


def test_a_chave_em_maiusculas_e_a_mesma_chave(
    client: TestClient, session: Session
) -> None:
    primeira = _postar(client, CHAVE)
    segunda = _postar(client, CHAVE.upper())

    assert segunda.json()["id"] == primeira.json()["id"]
    assert _missoes(session) == 1


@pytest.mark.parametrize(
    "chave",
    [
        "",
        "nao-e-uuid",
        "3f2a8c1e5b7d4e9a8c6f1d2e3f4a5b6c",
        "{3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c}",
        "urn:uuid:3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c",
        "3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6",
        "3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c0",
        " 3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c",
        "3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6g",
        "' OR 1=1 --",
        "a" * 5000,
    ],
)
def test_chave_que_nao_e_uuid_responde_422_com_code(
    client: TestClient, session: Session, chave: str
) -> None:
    resposta = _postar(client, chave)

    assert resposta.status_code == 422
    assert resposta.json() == {
        "detail": "Idempotency-Key precisa ser um UUID",
        "code": "chave_de_idempotencia_invalida",
    }
    assert _missoes(session) == 0
    assert _chaves(session) == []


def test_corpo_invalido_com_chave_continua_422_de_validacao(
    client: TestClient, session: Session
) -> None:
    resposta = _postar(client, CHAVE, difficulty=0)

    assert resposta.status_code == 422
    assert "code" not in resposta.json()
    assert _chaves(session) == []


def test_reenvio_devolve_a_missao_mesmo_depois_de_o_prazo_vencer(
    client: TestClient, session: Session, relogio: Relogio
) -> None:
    """O reenvio repete a resposta; nao revalida o pedido contra a hora nova.

    23 h depois, um prazo de 1 h a frente ja venceu: revalidar responderia 422
    a um pedido que o servidor aceitou.
    """
    primeira = _postar(client, CHAVE, deadline="2026-09-18T16:00:00Z")
    relogio.instante = datetime(2026, 9, 19, 14, 0, tzinfo=UTC)

    segunda = _postar(client, CHAVE, deadline="2026-09-18T16:00:00Z")

    assert segunda.status_code == 201
    assert segunda.json()["id"] == primeira.json()["id"]


def test_a_chave_vale_ate_um_segundo_antes_de_24_horas(
    client: TestClient, session: Session, relogio: Relogio
) -> None:
    primeira = _postar(client, CHAVE)
    relogio.instante = datetime(2026, 9, 19, 14, 59, 59, tzinfo=UTC)

    segunda = _postar(client, CHAVE, deadline="2026-09-20T15:00:00Z")

    assert segunda.status_code == 409
    assert _missoes(session) == 1
    assert primeira.status_code == 201


@pytest.mark.parametrize(
    "instante",
    [
        datetime(2026, 9, 19, 15, 0, tzinfo=UTC),
        datetime(2026, 9, 19, 15, 0, 1, tzinfo=UTC),
    ],
)
def test_depois_de_24_horas_a_chave_pode_ser_reutilizada(
    client: TestClient, session: Session, relogio: Relogio, instante: datetime
) -> None:
    primeira = _postar(client, CHAVE)
    relogio.instante = instante

    segunda = _postar(client, CHAVE, deadline="2026-09-20T15:00:00Z")

    assert segunda.status_code == 201
    assert segunda.json()["id"] != primeira.json()["id"]
    assert _missoes(session) == 2
    assert _chaves(session) == [(ESTUDANTE, UUID(CHAVE), instante)]


def test_a_limpeza_remove_as_chaves_vencidas_so_do_proprio_usuario(
    session: Session,
) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    for user_id in (ESTUDANTE, OUTRO):
        _criar_com_chave(session, user_id, CHAVE, AGORA)

    depois = datetime(2026, 9, 19, 15, 0, 1, tzinfo=UTC)
    _criar_com_chave(session, ESTUDANTE, OUTRA_CHAVE, depois)

    assert _chaves(session) == [
        (ESTUDANTE, UUID(OUTRA_CHAVE), depois),
        (OUTRO, UUID(CHAVE), AGORA),
    ]


def _criar_com_chave(
    session: Session,
    user_id: int,
    chave: str,
    agora: datetime,
    impressao: str = "0" * 64,
) -> Mission:
    return criar_com_chave(
        session,
        user_id=user_id,
        chave=UUID(chave),
        impressao=impressao,
        agora=agora,
        criar=lambda: criar_missao(
            session,
            user_id=user_id,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina entregue",
            difficulty=2,
            estimated_minutes=30,
            deadline=datetime(2026, 9, 19, 15, 0, tzinfo=UTC),
        ),
    )


def test_a_mesma_chave_de_outro_usuario_nao_tem_relacao(session: Session) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()

    minha = _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA)
    alheia = _criar_com_chave(session, OUTRO, CHAVE, AGORA)

    assert alheia.id != minha.id
    assert alheia.user_id == OUTRO
    assert _missoes(session, ESTUDANTE) == 1
    assert _missoes(session, OUTRO) == 1


def test_a_mesma_chave_de_outro_usuario_com_outro_corpo_nao_e_conflito(
    session: Session,
) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA, impressao="a" * 64)

    alheia = _criar_com_chave(session, OUTRO, CHAVE, AGORA, impressao="b" * 64)

    assert alheia.user_id == OUTRO


def test_corpo_diferente_no_servico_levanta_o_erro_de_dominio(
    session: Session,
) -> None:
    _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA, impressao="a" * 64)

    with pytest.raises(ChaveDeIdempotenciaReutilizadaError):
        _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA, impressao="b" * 64)


# --- Concorrencia real: conexoes proprias, commits de verdade ---------------


def _criar_em_paralelo(engine: Engine, impressoes: list[str]) -> list[str]:
    """Uma criacao por thread, todas com a MESMA chave, largando juntas.

    `sessao.connection()` antes da barreira: sem ela a conexao nasce depois
    da largada e as transacoes deixam de se cruzar (medido em
    `test_missions_concorrencia.py`).
    """
    barreira = threading.Barrier(len(impressoes), timeout=SEGUNDOS_LIMITE)
    resultados: list[str | None] = [None] * len(impressoes)

    def tentar(indice: int, impressao: str) -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()
            barreira.wait()
            try:
                missao = _criar_com_chave(sessao, ESTUDANTE, CHAVE, AGORA, impressao)
                sessao.commit()
                resultados[indice] = f"missao {missao.id}"
            except ChaveDeIdempotenciaReutilizadaError:
                sessao.rollback()
                resultados[indice] = "chave reutilizada"

    threads = [
        threading.Thread(target=tentar, args=(i, impressao))
        for i, impressao in enumerate(impressoes)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "thread travada"
    assert None not in resultados, f"alguma thread morreu: {resultados}"
    return [resultado for resultado in resultados if resultado is not None]


@pytest.fixture
def banco_limpo(banco_migrado: Engine) -> Iterator[Engine]:
    """Apaga, no fim, so o que estes testes commitaram (missoes do estudante
    com a instrucao deles; as chaves vao junto pelo CASCADE)."""
    try:
        yield banco_migrado
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(
                delete(IdempotencyKey).where(IdempotencyKey.key == UUID(CHAVE))
            )
            sessao.execute(
                delete(Mission).where(
                    Mission.user_id == ESTUDANTE,
                    Mission.instructions == "Ler o capitulo 3",
                )
            )
            sessao.commit()


def _contar(engine: Engine) -> tuple[int, int]:
    with Session(bind=engine) as sessao:
        return (
            _missoes(sessao),
            sessao.execute(
                select(func.count()).select_from(IdempotencyKey)
            ).scalar_one(),
        )


def test_duas_criacoes_simultaneas_com_a_mesma_chave_produzem_um_efeito(
    banco_limpo: Engine,
) -> None:
    resultados = _criar_em_paralelo(banco_limpo, ["a" * 64, "a" * 64])

    assert len(set(resultados)) == 1
    assert resultados[0].startswith("missao ")
    assert _contar(banco_limpo) == (1, 1)


def test_simultaneas_com_corpos_diferentes_uma_cria_e_a_outra_recebe_409(
    banco_limpo: Engine,
) -> None:
    resultados = _criar_em_paralelo(banco_limpo, ["a" * 64, "b" * 64])

    assert sorted(r.split()[0] for r in resultados) == ["chave", "missao"]
    assert _contar(banco_limpo) == (1, 1)


@pytest.fixture
def client_de_producao(banco_limpo: Engine, relogio: Relogio) -> Iterator[TestClient]:
    """Uma sessao NOVA por requisicao, pelo `get_session` de verdade.

    A fixture `client` reaproveita a mesma `Session`: o reenvio sai do identity
    map, com o objeto como o 1o pedido o deixou, e esconde qualquer diferenca
    entre a serializacao do 201 e a da missao relida do banco.
    """
    app.dependency_overrides[get_engine] = lambda: banco_limpo
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_engine, None)


def test_reenvio_em_outra_sessao_devolve_os_mesmos_bytes_com_prazo_em_offset(
    client_de_producao: TestClient,
) -> None:
    primeira = _postar(client_de_producao, CHAVE, deadline=PRAZO_EM_SAO_PAULO)
    segunda = _postar(client_de_producao, CHAVE, deadline=PRAZO_EM_SAO_PAULO)

    assert primeira.status_code == 201
    assert segunda.status_code == 201
    assert segunda.content == primeira.content
    assert primeira.json()["deadline"] == PRAZO


def test_efeito_recusado_depois_da_reserva_libera_a_chave(
    client_de_producao: TestClient, banco_limpo: Engine
) -> None:
    """A recusa de `validar_limites_da_avulsa` acontece DEPOIS da reserva,
    dentro de `criar`. A reserva tem de ir embora junto com o efeito: se ela
    sobrevivesse, o pedido corrigido com a mesma chave receberia 409 (corpo
    diferente) ou uma reserva sem missao.

    Usa `client_de_producao`: com a sessao compartilhada da fixture `client`,
    ninguem reverte a transacao da requisicao que falhou.
    """
    recusado = _postar(client_de_producao, CHAVE, deadline="2026-09-18T14:00:00Z")

    assert recusado.status_code == 422
    assert recusado.json()["code"] == "prazo_fora_do_limite"
    assert _contar(banco_limpo) == (0, 0)

    corrigido = _postar(client_de_producao, CHAVE)

    assert corrigido.status_code == 201
    assert corrigido.json()["deadline"] == PRAZO
    assert _contar(banco_limpo) == (1, 1)


def test_reserva_commitada_sem_missao_falha_alto(session: Session) -> None:
    """O "impossivel": uma reserva sem missao. Falha com excecao, nunca com
    uma resposta inventada."""
    session.add(
        IdempotencyKey(
            user_id=ESTUDANTE,
            key=UUID(CHAVE),
            request_fingerprint="0" * 64,
            created_at=AGORA,
        )
    )
    session.flush()

    with pytest.raises(RuntimeError, match="sem missao"):
        _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA)


def test_o_reenvio_devolve_a_propria_missao_quando_outro_usuario_tem_a_chave(
    session: Session,
) -> None:
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _criar_com_chave(session, OUTRO, CHAVE, AGORA)
    minha = _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA)

    reenvio = _criar_com_chave(session, ESTUDANTE, CHAVE, AGORA)

    assert reenvio.id == minha.id
    assert reenvio.id != alheia.id
