"""Contratos de entrada e saida da missao.

Os nomes dos campos estao em INGLES porque payload de API e contrato -- lido
por cliente, por teste de ponta a ponta e por quem depurar a rede --, nao
interface. O texto em portugues que a pessoa le pertence ao frontend, que
traduz o estado. Os comentarios e as docstrings daqui seguem em portugues,
pela mesma razao invertida: sao para quem mantem o codigo.

Os dois campos computados (`xp` e `duracao_real_minutos`) nao existem no banco.
Um campo derivado que fosse armazenado seria mais um lugar para discordar da
fonte -- e a fonte, aqui, e a dificuldade e o par de instantes.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

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


class MissionCreate(BaseModel):
    """O que a API aceita para criar uma missao.

    `difficulty` e recusada fora de `[1, DIFICULDADE_MAXIMA]` com 422, antes de
    o caso de uso comecar -- ver o comentario da constante para o porque de o
    teto viver na borda e nao no dominio.
    """

    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=DIFICULDADE_MAXIMA)
    estimated_minutes: int = Field(gt=0)
    deadline: datetime


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
    def duracao_real_minutos(self) -> int | None:
        """Minutos entre o inicio e a conclusao, ou None se um deles falta.

        Em minutos inteiros, truncados: a unidade que o resto do contrato usa
        para tempo e o minuto (`estimated_minutes`), e devolver segundos aqui
        pediria ao cliente para converter para comparar estimativa com
        realizado.
        """
        duracao = duracao_real(self.started_at, self.completed_at)
        return None if duracao is None else int(duracao.total_seconds() // 60)
