"""`Idempotency-Key` da criacao de missao avulsa (POST /api/missions).

O reenvio do MESMO pedido com a MESMA chave devolve a missao ja criada; a
mesma chave com outro corpo e recusada. O escopo e (usuario, chave): a chave
de outro usuario nao tem relacao nenhuma com a sua.

**A reserva e a serializacao.** `INSERT ... ON CONFLICT DO NOTHING` sobre o
`UNIQUE (user_id, key)` acontece ANTES da missao, na mesma transacao. Um
segundo pedido simultaneo com a mesma chave ESPERA no indice ate o primeiro
terminar (o PostgreSQL faz isso sozinho na insercao especulativa): se o
primeiro commitou, o segundo nao insere nada e le a reserva commitada; se o
primeiro reverteu, o segundo reserva e cria. Por isso nao ha um 409 de "em
andamento": a espera dura uma transacao curta, e o cliente recebe a resposta
de verdade em vez de ter de tentar de novo.

**A validade e de 24 h**, contada pelo relogio injetado. As reservas vencidas
do proprio usuario sao apagadas no inicio da mesma transacao: e o mecanismo
mais simples que garante o teto da tabela sem job agendado, e a chave vencida
fica livre exatamente quando seria reutilizada.

**O retrato da tabela.** A limpeza so alcanca o proprio usuario: a reserva de
quem nao volta a criar fica. Cada criacao com chave registra em INFO o total
de reservas e a idade da mais antiga, tirados depois da limpeza -- nunca a
chave, a impressao nem o usuario. Leitura e valor esperado em
`docs/ARCHITECTURE.md`, secao do `POST /api/missions`.
"""

import hashlib
import json
import logging
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from focusquest.core.errors import (
    ChaveDeIdempotenciaInvalidaError,
    ChaveDeIdempotenciaReutilizadaError,
)
from focusquest.modules.missions.models import IdempotencyKey, Mission
from focusquest.modules.missions.schemas import MissionCreate

VALIDADE_DA_CHAVE = timedelta(hours=24)
UNICIDADE_DA_CHAVE = "uq_idempotency_keys_user_id_key"
VERSAO_DA_IMPRESSAO = "v1"

_LOG = logging.getLogger(__name__)

# So a forma canonica 8-4-4-4-12 (sem chaves, sem `urn:uuid:`, sem espacos):
# `UUID()` sozinho aceitaria todas essas variacoes, e a mesma chave teria
# varias grafias validas. Maiusculas sao aceitas porque o valor e o mesmo.
_UUID_CANONICO = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


def ler_chave(valor: str | None) -> UUID | None:
    """A chave do cabecalho, ou None quando ele nao veio (comportamento antigo).

    Cabecalho presente e invalido -- inclusive vazio -- e recusado, e nao
    tratado como ausente: o cliente que mandou a chave conta com a protecao.
    """
    if valor is None:
        return None
    if _UUID_CANONICO.fullmatch(valor) is None:
        raise ChaveDeIdempotenciaInvalidaError("Idempotency-Key precisa ser um UUID")
    return UUID(valor)


def impressao_do_pedido(dados: MissionCreate) -> str:
    """SHA-256 da versao da impressao + o corpo canonizado (chaves ordenadas,
    prazo em UTC).

    O prazo e normalizado porque o mesmo instante escrito com outro fuso e o
    mesmo pedido -- e a missao gravada seria a mesma.

    A versao torna explicita a mudanca de canonizacao: um campo novo no
    `MissionCreate`, mesmo com default, muda a impressao, e o reenvio de um
    pedido aceito antes do deploy recebe 409 dentro da janela de 24 h. Quem
    mudar a canonizacao incrementa `VERSAO_DA_IMPRESSAO`.
    """
    canonico = dados.model_dump(mode="json") | {
        "deadline": dados.deadline.astimezone(UTC).isoformat()
    }
    texto = json.dumps(
        canonico, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(f"{VERSAO_DA_IMPRESSAO}:{texto}".encode()).hexdigest()


def criar_com_chave(
    session: Session,
    *,
    user_id: int,
    chave: UUID,
    impressao: str,
    agora: datetime,
    criar: Callable[[], Mission],
) -> Mission:
    """Cria a missao com `criar` uma unica vez por (usuario, chave) vigente.

    O reenvio devolve a missao reservada SEM chamar `criar`: nao revalida o
    pedido contra o relogio de agora, porque o servidor ja o aceitou.
    """
    session.execute(
        delete(IdempotencyKey).where(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.created_at <= agora - VALIDADE_DA_CHAVE,
        )
    )
    _registrar_retrato(session, agora)
    reserva = session.execute(
        insert(IdempotencyKey)
        .values(
            user_id=user_id, key=chave, request_fingerprint=impressao, created_at=agora
        )
        .on_conflict_do_nothing(constraint=UNICIDADE_DA_CHAVE)
        .returning(IdempotencyKey.id)
    ).scalar_one_or_none()
    if reserva is None:
        return _missao_reservada(session, user_id, chave, impressao)
    missao = criar()
    session.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.id == reserva)
        .values(mission_id=missao.id)
    )
    return missao


def _registrar_retrato(session: Session, agora: datetime) -> None:
    """Registra so o tamanho da tabela e a idade, em segundos, da reserva mais
    antiga (0 com a tabela vazia). Os dois valores vao tambem como campos do
    registro, para quem filtrar o log sem interpretar o texto."""
    total, mais_antiga = session.execute(
        select(func.count(), func.min(IdempotencyKey.created_at))
    ).one()
    idade_s = 0 if mais_antiga is None else int((agora - mais_antiga).total_seconds())
    _LOG.info(
        "reservas de idempotencia: total=%d mais_antiga_s=%d",
        total,
        idade_s,
        extra={
            "idempotency_keys_total": total,
            "idempotency_keys_oldest_age_s": idade_s,
        },
    )


def _missao_reservada(
    session: Session, user_id: int, chave: UUID, impressao: str
) -> Mission:
    """A missao que a reserva ja commitada aponta, se o corpo for o mesmo."""
    existente = session.execute(
        select(IdempotencyKey.request_fingerprint, IdempotencyKey.mission_id).where(
            IdempotencyKey.user_id == user_id, IdempotencyKey.key == chave
        )
    ).one()
    if existente.request_fingerprint != impressao:
        raise ChaveDeIdempotenciaReutilizadaError(
            "chave de idempotencia ja usada com outro corpo"
        )
    missao = (
        None
        if existente.mission_id is None
        else session.get(Mission, existente.mission_id)
    )
    if missao is None:
        raise RuntimeError(
            f"reserva da chave {chave} sem missao: a transacao que reservou "
            "commitou sem criar"
        )
    return missao
