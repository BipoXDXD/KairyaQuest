"""Conclusao sob concorrencia real: duas conexoes disputando a mesma missao.

O README s8 exige testar concorrencia ALEM da repeticao sequencial, e a
diferenca entre as duas coisas e o motivo deste arquivo existir separado.

A fixture `session` nao serve aqui. Ela prende tudo numa unica transacao, e
duas threads dentro da mesma transacao nao disputam coisa nenhuma -- o teste
ficaria verde sem nunca ter havido concorrencia. Cada thread abre a propria
conexao e commita de verdade.

`threading.Barrier` no lugar de `sleep`: as duas threads partem juntas porque
esperam uma pela outra, nao porque um numero de segundos foi chutado grande o
bastante. **Mas a barreira sozinha nao basta** -- veja `sessao.connection()`
em `_concluir_em_paralelo`, sem o qual a largada e falsa e o modulo inteiro
vira decoracao.

**Sobre o alcance de cada teste.** Medido, removendo o `FOR UPDATE` do
servico e rodando o modulo seis vezes:

- `test_duas_conclusoes_simultaneas_produzem_uma_so` e
  `test_reenvio_simultaneo_da_mesma_operacao_nao_duplica` ficam vermelhos nas
  seis -- desde que a conexao seja aberta ANTES da barreira. Sem isso, o
  primeiro ficava verde nas seis e o segundo tambem: os dois detectavam 0/6.
  A mesma medicao com a conexao aquecida da 6/6 nos dois.
- `test_concluir_trava_a_linha_da_missao` fica vermelho nas seis **por
  construcao**, sem depender de entrelacamento nenhum: ele pergunta ao
  proprio PostgreSQL se a leitura do servico trava a linha. E o unico que nao
  depende do escalonador, e por isso continua aqui mesmo agora que os outros
  dois detectam.

A licao que sobra: um teste de corrida so vale o que vale a largada dele, e
mesmo uma largada boa prova o contrato sem provar o mecanismo. Os tres se
complementam.
"""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from focusquest.core.errors import OperacaoReutilizadaError
from focusquest.modules.missions.domain import MissionState, TransicaoIlegalError
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.missions.service import concluir_missao, criar_missao

# O usuario unico semeado pela migracao (README s8). Repetido aqui, e nao
# importado de test_missions_service: um modulo de teste que importa outro
# cria uma dependencia de ordem entre arquivos que nao paga o que custa.
ESTUDANTE = 1

# Prazo maximo, nao sincronizacao. Nada neste modulo espera "ate dar o tempo":
# as threads se encontram na barreira e o bloqueio de linha e resolvido pelo
# banco. Estes limites existem para que uma falha de verdade apareca como
# teste vermelho em vez de suite travada para sempre.
SEGUNDOS_LIMITE = 30
# O mesmo raciocinio para a trava: no teste que a exercita, quem a segura
# nunca solta, entao a espera SEMPRE termina no timeout. O numero so decide
# quanto tempo o teste leva para concluir o que ja e certo.
LIMITE_DE_TRAVA = "2s"


