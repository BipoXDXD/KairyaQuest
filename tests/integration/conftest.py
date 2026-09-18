"""Fixtures de integracao. Usam PostgreSQL real, nunca SQLite (README s10)."""

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
def engine(settings: Settings) -> Iterator[Engine]:
    engine = create_engine_from_url(settings.test_database_url)
    yield engine
    engine.dispose()
