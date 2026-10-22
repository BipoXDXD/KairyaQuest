"""Tutoria de producao: exclusivamente Groq, ou `None` sem a chave dele."""

from datetime import timedelta

from focusquest.core.config import Settings
from focusquest.modules.tutoring.groq_provider import MODELO_GROQ, ProvedorGroq
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
        if (
            settings.groq_api_key is None
            or not settings.groq_api_key.get_secret_value().strip()
        ):
            return None
        # Uma leitura so, para o adaptador e para a tutoria: o modelo que
        # chama e o que se grava como quem interpretou nao podem divergir.
        modelo = MODELO_GROQ
        _tutoria = Tutoria(
            provedor=ProvedorGroq(
                chave=settings.groq_api_key.get_secret_value(),
                max_tokens=settings.tutor_max_tokens,
                timeout_segundos=settings.tutor_timeout_seconds,
            ),
            historico=settings.tutor_history_messages,
            limite=timedelta(seconds=settings.tutor_timeout_seconds),
            modelo=modelo,
        )
    return _tutoria
