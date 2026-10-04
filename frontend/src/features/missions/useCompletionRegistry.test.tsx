import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompletionRegistry } from './useCompletionRegistry'

const K1 = '00000000-0000-4000-8000-000000000001'
const K2 = '00000000-0000-4000-8000-000000000002'
const K3 = '00000000-0000-4000-8000-000000000003'

function renderRegistry() {
  const reload = vi.fn()
  const rendered = renderHook(() => useCompletionRegistry(reload))
  return { reload, result: rendered.result }
}

describe('useCompletionRegistry -- as chaves', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('nao gera chave nenhuma antes do primeiro pedido', () => {
    renderRegistry()

    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('devolve a MESMA chave a cada pedido da mesma missao, e uma por missao', () => {
    const { result } = renderRegistry()
    const { registry } = result.current

    expect(registry.operationIdFor(7)).toBe(K1)
    expect(registry.operationIdFor(8)).toBe(K2)
    expect(registry.operationIdFor(7)).toBe(K1)
  })

  it('depois de release, a missao ganha uma chave nova; as outras ficam', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.operationIdFor(8)

    registry.release(7)

    expect(registry.operationIdFor(7)).toBe(K3)
    expect(registry.operationIdFor(8)).toBe(K2)
  })

  it('o registro e o mesmo objeto entre renders -- e o que o faz sobreviver ao reload', () => {
    const { result } = renderRegistry()
    const antes = result.current.registry
    antes.operationIdFor(7)

    act(() => {
      result.current.reload()
    })

    expect(result.current.registry).toBe(antes)
    expect(result.current.registry.operationIdFor(7)).toBe(K1)
  })
})

describe('useCompletionRegistry -- a recarga', () => {
  it('sem conclusao em voo, recarrega na hora e nao entra em espera', () => {
    const { reload, result } = renderRegistry()

    act(() => {
      result.current.reload()
    })

    expect(reload).toHaveBeenCalledTimes(1)
    expect(result.current.waitingForCompletion).toBe(false)
  })

  it('com uma conclusao em voo, espera, e recarrega UMA vez quando ela termina', () => {
    const { reload, result } = renderRegistry()
    result.current.registry.started()

    act(() => {
      result.current.reload()
      result.current.reload()
    })

    expect(reload).not.toHaveBeenCalled()
    expect(result.current.waitingForCompletion).toBe(true)

    act(() => {
      result.current.registry.settled()
    })

    expect(reload).toHaveBeenCalledTimes(1)
    expect(result.current.waitingForCompletion).toBe(false)
  })

  it('com duas em voo, so recarrega quando a ULTIMA termina', () => {
    const { reload, result } = renderRegistry()
    result.current.registry.started()
    result.current.registry.started()
    act(() => {
      result.current.reload()
    })

    act(() => {
      result.current.registry.settled()
    })
    expect(reload).not.toHaveBeenCalled()
    expect(result.current.waitingForCompletion).toBe(true)

    act(() => {
      result.current.registry.settled()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('uma conclusao que termina sem pedido de recarga nao recarrega nada', () => {
    const { reload, result } = renderRegistry()
    result.current.registry.started()

    act(() => {
      result.current.registry.settled()
    })

    expect(reload).not.toHaveBeenCalled()
    expect(result.current.waitingForCompletion).toBe(false)
  })

  it('depois da espera atendida, o pedido seguinte volta a ser imediato', () => {
    const { reload, result } = renderRegistry()
    result.current.registry.started()
    act(() => {
      result.current.reload()
    })
    act(() => {
      result.current.registry.settled()
    })

    act(() => {
      result.current.reload()
    })

    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('reconciliacao de terminais explicitamente lidas', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
  })
  afterEach(() => vi.restoreAllMocks())

  it('libera apenas a chave terminal existente, sem gerar UUID ou recarregar', () => {
    const { result, reload } = renderRegistry()
    const { registry } = result.current
    expect(registry.operationIdFor(7)).toBe(K1)
    expect(registry.operationIdFor(8)).toBe(K2)
    // Uma API ausente falha nesta assercao, antes da verificacao do efeito real.
    expect(() => registry.reconcileCompleted([7, 7, 99])).not.toThrow()
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
    expect(registry.operationIdFor(8)).toBe(K2)
    expect(registry.operationIdFor(7)).toBe(K3)
  })

  it('nao acumula uma terminal que ainda nao tinha chave', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.started()
    registry.reconcileCompleted([7, 99])
    expect(crypto.randomUUID).not.toHaveBeenCalled()
    expect(registry.operationIdFor(7)).toBe(K1)
    act(() => registry.settled())
    expect(registry.operationIdFor(7)).toBe(K1)
  })

  it('conserva candidatas ate o ULTIMO settled, antes da recarga adiada', () => {
    let keyAtReload = ''
    const reload = vi.fn(() => {
      keyAtReload = result.current.registry.operationIdFor(7)
    })
    const { result } = renderHook(() => useCompletionRegistry(reload))
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.operationIdFor(8)
    registry.started()
    registry.started()
    registry.reconcileCompleted([7])
    act(() => result.current.reload())
    expect(registry.operationIdFor(7)).toBe(K1)
    act(() => registry.settled())
    expect(registry.operationIdFor(7)).toBe(K1)
    expect(registry.operationIdFor(8)).toBe(K2)
    expect(reload).not.toHaveBeenCalled()
    act(() => registry.settled())
    expect(keyAtReload).toBe(K3)
    expect(registry.operationIdFor(8)).toBe(K2)
    expect(result.current.waitingForCompletion).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(result.current.registry).toBe(registry)
  })

  it('libera candidatas no ultimo settled mesmo sem recarga pendente', () => {
    const { result, reload } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.started()
    registry.reconcileCompleted([7])
    act(() => registry.settled())
    expect(registry.operationIdFor(7)).toBe(K2)
    expect(reload).not.toHaveBeenCalled()
    registry.started()
    act(() => registry.settled())
    expect(registry.operationIdFor(7)).toBe(K2)
  })

  it('release retira a candidata e nao poda uma chave futura da mesma ID', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.started()
    registry.reconcileCompleted([7])
    registry.release(7)
    expect(registry.operationIdFor(7)).toBe(K2)
    act(() => registry.settled())
    expect(registry.operationIdFor(7)).toBe(K2)
  })

  it('lista vazia conserva as duas chaves e nao cancela candidata comprovada', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.operationIdFor(8)
    registry.reconcileCompleted([])
    expect(registry.operationIdFor(7)).toBe(K1)
    expect(registry.operationIdFor(8)).toBe(K2)
    registry.started()
    registry.reconcileCompleted([7])
    registry.reconcileCompleted([])
    act(() => registry.settled())
    expect(registry.operationIdFor(8)).toBe(K2)
    expect(registry.operationIdFor(7)).toBe(K3)
  })
})
