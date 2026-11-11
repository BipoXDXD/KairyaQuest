"""O texto PT que o back serializa para cada conquista e o mesmo do front.

O back continua publicando `title` e `description` em PT, e o front os copia
para `pt-BR.ts` (e acrescenta o EN). Sem este teste, uma mudanca de um lado
deixaria o painel com dois textos para a mesma conquista conforme o idioma.

A chave do front sai do NOME do membro do `Codigo` ou do `CodigoDerivado`
(`KAIRYA_PARTNERSHIP` -> `kairya_partnership`), e nao do valor: o valor
legado da conquista de parceria, anterior a migracao 2.1, cai no texto do back.
"""

import re
from pathlib import Path

import pytest

from focusquest.modules.progression.domain import PAINEL, ConquistaDoPainel
from focusquest.modules.progression.schemas import UnlockedAchievementRead

RAIZ = Path(__file__).resolve().parents[2]
PT_BR = RAIZ / "frontend/src/shared/i18n/messages/pt-BR.ts"

# `'chave': 'valor',` ou `'chave':\n    'valor',` -- o Prettier quebra a linha longa.
_ENTRADA = re.compile(r"'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'")


def _catalogo_do_front() -> dict[str, str]:
    return dict(_ENTRADA.findall(PT_BR.read_text(encoding="utf-8")))


def _chave(conquista: ConquistaDoPainel, campo: str) -> str:
    return f"progression.achievement.{conquista.codigo.name.lower()}.{campo}"


@pytest.mark.parametrize("conquista", PAINEL, ids=lambda c: c.codigo.name)
def test_titulo_e_descricao_pt_serializados_iguais_aos_do_front(
    conquista: ConquistaDoPainel,
) -> None:
    # Compara o que o contrato HTTP serializa, nao o atributo do dominio: uma
    # mudanca de texto no caminho da serializacao tambem quebra a paridade.
    serializado = UnlockedAchievementRead.da_conquista(conquista).model_dump()
    front = _catalogo_do_front()

    assert front.get(_chave(conquista, "title")) == serializado["title"]
    assert front.get(_chave(conquista, "description")) == serializado["description"]


def test_o_leitor_do_catalogo_acha_as_entradas() -> None:
    # Guarda contra um regex que nao casa nada e um teste que passaria vazio.
    front = _catalogo_do_front()

    assert front["shell.locale.label"] == "Idioma"
