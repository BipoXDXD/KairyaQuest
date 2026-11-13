"""O erro de banco nao carrega os parametros da instrucao (#166).

Um erro que sobe como 500 tem a mensagem levada para algum lugar (o log, o
stderr do processo). Sem `hide_parameters`, o SQLAlchemy poe na mensagem os
valores ligados a instrucao -- e um deles pode ser o texto da missao.
"""

import uuid

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import DBAPIError

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

CANARIO = f"CANARY-{uuid.uuid4()}"


def test_engine_nasce_escondendo_parametros(settings: Settings) -> None:
    engine = create_engine_from_url(settings.test_database_url)
    try:
        assert engine.hide_parameters is True
    finally:
        engine.dispose()


def test_erro_de_banco_nao_mostra_o_parametro(engine: Engine) -> None:
    with engine.connect() as conexao, pytest.raises(DBAPIError) as erro:
        # A divisao por zero falha NO servidor com o canario ligado como
        # parametro, e a mensagem do PostgreSQL nao o ecoa: o que sobra e so o
        # que o SQLAlchemy acrescenta. (Um cast invalido nao serviria: o
        # proprio servidor repete o valor na mensagem, e isso nao e parametro.)
        conexao.execute(text("SELECT CAST(:valor AS text), 1 / 0"), {"valor": CANARIO})
    assert CANARIO not in str(erro.value)
    assert "hidden due to hide_parameters" in str(erro.value)
