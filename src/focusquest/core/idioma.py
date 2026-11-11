"""O idioma da interface e da tutoria (F3).

Mora em `core/`, e nao em `users/`, porque `tutoring`, `evaluation` e `users`
o usam: no `users` ele obrigaria os outros dois a importar um modulo par so
para conhecer dois valores.
"""

from enum import StrEnum


class Idioma(StrEnum):
    """Os idiomas aceitos. Os VALORES sao contrato (JSON e CHECK
    `ck_users_locale` da migracao 0009) e seguem a BCP 47 que o navegador usa
    em `navigator.language`."""

    PT_BR = "pt-BR"
    EN = "en"
