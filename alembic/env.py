"""Ambiente do Alembic. A URL vem da configuracao, nunca do alembic.ini."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from focusquest.core.base import Base
from focusquest.core.config import Settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    """URL do banco.

    `-x test=true` aponta para o banco de teste. Sem isso, rodar a suite de
    migracao apagaria o banco de desenvolvimento -- e o README s10 manda
    recusar alvos de desenvolvimento.
    """
    settings = Settings()
    if context.get_x_argument(as_dictionary=True).get("test") == "true":
        return settings.test_database_url
    return settings.database_url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _url()
    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
