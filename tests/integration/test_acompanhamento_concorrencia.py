"""Iniciar e reagendar sob concorrencia real, e o relogio lido depois da trava.

Decisoes F2, F13 e F14 da spec do Incremento F. O desenho e o de
`test_missions_concorrencia.py` -- missao REALMENTE commitada, uma conexao por
thread, `threading.Barrier` com `sessao.connection()` ANTES do `wait()`,
resultado gravado no indice da propria thread, limpeza em `finally` com
`lock_timeout` -- e os auxiliares sao COPIADOS de la, nao importados: um
modulo de teste que importa outro cria uma dependencia de ordem entre
arquivos.

**O que cada grupo de teste prova, e o que nao prova.** Os cenarios de corrida
(`test_dois_*`, `test_*_junto_com_*`, `test_mesma_chave_*`) descrevem o
CONTRATO: o que o cliente ve quando dois pedidos se cruzam. Eles so pegam a
falta do `FOR UPDATE` quando as duas transacoes de fato se entrelacam, e quem
decide isso e o escalonador -- a taxa de deteccao medida esta no relatorio da
Task 5 e e menor que 100% em alguns deles. O MECANISMO e provado sem depender
de timing por tres testes:

- `test_*_trava_a_linha_da_missao`: segura a linha em `FOR KEY SHARE` e
  pergunta ao PostgreSQL se o servico esbarra nela (so `FOR UPDATE` esbarra;
  o `UPDATE` de coluna comum que sobraria sem a trava passa reto).
- `test_relogio_*_com_a_linha_ja_travada`: a sonda da decisao C13.
- `test_*_nao_e_anterior_ao_commit_que_liberou_a_trava`: o instante gravado
  nunca e anterior ao commit que liberou a linha.
"""

import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import psycopg
import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from focusquest.core.clock import system_now
from focusquest.core.errors import OperacaoReutilizadaError
from focusquest.modules.missions.cycle_service import ler_missao
from focusquest.modules.missions.domain import (
    MissionState,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionOperation,
    MissionReschedule,
)
from focusquest.modules.missions.schemas import MissionRead
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    iniciar_missao,
    reagendar_missao,
)

# O usuario unico semeado pela migracao (README s8).
ESTUDANTE = 1

# Prazo maximo, nao sincronizacao (ver `test_missions_concorrencia.py`).
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"

# O novo prazo e mandado com offset de Brasilia de proposito: o reenvio
# paralelo compara o CORPO serializado, e e com um offset diferente de UTC que
# a normalizacao de `reagendar_missao` (achado da Task 4) faz diferenca.
SAO_PAULO = timezone(timedelta(hours=-3))
FALTA_DE_TEMPO = MotivoDoReagendamento.FALTA_DE_TEMPO

# Um resultado de thread: o rotulo e o valor que a tarefa devolveu (ou None).
Resultado = tuple[str, Any]
Tarefa = Callable[[Session], Any]


