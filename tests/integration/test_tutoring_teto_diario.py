"""O teto diario de turnos: a contagem no banco e o 429 de ponta a ponta.

O teto e guarda de orcamento, e "turno" e CHAMADA ao modelo (uma resposta da
Kairya), nao pergunta: o reenvio de uma interrompida tambem e pago. O dia e o
de America/Sao_Paulo. Os testes usam um dia proprio, longe do `AGORA` dos outros
modulos, para nao contar mensagens que outro teste deixou no meio do caminho.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import get_clock
from focusquest.core.database import get_engine
from focusquest.main import app
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.domain import Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.service import Tutoria, turnos_de_hoje
from integration.conftest import Conversa
from integration.provedor_falso import Roteiro, ServidorAnthropicFalso, Texto

ESTUDANTE = 1
SAO_PAULO = ZoneInfo("America/Sao_Paulo")
DIA = datetime(2026, 3, 10, 9, 0, tzinfo=SAO_PAULO)
TETO = 60


class _Relogio:
    """O relogio da requisicao, que o teste adianta entre um pedido e outro."""

    def __init__(self, agora: datetime) -> None:
        self.agora = agora

    def __call__(self) -> datetime:
        return self.agora


@pytest.fixture
def relogio() -> _Relogio:
    return _Relogio(DIA)


@pytest.fixture
def cliente(
    banco_migrado: Engine, tutoria: Tutoria, relogio: _Relogio
) -> Iterator[TestClient]:
    sobrepostos: dict[Callable[..., Any], Callable[..., Any]] = {
        get_engine: lambda: banco_migrado,
        get_tutoria: lambda: tutoria,
        get_clock: lambda: relogio,
    }
    app.dependency_overrides.update(sobrepostos)
    with TestClient(app) as c:
        yield c
    for chave in sobrepostos:
        app.dependency_overrides.pop(chave, None)


def _semear(
    fabrica: sessionmaker[Session],
    conversa: Conversa,
    quantas: int,
    em: datetime,
    prefixo: str,
    status_da_resposta: StatusDaMensagem = StatusDaMensagem.COMPLETA,
) -> None:
    """`quantas` perguntas do estudante, cada uma com UMA resposta da Kairya
    (uma chamada ao modelo) no `status_da_resposta`, gravadas em `em`."""
    with fabrica() as sessao:
        for indice in range(quantas):
            pergunta = TutorMessage(
                user_id=ESTUDANTE,
                role=Papel.USUARIO,
                content="oi",
                status=StatusDaMensagem.COMPLETA,
                client_message_id=conversa.id(f"{prefixo}-{indice}"),
                created_at=em,
            )
            sessao.add(pergunta)
            sessao.flush()
            sessao.add(
                TutorMessage(
                    user_id=ESTUDANTE,
                    role=Papel.TUTORA,
                    content="ola",
                    status=status_da_resposta,
                    reply_to_id=pergunta.id,
                    created_at=em,
                )
            )
        sessao.commit()


def _enviar(cliente: TestClient, cid: str) -> Any:
    return cliente.post(
        "/api/tutoring/messages", json={"client_message_id": cid, "content": "oi"}
    )


def _gravadas(fabrica: sessionmaker[Session], cid: str) -> int:
    with fabrica() as sessao:
        total = sessao.scalar(
            select(func.count())
            .select_from(TutorMessage)
            .where(TutorMessage.client_message_id == cid)
        )
    assert total is not None
    return total


# --- Contagem ----------------------------------------------------------------


def test_turnos_de_hoje_conta_so_as_chamadas_do_dia_de_sao_paulo(
    fabrica: sessionmaker[Session], conversa: Conversa
) -> None:
    inicio = datetime(2026, 3, 10, 0, 0, tzinfo=SAO_PAULO)
    _semear(fabrica, conversa, 2, inicio, "comeco-do-dia")
    _semear(fabrica, conversa, 1, inicio + timedelta(hours=23, minutes=59), "fim")
    # Fora da janela [00:00, 24:00): um instante antes e a meia-noite seguinte.
    _semear(fabrica, conversa, 1, inicio - timedelta(microseconds=1), "ontem")
    _semear(fabrica, conversa, 1, inicio + timedelta(days=1), "amanha")
    with fabrica() as sessao:
        assert turnos_de_hoje(sessao, DIA, user_id=ESTUDANTE) == 3


def test_turnos_de_hoje_le_o_dia_de_sao_paulo_mesmo_com_agora_em_utc(
    fabrica: sessionmaker[Session], conversa: Conversa
) -> None:
    """01:00 UTC de 11/03 ainda e 22:00 de 10/03 em Sao Paulo."""
    _semear(fabrica, conversa, 2, DIA, "utc")
    with fabrica() as sessao:
        assert (
            turnos_de_hoje(
                sessao, datetime(2026, 3, 11, 1, 0, tzinfo=UTC), user_id=ESTUDANTE
            )
            == 2
        )


def test_turnos_de_hoje_sem_perguntas_e_zero(fabrica: sessionmaker[Session]) -> None:
    with fabrica() as sessao:
        assert turnos_de_hoje(sessao, DIA, user_id=ESTUDANTE) == 0


# --- O 429 -------------------------------------------------------------------


def test_turnos_de_hoje_conta_respostas_e_nao_perguntas(
    fabrica: sessionmaker[Session], conversa: Conversa
) -> None:
    """Uma pergunta reenviada depois de uma resposta interrompida tem DUAS
    respostas, duas chamadas pagas: o teto conta as duas."""
    _semear(fabrica, conversa, 1, DIA, "uma", StatusDaMensagem.INTERROMPIDA)
    with fabrica() as sessao:
        pergunta = sessao.scalars(
            select(TutorMessage).where(
                TutorMessage.client_message_id == conversa.client_message_ids[-1]
            )
        ).one()
        sessao.add(
            TutorMessage(
                user_id=ESTUDANTE,
                role=Papel.TUTORA,
                content="de novo",
                status=StatusDaMensagem.COMPLETA,
                reply_to_id=pergunta.id,
                created_at=DIA,
            )
        )
        sessao.commit()
        assert turnos_de_hoje(sessao, DIA, user_id=ESTUDANTE) == 2


@pytest.mark.parametrize("anteriores", [TETO - 2, TETO - 1])
def test_ate_o_teto_a_pergunta_passa(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
    anteriores: int,
) -> None:
    """Com 58 ou 59 chamadas no dia, esta e a 59a ou a 60a: as duas passam."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _semear(fabrica, conversa, anteriores, DIA - timedelta(hours=1), "antes")
    resposta = _enviar(cliente, conversa.id("dentro"))
    assert resposta.status_code == 200
    assert len(falso.recebidas) == 1


