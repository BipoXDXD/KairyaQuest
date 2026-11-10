"""O teto diario de turnos da tutoria, na parte que nao precisa de banco.

A contagem (`turnos_de_hoje`) e o 429 de ponta a ponta estao em
`tests/integration/test_tutoring_teto_diario.py`. Aqui ficam a conta do
`Retry-After` e a resposta que o handler monta; o padrao da configuracao
esta em `test_config.py`.
"""

import json
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from starlette.requests import Request

from focusquest.core.errors import LimiteDiarioDaTutoriaError
from focusquest.main import _limite_diario
from focusquest.modules.tutoring.service import segundos_ate_meia_noite

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


@pytest.mark.parametrize(
    ("agora", "esperado"),
    [
        pytest.param(
            datetime(2026, 11, 10, 23, 59, 30, tzinfo=SAO_PAULO), 30, id="23h59m30s"
        ),
        pytest.param(
            datetime(2026, 11, 10, 0, 0, tzinfo=SAO_PAULO), 86_400, id="meia-noite"
        ),
        pytest.param(
            datetime(2026, 11, 10, 12, 0, tzinfo=SAO_PAULO), 43_200, id="meio-dia"
        ),
        # O mesmo instante de 23:59:30 em Sao Paulo, escrito em UTC: o dia
        # que vale e o de Sao Paulo, nao o do relogio do servidor.
        pytest.param(datetime(2026, 11, 11, 2, 59, 30, tzinfo=UTC), 30, id="em-utc"),
        # Fim do horario de verao: a meia-noite de 17/02/2019 voltou para as
        # 23h de 16/02, e o dia teve 25 horas. Subtrair no horario de parede
        # daria 7200; o tempo real ate o fim do dia e 10800.
        pytest.param(
            datetime(2019, 2, 16, 22, 0, tzinfo=SAO_PAULO), 10_800, id="fim-do-verao"
        ),
        # Inicio do horario de verao: a meia-noite de 04/11/2018 nao existiu
        # (pulou para 01h), e o dia seguinte comeca 2 horas depois das 22h.
        pytest.param(
            datetime(2018, 11, 3, 22, 0, tzinfo=SAO_PAULO), 7_200, id="inicio-do-verao"
        ),
        # Arredonda para cima: um `Retry-After` de 0 mandaria o cliente
        # repetir meio segundo antes de o dia virar.
        pytest.param(
            datetime(2026, 11, 10, 23, 59, 59, 500_000, tzinfo=SAO_PAULO),
            1,
            id="meio-segundo",
        ),
    ],
)
def test_segundos_ate_meia_noite_de_sao_paulo(agora: datetime, esperado: int) -> None:
    assert segundos_ate_meia_noite(agora) == esperado


def _pedido() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "headers": []})


def test_o_limite_vira_429_com_retry_after_e_code() -> None:
    resposta = _limite_diario(_pedido(), LimiteDiarioDaTutoriaError(30))
    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "30"
    corpo = json.loads(bytes(resposta.body))
    assert corpo["code"] == "limite_diario_da_tutoria"
    assert set(corpo) == {"detail", "code"}
