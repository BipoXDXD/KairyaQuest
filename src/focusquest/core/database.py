"""Engine e sessao do SQLAlchemy."""

from sqlalchemy import Engine, create_engine


def create_engine_from_url(url: str) -> Engine:
    """Cria a engine. `pool_pre_ping` evita entregar conexao morta apos o
    banco reiniciar, o que acontece com frequencia em desenvolvimento."""
    return create_engine(url, pool_pre_ping=True, future=True)