@contextmanager
def _missao_commitada(engine: Engine) -> Iterator[int]:
    """Cria uma missao REALMENTE commitada e a apaga ao sair.

    Este modulo escreve fora da rede de protecao do rollback -- tem de
    escrever, porque conexoes diferentes so enxergam o que foi commitado. O
    preco e a limpeza, e ela e obrigacao deste arquivo: os testes de
    isolamento em `test_missions_models.py` exigem a tabela `missions` vazia,
    e uma missao esquecida aqui os derrubaria a distancia, num arquivo que
    nao tem nada a ver com a causa.

    A limpeza esta num `finally`, que roda mesmo quando a assercao do teste
    falha -- e onde ela precisa estar, porque um teste de concorrencia que
    falha e exatamente o teste que deixou lixo para tras.

    Apagar a missao basta: as linhas de `mission_operations` vao junto pelo
    `ondelete=CASCADE` da chave estrangeira. E a limpeza e restrita ao que
    esta execucao criou (README s10) -- nenhum TRUNCATE, nenhum DELETE sem
    WHERE, nada que alcance dado de outro teste.
    """
    with Session(bind=engine) as sessao:
        missao = criar_missao(
            sessao,
            user_id=ESTUDANTE,
            instructions="Ler o capitulo 3",
            completion_criterion="Resumo de uma pagina entregue",
            difficulty=2,
            estimated_minutes=30,
            deadline=datetime.now(UTC) + timedelta(days=1),
        )
        sessao.commit()
        mission_id = missao.id

    try:
        yield mission_id
    finally:
        with Session(bind=engine) as sessao:
            # A limpeza tem prazo. Se uma thread sobreviver ao teste segurando
            # o `FOR UPDATE` da missao, este DELETE esperaria por ela para
            # sempre e a suite inteira penduraria -- num teardown, que e o
            # ultimo lugar onde alguem vai procurar a causa. Com o
            # `lock_timeout`, a limpeza falha alto em vez de travar.
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


@pytest.fixture
def missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    with _missao_commitada(banco_migrado) as mission_id:
        yield mission_id


@pytest.fixture
def outra_missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    """Uma SEGUNDA missao, para o conflito que a trava de linha nao cobre."""
    with _missao_commitada(banco_migrado) as mission_id:
        yield mission_id


def _operacoes_da_missao(engine: Engine, mission_id: int) -> int:
    """Conta so as operacoes DESTA missao.

    Filtrar por missao, em vez de contar a tabela inteira, e o que faz a
    assercao continuar significando a mesma coisa independentemente do que
    outro teste tenha deixado para tras -- e o que a faz apontar para a
    missao certa quando falha.
    """
    with Session(bind=engine) as sessao:
        return sessao.execute(
            select(func.count())
            .select_from(MissionOperation)
            .where(MissionOperation.mission_id == mission_id)
        ).scalar_one()


