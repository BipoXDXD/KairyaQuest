"""O tamanho da pagina do `GET /api/missions` e o mesmo nos dois lados (#182).

O frontend pede a primeira pagina SEM `limit` (recebe o padrao do backend) e
decide que ha mais quando a pagina chega cheia, com `MISSIONS_PAGE_SIZE`
missoes. Se os dois numeros divergissem, uma pagina cheia pareceria a ultima
(front maior: o botao nunca aparece e o resto some da tela) ou toda pagina
pareceria ter continuacao (front menor). O frontend nao importa Python, entao
este teste le o arquivo TypeScript como texto, no molde de
`test_limite_do_texto_do_plano.py`.
"""

import re
from pathlib import Path

from focusquest.modules.missions.schemas import (
    TAMANHO_MAXIMO_DA_PAGINA,
    TAMANHO_PADRAO_DA_PAGINA,
)

RAIZ = Path(__file__).resolve().parents[2]
ARQUIVO_DO_FRONT = RAIZ / "frontend/src/features/missions/useMissions.ts"
DECLARACAO_DO_FRONT = re.compile(
    r"^export const MISSIONS_PAGE_SIZE = (\d+)$", flags=re.MULTILINE
)


def test_o_padrao_do_backend_e_o_tamanho_que_o_front_espera() -> None:
    achados = DECLARACAO_DO_FRONT.findall(ARQUIVO_DO_FRONT.read_text(encoding="utf-8"))
    assert achados == [str(TAMANHO_PADRAO_DA_PAGINA)]


def test_o_padrao_cabe_no_teto() -> None:
    assert 1 <= TAMANHO_PADRAO_DA_PAGINA <= TAMANHO_MAXIMO_DA_PAGINA
