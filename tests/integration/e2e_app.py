"""Entrada EXCLUSIVA do navegador de testes, ausente do pacote de producao.

Preserva os roteiros deterministas historicos, inclusive a exibicao de
fallback antigo. Nao e uma opcao da dependencia de producao: nao recebe
chave real nem aceita host externo. O script e2e-env valida tambem o banco.
"""

from datetime import timedelta
from functools import cache
from urllib.parse import urlsplit

from focusquest.core.config import Settings
from focusquest.main import app as app
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.dependencies import get_tutoria
from focusquest.modules.tutoring.service import Tutoria


@cache
def tutoria_falsa() -> Tutoria:
    settings = Settings()
    if urlsplit(settings.anthropic_base_url).hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        raise RuntimeError("o E2E so aceita o provedor falso em loopback")
    return Tutoria(
        provedor=ProvedorAnthropic(
            chave="e2e-chave-ficticia",
            base_url=settings.anthropic_base_url,
            modelo="claude-opus-5",
            max_tokens=settings.tutor_max_tokens,
            timeout_segundos=settings.tutor_timeout_seconds,
            fallback=True,
        ),
        historico=settings.tutor_history_messages,
        limite=timedelta(seconds=settings.tutor_timeout_seconds),
        modelo="claude-opus-5",
    )


app.dependency_overrides[get_tutoria] = tutoria_falsa
