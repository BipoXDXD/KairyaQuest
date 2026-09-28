"""O processo de avaliar uma entrega: duas transacoes e o modelo entre elas.

Direcao unica (E11): este modulo escreve por `missions.evaluation_records` e
`progression.service`, e fala com o modelo pelo `Protocol` de `tutoring`.
Ninguem alem de `main.py` (pelo router) importa `evaluation`.

Por que duas transacoes, e nao uma: a chamada ao modelo leva segundos, e uma
transacao aberta durante ela seguraria a trava da missao e uma conexao do pool
esse tempo todo (E9). A primeira grava `avaliando` e commita; a segunda grava
o resultado -- ou a falha -- e commita ANTES de a rota responder (E13).
"""

from dataclasses import dataclass

from pydantic import ValidationError
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.clock import Clock
from focusquest.core.errors import AvaliacaoEmAndamentoError, AvaliacaoFalhouError
from focusquest.modules.evaluation.rubric import (
    FERRAMENTA_DA_AVALIACAO,
    montar_turno_da_avaliacao,
)
from focusquest.modules.evaluation.schemas import EvaluationOutput
from focusquest.modules.missions.domain import FalhaDaAvaliacao
from focusquest.modules.missions.evaluation_records import (
    abrir_tentativa,
    registrar_falha,
    registrar_resultado,
)
from focusquest.modules.missions.models import Mission, MissionEvaluation
from focusquest.modules.progression.service import (
    Recompensa,
    recompensa_do_bonus,
    registrar_bonus,
)
from focusquest.modules.tutoring.provider import (
    ProvedorIndisponivelError,
    TempoEsgotadoError,
)
from focusquest.modules.tutoring.service import FOLGA_DO_ORFAO, Tutoria


@dataclass(frozen=True)
class ResultadoDaAvaliacao:
    """A avaliacao concluida e o bonus dela, ou `None` sem bonus."""

    avaliacao: MissionEvaluation
    recompensa: Recompensa | None


def avaliar_missao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    *,
    user_id: int,
    mission_id: int,
    clock: Clock,
) -> ResultadoDaAvaliacao:
    """Pede a Tifa o veredito da entrega e aplica o bonus deterministico.

    Devolve a avaliacao `concluida` (a nova, ou a que ja existia, sem chamar o
    modelo: E8). Toda falha do modelo e GRAVADA e commitada antes de subir
    como `AvaliacaoFalhouError` (E13); a tentativa superada (E10) sobe como
    `AvaliacaoEmAndamentoError`, sem gravar nada.

    O veredito so vale se o esquema o aceitar (`EvaluationOutput`): e so ele,
    e nunca o texto da evidencia, que decide o bonus.
    """
    agora = clock()
    with fabrica() as session:
        aberta = abrir_tentativa(
            session,
            user_id,
            mission_id,
            agora=agora,
            modelo=tutoria.modelo,
            orfa_antes_de=agora - tutoria.limite - FOLGA_DO_ORFAO,
        )
        session.commit()
    if isinstance(aberta, MissionEvaluation):
        return _reconstruir(fabrica, mission_id)

    falha: FalhaDaAvaliacao | None = None
    saida: EvaluationOutput | None = None
    inicio = clock()
    try:
        entrada = tutoria.provedor.avaliar(
            montar_turno_da_avaliacao(aberta), FERRAMENTA_DA_AVALIACAO
        )
    except TempoEsgotadoError:
        falha = FalhaDaAvaliacao.TEMPO_ESGOTADO
    except ProvedorIndisponivelError:
        falha = FalhaDaAvaliacao.PROVEDOR_INDISPONIVEL
    else:
        # O limite TOTAL (M5): o timeout do SDK e por leitura, e uma resposta
        # que pinga devagar passaria por ele. Nem uma saida valida conta
        # depois do limite.
        if clock() - inicio > tutoria.limite:
            falha = FalhaDaAvaliacao.TEMPO_ESGOTADO
        else:
            try:
                # `None` (o modelo nao chamou a ferramenta) tambem reprova
                # aqui: `model_validate(None)` levanta `ValidationError`.
                saida = EvaluationOutput.model_validate(entrada)
            except ValidationError:
                falha = FalhaDaAvaliacao.AVALIACAO_INVALIDA

    fim = clock()
    with fabrica() as session:
        if saida is None:
            assert falha is not None
            gravou = registrar_falha(session, aberta, falha=falha, agora=fim)
            # Commit ANTES do raise: quem recebe o erro ja encontra a falha
            # gravada (E13).
            session.commit()
            if not gravou:
                raise AvaliacaoEmAndamentoError(
                    f"missao {mission_id}: tentativa superada"
                )
            raise AvaliacaoFalhouError(falha)
        gravada = registrar_resultado(
            session, aberta, veredito=saida.verdict, feedback=saida.feedback, agora=fim
        )
        if gravada is None:
            session.rollback()
            raise AvaliacaoEmAndamentoError(f"missao {mission_id}: tentativa superada")
        missao, _ = gravada
        registrar_bonus(session, missao, saida.verdict, fim)
        session.commit()
    return _reconstruir(fabrica, mission_id)


def _reconstruir(
    fabrica: sessionmaker[Session], mission_id: int
) -> ResultadoDaAvaliacao:
    """A avaliacao e o bonus lidos do banco: um caminho so para o primeiro
    pedido e para o repetido, que por isso devolvem o mesmo corpo (D10)."""
    with fabrica() as session:
        missao = session.get(Mission, mission_id)
        assert missao is not None and missao.evaluation is not None
        return ResultadoDaAvaliacao(
            missao.evaluation, recompensa_do_bonus(session, missao)
        )
