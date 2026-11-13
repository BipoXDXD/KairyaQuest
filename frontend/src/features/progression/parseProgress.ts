import { ApiError } from '../../shared/api/client'
import type { Progress } from './types'

/**
 * O status do corpo que chega aqui: o parse so roda depois de uma resposta de
 * sucesso, que o cliente ja conferiu.
 */
const SUCCESS_STATUS = 200

/**
 * Converte o corpo de `GET /api/progress` em `Progress`, recusando na
 * FRONTEIRA o custo de nivel (`next_level_xp - level_floor_xp`) que nao e
 * positivo. Esse custo e o divisor da barra de XP: zero ou negativo nao e um
 * nivel, e um defeito de contrato que a tela nao deve desenhar.
 *
 * A recusa sai como `ApiError` `format`, o texto "formato inesperado" do
 * catalogo. `!(custo > 0)` recusa tambem o `NaN` de campos ausentes ou que nao
 * sao numero. O resto do corpo segue sem validacao, como em todo o cliente
 * (`send`, em `shared/api/client.ts`).
 */
export function parseProgress(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) {
    throw formatError()
  }
  const progress = raw as Progress
  const levelCost = progress.next_level_xp - progress.level_floor_xp
  if (!(levelCost > 0)) {
    throw formatError()
  }
  return progress
}

function formatError(): ApiError {
  return new ApiError('A resposta chegou num formato inesperado.', SUCCESS_STATUS, null, {
    kind: 'format',
  })
}
