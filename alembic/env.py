"""Ambiente do Alembic. A URL vem da configuracao, nunca do alembic.ini."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool

# Importados pelo efeito colateral de registrar as tabelas no `Base.metadata`:
# sem eles, o `target_metadata` do autogenerate nao conheceria a tutoria.
import focusquest.modules.missions.models  # noqa: F401
import focusquest.modules.progression.models  # noqa: F401
import focusquest.modules.tutoring.models  # noqa: F401
import focusquest.modules.users.models  # noqa: F401
from focusquest.core.base import Base
from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

config = context.config

if config.config_file_name is not None:
    # `disable_existing_loggers=False` corrige um efeito colateral que o
    # template do Alembic traz e que so aparece quando a migracao roda DENTRO
    # de outro processo -- como na fixture `banco_migrado`, que chama
    # `command.upgrade` na mesma interpretacao Python da suite.
    #
    # O padrao do `fileConfig` e True, e "existing" ali significa "todo logger
    # que ja foi criado e nao esta nomeado neste arquivo". O alembic.ini nomeia
    # root, sqlalchemy e alembic; `focusquest.*` nao esta la. Resultado
    # medido: depois de um `upgrade`, `logging.getLogger("focusquest.main")`
    # volta com `disabled = True`, e todo log da aplicacao desaparece em
    # silencio pelo resto do processo. Foi assim que o teste do 404 de missao
    # alheia descobriu o problema: o handler rodava e o log nao chegava.
    #
    # Configurar o log da FERRAMENTA nao e motivo para calar o da APLICACAO.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

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
    """A engine nasce pela MESMA fabrica da aplicacao, e nao por
    `engine_from_config`: e o que da a migracao a mesma configuracao de
    conexao que a aplicacao usa -- a sessao em UTC, hoje. O `alembic.ini` nao
    tem chave `sqlalchemy.*` nenhuma (a URL vem de `_url()`), entao o
    `engine_from_config` do template nao trazia nada que se perca aqui."""
    # Sem `limites`, de proposito: a migracao nao tem tetos de sessao (ADR 0001).
    connectable = create_engine_from_url(_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