@contextmanager
def _missao_commitada(engine: Engine) -> Iterator[int]:
    """Cria uma missao avulsa REALMENTE commitada e a apaga ao sair.

    Conexoes diferentes so enxergam o que foi commitado, entao este modulo
    escreve fora do rollback da fixture `session`. A limpeza em `finally` e
    obrigacao dele: os testes de isolamento de `test_missions_models.py`
    exigem a tabela `missions` vazia. Apagar a missao basta -- operacoes,
    historico de prazos, lancamentos de XP e conquistas vao junto pelos
    `ondelete=CASCADE`. O `lock_timeout` faz a limpeza falhar alto, em vez de
    pendurar a suite, se uma thread sobreviver segurando a linha.
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


def _em_paralelo(engine: Engine, tarefas: list[Tarefa]) -> list[Resultado]:
    """Roda cada tarefa numa thread, na propria conexao, todas juntas.

    As tarefas NAO commitam: quem commita e esta funcao (e `segurar`, nos testes
    do relogio, precisa manter a trava ate a hora certa). Uma `Mission`
    devolvida vira o corpo da rota depois do commit.

    `sessao.connection()` antes de `barreira.wait()`: sem ela a conexao so
    nasce no primeiro `execute`, ja depois da barreira, e o custo de conectar
    dissolve o encontro (medido em `test_missions_concorrencia.py`: 0/6 de
    deteccao sem a linha, 6/6 com ela).

    A sessao e a da aplicacao (`expire_on_commit=False`, `core/database.py`),
    para que o valor devolvido depois do commit seja o que a rota serializaria.
    Cada thread escreve no PROPRIO indice; uma que morresse por excecao nao
    prevista deixaria o None no lugar, e a assercao abaixo reprovaria.
    """
    barreira = threading.Barrier(len(tarefas), timeout=SEGUNDOS_LIMITE)
    resultados: list[Resultado | None] = [None] * len(tarefas)

    def rodar(indice: int, tarefa: Tarefa) -> None:
        with Session(bind=engine, expire_on_commit=False) as sessao:
            sessao.connection()
            barreira.wait()
            try:
                valor = tarefa(sessao)
                sessao.commit()
                # A missao vira o corpo DEPOIS do commit, como na rota.
                if isinstance(valor, Mission):
                    valor = _corpo(sessao, valor)
                resultados[indice] = ("ok", valor)
            except TransicaoIlegalError:
                sessao.rollback()
                resultados[indice] = ("bloqueada", None)
            except OperacaoReutilizadaError:
                sessao.rollback()
                resultados[indice] = ("chave gasta", None)

    threads = [
        threading.Thread(target=rodar, args=(i, tarefa))
        for i, tarefa in enumerate(tarefas)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "thread travada: houve espera circular"

    assert None not in resultados, f"alguma thread morreu sem resultado: {resultados}"
    return [resultado for resultado in resultados if resultado is not None]


def _rotulos(resultados: list[Resultado]) -> list[str]:
    return sorted(rotulo for rotulo, _ in resultados)


def _corpo(sessao: Session, missao: Mission) -> dict[str, Any]:
    """O corpo que a rota devolveria, com um instante de leitura FIXO.

    A disponibilidade depende do instante de leitura; fixa-lo e o que torna
    dois corpos comparaveis. O resto e exatamente `MissionRead.da_leitura`,
    o que a rota serializa.
    """
    leitura = datetime(2026, 1, 1, tzinfo=UTC)
    lida = ler_missao(sessao, missao, leitura)
    return MissionRead.da_leitura(lida).model_dump(mode="json")


def _iniciar(mission_id: int, chave: str) -> Tarefa:
    def tarefa(sessao: Session) -> Mission:
        return iniciar_missao(sessao, ESTUDANTE, mission_id, chave, clock=system_now)

    return tarefa


def _reagendar(mission_id: int, chave: str, prazo: datetime) -> Tarefa:
    def tarefa(sessao: Session) -> Mission:
        return reagendar_missao(
            sessao,
            ESTUDANTE,
            mission_id,
            chave,
            novo_prazo=prazo,
            motivo=FALTA_DE_TEMPO,
            origem=OrigemDoReagendamento.USUARIO,
            clock=system_now,
        )

    return tarefa


def _concluir(mission_id: int, chave: str) -> Tarefa:
    """Conclui e devolve o prazo que a conclusao VIU com a linha travada: e o
    que diz, depois, se ela entrou antes ou depois de um reagendamento."""

    def tarefa(sessao: Session) -> datetime:
        missao = concluir_missao(sessao, ESTUDANTE, mission_id, chave, clock=system_now)
        assert missao.deadline is not None
        return missao.deadline

    return tarefa


def _operacoes(engine: Engine, mission_id: int) -> int:
    with Session(bind=engine) as sessao:
        return sessao.execute(
            select(func.count())
            .select_from(MissionOperation)
            .where(MissionOperation.mission_id == mission_id)
        ).scalar_one()


def _historico(engine: Engine, mission_id: int) -> list[MissionReschedule]:
    """Os elos do historico, em ordem de gravacao (id)."""
    with Session(bind=engine, expire_on_commit=False) as sessao:
        return list(
            sessao.scalars(
                select(MissionReschedule)
                .where(MissionReschedule.mission_id == mission_id)
                .order_by(MissionReschedule.id)
            )
        )


def _missao(engine: Engine, mission_id: int) -> Mission:
    with Session(bind=engine, expire_on_commit=False) as sessao:
        missao = sessao.get(Mission, mission_id)
        assert missao is not None
        return missao


def _futuro(dias: int) -> datetime:
    """Um prazo `dias` a frente, com offset de Brasilia e sem microssegundo
    (o corpo publicado e comparado como texto)."""
    agora = datetime.now(SAO_PAULO).replace(microsecond=0)
    return agora + timedelta(days=dias)


# --- iniciar -----------------------------------------------------------------


def test_dois_inicios_com_chaves_diferentes_iniciam_uma_vez(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """Duas chaves, a mesma missao: um inicia, o outro e `transicao_ilegal`
    (F2) -- a segunda so entra com a linha livre, e ja encontra
    `em_andamento`. Uma operacao `start` gravada."""
    resultados = _em_paralelo(
        banco_migrado,
        [
            _iniciar(missao_commitada, "start-a"),
            _iniciar(missao_commitada, "start-b"),
        ],
    )

    assert _rotulos(resultados) == ["bloqueada", "ok"]
    assert _operacoes(banco_migrado, missao_commitada) == 1
    assert _missao(banco_migrado, missao_commitada).state is MissionState.EM_ANDAMENTO


def test_o_mesmo_inicio_reenviado_em_paralelo_devolve_o_mesmo_corpo(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A mesma chave, em paralelo: os dois `200`, com o MESMO corpo (o mesmo
    `started_at`), e uma so operacao. O segundo encontra a operacao que o
    primeiro commitou porque so a procura depois de travar a linha."""
    resultados = _em_paralelo(
        banco_migrado,
        [
            _iniciar(missao_commitada, "start-repetido"),
            _iniciar(missao_commitada, "start-repetido"),
        ],
    )

    assert _rotulos(resultados) == ["ok", "ok"]
    (_, primeiro), (_, segundo) = resultados
    assert primeiro == segundo
    assert primeiro["state"] == "em_andamento"
    assert _operacoes(banco_migrado, missao_commitada) == 1


