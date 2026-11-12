"""O teto diario da tutoria gasto de proposito, para o E2E.

O cenario do 429 em EN (`frontend/tests/e2e/locale.spec.ts`) precisa da API
do E2E com o teto do dia ja atingido. Este modulo semeia, direto no banco de
TESTE, pares pergunta+resposta com o instante de agora ate a contagem do
servico bater no limite, e os apaga depois:

    PYTHONPATH=tests ./scripts/e2e-env.sh \
        uv run python -m integration.teto_do_e2e semear|apagar

Pares, e nao so perguntas: o teto conta RESPOSTAS da Kairya
(`turnos_de_hoje`), porque "turno" e chamada paga. A resposta e `completa`,
nunca `gerando` -- o indice parcial aceita uma so `gerando` por usuario, e uma
que sobrasse seria recolhida como orfa no turno seguinte. O prefixo marca so a
pergunta (`ck_tutor_messages_forma` exige `client_message_id` nulo na
resposta); a resposta cai pelo `ON DELETE CASCADE` de `reply_to_id`.

Mora em tests/, como o `falso_do_e2e`: nenhum caminho da aplicacao escreve
mensagem sem passar pelo provedor. O banco vem de `FOCUSQUEST_DATABASE_URL`,
que so o `scripts/e2e-env.sh` aponta para o de teste; a guarda de
`banco_de_teste` recusa qualquer outro alvo antes de escrever.
"""

import argparse
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from focusquest.core.clock import system_now
from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.tutoring.domain import Papel, StatusDaMensagem
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.service import turnos_de_hoje
from integration.banco_de_teste import exigir_banco_de_teste

PREFIXO = "e2e-teto-"
_DO_PREFIXO = TutorMessage.client_message_id.like(f"{PREFIXO}%")


def semear(session: Session, agora: datetime, *, limite: int, user_id: int) -> int:
    """Grava os pares que faltam para `turnos_de_hoje` chegar a `limite` e
    devolve quantos gravou (zero com o teto ja atingido). Sem commit."""
    faltam = max(limite - turnos_de_hoje(session, agora, user_id=user_id), 0)
    # A numeracao continua a dos pares que ja existem: um `semear` repetido
    # (limite maior, ou sem `apagar` no meio) nao colide no UNIQUE do id.
    inicio = session.scalar(select(func.count()).where(_DO_PREFIXO)) or 0
    for n in range(inicio, inicio + faltam):
        pergunta = TutorMessage(
            user_id=user_id,
            role=Papel.USUARIO,
            content=f"Pergunta semeada pelo E2E ({n})",
            status=StatusDaMensagem.COMPLETA,
            client_message_id=f"{PREFIXO}{n}",
            created_at=agora,
        )
        session.add(pergunta)
        session.flush()
        session.add(
            TutorMessage(
                user_id=user_id,
                role=Papel.TUTORA,
                content=f"Resposta semeada pelo E2E ({n})",
                status=StatusDaMensagem.COMPLETA,
                reply_to_id=pergunta.id,
                created_at=agora,
            )
        )
    session.flush()
    return faltam


def apagar(session: Session) -> int:
    """Apaga as perguntas semeadas (as respostas vao pelo CASCADE) e devolve
    quantas apagou. Sem nada semeado, zero: o estado final e o pedido."""
    # `RETURNING`, e nao `rowcount`: o `Session.execute` tipa o resultado como
    # `Result`, sem `rowcount` (o mesmo desenho de `users.service`).
    apagadas = session.scalars(
        delete(TutorMessage).where(_DO_PREFIXO).returning(TutorMessage.id)
    ).all()
    return len(apagadas)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("acao", choices=["semear", "apagar"])
    argumentos = parser.parse_args(argv)
    settings = Settings()
    engine = create_engine_from_url(settings.database_url)
    try:
        try:
            exigir_banco_de_teste(engine)
        except RuntimeError as erro:
            raise SystemExit(
                f"recusando mexer no teto fora do banco de teste: {erro}"
            ) from None
        with Session(engine) as session:
            if argumentos.acao == "semear":
                semear(
                    session,
                    system_now(),
                    limite=settings.tutor_daily_turn_limit,
                    user_id=USUARIO_UNICO,
                )
            else:
                apagar(session)
            session.commit()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
