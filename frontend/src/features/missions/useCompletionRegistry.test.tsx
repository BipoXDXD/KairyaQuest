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

describe('useCompletionRegistry -- o rascunho da evidencia', () => {
  it('draftFor devolve o rascunho vazio para missao sem rascunho', () => {
    const { result } = renderRegistry()

    expect(result.current.registry.draftFor(7)).toEqual({ text: '', link: '' })
  })

  it('o rascunho vazio e imutavel: mutar o de uma missao nao contamina o das outras', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    const vazio = registry.draftFor(7) as { text: string; link: string }

    // Modulo ESM roda em strict mode: escrever num objeto congelado lanca.
    expect(() => {
      vazio.text = 'contaminado'
    }).toThrow(TypeError)

    expect(registry.draftFor(8)).toEqual({ text: '', link: '' })
    expect(Object.isFrozen(registry.draftFor(9))).toBe(true)
  })

  it('saveDraft guarda por missao e draftFor devolve o que foi guardado', () => {
    const { result } = renderRegistry()
    const { registry } = result.current

    registry.saveDraft(7, { text: 'Feito', link: 'https://x.com' })

    expect(registry.draftFor(7)).toEqual({ text: 'Feito', link: 'https://x.com' })
    expect(registry.draftFor(8)).toEqual({ text: '', link: '' })
  })

  it('o rascunho sobrevive ao reload do quadro', () => {
    const { result } = renderRegistry()
    result.current.registry.saveDraft(7, { text: 'Feito', link: '' })

    act(() => {
      result.current.reload()
    })

    expect(result.current.registry.draftFor(7)).toEqual({ text: 'Feito', link: '' })
  })

  it('release apaga a chave E o rascunho da missao, e so dela', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(K1).mockReturnValueOnce(K2)
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.saveDraft(7, { text: 'Feito', link: '' })
    registry.saveDraft(8, { text: 'Outra', link: '' })

    registry.release(7)

    expect(registry.draftFor(7)).toEqual({ text: '', link: '' })
    expect(registry.draftFor(8)).toEqual({ text: 'Outra', link: '' })
    expect(registry.operationIdFor(7)).toBe(K2)
    vi.restoreAllMocks()
  })
})
