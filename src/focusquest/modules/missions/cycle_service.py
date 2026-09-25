"""Casos de uso do ciclo diario: criar o plano da semana e ler o ciclo.

Como `service.py`, nada aqui conhece HTTP e nada commita: quem abre a
transacao e quem a fecha. A leitura e sempre DERIVADA (decisao C2): o que esta
revelado, disponivel, perdido ou expirado sai do relogio, do plano e das
conclusoes, e nunca de uma coluna.

A ocultacao (C11) mora em `ler_missao`: o que ainda nao foi revelado levanta
`MissaoNaoEncontradaError`, o MESMO erro de "nao existe". A conclusao usa a
mesma funcao, e e isso que impede a leitura e a conclusao de discordarem
sobre o que existe (decisao P6 do plano do B).
"""

from dataclasses import dataclass
from datetime import date, datetime

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.domain import MissionState
from focusquest.modules.missions.models import Mission


@dataclass(frozen=True)
class MissaoLida:
    """A missao com o que e derivado dela: o prazo e a disponibilidade."""

    missao: Mission
    deadline: datetime
    availability: Availability


def dia_da_diaria(missao: Mission) -> date:
    """O dia de uma diaria. Nulo seria o esquema divergindo do CHECK."""
    if missao.day is None:
        raise RuntimeError(
            f"missao {missao.id} sem dia: o CHECK ck_missions_dia_do_tipo foi violado"
        )
    return missao.day


def leitura_da_avulsa(missao: Mission) -> MissaoLida:
    """A avulsa lida: o prazo e o da coluna, e a disponibilidade so distingue
    concluida (decisao P3 do plano do B) -- a avulsa nao tem regra de dia."""
    if missao.deadline is None:
        raise RuntimeError(
            f"missao {missao.id} sem prazo: o CHECK ck_missions_prazo_do_tipo "
            "foi violado"
        )
    if missao.state is MissionState.CONCLUIDA:
        return MissaoLida(missao, missao.deadline, Availability.CONCLUIDA)
    return MissaoLida(missao, missao.deadline, Availability.DISPONIVEL)
