"""A dependencia da tutoria: o provedor Anthropic, ou `None` sem a chave."""

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
        chave = settings.anthropic_api_key
        if chave is None or not chave.get_secret_value().strip():
            return None
        # Uma leitura so, para o adaptador e para a tutoria: o modelo que
        # chama e o que se grava como quem interpretou nao podem divergir.
        modelo = settings.tutor_model
        _tutoria = Tutoria(
            provedor=ProvedorAnthropic(
                chave=chave.get_secret_value(),
                base_url=settings.anthropic_base_url,
                modelo=modelo,
                max_tokens=settings.tutor_max_tokens,
                timeout_segundos=settings.tutor_timeout_seconds,
                fallback=settings.tutor_fallback,
                esforco=settings.tutor_effort,
                esforco_da_avaliacao=settings.evaluation_effort,
            ),
            historico=settings.tutor_history_messages,
            turnos_por_dia=settings.tutor_daily_turn_limit,
            limite=timedelta(seconds=settings.tutor_timeout_seconds),
            modelo=modelo,
        )
    return _tutoria
