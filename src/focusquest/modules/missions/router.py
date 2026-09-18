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

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.modules.missions.schemas import (
    MissionComplete,
    MissionCreate,
    MissionRead,
)
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    listar_missoes,
)

# O usuario unico do incremento 1a, semeado pela migracao (README s8). O
# recorte de usuario unico e EXPLICITO, e nao ha autenticacao improvisada: o
# dono nao vem de token nem de cabecalho, vem daqui.
#
# A constante e o ponto que muda quando houver autenticacao -- cada rota vai
# receber o usuario por dependencia em vez de ler este numero --, e e por isso
# que ela tem nome em vez de aparecer como `1` em tres chamadas.
USUARIO_UNICO = 1

router = APIRouter(prefix="/api/missions", tags=["missions"])

# A sessao da requisicao, escrita uma vez. Repetir o `Annotated` em tres
# assinaturas convidaria a divergirem.
SessaoDaRequisicao = Annotated[Session, Depends(get_session)]


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
    return MissionRead.model_validate(missao)


@router.get("")
def listar(session: SessaoDaRequisicao) -> list[MissionRead]:
    """Lista as missoes do usuario. Colecao vazia e `[]` com 200, nao 404: a
    colecao existe, so esta sem itens -- e a tela precisa distinguir "nenhuma
    missao" de "deu erro".

    Nao ha `commit`: uma leitura nao tem nada para tornar permanente, e a
    transacao aberta pela sessao morre no fim da requisicao.
    """
    return [
        MissionRead.model_validate(missao)
        for missao in listar_missoes(session, USUARIO_UNICO)
    ]


@router.post("/{mission_id}/complete")
def concluir(
    mission_id: int, dados: MissionComplete, session: SessaoDaRequisicao
) -> MissionRead:
    """Conclui a missao, de forma idempotente pelo identificador de operacao.

    200 e nao 201: nao nasce recurso novo, muda o estado de um que ja existia.
    E o reenvio do MESMO identificador devolve 200 de novo, com o mesmo corpo
    -- o servico e quem sustenta essa promessa; a rota so nao a estraga
    devolvendo um status diferente na segunda vez.
    """
    missao = concluir_missao(session, USUARIO_UNICO, mission_id, dados.operation_id)
    session.commit()
    return MissionRead.model_validate(missao)
