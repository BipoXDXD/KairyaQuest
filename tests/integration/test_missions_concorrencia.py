"""Conclusao sob concorrencia real: duas conexoes disputando a mesma missao.

O README s8 exige testar concorrencia ALEM da repeticao sequencial, e a
diferenca entre as duas coisas e o motivo deste arquivo existir separado.

A fixture `session` nao serve aqui. Ela prende tudo numa unica transacao, e
duas threads dentro da mesma transacao nao disputam coisa nenhuma -- o teste
ficaria verde sem nunca ter havido concorrencia. Cada thread abre a propria
conexao e commita de verdade.

`threading.Barrier` no lugar de `sleep`: as duas threads partem juntas porque
esperam uma pela outra, nao porque um numero de segundos foi chutado grande o
bastante.

**Sobre o alcance de cada teste.** Os dois primeiros descrevem o CONTRATO
observavel e sao os que o README pede. O terceiro existe porque o alcance
deles foi MEDIDO, removendo o `FOR UPDATE` do servico e rodando o modulo seis
vezes:

- `test_duas_conclusoes_simultaneas_produzem_uma_so` ficou VERDE nas seis.
  Com a barreira apenas na largada, a primeira thread termina a transacao
  inteira antes de a segunda chegar a ler a missao, e o resultado observavel
  sai igual ao da implementacao correta. A janela perigosa existe mesmo --
  forcando o entrelacamento com uma segunda barreira logo apos a leitura, o
  servico sem trava conclui DUAS vezes e grava duas operacoes --, mas ela e
  curta demais para uma corrida acerta-la.
- `test_reenvio_simultaneo_da_mesma_operacao_nao_duplica` ficou vermelho nas
  seis. E um sinal forte, e ainda assim indireto: quem o derruba e a restricao
  unica recusando o segundo INSERT, o que depende de as duas transacoes se
  sobreporem. Nao e garantia.
- `test_concluir_trava_a_linha_da_missao` ficou vermelho nas seis por
  construcao, sem depender de entrelacamento nenhum: ele pergunta ao proprio
  PostgreSQL se a leitura do servico trava a linha.

A conclusao que importa: um teste de corrida prova o contrato quando passa,
mas nao prova o mecanismo quando o mecanismo some. Por isso os tres.
"""

import threading
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

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


@pytest.fixture
def missao_commitada(banco_migrado: Engine) -> Iterator[int]:
    """Uma missao REALMENTE commitada, apagada no teardown.

    Este modulo escreve fora da rede de protecao do rollback -- tem de
    escrever, porque conexoes diferentes so enxergam o que foi commitado. O
    preco e a limpeza, e ela e obrigacao deste arquivo: os testes de
    isolamento em `test_missions_models.py` exigem a tabela `missions` vazia,
    e uma missao esquecida aqui os derrubaria a distancia, num arquivo que
    nao tem nada a ver com a causa.

    A limpeza roda no teardown da fixture, que o pytest executa mesmo quando
    a assercao do teste falha -- e onde ela precisa estar, porque um teste de
    concorrencia que falha e exatamente o teste que deixou lixo para tras.

    Apagar a missao basta: as linhas de `mission_operations` vao junto pelo
    `ondelete=CASCADE` da chave estrangeira. E a limpeza e restrita ao que
    esta execucao criou (README s10) -- nenhum TRUNCATE, nenhum DELETE sem
    WHERE, nada que alcance dado de outro teste.
    """
    with Session(bind=banco_migrado) as sessao:
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
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


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
    engine: Engine, mission_id: int, operation_ids: list[str]
) -> list[str]:
    """Roda uma conclusao por thread, cada uma na sua conexao, todas juntas.

    Cada thread escreve no PROPRIO indice da lista de resultados. Nao ha
    mutacao compartilhada para proteger, e a lista comeca cheia de None: uma
    thread que morresse por uma excecao nao prevista deixaria o None no
    lugar, e a assercao do teste falharia em vez de contar um resultado a
    menos em silencio.
    """
    barreira = threading.Barrier(len(operation_ids), timeout=SEGUNDOS_LIMITE)
    resultados: list[str | None] = [None] * len(operation_ids)

    def tentar(indice: int, operation_id: str) -> None:
        with Session(bind=engine) as sessao:
            barreira.wait()
            try:
                concluir_missao(sessao, ESTUDANTE, mission_id, operation_id)
                sessao.commit()
                resultados[indice] = "concluiu"
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[indice] = "bloqueada"

    threads = [
        threading.Thread(target=tentar, args=(i, operation_id))
        for i, operation_id in enumerate(operation_ids)
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
        banco_migrado, missao_commitada, ["op-a", "op-b"]
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
        banco_migrado, missao_commitada, ["op-repetida", "op-repetida"]
    )

    assert resultados == ["concluiu", "concluiu"]
    assert _operacoes_da_missao(banco_migrado, missao_commitada) == 1


def test_concluir_trava_a_linha_da_missao(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A prova de que a leitura do servico trava a linha -- pedida ao PostgreSQL.

    Os testes acima descrevem o contrato mas nao conseguem garanti-lo: eles
    dependem de as duas transacoes se cruzarem na janela curta entre a
    leitura e o commit, e na pratica a primeira thread quase sempre termina
    antes. A medicao esta no docstring do modulo -- o primeiro deles fica
    verde contra um servico SEM `FOR UPDATE`, e o segundo so o pega de
    carona, quando a restricao unica recusa o segundo INSERT.

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
