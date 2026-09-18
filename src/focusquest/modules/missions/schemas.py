"""Contratos de entrada e saida da missao.

Os nomes dos campos estao em INGLES porque payload de API e contrato que
atravessa sistemas -- lido por cliente, por teste de ponta a ponta e por quem
depurar a rede --, nao interface. O texto em portugues que a pessoa le pertence
ao frontend, que traduz o estado. Identificadores INTERNOS (`duracao_real`,
`xp_para_dificuldade`, `DIFICULDADE_MAXIMA`) continuam em portugues: eles nao
atravessam a rede. Os comentarios e as docstrings daqui seguem em portugues,
pela mesma razao invertida: sao para quem mantem o codigo.

Os dois campos computados (`xp` e `actual_duration_minutes`) nao existem no
banco. Um campo derivado que fosse armazenado seria mais um lugar para discordar
da fonte -- e a fonte, aqui, e a dificuldade e o par de instantes.
"""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
)

from focusquest.modules.missions.domain import (
    MissionState,
    duracao_real,
    xp_para_dificuldade,
)

# O teto da dificuldade aceita na ENTRADA. Escolhido em 5 por dois motivos que
# se somam:
#
# 1. **A curva de XP foi calibrada nesta faixa.** `xp_para_dificuldade`
#    justifica a propria forma com "dificuldade 1 vale 20, dificuldade 5 vale
#    220, uma razao de 11x que e significativa sem ser absurda". A
#    justificativa cala fora dela: dificuldade 100 valeria 99.020, e a razao
#    viraria 4.951x. Aceitar um numero para o qual a curva nao tem defesa e
#    aceitar um XP que ninguem decidiu.
# 2. **Cinco e a granularidade que uma pessoa consegue julgar.** Quem estima
#    dificuldade no momento de criar a missao distingue "facil", "media" e
#    "brutal"; nao distingue 61 de 62.
#
# O teto mora AQUI, e nao no dominio, e a divisao e deliberada: o dominio
# responde "quanto vale esta dificuldade" -- e a resposta dele e valida para
# qualquer inteiro >= 1 --, enquanto a borda responde "que dificuldade eu
# aceito receber". Poe-lo no dominio faria uma funcao pura de precificacao
# carregar uma politica de formulario.
#
# Mudar este numero muda o contrato da API, nao a regra: missoes ja gravadas
# com dificuldade maior continuariam sendo lidas e precificadas normalmente.
DIFICULDADE_MAXIMA = 5

# O maior inteiro que cabe numa coluna `Integer` do PostgreSQL (int4). E um teto
# TECNICO, nao de negocio: acima dele o INSERT estoura a coluna e a API
# responderia 500 (medido: `estimated_minutes` de 3_000_000_000 e de 2**63, e
# `/api/missions/99999999999/complete`). Recusar com 422 na borda e o que
# cumpre "nenhum caminho de erro retorna 500 por omissao".
#
# Ele NAO responde "quanto tempo cabe numa missao" -- isso e decisao de
# produto, deixada em aberto para o dono (docs/HANDOFF.md). Quando ela vier,
# entra como um teto proprio, com nome proprio, e este continua valendo para os
# identificadores de rota, que nao tem teto de negocio nenhum.
MAIOR_INTEIRO_DA_COLUNA = 2**31 - 1


def _instante_representavel(prazo: datetime) -> datetime:
    """Recusa o prazo cujo instante, em UTC, o `datetime` do Python nao representa.

    `AwareDatetime` aceita `9999-12-31T23:59:59-03:00`, porque a data LOCAL
    cabe no `datetime`. O instante, nao: em UTC ele e `10000-01-01T02:59:59Z`.
    O PostgreSQL grava esse valor sem reclamar, e a partir dai toda leitura da
    linha falha no Python -- medido: o `GET /api/missions` passava a responder
    500 para sempre, ate alguem apagar a linha por SQL.

    A conversao para UTC e a pergunta certa porque e o que a coluna
    `timestamptz` guarda. Nao ha janela de negocio aqui (prazo no passado, prazo
    longe demais): essa decisao e do dono e ficou aberta de proposito.

    Limite conhecido, registrado no docs/HANDOFF.md: a leitura volta no fuso da
    SESSAO do PostgreSQL. Com a sessao em UTC -- o padrao do servidor deste
    projeto -- esta guarda basta; com a sessao em outro fuso, um instante a
    poucas horas das bordas passaria aqui e ainda estouraria na leitura.
    """
    try:
        prazo.astimezone(UTC)
    except OverflowError as exc:
        raise ValueError(
            "prazo fora da faixa representavel quando convertido para UTC"
        ) from exc
    return prazo


