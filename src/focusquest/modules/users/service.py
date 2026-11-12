"""Casos de uso do usuario: ler e gravar o idioma.

Como nos outros `service`, nada aqui commita: quem abre a transacao a fecha.
"""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from focusquest.core.idioma import Idioma
from focusquest.modules.users.models import User
from focusquest.modules.users.schemas import MeRead

# O idioma de quem nunca escolheu, para o back (tutoria e avaliacao). O front
# tem a propria deteccao pelo navegador; este e o UNICO lugar do back que
# conhece o fallback.
IDIOMA_PADRAO = Idioma.PT_BR


def ler_idioma(session: Session, user_id: int) -> Idioma:
    """O idioma do usuario, com `pt-BR` quando ele nunca escolheu.

    Usuario inexistente falha alto (`NoResultFound`): nao e "nunca escolheu".
    """
    gravado = session.execute(
        select(User.locale).where(User.id == user_id)
    ).scalar_one()
    return IDIOMA_PADRAO if gravado is None else Idioma(gravado)


def ler_me(session: Session, user_id: int) -> MeRead:
    """Nome e idioma gravado, sem fallback: `None` e informacao para o front."""
    display_name, locale = session.execute(
        select(User.display_name, User.locale).where(User.id == user_id)
    ).one()
    return MeRead(
        display_name=display_name,
        locale=None if locale is None else Idioma(locale),
    )


def atualizar_idioma(session: Session, user_id: int, idioma: Idioma) -> MeRead:
    """Grava o idioma num `UPDATE` atomico, sem ler antes.

    Repetir o mesmo valor e sucesso (idempotente). Nenhuma linha afetada so
    acontece com usuario inexistente, o que com usuario unico e defeito:
    falha alto em vez de responder 200 sobre nada gravado.

    A contagem vem do `RETURNING`, e nao de `rowcount`: o `Session.execute`
    tipa o resultado como `Result`, que nao tem `rowcount`, e o `RETURNING`
    ja traz o corpo da resposta sem uma segunda consulta.
    """
    linhas = session.execute(
        update(User)
        .where(User.id == user_id)
        .values(locale=idioma.value)
        .returning(User.display_name)
    ).all()
    if len(linhas) != 1:
        raise RuntimeError(
            f"esperava 1 usuario com id {user_id}, o UPDATE afetou {len(linhas)}"
        )
    return MeRead(display_name=linhas[0].display_name, locale=idioma)
