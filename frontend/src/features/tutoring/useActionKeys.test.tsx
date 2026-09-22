import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActionKeys } from './useActionKeys'

describe('useActionKeys', () => {
  it('a chave nasce na primeira pergunta e se repete ate ser solta', () => {
    const { result } = renderHook(() => useActionKeys())
    const primeira = result.current.operationIdFor(5)
    expect(result.current.operationIdFor(5)).toBe(primeira)
    expect(result.current.operationIdFor(6)).not.toBe(primeira)
    result.current.release(5)
    expect(result.current.operationIdFor(5)).not.toBe(primeira)
  })

  it('o registro sobrevive a novos renders', () => {
    const { result, rerender } = renderHook(() => useActionKeys())
    const chave = result.current.operationIdFor(5)
    const registro = result.current
    rerender()
    expect(result.current.operationIdFor(5)).toBe(chave)
    // O mesmo objeto: quem o poe numa lista de dependencias nao recria nada.
    expect(result.current).toBe(registro)
  })
})
