import { describe, expect, it } from 'vitest'
import { TURNTABLE } from './turntable'

describe('TURNTABLE', () => {
  it('e nulo enquanto o asset nao existe', () => {
    expect(TURNTABLE).toBeNull()
  })
})
