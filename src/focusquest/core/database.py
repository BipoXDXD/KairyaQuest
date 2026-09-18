"""Criacao da engine do SQLAlchemy."""

from sqlalchemy import Engine, create_engine


def create_engine_from_url(url: str) -> Engine:
    """Cria a engine. `pool_pre_ping` testa a `connection` antes de entrega-la:
    sem isso o pool reaproveita uma que morreu quando o banco reiniciou, o que
    acontece com frequencia em desenvolvimento."""
    return create_engine(url, pool_pre_ping=True)
