"""Fixtures de integracao. Usam PostgreSQL real, nunca SQLite (README s10)."""

from argparse import Namespace
from collections.abc import Iterator
from datetime import timedelta

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.models import TutorMessage
from focusquest.modules.tutoring.service import Tutoria
from integration.provedor_falso import ServidorAnthropicFalso, iniciar

from .banco_de_teste import criar_banco_se_ausente, recriar_esquema

# O prazo do SDK so e o OBJETO nos testes de demora: neles ele e curto, para o
# estouro sair em menos de um segundo. Nos demais ele e so um teto contra
# travamento -- e um prazo curto ali reprova o caminho feliz com a maquina
# carregada sem nada estar errado: o prazo do SDK conta o silencio ENTRE dois
# pedacos, e um teste que segura o falso enquanto ele mesmo faz outra coisa
# (consultar o banco, desconectar) via os 0,3 s estourarem e a resposta virar
# `falhou` antes da hora.
TIMEOUT_DA_DEMORA = 0.3
TIMEOUT_FOLGADO = 30.0


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture
def falso() -> Iterator[ServidorAnthropicFalso]:
    """Um servidor falso por teste: roteiro e contadores nunca vazam."""
    yield from iniciar()


@pytest.fixture(scope="session")
def engine(settings: Settings) -> Iterator[Engine]:
    """A engine do banco de teste, CRIADO aqui se ainda nao existir.

    A criacao mora nesta fixture, e nao so no `make reset-test-db`, por dois
    motivos (pendencia 19). No `make check` o `check-api` roda ANTES do
    `check-e2e` -- e do `reset-test-db`, pre-requisito dele --, entao o
    primeiro `make check` de um worktree novo reprovaria no pytest se a suite
    dependesse de um passo manual. E o worktree do pre-push comeca SEMPRE com
    um banco novo (`..._push_test`): depender do `reset-test-db` ali seria
    recusar todo push. Aqui, e nao em `banco_migrado`, porque alguns testes
    conectam pela `engine` sem pedir o esquema (`test_health.py`).

    A guarda de nome e de alvo vem antes de qualquer conexao
    (`criar_banco_se_ausente`), a mesma do `DROP SCHEMA`.
    """
    engine = create_engine_from_url(settings.test_database_url)
    criar_banco_se_ausente(engine)
    yield engine
    engine.dispose()


def alembic_config() -> Config:
    """Configuracao do Alembic apontada para o banco de TESTE.

    `cmd_opts` e o mesmo objeto que a linha de comando preenche: e dali que
    `context.get_x_argument()` le o `-x`. Passar um Namespace no construtor,
    em vez de remendar o atributo depois, e o caminho tipado -- o campo ja e
    declarado como `Namespace | None`, entao nao ha `type: ignore` nenhum.
    Sem esse `x`, o env.py cairia no banco de DESENVOLVIMENTO, e o
    `DROP SCHEMA` de `banco_migrado` destruiria dados reais.
    """
    return Config("alembic.ini", cmd_opts=Namespace(x=["test=true"]))


@pytest.fixture(scope="session")
def banco_migrado(engine: Engine) -> Engine:
    """Banco de teste zerado e migrado do zero.

    Esta fixture existe para que os testes nao dependam da ordem em que o
    pytest os executa: cada um declara o estado de que precisa, em vez de
    torcer para o primeiro teste ter rodado antes. Ela vive no conftest --
    e nao no modulo que a criou -- porque agora ha DOIS consumidores: os
    testes de migracao e os de persistencia. Duplicar o `DROP SCHEMA` no
    segundo modulo seria duplicar justamente o trecho destrutivo, que e o
    ultimo lugar onde se quer duas versoes divergindo.

    O escopo e `session`, nao `module`: a migracao roda uma vez por suite em
    vez de uma vez por arquivo de teste, e os dois modulos compartilham o
    mesmo esquema ja aplicado.

    A guarda e o DROP moram em `banco_de_teste.recriar_esquema`.
    """
    recriar_esquema(engine)
    command.upgrade(alembic_config(), "head")
    return engine


