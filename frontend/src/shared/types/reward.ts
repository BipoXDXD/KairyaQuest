import type { Mission } from './mission'

/**
 * O contrato da recompensa (`RewardRead`, src/focusquest/modules/progression/schemas.py)
 * como a resposta da conclusao a publica (spec do incremento D, decisao D14,
 * secao "O anuncio no cartao", D16).
 *
 * Os nomes dos campos estao em `snake_case` e em ingles porque sao as chaves do
 * payload -- contrato que atravessa a rede.
 */

/** Uma conquista destravada por esta conclusao, como a API a publica. */
export interface UnlockedAchievement {
  code: string
  title: string
  description: string
}

/**
 * A recompensa de UMA conclusao: o XP ganho e, se mudou, o nivel e as
 * conquistas destravadas por ela -- nunca o saldo atual de outra conclusao
 * (Review Focus 1 das Global Constraints, reenvio antigo).
 */
export interface Reward {
  xp_awarded: number
  xp_total: number
  level_before: number
  level_after: number
  achievements_unlocked: UnlockedAchievement[]
}

/**
 * O contrato de missao concluida como `POST /missions/{id}/complete` o
 * publica desde o incremento D: o `MissionRead` de sempre, com `reward` a
 * mais.
 */
export interface MissionCompletion extends Mission {
  // Opcional e anulavel DE PROPOSITO: o `postJson` nao valida a resposta em
  // tempo de execucao, e um deploy defasado (backend anterior ao incremento
  // D) ou um contrato violado devolve a missao sem `reward` (chave ausente)
  // ou com `"reward": null` explicito -- o padrao do FastAPI/Pydantic para um
  // `Optional[Reward] = None` sem `response_model_exclude_none`. Modelados os
  // dois casos aqui, o TypeScript obriga quem le a ter a guarda contra ambos
  // -- sem ela, o cartao lia `reward.xp_awarded` de `undefined`/`null` e
  // derrubava o quadro inteiro.
  reward?: Reward | null
}
