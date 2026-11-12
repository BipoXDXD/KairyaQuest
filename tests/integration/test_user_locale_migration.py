"""A migracao 0009: `users.locale`, anulavel e sem default (F3).

Mesmo padrao de `test_kairya_migration.py`: o `finally` sempre devolve o
esquema para `head`, e o usuario commitado e proprio, apagado no fim.
"""

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, MetaData, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.users.models import User

from .conftest import alembic_config

REVISAO = "0009"
# Usuario so destes testes: nao toca no `locale` do usuario unico.
SO_DA_0009 = 90
CHECK = "ck_users_locale"
ESPELHO_DO_MODELO = "users_espelho_do_modelo"


def _anterior_a_0009() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _coluna_locale(banco: Engine) -> dict[str, object] | None:
    """`is_nullable` e `column_default` de `users.locale`, ou None sem coluna."""
    with banco.connect() as conexao:
        linha = (
            conexao.execute(
                text(
                    "SELECT is_nullable, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_schema = current_schema() "
                    "AND table_name = 'users' AND column_name = 'locale'"
                )
            )
            .mappings()
            .one_or_none()
        )
        return None if linha is None else dict(linha)


def _checks_do_postgres(session: Session, tabela: str) -> dict[str, str]:
    linhas = session.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE contype = 'c' AND conrelid = CAST(:tabela AS regclass)"
        ),
        {"tabela": tabela},
    ).all()
    return {nome: definicao for nome, definicao in linhas}


@pytest.fixture
def limpar_usuario(banco_migrado: Engine) -> Iterator[None]:
    try:
        yield
    finally:
        command.upgrade(alembic_config(), "head")
        with banco_migrado.begin() as conexao:
            conexao.execute(text("DELETE FROM users WHERE id = :u"), {"u": SO_DA_0009})


def test_a_0009_encadeia_na_0008(banco_migrado: Engine) -> None:
    assert _anterior_a_0009() == "0008"


def test_upgrade_deixa_null_nas_linhas_existentes(
    banco_migrado: Engine, limpar_usuario: None
) -> None:
    command.downgrade(alembic_config(), _anterior_a_0009())
    with banco_migrado.begin() as conexao:
        conexao.execute(
            text("INSERT INTO users (id, display_name) VALUES (:u, 'So da 0009')"),
            {"u": SO_DA_0009},
        )

    command.upgrade(alembic_config(), REVISAO)

    with banco_migrado.connect() as conexao:
        locales = conexao.execute(
            text("SELECT locale FROM users WHERE id IN (:u, :unico)"),
            {"u": SO_DA_0009, "unico": USUARIO_UNICO},
        ).scalars()
        assert list(locales) == [None, None]


def test_coluna_e_anulavel_e_sem_default(banco_migrado: Engine) -> None:
    assert _coluna_locale(banco_migrado) == {
        "is_nullable": "YES",
        "column_default": None,
    }


def test_check_recusa_idioma_fora_da_lista(session: Session) -> None:
    with pytest.raises(IntegrityError, match=CHECK):
        session.execute(
            text("UPDATE users SET locale = 'fr' WHERE id = :u"),
            {"u": USUARIO_UNICO},
        )


def _locale_do_usuario_unico(session: Session) -> str | None:
    locale: str | None = session.execute(
        text("SELECT locale FROM users WHERE id = :u"), {"u": USUARIO_UNICO}
    ).scalar_one()
    return locale


@pytest.mark.parametrize("idioma", ["pt-BR", "en"])
def test_check_aceita_os_idiomas_da_lista(session: Session, idioma: str) -> None:
    session.execute(
        text("UPDATE users SET locale = :l WHERE id = :u"),
        {"l": idioma, "u": USUARIO_UNICO},
    )
    assert _locale_do_usuario_unico(session) == idioma


def test_check_aceita_null(session: Session) -> None:
    """Parte de um valor gravado: sem ele, o `NULL` relido nao distinguiria
    o UPDATE que gravou do que nao casou linha nenhuma."""
    session.execute(
        text("UPDATE users SET locale = 'en' WHERE id = :u"), {"u": USUARIO_UNICO}
    )
    session.execute(
        text("UPDATE users SET locale = NULL WHERE id = :u"), {"u": USUARIO_UNICO}
    )
    assert _locale_do_usuario_unico(session) is None


def test_downgrade_remove_a_coluna(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0009())
        assert _coluna_locale(banco_migrado) is None
        command.upgrade(cfg, REVISAO)
        assert _coluna_locale(banco_migrado) is not None
    finally:
        command.upgrade(cfg, "head")


def test_o_modelo_descreve_o_check_que_a_migracao_criou(session: Session) -> None:
    """O CHECK do modelo deriva de `Idioma`; o da migracao foi congelado. O
    PostgreSQL descreve os dois, como em `test_missions_models.py`. A copia
    nasce e morre na transacao do teste (DDL e transacional)."""
    metadados = MetaData()
    User.metadata.tables["users"].to_metadata(metadados, name=ESPELHO_DO_MODELO)
    metadados.tables[ESPELHO_DO_MODELO].create(session.connection())

    assert _checks_do_postgres(session, ESPELHO_DO_MODELO) == _checks_do_postgres(
        session, "users"
    )