def test_a_61a_chamada_responde_429_sem_gravar_nem_chamar_o_provedor(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
    relogio: _Relogio,
) -> None:
    _semear(fabrica, conversa, TETO, DIA - timedelta(hours=1), "cheio")
    relogio.agora = datetime(2026, 3, 10, 23, 59, 30, tzinfo=SAO_PAULO)
    cid = conversa.id("estourou")
    resposta = _enviar(cliente, cid)
    assert resposta.status_code == 429
    assert resposta.json()["code"] == "limite_diario_da_tutoria"
    assert resposta.headers["retry-after"] == "30"
    assert _gravadas(fabrica, cid) == 0
    assert falso.recebidas == []


def test_a_virada_da_meia_noite_zera_a_contagem(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
    relogio: _Relogio,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _semear(fabrica, conversa, TETO, DIA, "ontem-cheio")
    relogio.agora = datetime(2026, 3, 10, 23, 59, 59, tzinfo=SAO_PAULO)
    assert _enviar(cliente, conversa.id("antes-da-virada")).status_code == 429
    relogio.agora = datetime(2026, 3, 11, 0, 0, tzinfo=SAO_PAULO)
    assert _enviar(cliente, conversa.id("depois-da-virada")).status_code == 200


def test_reenvio_de_pergunta_ja_contada_nao_esbarra_no_teto(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
) -> None:
    """Quem repete o MESMO `client_message_id` (rede caiu) nao abre turno novo:
    a pergunta ja foi contada, e o reenvio de uma respondida devolve a resposta
    sem chamar o modelo."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _semear(fabrica, conversa, TETO - 1, DIA - timedelta(hours=1), "quase")
    cid = conversa.id("a-sexagesima")
    assert _enviar(cliente, cid).status_code == 200
    assert _enviar(cliente, cid).status_code == 200
    assert len(falso.recebidas) == 1


def _respostas_gerando(fabrica: sessionmaker[Session]) -> int:
    with fabrica() as sessao:
        total = sessao.scalar(
            select(func.count())
            .select_from(TutorMessage)
            .where(
                TutorMessage.user_id == ESTUDANTE,
                TutorMessage.status == StatusDaMensagem.GERANDO,
            )
        )
    assert total is not None
    return total


def test_reenvio_de_pergunta_interrompida_no_teto_responde_429_sem_chamar(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
) -> None:
    """59 chamadas completas e 1 interrompida somam 60. Reenviar a interrompida
    seria a 61a chamada paga: 429, sem `gerando` nova e sem chamar o modelo."""
    _semear(fabrica, conversa, TETO - 1, DIA - timedelta(hours=1), "pagas")
    _semear(
        fabrica,
        conversa,
        1,
        DIA - timedelta(minutes=5),
        "cortada",
        StatusDaMensagem.INTERROMPIDA,
    )
    cid = conversa.client_message_ids[-1]
    resposta = _enviar(cliente, cid)
    assert resposta.status_code == 429
    assert resposta.json()["code"] == "limite_diario_da_tutoria"
    assert _respostas_gerando(fabrica) == 0
    assert falso.recebidas == []


def test_reenvio_de_pergunta_interrompida_abaixo_do_teto_chama_o_modelo(
    cliente: TestClient,
    falso: ServidorAnthropicFalso,
    fabrica: sessionmaker[Session],
    conversa: Conversa,
) -> None:
    """O par do teste acima: com folga no dia, o mesmo reenvio passa."""
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _semear(
        fabrica,
        conversa,
        1,
        DIA - timedelta(minutes=5),
        "cortada-com-folga",
        StatusDaMensagem.INTERROMPIDA,
    )
    assert _enviar(cliente, conversa.client_message_ids[-1]).status_code == 200
    assert len(falso.recebidas) == 1