class MissionCreate(BaseModel):
    """O que a API aceita para criar uma missao.

    `difficulty` e recusada fora de `[1, DIFICULDADE_MAXIMA]` com 422, antes de
    o caso de uso comecar -- ver o comentario da constante para o porque de o
    teto viver na borda e nao no dominio.

    `deadline` exige FUSO (`AwareDatetime`): um datetime naive e recusado com
    422. O motivo e um defeito medido, nao purismo. A coluna e `timestamptz`,
    entao a leitura seguinte sai com fuso -- no fuso da SESSAO do PostgreSQL,
    que e quem converte o instante na leitura, e nao a API: com a sessao em UTC
    (o padrao do servidor deste projeto) sai com `Z`, com a sessao em
    `America/Sao_Paulo` sai com `-03:00` (medido). Com
    `expire_on_commit=False`, o 201 serializa o objeto como ele CHEGOU no
    pedido. Aceitar naive fazia o mesmo prazo sair em duas serializacoes
    diferentes -- `"...T10:00:00"` no 201 e `"...T10:00:00Z"` no GET --, e em
    JavaScript `new Date("...T10:00:00")` e hora LOCAL enquanto
    `new Date("...T10:00:00Z")` e UTC. O mesmo campo viraria dois instantes.

    A alternativa -- normalizar naive para UTC em silencio -- foi recusada: quem
    manda "10:00" sem dizer onde nao informou o instante, e assumir um fuso por
    ele e adivinhacao que produz hora errada para sempre e sem aviso. Recusar
    alto obriga o cliente a ser explicito UMA vez.
    """

    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=DIFICULDADE_MAXIMA)
    estimated_minutes: int = Field(gt=0, le=MAIOR_INTEIRO_DA_COLUNA)
    deadline: Annotated[AwareDatetime, AfterValidator(_instante_representavel)]


class MissionComplete(BaseModel):
    """O identificador de operacao que torna a conclusao idempotente.

    Quem o gera e o cliente, e e por isso que ele entra no corpo: o servidor
    nao tem como saber, sozinho, se a segunda requisicao e um reenvio da
    primeira ou uma tentativa nova.
    """

    operation_id: str = Field(min_length=1)


class MissionRead(BaseModel):
    """A missao como a API a publica.

    `from_attributes` existe para que a rota possa validar direto o objeto do
    SQLAlchemy. O schema continua sendo uma coisa diferente do modelo: ele
    escolhe o que sai (nao publica `user_id` nem `created_at`) e acrescenta o
    que e derivado.

    Os dois `type: ignore[prop-decorator]` abaixo nao escondem defeito nosso:
    o mypy nao suporta decorador acima de `@property` (`Decorators on top of
    @property are not supported`), e `@computed_field` precisa estar acima --
    e a ordem que o proprio pydantic documenta. Sem o ignore o `make check-api`
    reprova; com ele, o codigo verificado e exatamente o que roda. Medido nas
    duas direcoes: sem o ignore sao dois erros, com o ignore o mypy nao acusa
    ignore sem uso (o `strict` liga `warn_unused_ignores`).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int
    deadline: datetime
    state: MissionState
    started_at: datetime | None
    completed_at: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def xp(self) -> int:
        """Derivado da dificuldade, nunca armazenado (decisao A4)."""
        return xp_para_dificuldade(self.difficulty)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def actual_duration_minutes(self) -> int | None:
        """Minutos entre o inicio e a conclusao, ou None se um deles falta.

        Em minutos inteiros, truncados: a unidade que o resto do contrato usa
        para tempo e o minuto (`estimated_minutes`), e devolver segundos aqui
        pediria ao cliente para converter para comparar estimativa com
        realizado.

        O nome esta em ingles porque ele E a chave publicada no payload e no
        `/openapi.json` -- contrato que atravessa sistemas. A funcao de dominio
        que ele chama continua sendo `duracao_real`: essa nao atravessa nada.
        """
        duracao = duracao_real(self.started_at, self.completed_at)
        return None if duracao is None else int(duracao.total_seconds() // 60)
