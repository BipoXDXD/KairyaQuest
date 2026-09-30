"""Regras do ciclo diario, independentes de framework e de persistencia.

Spec: `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`. Tudo aqui e
funcao pura de (plano, conclusoes, instante): nada le o relogio, nada toca o
banco. O estado do ciclo e DERIVADO a cada leitura (decisao C2) -- nao ha job
a meia-noite, e um servidor que ficou fora do ar nao deixa dia por recalcular.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

# C1: o dia e a data civil em Sao Paulo, o mesmo fuso em que a tela apresenta
# (README s8, decisao A3). O `zoneinfo` procura a base do sistema e, sem ela,
# usa o pacote `tzdata`. Nenhum deslocamento fixo e suposto: Sao Paulo ja teve
# horario de verao, e o dia do passado precisa sair certo tambem.
FUSO_DO_CICLO = ZoneInfo("America/Sao_Paulo")

DIAS_DA_SEMANA = 7
# C7: a especial e desbloqueada a cada 7 dias de sequencia.
DIAS_POR_MARCO = 7
# C10: a diaria e a especial cabem num dia (24 h), inclusive na estimativa.
MINUTOS_DO_DIA = 24 * 60

_UM_DIA = timedelta(days=1)


class Availability(StrEnum):
    """A disponibilidade de uma missao, DERIVADA e nunca gravada.

    E diferente do `state` gravado (`pendente`, `em_andamento`, `concluida`),
    que continua existindo: o estado diz o que foi feito; a disponibilidade diz
    o que ainda pode ser feito, e depende do relogio.
    """

    FORA_DO_PLANO = "fora_do_plano"
    BLOQUEADA = "bloqueada"
    DISPONIVEL = "disponivel"
    CONCLUIDA = "concluida"
    PERDIDA = "perdida"
    EXPIRADA = "expirada"


# Onde concluir responde 409 `missao_expirada`: o dia (ou a janela) ja passou,
# ou o dia nem fazia parte do plano. BLOQUEADA nao esta aqui porque nunca chega
# a regra do dia: o que nao foi revelado responde 404 antes (C11).
NAO_CONCLUIVEIS = frozenset(
    {Availability.FORA_DO_PLANO, Availability.PERDIDA, Availability.EXPIRADA}
)


@dataclass(frozen=True)
class DiaDoPlano:
    """O que as regras precisam saber de um dia planejado."""

    concluida: bool
    # A data, em Sao Paulo, em que o plano deste dia foi criado: os dias
    # anteriores a ela sao `fora_do_plano`.
    plano_criado_em: date


# Os dias planejados do usuario, de todas as semanas.
Historico = Mapping[date, DiaDoPlano]


def dia_de(instante: datetime) -> date:
    """A data civil em Sao Paulo de um instante COM fuso."""
    if instante.tzinfo is None:
        raise ValueError("instante sem fuso: o dia do ciclo depende do fuso")
    return instante.astimezone(FUSO_DO_CICLO).date()


def inicio_do_dia(dia: date) -> datetime:
    """A meia-noite que abre o dia em Sao Paulo."""
    return datetime.combine(dia, time.min, tzinfo=FUSO_DO_CICLO)


def fim_do_dia(dia: date) -> datetime:
    """A meia-noite que fecha o dia: o intervalo e semiaberto, e ela ja e do
    dia seguinte. E tambem o prazo derivado da diaria (C10)."""
    return inicio_do_dia(dia + _UM_DIA)


def segunda_da_semana(dia: date) -> date:
    """A segunda-feira que abre a semana do dia (C1)."""
    return dia - timedelta(days=dia.weekday())


def dias_da_semana(segunda: date) -> list[date]:
    return [segunda + timedelta(days=indice) for indice in range(DIAS_DA_SEMANA)]


def disponibilidade_da_diaria(
    dia: date, estado: DiaDoPlano, hoje: date
) -> Availability:
    """A tabela "Estado de disponibilidade" da spec.

    `concluida` vem primeiro: uma diaria feita continua feita em qualquer dia,
    e e isso que faz o reenvio depois da meia-noite nao virar `perdida`.
    """
    if estado.concluida:
        return Availability.CONCLUIDA
    if dia < estado.plano_criado_em:
        return Availability.FORA_DO_PLANO
    if dia > hoje:
        return Availability.BLOQUEADA
    if dia == hoje:
        return Availability.DISPONIVEL
    return Availability.PERDIDA


def sequencia_ate(historico: Historico, dia: date) -> int:
    """Dias seguidos com a diaria concluida, contando de `dia` para tras.

    Dia sem plano e dia `fora_do_plano` sao pulados, sem somar e sem parar
    (C6): sem missao, o usuario nao deixou de fazer nada. Qualquer outro dia
    para a contagem (B1(a): a sequencia e um contador de habito).
    """
    if not historico:
        return 0
    primeiro = min(historico)
    contagem = 0
    while dia >= primeiro:
        estado = historico.get(dia)
        if estado is not None and dia >= estado.plano_criado_em:
            if not estado.concluida:
                break
            contagem += 1
        dia -= _UM_DIA
    return contagem


def sequencia(historico: Historico, hoje: date) -> int:
    """A sequencia atual: comeca hoje, se a diaria de hoje foi concluida, ou
    ontem, se ela ainda esta em aberto -- o dia de hoje nao quebra nada antes
    de terminar."""
    estado = historico.get(hoje)
    if estado is not None and estado.concluida:
        return sequencia_ate(historico, hoje)
    return sequencia_ate(historico, hoje - _UM_DIA)


def dias_para_o_marco(sequencia_atual: int) -> int:
    """Quantos dias faltam para o proximo marco; 7 quando a sequencia e zero
    ou acabou de bater um marco."""
    return DIAS_POR_MARCO - sequencia_atual % DIAS_POR_MARCO


def marco_da_semana(historico: Historico, segunda: date) -> date | None:
    """O dia da semana em que a sequencia bateu um multiplo de 7, se houve.

    Cada semana tem no maximo um marco (C7): dois multiplos de 7 da mesma
    sequencia ficam 7 dias um do outro.
    """
    for dia in dias_da_semana(segunda):
        estado = historico.get(dia)
        if (
            estado is not None
            and estado.concluida
            and sequencia_ate(historico, dia) % DIAS_POR_MARCO == 0
        ):
            return dia
    return None


def marco_mais_recente(historico: Historico, hoje: date) -> date | None:
    """O marco da semana atual ou, sem ele, o da semana anterior.

    Mais para tras nao precisa: a janela da especial acaba no fim do dia
    seguinte ao marco, e o marco mais tardio da semana anterior (o domingo)
    ainda tem a janela aberta na segunda.
    """
    segunda = segunda_da_semana(hoje)
    atual = marco_da_semana(historico, segunda)
    if atual is not None:
        return atual
    return marco_da_semana(historico, segunda - timedelta(days=DIAS_DA_SEMANA))


def fim_da_janela_da_especial(marco: date) -> datetime:
    """C8: a especial fica disponivel do marco ate o fim do dia seguinte. E
    tambem o prazo derivado da especial."""
    return fim_do_dia(marco + _UM_DIA)


def disponibilidade_da_especial(
    marco: date | None, concluida: bool, agora: datetime
) -> Availability:
    """A tabela "Missao especial" da spec."""
    if concluida:
        return Availability.CONCLUIDA
    if marco is None:
        return Availability.BLOQUEADA
    if agora < fim_da_janela_da_especial(marco):
        return Availability.DISPONIVEL
    return Availability.EXPIRADA


# F25 (pendencia 115): o que ja venceu e pode ser reaberto pela conclusao tardia.
# FORA_DO_PLANO nao entra: o que nao era do plano nunca pode ter sido iniciado.
_VENCIDAS = frozenset({Availability.PERDIDA, Availability.EXPIRADA})


def limite_da_conclusao_tardia(prazo: datetime) -> datetime:
    """F25: a missao iniciada a tempo pode ser concluida ate o fim do dia
    civil que o prazo abre -- o prazo e sempre uma meia-noite de Sao Paulo, e
    o limite e a meia-noite seguinte. Para a diaria de quarta: sexta 00:00.

    E o mesmo desenho da janela da especial (C8), e garante que a diaria
    concluida com atraso que bate um marco ainda encontra a janela da
    especial aberta (ela vai ate o fim do dia seguinte ao marco)."""
    return fim_do_dia(dia_de(prazo))


def com_inicio_a_tempo(
    disponibilidade: Availability,
    prazo: datetime,
    iniciada_em: datetime | None,
    agora: datetime,
) -> Availability:
    """F25: a missao vencida (perdida ou expirada) que foi INICIADA antes do
    prazo volta a ser `disponivel` ate o limite da conclusao tardia.

    A pessoa comecou a tempo: prender a missao em `em_andamento` para sempre
    seria a perda destrutiva que o README s5 proibe. So quem nunca comecou
    (pendente) continua perdida depois do prazo. `disponivel` aqui so serve
    para concluir: iniciar de novo e `transicao_ilegal`, porque ja esta em
    andamento.
    """
    if (
        disponibilidade in _VENCIDAS
        and iniciada_em is not None
        and iniciada_em < prazo
        and agora < limite_da_conclusao_tardia(prazo)
    ):
        return Availability.DISPONIVEL
    return disponibilidade


def na_conclusao_tardia(
    prazo: datetime,
    disponibilidade: Availability,
    concluida_em: datetime | None,
    agora: datetime,
) -> bool:
    """F25: depois do prazo, a missao continua a vista no Quartel-General
    enquanto pode ser concluida com atraso (`disponivel` pela
    `com_inicio_a_tempo`) e, depois de concluida com atraso, ate o limite --
    o `refresh` que segue a conclusao nao pode tirar da tela o cartao que
    acabou de concluir (e o anuncio da recompensa que mora nele)."""
    if agora < prazo:
        return False
    if disponibilidade is Availability.DISPONIVEL:
        return True
    return (
        concluida_em is not None
        and concluida_em >= prazo
        and agora < limite_da_conclusao_tardia(prazo)
    )