@pytest.fixture
def session(banco_migrado: Engine) -> Iterator[Session]:
    """Sessao com rollback ao final: um teste nunca ve o que outro escreveu.

    A dependencia e `banco_migrado`, nao `engine`: sem ela, os testes de
    persistencia so passariam quando o pytest tivesse rodado o modulo de
    migracao antes -- ou seja, por ordem alfabetica de nome de arquivo.
    Depender do esquema explicitamente e o que faz `pytest
    tests/integration/test_missions_models.py` sozinho funcionar.

    A transacao externa com rollback e o que torna os testes independentes
    sem truncar tabelas entre eles: mais rapido, e sem nenhum comando
    destrutivo por teste.

    `join_transaction_mode="create_savepoint"` nao e detalhe: e o que faz a
    transacao externa sobreviver aos testes de restricao. No modo padrao
    ("conditional_savepoint"), uma Session ligada a uma conexao que ja esta
    em transacao cai em "rollback_only" -- e o rollback automatico que ela
    dispara depois de um IntegrityError desfaz a transacao EXTERNA, a mesma
    que esta fixture ainda precisa reverter no teardown. O sintoma visivel
    era um `SAWarning: transaction already deassociated from connection` em
    todo teste que espera IntegrityError; o sintoma invisivel seria uma
    fixture que so PARECE estar revertendo. Com o savepoint, a falha volta
    ate ele e a transacao externa continua de pe.

    O teardown e escrito em duas camadas de proposito. A `connection` e a
    unica coisa aqui que precisa voltar para o pool aconteca o que acontecer
    -- por isso ela fica num `with`, e nao numa linha solta no fim. Sem isso,
    qualquer excecao no meio do teardown deixaria a conexao *checked out*, e
    cinco testes assim esgotariam o pool: a suite travaria em um teste que
    nao tem nada a ver com a causa. O `finally` interno cuida do par
    sessao/transacao; se ate ele falhar, o `close()` da conexao ainda reverte
    a transacao em aberto ao devolve-la ao pool.
    """
    with banco_migrado.connect() as conexao:
        transacao = conexao.begin()
        sessao = Session(
            bind=conexao,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield sessao
        finally:
            sessao.close()
            transacao.rollback()


@pytest.fixture
def fabrica(banco_migrado: Engine) -> sessionmaker[Session]:
    """Sessoes que COMMITAM de verdade, como as da transmissao."""
    return sessionmaker(bind=banco_migrado, expire_on_commit=False)


@pytest.fixture
def prazo_do_provedor() -> float:
    """O prazo do SDK da `tutoria`, em segundos: o teto folgado por padrao.

    Teste de demora troca pelo curto parametrizando este nome
    (`@pytest.mark.parametrize("prazo_do_provedor", [TIMEOUT_DA_DEMORA])`):
    o pytest deixa a parametrizacao direta substituir a fixture, inclusive
    quando quem a pede e outra fixture (a `tutoria`, ou o `cliente` que a
    recebe).
    """
    return TIMEOUT_FOLGADO


@pytest.fixture
def tutoria(falso: ServidorAnthropicFalso, prazo_do_provedor: float) -> Tutoria:
    """A tutoria de producao inteira, com o SDK real apontado para o falso."""
    return Tutoria(
        provedor=ProvedorAnthropic(
            chave="sk-ant-teste",
            base_url=falso.url,
            modelo="claude-opus-5",
            max_tokens=256,
            timeout_segundos=prazo_do_provedor,
            # O padrao de producao (`Settings.tutor_fallback`, pendencia 174).
            fallback=True,
            esforco="low",
            esforco_da_avaliacao="medium",
        ),
        historico=20,
        turnos_por_dia=60,
        limite=timedelta(seconds=60),
        modelo="claude-opus-5",
    )


class Conversa:
    """Registra o que um teste criou com commit, para a limpeza apagar SO isso."""

    def __init__(self) -> None:
        self.client_message_ids: list[str] = []

    def id(self, sufixo: str) -> str:
        """Um `client_message_id` registrado para a limpeza."""
        cid = f"teste-{sufixo}"
        self.client_message_ids.append(cid)
        return cid


@pytest.fixture
def conversa(banco_migrado: Engine) -> Iterator[Conversa]:
    """Limpa, no fim, as perguntas que o teste registrou (respostas e acoes
    vao pelo CASCADE).

    So mensagens: nenhum teste que usa esta fixture confirma uma acao com
    commit de verdade, e por isso nunca cria uma missao para apagar aqui. Os
    testes que confirmam de verdade (`test_tutoring_acoes.py`, secao de
    concorrencia) tem a propria limpeza, ao lado da propria trava real.
    """
    registro = Conversa()
    try:
        yield registro
    finally:
        with Session(bind=banco_migrado) as limpeza:
            limpeza.execute(
                delete(TutorMessage).where(
                    TutorMessage.client_message_id.in_(registro.client_message_ids)
                )
            )
            limpeza.commit()
