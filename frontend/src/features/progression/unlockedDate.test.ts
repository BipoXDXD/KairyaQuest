import { describe, expect, it } from 'vitest'
import { formatUnlockedAt } from './unlockedDate'

describe('formatUnlockedAt', () => {
  it('formata o instante em America/Sao_Paulo', () => {
    expect(formatUnlockedAt('2026-09-21T13:02:11Z')).toBe('21/09/2026')
  })

  it('usa o fuso de Sao Paulo, nao o do processo (Asia/Tokyo, ja em 22/09)', () => {
    // 2026-09-22T02:30:00Z sao 23:30 do dia 21 em Sao Paulo (UTC-3), mas ja
    // e dia 22 em Tokyo (UTC+9) -- o caso que um formatador sem `timeZone`
    // erraria, porque o fuso do processo dos testes (TZ=Asia/Tokyo, no
    // vite.config.ts) tem sinal oposto ao de Sao Paulo.
    expect(formatUnlockedAt('2026-09-22T02:30:00Z')).toBe('21/09/2026')
  })
})
