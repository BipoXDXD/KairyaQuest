"""A escrita da avaliacao da Tifa: dados da missao, gravados por `missions`.

A avaliacao e dado da missao (E11): as tabelas moram em `missions`, e e daqui
que `evaluation` escreve nelas. Como em `service.py`, nada aqui commita.

A ordem das travas e a mesma em todo caminho: a MISSAO primeiro (`FOR
UPDATE`), a avaliacao lida depois dela, e o usuario (o bonus, em
`progression`) por ultimo (D12). A missao travada e o ponto de serializacao de
tudo o que acontece com a avaliacao dela: dois pedidos da mesma missao entram
um de cada vez, e o segundo le o que o primeiro commitou.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    AvaliacaoEmAndamentoError,
    MissaoNaoEncontradaError,
    SemEvidenciaError,
)
from focusquest.modules.missions.cycle_service import ler_missao
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    Veredito,
    validar_transicao_da_avaliacao,
)
from focusquest.modules.missions.models import Mission, MissionEvaluation
from focusquest.modules.missions.service import buscar_para_escrever


@dataclass(frozen=True)
class Tentativa:
    """Uma tentativa aberta: o que o modelo precisa ler e o numero dela (E10).

    Copia os textos da missao para que a chamada ao modelo, FORA de
    transacao, nao dependa de sessao nenhuma aberta.
    """

    mission_id: int
    attempt: int
    instructions: str
    completion_criterion: str
    evidence_text: str
    evidence_link: str | None


def abrir_tentativa(
    session: Session,
    user_id: int,
    mission_id: int,
    *,
    clock: Clock,
    modelo: str,
    limite_do_orfao: timedelta,
) -> Tentativa | MissionEvaluation:
    """Grava `avaliando` numa tentativa nova, ou devolve a avaliacao concluida.

    A ordem das recusas e a da spec: a ocultacao ANTES da evidencia (uma diaria
    futura sem evidencia responde 404, e nao `sem_evidencia`, que diria que
    ela existe); a `concluida` ANTES da em andamento, porque e terminal (E8).

    A hora e lida DEPOIS da trava (spec, Servicos, passo 1; a C13 da
    conclusao): lida antes, um pedido que esperasse a trava de uma conclusao
    da mesma missao gravaria um `requested_at` anterior a ela, e aplicaria a
    ocultacao num instante velho.

    O corte do orfao e `agora - limite_do_orfao`. Uma `avaliando` pedida no
    corte ou depois esta em andamento; so a ANTERIOR a ele e orfa (E9), e
    passa por `falhou` (`tempo_esgotado`) antes da tentativa nova -- o mesmo
    caminho de uma falha de verdade, pela tabela de transicoes.
    """
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)
    agora = clock()
    ler_missao(session, missao, agora)
    if missao.evidence is None:
        raise SemEvidenciaError(f"missao {mission_id} nao tem evidencia para avaliar")
    avaliacao = missao.evaluation
    if avaliacao is not None and avaliacao.state is EstadoDaAvaliacao.CONCLUIDA:
        return avaliacao
    if avaliacao is not None and avaliacao.state is EstadoDaAvaliacao.AVALIANDO:
        if avaliacao.requested_at >= agora - limite_do_orfao:
            raise AvaliacaoEmAndamentoError(
                f"missao {mission_id} ja esta sendo avaliada"
            )
        _encerrar_com_falha(avaliacao, FalhaDaAvaliacao.TEMPO_ESGOTADO, agora)
    if avaliacao is None:
        avaliacao = MissionEvaluation(
            state=EstadoDaAvaliacao.AVALIANDO,
            attempt=1,
            model=modelo,
            requested_at=agora,
        )
        missao.evaluation = avaliacao
    else:
        validar_transicao_da_avaliacao(avaliacao.state, EstadoDaAvaliacao.AVALIANDO)
        avaliacao.state = EstadoDaAvaliacao.AVALIANDO
        avaliacao.attempt += 1
        avaliacao.model = modelo
        avaliacao.requested_at = agora
        avaliacao.error_code = None
        avaliacao.finished_at = None
    session.flush()
    return Tentativa(
        mission_id=missao.id,
        attempt=avaliacao.attempt,
        instructions=missao.instructions,
        completion_criterion=missao.completion_criterion,
        evidence_text=missao.evidence.text,
        evidence_link=missao.evidence.link,
    )


@dataclass(frozen=True)
class ResultadoGravado:
    """A missao JA TRAVADA, a avaliacao concluida e o instante lido depois da
    trava: o chamador credita o bonus na mesma transacao, com a mesma hora."""

    missao: Mission
    avaliacao: MissionEvaluation
    agora: datetime


def registrar_resultado(
    session: Session,
    tentativa: Tentativa,
    *,
    veredito: Veredito,
    feedback: str,
    clock: Clock,
) -> ResultadoGravado | None:
    """Grava `concluida` se `tentativa` ainda for a corrente; `None` se nao.

    `None` e a tentativa superada (E10): nada muda na linha. A hora e lida
    depois da trava, como em `abrir_tentativa`.
    """
    missao, avaliacao = _corrente(session, tentativa)
    if avaliacao is None:
        return None
    agora = clock()
    validar_transicao_da_avaliacao(avaliacao.state, EstadoDaAvaliacao.CONCLUIDA)
    avaliacao.state = EstadoDaAvaliacao.CONCLUIDA
    avaliacao.verdict = veredito
    avaliacao.feedback = feedback
    avaliacao.finished_at = agora
    session.flush()
    return ResultadoGravado(missao, avaliacao, agora)


def registrar_falha(
    session: Session,
    tentativa: Tentativa,
    *,
    falha: FalhaDaAvaliacao,
    clock: Clock,
) -> bool:
    """Grava `falhou` se `tentativa` ainda for a corrente. `False` se superada."""
    _, avaliacao = _corrente(session, tentativa)
    if avaliacao is None:
        return False
    _encerrar_com_falha(avaliacao, falha, clock())
    session.flush()
    return True


def _corrente(
    session: Session, tentativa: Tentativa
) -> tuple[Mission, MissionEvaluation | None]:
    """Trava a missao, depois le a avaliacao; `None` se a tentativa nao e mais
    a corrente -- outro numero (a orfa retomada) ou ja encerrada.

    Sem ocultacao nem dono: a tentativa so existe porque `abrir_tentativa` ja
    conferiu os dois, e o que muda entre as duas transacoes e so a avaliacao.
    """
    missao = session.get(Mission, tentativa.mission_id, with_for_update=True)
    if missao is None:
        raise MissaoNaoEncontradaError(f"missao {tentativa.mission_id} nao existe")
    avaliacao = missao.evaluation
    if (
        avaliacao is None
        or avaliacao.attempt != tentativa.attempt
        or avaliacao.state is not EstadoDaAvaliacao.AVALIANDO
    ):
        return missao, None
    return missao, avaliacao


def _encerrar_com_falha(
    avaliacao: MissionEvaluation, falha: FalhaDaAvaliacao, agora: datetime
) -> None:
    validar_transicao_da_avaliacao(avaliacao.state, EstadoDaAvaliacao.FALHOU)
    avaliacao.state = EstadoDaAvaliacao.FALHOU
    avaliacao.error_code = falha
    avaliacao.finished_at = agora
