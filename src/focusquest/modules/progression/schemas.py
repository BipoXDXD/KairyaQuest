"""Contratos HTTP da progressao. Chaves em ingles: contrato externo (README s3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from focusquest.modules.progression.domain import Conquista
from focusquest.modules.progression.service import Progresso, Recompensa


class AchievementRead(BaseModel):
    code: str
    title: str
    description: str
    unlocked_at: datetime | None


class ProgressRead(BaseModel):
    xp_total: int
    level: int
    level_floor_xp: int
    next_level_xp: int
    achievements: list[AchievementRead]

    @classmethod
    def do_progresso(cls, progresso: Progresso) -> ProgressRead:
        return cls(
            xp_total=progresso.xp_total,
            level=progresso.faixa.nivel,
            level_floor_xp=progresso.faixa.piso,
            next_level_xp=progresso.faixa.proximo,
            achievements=[
                AchievementRead(
                    code=item.conquista.codigo.value,
                    title=item.conquista.titulo,
                    description=item.conquista.descricao,
                    unlocked_at=item.unlocked_at,
                )
                for item in progresso.conquistas
            ],
        )


class UnlockedAchievementRead(BaseModel):
    code: str
    title: str
    description: str

    @classmethod
    def da_conquista(cls, conquista: Conquista) -> UnlockedAchievementRead:
        return cls(
            code=conquista.codigo.value,
            title=conquista.titulo,
            description=conquista.descricao,
        )


class RewardRead(BaseModel):
    xp_awarded: int
    xp_total: int
    level_before: int
    level_after: int
    achievements_unlocked: list[UnlockedAchievementRead]

    @classmethod
    def da_recompensa(cls, recompensa: Recompensa) -> RewardRead:
        return cls(
            xp_awarded=recompensa.xp_awarded,
            xp_total=recompensa.xp_total,
            level_before=recompensa.level_before,
            level_after=recompensa.level_after,
            achievements_unlocked=[
                UnlockedAchievementRead.da_conquista(c)
                for c in recompensa.achievements_unlocked
            ],
        )
