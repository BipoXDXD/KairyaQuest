"""Entrada EXCLUSIVA do navegador de testes, ausente do pacote de producao.

Liga a tutoria ao servidor falso da Anthropic em loopback, com os roteiros
deterministas. Nao e uma opcao da dependencia de producao: nao recebe chave
real nem aceita host externo. O script e2e-env valida tambem o banco.

E troca o relogio pelo controlavel de `relogio_do_e2e` (pendencia 116): real
ate o cenario fixar um instante por `PUT /_e2e/clock`. A rota mora num app
externo que monta o de producao, e nao no de producao.
"""

from datetime import timedelta
from functools import cache
from urllib.parse import urlsplit

from focusquest.core.config import Settings
from focusquest.main import app as app_de_producao
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.service import Tutoria
from integration.relogio_do_e2e import RelogioDoE2E, montar_app_do_e2e


def _url_do_falso() -> str:
    """O endereco do provedor, que so pode ser o falso em loopback."""
    url = Settings().anthropic_base_url
    if urlsplit(url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("o E2E so aceita o provedor falso em loopback")
    return url


@cache
def tutoria_falsa() -> Tutoria:
    settings = Settings()
    base_url = _url_do_falso()
    return Tutoria(
        provedor=ProvedorAnthropic(
            chave="e2e-chave-ficticia",
            base_url=base_url,
            modelo="claude-opus-5",
            max_tokens=settings.tutor_max_tokens,
            timeout_segundos=settings.tutor_timeout_seconds,
            fallback=True,
            esforco="low",
            esforco_da_avaliacao="medium",
        ),
        historico=settings.tutor_history_messages,
        turnos_por_dia=settings.tutor_daily_turn_limit,
        limite=timedelta(seconds=settings.tutor_timeout_seconds),
        modelo="claude-opus-5",
    )


app_de_producao.dependency_overrides[get_tutoria] = tutoria_falsa
app = montar_app_do_e2e(app_de_producao, RelogioDoE2E(), falso_url=_url_do_falso())
