"""`get_engine` cria UMA engine, mesmo com chamadas simultaneas (pendencia 14).

O FastAPI resolve dependencias sincronas no threadpool: duas requisicoes na
partida podiam ver `_engine is None` ao mesmo tempo e criar duas engines, com
dois pools, e uma delas ficava orfa com as conexoes que abrisse.

Nenhum teste aqui conecta ao banco: a criacao e substituida por uma falsa, e a
engine de verdade e preguicosa de qualquer forma.
"""

import threading
from pathlib import Path

import pytest
from pydantic import ValidationError

from focusquest.core import database

# Quanto a primeira criacao espera a segunda thread entrar. Sem a trava a
# segunda entra em microssegundos e acorda a primeira na hora; com a trava ela
# nunca entra, e a espera inteira e o custo do caminho verde.
ESPERA_PELA_SEGUNDA_CRIACAO = 1.0
# Teto para `join`: um deadlock vira falha do teste, nao suite pendurada.
TETO_DA_THREAD = 10.0
CHAMADORES_SIMULTANEOS = 4


@pytest.fixture
def ambiente_configurado(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FOCUSQUEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/d")
    monkeypatch.setenv(
        "FOCUSQUEST_TEST_DATABASE_URL", "postgresql+psycopg://u:p@h:55432/t"
    )
    # Sem o chdir o `Settings` leria o .env real do repositorio.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(database, "_engine", None)


@pytest.mark.usefixtures("ambiente_configurado")
def test_chamadas_simultaneas_criam_uma_unica_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    criadas: list[object] = []
    segunda_criacao_comecou = threading.Event()

    def criar_e_esperar_a_proxima(
        url: str, poolclass: object = None, limites: object = None
    ) -> object:
        # Sem a trava, a primeira criacao segura aqui ate a segunda thread
        # tambem ver `_engine is None` -- e a corrida fica deterministica.
        criadas.append(engine := object())
        if len(criadas) == 1:
            segunda_criacao_comecou.wait(timeout=ESPERA_PELA_SEGUNDA_CRIACAO)
        else:
            segunda_criacao_comecou.set()
        return engine

    monkeypatch.setattr(database, "create_engine_from_url", criar_e_esperar_a_proxima)

    recebidas: list[object] = []
    threads = [
        threading.Thread(
            target=lambda: recebidas.append(database.get_engine()), daemon=True
        )
        for _ in range(CHAMADORES_SIMULTANEOS)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=TETO_DA_THREAD)

    assert not any(thread.is_alive() for thread in threads)
    assert len(criadas) == 1
    assert recebidas == [criadas[0]] * CHAMADORES_SIMULTANEOS
    # Depois da partida, a chamada comum devolve a mesma, sem criar outra.
    assert database.get_engine() is criadas[0]
    assert len(criadas) == 1


def test_configuracao_ausente_levanta_de_novo_sem_prender_a_trava(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("FOCUSQUEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("FOCUSQUEST_TEST_DATABASE_URL", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(database, "_engine", None)

    with pytest.raises(ValidationError):
        database.get_engine()

    # A segunda chamada roda numa thread: se a primeira tivesse deixado a
    # trava presa, ela pararia no `acquire`, e o `join` com teto transforma
    # isso em falha em vez de pendurar a suite.
    erros: list[BaseException] = []

    def chamar_de_novo() -> None:
        try:
            database.get_engine()
        except ValidationError as erro:
            erros.append(erro)

    # daemon: uma thread presa no `acquire` nao segura o processo do pytest.
    segunda = threading.Thread(target=chamar_de_novo, daemon=True)
    segunda.start()
    segunda.join(timeout=TETO_DA_THREAD)

    assert not segunda.is_alive()
    assert len(erros) == 1
    assert database._engine is None