def _concluir_em_paralelo(
    engine: Engine, tentativas: list[tuple[int, str]]
) -> list[str]:
    """Roda uma conclusao por thread, cada uma na sua conexao, todas juntas.

    Cada tentativa e um par (missao, identificador de operacao) -- missoes
    diferentes sao necessarias para exercitar o conflito que a trava de linha
    nao cobre.

    Cada thread escreve no PROPRIO indice da lista de resultados. Nao ha
    mutacao compartilhada para proteger, e a lista comeca cheia de None: uma
    thread que morresse por uma excecao nao prevista deixaria o None no
    lugar, e a assercao do teste falharia em vez de contar um resultado a
    menos em silencio.
    """
    barreira = threading.Barrier(len(tentativas), timeout=SEGUNDOS_LIMITE)
    resultados: list[str | None] = [None] * len(tentativas)

    def tentar(indice: int, mission_id: int, operation_id: str) -> None:
        with Session(bind=engine) as sessao:
            # Sem esta linha a largada e FALSA, e o teste inteiro perde o
            # sentido. `Session(bind=engine)` NAO conecta: a conexao so nasce
            # no primeiro `execute`, ja depois da barreira. O custo de
            # conectar com o pool frio -- dezenas de milissegundos, e
            # diferente entre as threads -- dissolve o encontro, e as duas
            # transacoes deixam de se cruzar. Medido: com o servico mutado
            # para nao travar a linha, estes testes detectavam 0/6 sem esta
            # chamada e 6/6 com ela.
            sessao.connection()
            barreira.wait()
            try:
                concluir_missao(sessao, ESTUDANTE, mission_id, operation_id)
                sessao.commit()
                resultados[indice] = "concluiu"
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[indice] = "bloqueada"
            except OperacaoReutilizadaError:
                sessao.rollback()
                resultados[indice] = "chave gasta"

    threads = [
        threading.Thread(target=tentar, args=(i, mission_id, operation_id))
        for i, (mission_id, operation_id) in enumerate(tentativas)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "thread travada: houve espera circular"

    assert None not in resultados, f"alguma thread morreu sem resultado: {resultados}"
    return [resultado for resultado in resultados if resultado is not None]


def test_duas_conclusoes_simultaneas_produzem_uma_so(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """Identificadores de operacao DIFERENTES: exatamente uma vence.

    Duas operacoes distintas sobre a mesma missao sao duas tentativas
    distintas de concluir. A segunda a chegar encontra a missao ja
    `concluida` -- porque so entra depois que a primeira liberou a linha -- e
    e recusada por `TransicaoIlegalError`, com a mesma mensagem que receberia
    numa tentativa sequencial. A idempotencia nao entra aqui: nao ha reenvio,
    ha duas operacoes.
    """
    resultados = _concluir_em_paralelo(
        banco_migrado, [(missao_commitada, "op-a"), (missao_commitada, "op-b")]
    )

    assert sorted(resultados) == ["bloqueada", "concluiu"]
    assert _operacoes_da_missao(banco_migrado, missao_commitada) == 1


def test_reenvio_simultaneo_da_mesma_operacao_nao_duplica(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """O MESMO identificador, em paralelo: as duas recebem sucesso.

    Este e o outro lado da semantica dupla, e o caso real que a idempotencia
    existe para atender -- o clique duplo, ou o cliente que reenvia porque a
    resposta se perdeu no caminho. As duas chamadas devolvem sucesso e o
    banco fica com UMA operacao: a segunda a entrar encontra a linha que a
    primeira commitou e devolve aquele mesmo resultado.

    E o teste que justifica a ordem das linhas em `concluir_missao`. Com a
    consulta a `mission_operations` ANTES do `FOR UPDATE`, as duas threads
    nao encontrariam nada -- a primeira ainda nao commitou --, e a segunda
    receberia erro. O contrato sequencial continuaria de pe e a promessa
    quebraria justamente sob a condicao para a qual foi feita.
    """
    resultados = _concluir_em_paralelo(
        banco_migrado,
        [(missao_commitada, "op-repetida"), (missao_commitada, "op-repetida")],
    )

    assert resultados == ["concluiu", "concluiu"]
    assert _operacoes_da_missao(banco_migrado, missao_commitada) == 1


def test_concluir_trava_a_linha_da_missao(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A prova de que a leitura do servico trava a linha -- pedida ao PostgreSQL.

    Os testes acima descrevem o contrato e, com a largada corrigida, tambem
    pegam a falta da trava -- mas pegam porque as duas transacoes se cruzam,
    e isso e o escalonador que decide. Basta uma maquina mais lenta, um pool
    mais quente ou uma thread a menos para a janela mudar de tamanho. Eles
    provam o CONTRATO; nao provam o MECANISMO.

    Este teste nao depende de timing nenhum. Ele segura a linha da missao em
    `FOR KEY SHARE` e pergunta ao banco se o servico esbarra nela, e a
    escolha do modo de trava e o que torna a resposta discriminante:

    - `SELECT ... FOR UPDATE`, que o servico emite, CONFLITA com FOR KEY
      SHARE. Espera, e o `lock_timeout` a transforma em erro.
    - um `UPDATE` de colunas comuns -- o que sobraria se o `FOR UPDATE` fosse
      removido -- pega apenas FOR NO KEY UPDATE, que NAO conflita com FOR KEY
      SHARE. Passaria reto.

    Ou seja: com a trava, `LockNotAvailable`; sem ela, a conclusao acontece e
    este teste fica vermelho -- sempre, e nao quando o escalonador ajuda.
    """
    with banco_migrado.connect() as dono_da_trava:
        dono_da_trava.execute(
            text("SELECT id FROM missions WHERE id = :id FOR KEY SHARE"),
            {"id": missao_commitada},
        )

        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            with pytest.raises(OperationalError) as excecao:
                concluir_missao(sessao, ESTUDANTE, missao_commitada, "op-travada")
            sessao.rollback()

        # Nao basta "deu OperationalError": uma conexao caida daria o mesmo
        # tipo. LockNotAvailable e o que diz que o servico ESPEROU por uma
        # trava de linha ate o prazo acabar.
        assert isinstance(excecao.value.orig, psycopg.errors.LockNotAvailable)

    # E a tentativa recusada nao deixou rastro: nem estado, nem operacao.
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, missao_commitada)
        assert missao is not None
        assert missao.state is MissionState.PENDENTE
    assert _operacoes_da_missao(banco_migrado, missao_commitada) == 0


def test_mesma_chave_em_missoes_diferentes_e_recusada_tambem_em_paralelo(
    banco_migrado: Engine, missao_commitada: int, outra_missao_commitada: int
) -> None:
    """O reuso de chave da o MESMO erro em paralelo e em sequencia.

    Este e o unico conflito que a trava de linha nao resolve: as duas threads
    travam missoes DIFERENTES, entao nao esperam uma pela outra e as duas
    consultas de idempotencia podem nao ver nada. Quem recusa o segundo
    INSERT e a restricao unica do banco, e o servico traduz esse
    `IntegrityError` para `OperacaoReutilizadaError` -- a mesma recusa que o
    caminho sequencial produz, em
    `test_reenviar_operacao_de_outra_missao_e_recusado`.

    Sem a traducao, o mesmo engano do cliente daria 200 em sequencia e 500 em
    paralelo, conforme o escalonador. A assercao aqui e sobre o par de
    resultados, nao sobre qual thread venceu: qualquer uma pode chegar
    primeiro, e as duas ordens sao igualmente corretas.
    """
    resultados = _concluir_em_paralelo(
        banco_migrado,
        [(missao_commitada, "op-disputada"), (outra_missao_commitada, "op-disputada")],
    )

    assert sorted(resultados) == ["chave gasta", "concluiu"]
    # Exatamente uma das duas missoes registrou a operacao.
    total = _operacoes_da_missao(banco_migrado, missao_commitada) + (
        _operacoes_da_missao(banco_migrado, outra_missao_commitada)
    )
    assert total == 1


def test_conflito_gravado_apos_a_consulta_vira_o_mesmo_erro_de_dominio(
    banco_migrado: Engine, missao_commitada: int, outra_missao_commitada: int
) -> None:
    """A traducao do IntegrityError, provada SEM depender de entrelacamento.

    O teste acima chega ao conflito quando as duas threads se cruzam -- mas
    quando nao se cruzam, a segunda simplesmente encontra a operacao na
    consulta e o erro sai por ali. Os dois caminhos dao o mesmo resultado (e
    esse e o ponto), o que tem um efeito colateral: aquele teste nao GARANTE
    que o caminho da restricao unica foi percorrido.

    Aqui ele e percorrido sempre, e sem thread nenhuma. REPEATABLE READ fixa
    o snapshot da sessao ANTES de a operacao concorrente ser gravada: a
    consulta de idempotencia nao enxerga a linha nova, porque ela nao existia
    no snapshot, mas o indice unico enxerga -- indices valem sobre todas as
    linhas commitadas, nao sobre a visao da transacao. E exatamente a corrida
    que se quer reproduzir, so que deterministica.
    """
    with Session(bind=banco_migrado) as sessao:
        sessao.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        # Primeira leitura: e ela que fixa o snapshot da transacao.
        sessao.execute(select(func.count()).select_from(MissionOperation))

        # Outra conexao gasta a chave na outra missao, e commita.
        with Session(bind=banco_migrado) as intrusa:
            intrusa.add(
                MissionOperation(
                    operation_id="op-disputada",
                    mission_id=outra_missao_commitada,
                    kind="complete",
                )
            )
            intrusa.commit()

        with pytest.raises(OperacaoReutilizadaError) as excecao:
            concluir_missao(sessao, ESTUDANTE, missao_commitada, "op-disputada")
        sessao.rollback()

    assert "op-disputada" in str(excecao.value)
    assert str(outra_missao_commitada) not in str(excecao.value)
    # A missao que perdeu a disputa nao mudou de estado.
    assert _operacoes_da_missao(banco_migrado, missao_commitada) == 0
