"""A dependencia da tutoria: o provedor configurado, ou `None` sem chave."""

from datetime import timedelta

from focusquest.core.config import Settings
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.service import Tutoria

_tutoria: Tutoria | None = None


def get_tutoria() -> Tutoria | None:
    """A tutoria de producao, montada na primeira chamada com chave.

    `None` e "sem chave", e nao e guardado: configurar a chave e reiniciar
    basta. Os testes substituem esta dependencia pelo servidor falso -- e
    `test_get_tutoria_*` a exercita direto, porque dependencia trocada em
    todo teste e dependencia que nenhum teste executa (licao do 1a).
    """
    global _tutoria
    if _tutoria is None:
        settings = Settings()
        if settings.anthropic_api_key is None:
            return None
        _tutoria = Tutoria(
            provedor=ProvedorAnthropic(
                chave=settings.anthropic_api_key.get_secret_value(),
                base_url=settings.anthropic_base_url,
                modelo=settings.tutor_model,
                max_tokens=settings.tutor_max_tokens,
                timeout_segundos=settings.tutor_timeout_seconds,
            ),
            historico=settings.tutor_history_messages,
            limite=timedelta(seconds=settings.tutor_timeout_seconds),
        )
    return _tutoria
