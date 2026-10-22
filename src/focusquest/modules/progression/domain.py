"""Regras puras da progressao: a curva de nivel e o catalogo de conquistas.

Nenhuma funcao daqui toca o banco nem le o relogio (spec, "Dominio puro"). A
migracao 0004 tem COPIAS CONGELADAS destas regras (D8): mudar algo aqui nao
reescreve o passado, e o teste de equivalencia da migracao so vale para a regra
de hoje.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from math import isqrt

from focusquest.modules.missions.cycle_domain import Historico, sequencia_ate
from focusquest.modules.missions.domain import Veredito

# D4: subir do nivel n para o n+1 custa 100*n XP. O XP acumulado para estar
# no nivel L e a soma 100*(1 + 2 + ... + (L-1)) = 50*L*(L-1).
CUSTO_POR_NIVEL = 100


def xp_para_o_nivel(nivel: int) -> int:
    """XP acumulado para ESTAR no nivel `nivel` (o piso do nivel)."""
    if nivel < 1:
        raise ValueError(f"nivel precisa ser >= 1, recebido {nivel}")
    return CUSTO_POR_NIVEL * nivel * (nivel - 1) // 2


def nivel_do_saldo(xp: int) -> int:
    """O maior nivel L com xp_para_o_nivel(L) <= xp, so com inteiros.

    L*(L-1) <= xp/50 equivale a L*(L-1) <= xp//50, porque o lado esquerdo e
    inteiro. A raiz inteira resolve a inequacao sem ponto flutuante: com
    float, saldos grandes arredondariam para o nivel errado bem no piso.
    """
    if xp < 0:
        raise ValueError(f"saldo precisa ser >= 0, recebido {xp}")
    metade = CUSTO_POR_NIVEL // 2
    return (1 + isqrt(1 + 4 * (xp // metade))) // 2


@dataclass(frozen=True)
class FaixaDoNivel:
    """O nivel e os dois pisos que o painel mostra ("340 / 500 XP")."""

    nivel: int
    piso: int
    proximo: int


def faixa_do_nivel(xp: int) -> FaixaDoNivel:
    nivel = nivel_do_saldo(xp)
    return FaixaDoNivel(nivel, xp_para_o_nivel(nivel), xp_para_o_nivel(nivel + 1))


class Codigo(StrEnum):
    """O codigo da conquista: contrato da API e valor da coluna, em ingles."""

    FIRST_STEPS = "first_steps"
    STREAK_7 = "streak_7"
    STREAK_30 = "streak_30"
    VETERAN_10 = "veteran_10"
    VETERAN_50 = "veteran_50"
    VETERAN_100 = "veteran_100"
    # Valor persistido legado: mantém conquistas já concedidas e clientes existentes.
    KAIRYA_PARTNERSHIP = "tifa_partnership"


@dataclass(frozen=True)
class FatosDoUsuario:
    """O que as regras precisam saber do usuario, ja lido do banco."""

    missoes_concluidas: int
    maior_sequencia: int
    concluiu_missao_da_kairya: bool


@dataclass(frozen=True)
class Conquista:
    codigo: Codigo
    titulo: str
    descricao: str
    regra: Callable[[FatosDoUsuario], bool]


# A ordem e a do painel (spec, "Catalogo"). Titulos e descricoes sao texto de
# interface, em pt-BR com acento; trocar um deles nao mexe no banco (D9).
CATALOGO: tuple[Conquista, ...] = (
    Conquista(
        Codigo.FIRST_STEPS,
        "Primeiros passos",
        "Conclua a sua primeira missão.",
        lambda f: f.missoes_concluidas >= 1,
    ),
    Conquista(
        Codigo.STREAK_7,
        "Uma semana inteira",
        "Complete a diária 7 dias seguidos.",
        lambda f: f.maior_sequencia >= 7,
    ),
    Conquista(
        Codigo.STREAK_30,
        "Um mês de hábito",
        "Complete a diária 30 dias seguidos.",
        lambda f: f.maior_sequencia >= 30,
    ),
    Conquista(
        Codigo.VETERAN_10,
        "Veterano I",
        "Conclua 10 missões.",
        lambda f: f.missoes_concluidas >= 10,
    ),
    Conquista(
        Codigo.VETERAN_50,
        "Veterano II",
        "Conclua 50 missões.",
        lambda f: f.missoes_concluidas >= 50,
    ),
    Conquista(
        Codigo.VETERAN_100,
        "Veterano III",
        "Conclua 100 missões.",
        lambda f: f.missoes_concluidas >= 100,
    ),
    Conquista(
        Codigo.KAIRYA_PARTNERSHIP,
        "Parceria com a Kairya",
        "Conclua uma missão proposta pela Kairya.",
        lambda f: f.concluiu_missao_da_kairya,
    ),
)

CONQUISTA_POR_CODIGO: Mapping[Codigo, Conquista] = {c.codigo: c for c in CATALOGO}


def conquistas_satisfeitas(fatos: FatosDoUsuario) -> frozenset[Codigo]:
    """Os codigos cuja regra vale para estes fatos. A regra UNICA (D9)."""
    return frozenset(c.codigo for c in CATALOGO if c.regra(fatos))


def maior_sequencia(historico: Historico) -> int:
    """A maior sequencia JA atingida (D13), nao a atual.

    `sequencia_ate` conta para tras a partir de um dia com a regra do ciclo
    (dia sem plano nao quebra); o maximo sobre todos os dias do historico e a
    maior sequencia que existiu. Quadratico no numero de dias planejados --
    o mesmo custo declarado da C2, desprezivel com usuario unico.
    """
    return max((sequencia_ate(historico, dia) for dia in historico), default=0)


def bonus_da_avaliacao(veredito: Veredito, xp_da_missao: int) -> int:
    """O bonus da avaliacao (E7): metade do XP da missao, para baixo, so no
    `atende`. E a regra UNICA -- o servico chama esta funcao e nao repete a
    conta. O modelo decide o veredito; quanto vale e decisao daqui."""
    return xp_da_missao // 2 if veredito is Veredito.ATENDE else 0
