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

from datetime import UTC, date, datetime
from typing import Annotated, TypedDict

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
)

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.cycle_service import MissaoLida
from focusquest.modules.missions.domain import (
    EstadoDaAvaliacao,
    FalhaDaAvaliacao,
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    Veredito,
    Verificacao,
    duracao_real,
    verificacao_da_missao,
    xp_da_missao,
)
from focusquest.modules.missions.models import (
    Mission,
    MissionEvaluation,
    MissionReschedule,
)
from focusquest.modules.progression.schemas import RewardRead

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

    A guarda so basta porque a LEITURA tambem acontece em UTC: o `timestamptz`
    volta no fuso da sessao do PostgreSQL, e `core/database.py` fixa essa
    sessao em UTC em toda conexao. Sem isso, um instante a poucas horas das
    bordas passaria aqui e ainda estouraria na leitura (medido com a sessao em
    `Asia/Tokyo` e em `America/Sao_Paulo`; `tests/integration/
    test_sessao_em_utc.py`).
    """
    try:
        prazo.astimezone(UTC)
    except OverflowError as exc:
        raise ValueError(
            "prazo fora da faixa representavel quando convertido para UTC"
        ) from exc
    return prazo


# O instante com fuso e representavel em UTC: a regra do `deadline` da criacao,
# com nome, porque o reagendamento (F9) e a proposta da Tifa (F15) usam a MESMA.
PrazoComFuso = Annotated[AwareDatetime, AfterValidator(_instante_representavel)]


class MissionCreate(BaseModel):
    """O que a API aceita para criar uma missao.

    `difficulty` e recusada fora de `[1, DIFICULDADE_MAXIMA]` com 422, antes de
    o caso de uso comecar -- ver o comentario da constante para o porque de o
    teto viver na borda e nao no dominio.

    `deadline` exige FUSO (`AwareDatetime`): um datetime naive e recusado com
    422. O motivo e um defeito medido, nao purismo. A coluna e `timestamptz`,
    entao a leitura seguinte sai com fuso -- sempre com `Z`, porque
    `core/database.py` fixa a sessao do PostgreSQL em UTC. Com
    `expire_on_commit=False`, o 201 serializa o objeto como ele CHEGOU no
    pedido, com o offset que o cliente mandou. Aceitar naive fazia o mesmo
    prazo sair em duas serializacoes diferentes -- `"...T10:00:00"` no 201 e
    `"...T10:00:00Z"` no GET --, e em JavaScript `new Date("...T10:00:00")` e
    hora LOCAL enquanto `new Date("...T10:00:00Z")` e UTC. O mesmo campo
    viraria dois instantes.

    A alternativa -- normalizar naive para UTC em silencio -- foi recusada: quem
    manda "10:00" sem dizer onde nao informou o instante, e assumir um fuso por
    ele e adivinhacao que produz hora errada para sempre e sem aviso. Recusar
    alto obriga o cliente a ser explicito UMA vez.
    """

    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=DIFICULDADE_MAXIMA)
    estimated_minutes: int = Field(gt=0, le=MAIOR_INTEIRO_DA_COLUNA)
    deadline: PrazoComFuso


# Teto TECNICO de um identificador gerado pelo cliente (`operation_id` aqui e
# na confirmacao da tutoria, `client_message_id` na pergunta): o frontend
# manda um `crypto.randomUUID()`, 36 caracteres, e 200 sobra com folga. Sem
# teto, a coluna `Text` guardaria qualquer tamanho que o corpo trouxesse.
TAMANHO_MAXIMO_DO_IDENTIFICADOR = 200


TAMANHO_MAXIMO_DA_EVIDENCIA = 4000
TAMANHO_MAXIMO_DO_LINK = 2000
TAMANHO_MAXIMO_DO_FEEDBACK = 1500


def _sem_nul(valor: str) -> str:
    """Recusa o byte NUL: o PostgreSQL nao o guarda em `text`, e sem esta guarda
    a entrega viraria um 500 em vez de um 422 que aponta o campo."""
    if "\x00" in valor:
        raise ValueError("o texto nao pode conter o caractere NUL")
    return valor


TextoDaEvidencia = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=TAMANHO_MAXIMO_DA_EVIDENCIA
    ),
    AfterValidator(_sem_nul),
]
# `(?i)`: HTTPS:// colado de um celular e o mesmo endereco (EM2). `\S+`: um
# espaco no meio nao e endereco nenhum. O backend NUNCA abre o link (E3).
LinkDaEvidencia = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=TAMANHO_MAXIMO_DO_LINK,
        pattern=r"(?i)^https?://\S+$",
    ),
    AfterValidator(_sem_nul),
]


class EvidenceIn(BaseModel):
    """A evidencia de uma conclusao (E1, E3). `extra="forbid"`: um campo a mais
    seria ignorado em silencio, e quem o mandou acharia que foi gravado."""

    model_config = ConfigDict(extra="forbid")

    text: TextoDaEvidencia
    link: LinkDaEvidencia | None = None


class EvidenceRead(BaseModel):
    """A evidencia como a API a publica."""

    text: str
    link: str | None


class EvaluationSummaryRead(BaseModel):
    """O resumo da avaliacao da Tifa que acompanha a missao (sem `bonus_xp`, EM1)."""

    state: EstadoDaAvaliacao
    verdict: Veredito | None
    feedback: str | None
    error_code: FalhaDaAvaliacao | None
    model: str
    finished_at: datetime | None

    @classmethod
    def da_avaliacao(cls, avaliacao: MissionEvaluation) -> EvaluationSummaryRead:
        return cls(
            state=avaliacao.state,
            verdict=avaliacao.verdict,
            feedback=avaliacao.feedback,
            error_code=avaliacao.error_code,
            model=avaliacao.model,
            finished_at=avaliacao.finished_at,
        )


class _CamposDaEntrega(TypedDict):
    """Os tres campos com o tipo real, para o mypy checar o `**` de quem os usa."""

    verification: Verificacao | None
    evidence: EvidenceRead | None
    evaluation: EvaluationSummaryRead | None


def _campos_da_entrega(
    missao: Mission,
) -> _CamposDaEntrega:
    """Os tres campos novos de `MissionRead`, escritos uma vez so."""
    return {
        "verification": verificacao_da_missao(
            missao.state, missao.evidence is not None
        ),
        "evidence": None
        if missao.evidence is None
        else EvidenceRead(text=missao.evidence.text, link=missao.evidence.link),
        "evaluation": None
        if missao.evaluation is None
        else EvaluationSummaryRead.da_avaliacao(missao.evaluation),
    }


class MissionStart(BaseModel):
    """O corpo do inicio: so a chave de idempotencia (F2)."""

    operation_id: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)


class MissionRescheduleIn(BaseModel):
    """O corpo do reagendamento (F6): a chave, o novo prazo e o motivo.

    `extra="forbid"`, como `EvidenceIn`: um campo a mais (uma `note` que ninguem
    guardaria) seria ignorado em silencio, e quem o mandou acharia que foi
    gravado. O motivo e um dos tres do README (F10); sem texto livre.
    """

    model_config = ConfigDict(extra="forbid")

    operation_id: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)
    new_deadline: PrazoComFuso
    reason: MotivoDoReagendamento


class RescheduleRead(BaseModel):
    """Um elo do historico de prazos, como a API o publica (F12)."""

    previous_deadline: datetime
    new_deadline: datetime
    reason: MotivoDoReagendamento
    origin: OrigemDoReagendamento
    rescheduled_at: datetime

    @classmethod
    def do_reagendamento(cls, linha: MissionReschedule) -> RescheduleRead:
        return cls(
            previous_deadline=linha.previous_deadline,
            new_deadline=linha.new_deadline,
            reason=linha.reason,
            origin=linha.origin,
            rescheduled_at=linha.rescheduled_at,
        )


def _historico_de_prazos(missao: Mission) -> list[RescheduleRead]:
    """O historico em ordem de gravacao (a do relacionamento). Escrito uma vez,
    porque os dois construtores de `MissionRead` o usam."""
    return [RescheduleRead.do_reagendamento(r) for r in missao.reschedules]


class MissionComplete(BaseModel):
    """O corpo da conclusao: o identificador de operacao e a evidencia opcional.

    O identificador torna a conclusao idempotente.

    Quem o gera e o cliente, e e por isso que ele entra no corpo: o servidor
    nao tem como saber, sozinho, se a segunda requisicao e um reenvio da
    primeira ou uma tentativa nova. A `evidence`, quando vem, faz parte da
    operacao: o mesmo identificador com outra evidencia e chave gasta.
    """

    operation_id: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)
    evidence: EvidenceIn | None = None


class MissionRead(BaseModel):
    """A missao como a API a publica.

    Nao e mais validada direto do objeto do SQLAlchemy (`from_attributes`):
    `deadline` e `availability` sao DERIVADOS para a diaria e a especial (C10,
    C2), e so o servico sabe deriva-los. Quem publica uma missao passa por
    `da_leitura`, com o que o servico leu.

    Os dois `type: ignore[prop-decorator]` abaixo nao escondem defeito nosso:
    o mypy nao suporta decorador acima de `@property`, e `@computed_field`
    precisa estar acima -- e a ordem que o proprio pydantic documenta.
    """

    id: int
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int
    mission_type: MissionType
    # Data CIVIL do ciclo, sem fuso: a tela a mostra sem conversao.
    day: date | None
    # Obrigatorio na resposta mesmo sendo nulo na COLUNA para diaria e
    # especial: e calculado para elas, e a especial bloqueada nunca e
    # publicada como MissionRead (spec, Endpoints).
    deadline: datetime
    availability: Availability
    state: MissionState
    started_at: datetime | None
    completed_at: datetime | None
    verification: Verificacao | None
    evidence: EvidenceRead | None
    evaluation: EvaluationSummaryRead | None
    reschedules: list[RescheduleRead]

    @classmethod
    def da_leitura(cls, lida: MissaoLida) -> MissionRead:
        missao = lida.missao
        return cls(
            id=missao.id,
            instructions=missao.instructions,
            completion_criterion=missao.completion_criterion,
            difficulty=missao.difficulty,
            estimated_minutes=missao.estimated_minutes,
            mission_type=missao.mission_type,
            day=missao.day,
            deadline=lida.deadline,
            availability=lida.availability,
            state=missao.state,
            started_at=missao.started_at,
            completed_at=missao.completed_at,
            **_campos_da_entrega(missao),
            reschedules=_historico_de_prazos(missao),
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def xp(self) -> int:
        """Derivado do tipo e da dificuldade, nunca armazenado (A4, C9)."""
        return xp_da_missao(self.mission_type, self.difficulty)

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


class MissionCompletionRead(MissionRead):
    """A resposta da conclusao: o MissionRead de sempre e a recompensa (D14).

    `da_leitura_e_recompensa` monta os campos explicitamente, como
    `MissionRead.da_leitura` -- e nao com `model_dump(exclude=...)` sobre um
    `MissionRead` ja pronto, que dependeria dos nomes exatos dos dois campos
    computados (`xp`, `actual_duration_minutes`) continuarem os mesmos para
    nao duplica-los ou esquece-los.
    """

    reward: RewardRead

    @classmethod
    def da_leitura_e_recompensa(
        cls, lida: MissaoLida, recompensa: RewardRead
    ) -> MissionCompletionRead:
        missao = lida.missao
        return cls(
            id=missao.id,
            instructions=missao.instructions,
            completion_criterion=missao.completion_criterion,
            difficulty=missao.difficulty,
            estimated_minutes=missao.estimated_minutes,
            mission_type=missao.mission_type,
            day=missao.day,
            deadline=lida.deadline,
            availability=lida.availability,
            state=missao.state,
            started_at=missao.started_at,
            completed_at=missao.completed_at,
            **_campos_da_entrega(missao),
            reschedules=_historico_de_prazos(missao),
            reward=recompensa,
        )
