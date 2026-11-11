"""O enum `Idioma` e o CHECK da migracao 0009 nao podem divergir em silencio.

A migracao congelou a lista (migracao e historico); o enum e o que o codigo
usa hoje. Sem banco: a expressao do CHECK e lida do proprio arquivo.
"""

import re
from pathlib import Path

from focusquest.core.idioma import Idioma

RAIZ = Path(__file__).resolve().parents[2]
MIGRACAO = RAIZ / "alembic" / "versions" / "0009_user_locale.py"


def _idiomas_do_check() -> set[str]:
    fonte = MIGRACAO.read_text(encoding="utf-8")
    expressao = re.search(r"locale IN \(([^)]*)\)", fonte)
    assert expressao is not None, "a 0009 nao tem mais o CHECK `locale IN (...)`"
    return set(re.findall(r"'([^']+)'", expressao.group(1)))


def test_os_valores_do_idioma_sao_exatamente_pt_br_e_en() -> None:
    assert {idioma.value for idioma in Idioma} == {"pt-BR", "en"}


def test_o_check_da_0009_aceita_exatamente_os_valores_do_enum() -> None:
    assert _idiomas_do_check() == {idioma.value for idioma in Idioma}
