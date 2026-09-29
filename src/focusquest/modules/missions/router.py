"""Transporte HTTP da missao.

Cada rota faz quatro coisas e nada alem: recebe o contrato validado, chama o
caso de uso, torna a transacao permanente e devolve o contrato de saida. Regra
de negocio nenhuma mora aqui -- quando uma rota precisar decidir algo, a
decisao pertence ao `service.py` ou ao `domain.py`.

Nenhuma rota trata erro. Os erros de dominio sobem, e `main.py` os traduz em
status: um `try/except` por rota espalharia a mesma traducao por tres lugares,
e o quarto endpoint esqueceria dela.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status

from focusquest.core.clock import Clock, get_clock
from focusquest.core.database import SessaoDaRequisicao
from focusquest.core.usuario_unico import USUARIO_UNICO
from focusquest.modules.missions.cycle_service import leitura_da_avulsa, ler_missao
from focusquest.modules.missions.schemas import (
    MAIOR_INTEIRO_DA_COLUNA,
    MissionComplete,
    MissionCompletionRead,
    MissionCreate,
    MissionRead,
)
from focusquest.modules.missions.service import (
    NovaEvidencia,
    concluir_missao,
    criar_missao,
    listar_missoes,
)
from focusquest.modules.progression.schemas import RewardRead
from focusquest.modules.progression.service import recompensa_da_missao

router = APIRouter(prefix="/api/missions", tags=["missions"])

# O identificador da missao no caminho, limitado a faixa da coluna `id` (int4).
# Sem o teto, `/api/missions/99999999999/complete` chegava ao banco e estourava
# o parametro -- 500 em vez de 422. Sem o piso, zero e negativos nao estouram
# nada, mas nunca serao id de missao: recusar na borda diz isso ao cliente com
# o `loc` do campo, em vez de um 404 que sugeriria "talvez exista".
IdDaMissao = Annotated[int, Path(ge=1, le=MAIOR_INTEIRO_DA_COLUNA)]


@router.post("", status_code=status.HTTP_201_CREATED)
def criar(dados: MissionCreate, session: SessaoDaRequisicao) -> MissionRead:
    """Cria a missao e devolve 201 com o recurso criado.

    Os argumentos sao passados um por um, e nao com `**dados.model_dump()`: o
    servico declarou `difficulty` e `estimated_minutes` como somente-nomeados
    justamente para que uma troca entre eles fosse impossivel, e um `**` de
    `dict[str, Any]` devolveria essa conferencia ao acaso -- um campo renomeado
    no schema passaria a chegar como argumento inesperado em tempo de execucao,
    nao no mypy.
    """
    missao = criar_missao(
        session,
        user_id=USUARIO_UNICO,
        instructions=dados.instructions,
        completion_criterion=dados.completion_criterion,
        difficulty=dados.difficulty,
        estimated_minutes=dados.estimated_minutes,
        deadline=dados.deadline,
    )
    session.commit()
    return MissionRead.da_leitura(leitura_da_avulsa(missao))


@router.get("")
def listar(session: SessaoDaRequisicao) -> list[MissionRead]:
    """Lista as missoes do usuario. Colecao vazia e `[]` com 200, nao 404: a
    colecao existe, so esta sem itens -- e a tela precisa distinguir "nenhuma
    missao" de "deu erro".

    Nao ha `commit`: uma leitura nao tem nada para tornar permanente, e a
    transacao aberta pela sessao morre no fim da requisicao.
    """
    return [
        MissionRead.da_leitura(leitura_da_avulsa(missao))
        for missao in listar_missoes(session, USUARIO_UNICO)
    ]


@router.post("/{mission_id}/complete")
def concluir(
    mission_id: IdDaMissao,
    dados: MissionComplete,
    session: SessaoDaRequisicao,
    clock: Annotated[Clock, Depends(get_clock)],
) -> MissionCompletionRead:
    """Conclui a missao, de forma idempotente pelo identificador de operacao.

    200 e nao 201: nao nasce recurso novo, muda o estado de um que ja existia.
    E o reenvio do MESMO identificador devolve 200 de novo, com o mesmo corpo
    -- o servico e quem sustenta essa promessa; a rota so nao a estraga
    devolvendo um status diferente na segunda vez. A mesma chave com OUTRA
    evidencia (ou em outra missao) nao e reenvio: e `OperacaoReutilizadaError`.

    O relogio vem da dependencia e segue INTEIRO para o servico, que o le
    depois de travar a linha. A rota nao le a hora ANTES do servico: ler aqui
    seria ler antes da trava (ver `core/clock.py`). Ela le de novo DEPOIS do
    commit, so para montar a resposta -- ver o comentario abaixo.
    """
    missao = concluir_missao(
        session,
        USUARIO_UNICO,
        mission_id,
        dados.operation_id,
        clock=clock,
        evidencia=(
            None
            if dados.evidence is None
            else NovaEvidencia(dados.evidence.text, dados.evidence.link)
        ),
    )
    session.commit()
    # Relida depois do commit, com o relogio lido de novo: a disponibilidade de
    # uma missao concluida e `concluida` em qualquer instante, e o prazo nao
    # depende do instante -- ler a hora de novo nao muda a resposta.
    lida = ler_missao(session, missao, clock())
    # A recompensa sai SEMPRE do banco, depois do commit, no primeiro envio e
    # no reenvio (D10): e o que torna os dois corpos identicos.
    recompensa = RewardRead.da_recompensa(recompensa_da_missao(session, missao))
    return MissionCompletionRead.da_leitura_e_recompensa(lida, recompensa)