def test_inicio_junto_com_conclusao_termina_concluida_e_coerente(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A conclusao sempre vence ou convive (pendente -> concluida e
    em_andamento -> concluida sao as duas legais): o estado final e
    `concluida`. Se o inicio entrou primeiro, `started_at <= completed_at`; se
    entrou depois, e `transicao_ilegal` e o `started_at` fica nulo."""
    inicio, conclusao = _em_paralelo(
        banco_migrado,
        [
            _iniciar(missao_commitada, "start-x"),
            _concluir(missao_commitada, "complete-x"),
        ],
    )

    assert conclusao[0] == "ok"
    final = _missao(banco_migrado, missao_commitada)
    assert final.state is MissionState.CONCLUIDA
    assert final.completed_at is not None
    if inicio[0] == "ok":
        assert final.started_at is not None
        assert final.started_at <= final.completed_at
        assert _operacoes(banco_migrado, missao_commitada) == 2
    else:
        assert inicio[0] == "bloqueada"
        assert final.started_at is None
        assert _operacoes(banco_migrado, missao_commitada) == 1


# --- reagendar ---------------------------------------------------------------


def test_dois_reagendamentos_com_chaves_diferentes_viram_dois_elos(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """Review Focus 1 (F14): duas abas reagendando juntas. Dois elos
    ENCADEADOS -- o `previous_deadline` do segundo e o `new_deadline` do
    primeiro -- e o prazo final e o do ultimo a commitar. Sem a trava, as
    duas leriam o mesmo prazo antigo e o segundo elo mentiria sobre de onde
    o prazo saiu (a atualizacao perdida que o historico existe para evitar).
    """
    original = _missao(banco_migrado, missao_commitada).deadline
    prazo_a, prazo_b = _futuro(3), _futuro(5)

    resultados = _em_paralelo(
        banco_migrado,
        [
            _reagendar(missao_commitada, "resched-a", prazo_a),
            _reagendar(missao_commitada, "resched-b", prazo_b),
        ],
    )

    assert _rotulos(resultados) == ["ok", "ok"]
    primeiro, segundo = _historico(banco_migrado, missao_commitada)
    assert primeiro.previous_deadline == original
    assert segundo.previous_deadline == primeiro.new_deadline
    assert {primeiro.new_deadline, segundo.new_deadline} == {prazo_a, prazo_b}
    assert primeiro.rescheduled_at <= segundo.rescheduled_at
    assert _missao(banco_migrado, missao_commitada).deadline == segundo.new_deadline
    assert _operacoes(banco_migrado, missao_commitada) == 2


def test_o_mesmo_reagendamento_reenviado_em_paralelo_grava_um_elo(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A mesma chave e o mesmo conteudo, em paralelo (F13): os dois `200`,
    com o MESMO corpo, e uma linha no historico. O prazo vai com offset de
    Brasilia: sem a normalizacao para UTC do servico, o corpo do primeiro
    (em memoria) e o do segundo (lido do banco) difeririam na grafia."""
    prazo = _futuro(4)

    resultados = _em_paralelo(
        banco_migrado,
        [
            _reagendar(missao_commitada, "resched-repetido", prazo),
            _reagendar(missao_commitada, "resched-repetido", prazo),
        ],
    )

    assert _rotulos(resultados) == ["ok", "ok"]
    (_, primeiro), (_, segundo) = resultados
    assert primeiro == segundo
    assert len(primeiro["reschedules"]) == 1
    (elo,) = _historico(banco_migrado, missao_commitada)
    assert elo.new_deadline == prazo
    assert _operacoes(banco_migrado, missao_commitada) == 1


def test_reagendamento_junto_com_conclusao_nunca_reagenda_concluida(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A missao concluida nao tem mais prazo a cumprir (F8). Ou o
    reagendamento entrou ANTES -- e a conclusao, que so trava depois, viu o
    prazo NOVO, e o elo e anterior ao `completed_at` --, ou entrou depois e e
    `transicao_ilegal`, sem elo nenhum. O que nunca pode acontecer: os dois
    sucederem com a conclusao tendo visto o prazo velho (o reagendamento leu
    `pendente` antes da conclusao e escreveu depois dela)."""
    original = _missao(banco_migrado, missao_commitada).deadline
    prazo = _futuro(3)

    reagendamento, conclusao = _em_paralelo(
        banco_migrado,
        [
            _reagendar(missao_commitada, "resched-y", prazo),
            _concluir(missao_commitada, "complete-y"),
        ],
    )

    assert conclusao[0] == "ok"
    final = _missao(banco_migrado, missao_commitada)
    assert final.state is MissionState.CONCLUIDA
    assert final.completed_at is not None
    historico = _historico(banco_migrado, missao_commitada)
    if reagendamento[0] == "ok":
        assert conclusao[1] == prazo, "a conclusao entrou antes do reagendamento"
        (elo,) = historico
        assert elo.rescheduled_at <= final.completed_at
        assert final.deadline == prazo
    else:
        assert reagendamento[0] == "bloqueada"
        assert conclusao[1] == original
        assert historico == []
        assert final.deadline == original


def test_mesma_chave_de_reagendamento_em_missoes_diferentes(
    banco_migrado: Engine, missao_commitada: int, outra_missao_commitada: int
) -> None:
    """A janela que a trava nao fecha: missoes diferentes nao disputam trava,
    e quem recusa a segunda e a UNIQUE de `mission_operations` -- traduzida
    para a mesma `operacao_reutilizada` do caminho sequencial."""
    prazo = _futuro(3)

    resultados = _em_paralelo(
        banco_migrado,
        [
            _reagendar(missao_commitada, "resched-disputada", prazo),
            _reagendar(outra_missao_commitada, "resched-disputada", prazo),
        ],
    )

    assert _rotulos(resultados) == ["chave gasta", "ok"]
    elos = len(_historico(banco_migrado, missao_commitada)) + len(
        _historico(banco_migrado, outra_missao_commitada)
    )
    assert elos == 1
    operacoes = _operacoes(banco_migrado, missao_commitada) + _operacoes(
        banco_migrado, outra_missao_commitada
    )
    assert operacoes == 1


def test_conflito_de_chave_gravado_apos_a_consulta_no_reagendamento(
    banco_migrado: Engine, missao_commitada: int, outra_missao_commitada: int
) -> None:
    """O caminho da UNIQUE no reagendamento, SEM depender de entrelacamento.

    O teste acima so percorre a traducao do `IntegrityError` quando as duas
    threads se cruzam. Aqui, REPEATABLE READ fixa o snapshot antes de a outra
    conexao gastar a chave: a consulta de idempotencia nao ve a operacao
    alheia, o indice unico ve -- e o erro tem de sair como dominio, nao 500.
    """
    with Session(bind=banco_migrado) as sessao:
        sessao.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        sessao.execute(select(func.count()).select_from(MissionOperation))

        with Session(bind=banco_migrado) as intrusa:
            intrusa.add(
                MissionOperation(
                    operation_id="resched-intrusa",
                    mission_id=outra_missao_commitada,
                    kind="reschedule",
                )
            )
            intrusa.commit()

        with pytest.raises(OperacaoReutilizadaError) as excecao:
            _reagendar(missao_commitada, "resched-intrusa", _futuro(3))(sessao)
        sessao.rollback()

    assert "resched-intrusa" in str(excecao.value)
    assert _historico(banco_migrado, missao_commitada) == []
    assert _operacoes(banco_migrado, missao_commitada) == 0


# --- o mecanismo: a trava e o relogio ----------------------------------------


@pytest.mark.parametrize("operacao", ["iniciar", "reagendar"])
def test_a_escrita_trava_a_linha_da_missao(
    banco_migrado: Engine, missao_commitada: int, operacao: str
) -> None:
    """A trava pedida ao PostgreSQL, sem timing (o desenho de
    `test_concluir_trava_a_linha_da_missao`): com a linha em `FOR KEY SHARE`,
    o `FOR UPDATE` do servico espera ate o `lock_timeout`; sem ele, o `UPDATE`
    de coluna comum (FOR NO KEY UPDATE) e o INSERT com FK (FOR KEY SHARE)
    passariam reto."""
    tarefa = (
        _iniciar(missao_commitada, "op-travada")
        if operacao == "iniciar"
        else _reagendar(missao_commitada, "op-travada", _futuro(3))
    )
    with banco_migrado.connect() as dono_da_trava:
        dono_da_trava.execute(
            text("SELECT id FROM missions WHERE id = :id FOR KEY SHARE"),
            {"id": missao_commitada},
        )
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            with pytest.raises(OperationalError) as excecao:
                tarefa(sessao)
            sessao.rollback()

        assert isinstance(excecao.value.orig, psycopg.errors.LockNotAvailable)

    final = _missao(banco_migrado, missao_commitada)
    assert final.state is MissionState.PENDENTE
    assert _operacoes(banco_migrado, missao_commitada) == 0
    assert _historico(banco_migrado, missao_commitada) == []


def _relogio_que_sonda(engine: Engine, mission_id: int, observado: list[str]) -> Any:
    """Um relogio que, quando lido, pergunta por OUTRA conexao se a linha ja
    esta travada. `FOR KEY SHARE NOWAIT` conflita com o `FOR UPDATE` e
    responde na hora -- a sonda nunca bloqueia o servico."""

    def relogio() -> datetime:
        with engine.connect() as sonda:
            try:
                sonda.execute(
                    text("SELECT id FROM missions WHERE id = :id FOR KEY SHARE NOWAIT"),
                    {"id": mission_id},
                )
            except OperationalError as erro:
                # So a recusa de trava conta como "travada".
                assert isinstance(erro.orig, psycopg.errors.LockNotAvailable)
                observado.append("travada")
            else:
                observado.append("livre")
        return datetime.now(UTC)

    return relogio


def test_relogio_do_inicio_e_lido_com_a_linha_ja_travada(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """C13/F14 no inicio: o relogio e lido UMA vez, e com a linha travada."""
    observado: list[str] = []
    relogio = _relogio_que_sonda(banco_migrado, missao_commitada, observado)

    with Session(bind=banco_migrado) as sessao:
        iniciar_missao(
            sessao, ESTUDANTE, missao_commitada, "start-sonda", clock=relogio
        )
        sessao.commit()

    assert observado == ["travada"]


def test_relogio_do_reagendamento_e_lido_com_a_linha_ja_travada(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """C13/F14 no reagendamento: o relogio e lido UMA vez, e com a linha
    travada."""
    observado: list[str] = []
    relogio = _relogio_que_sonda(banco_migrado, missao_commitada, observado)

    with Session(bind=banco_migrado) as sessao:
        reagendar_missao(
            sessao,
            ESTUDANTE,
            missao_commitada,
            "resched-sonda",
            novo_prazo=_futuro(3),
            motivo=FALTA_DE_TEMPO,
            origem=OrigemDoReagendamento.USUARIO,
            clock=relogio,
        )
        sessao.commit()

    assert observado == ["travada"]


def _esperar_bloqueio(engine: Engine, pid: int) -> None:
    """Espera ate o backend `pid` estar parado numa trava do PostgreSQL.

    E uma espera por CONDICAO, com prazo, e nao um `sleep` chutado: o
    `pg_stat_activity` diz quando a thread chegou ao `FOR UPDATE` e parou
    nele. So entao o teste registra a hora da liberacao -- e isso que torna a
    comparacao deterministica.
    """
    limite = time.monotonic() + SEGUNDOS_LIMITE
    with engine.connect() as observador:
        while time.monotonic() < limite:
            espera = observador.execute(
                text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"),
                {"pid": pid},
            ).scalar_one_or_none()
            observador.commit()
            if espera == "Lock":
                return
            time.sleep(0.01)
    pytest.fail(f"o backend {pid} nunca esperou pela trava da missao")


def _instante_depois_da_espera(
    engine: Engine,
    mission_id: int,
    segurar: Callable[[Session], object],
    esperar: Callable[[Session], datetime],
) -> tuple[datetime, datetime]:
    """`segurar` trava a linha numa sessao aberta; `esperar` roda numa thread
    e para na trava. Com a thread comprovadamente parada, registra a hora e
    commita `segurar`. Devolve (liberada_em, instante que `esperar` gravou)."""
    pid: list[int] = []
    conectou = threading.Event()
    gravado: list[datetime] = []

    def alvo() -> None:
        with Session(bind=engine, expire_on_commit=False) as sessao:
            pid.append(sessao.execute(text("SELECT pg_backend_pid()")).scalar_one())
            conectou.set()
            gravado.append(esperar(sessao))
            sessao.commit()

    with Session(bind=engine, expire_on_commit=False) as dono:
        segurar(dono)
        thread = threading.Thread(target=alvo)
        thread.start()
        assert conectou.wait(timeout=SEGUNDOS_LIMITE)
        _esperar_bloqueio(engine, pid[0])
        liberada_em = datetime.now(UTC)
        dono.commit()

    thread.join(timeout=SEGUNDOS_LIMITE)
    assert not thread.is_alive(), "thread travada depois da liberacao"
    assert len(gravado) == 1, "a thread que esperava a trava morreu sem resultado"
    return liberada_em, gravado[0]


def test_started_at_nao_e_anterior_ao_commit_que_liberou_a_trava(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """Um reagendamento segura a linha; um inicio espera por ela. O
    `started_at` e lido DEPOIS da trava, entao nao pode ser anterior ao
    instante em que o reagendamento commitou e a liberou. Lido antes, ele
    carregaria a hora de CHEGADA -- anterior a toda a espera."""

    def iniciar(sessao: Session) -> datetime:
        missao = iniciar_missao(
            sessao, ESTUDANTE, missao_commitada, "start-espera", clock=system_now
        )
        assert missao.started_at is not None
        return missao.started_at

    liberada_em, started_at = _instante_depois_da_espera(
        banco_migrado,
        missao_commitada,
        _reagendar(missao_commitada, "resched-segura", _futuro(3)),
        iniciar,
    )

    assert started_at >= liberada_em


def test_rescheduled_at_nao_e_anterior_ao_commit_que_liberou_a_trava(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """O espelho do teste acima: um inicio segura a linha; um reagendamento
    espera por ela, e o `rescheduled_at` do elo nao e anterior a liberacao."""

    def reagendar(sessao: Session) -> datetime:
        missao = reagendar_missao(
            sessao,
            ESTUDANTE,
            missao_commitada,
            "resched-espera",
            novo_prazo=_futuro(3),
            motivo=FALTA_DE_TEMPO,
            origem=OrigemDoReagendamento.USUARIO,
            clock=system_now,
        )
        return missao.reschedules[-1].rescheduled_at

    liberada_em, rescheduled_at = _instante_depois_da_espera(
        banco_migrado,
        missao_commitada,
        _iniciar(missao_commitada, "start-segura"),
        reagendar,
    )

    assert rescheduled_at >= liberada_em
