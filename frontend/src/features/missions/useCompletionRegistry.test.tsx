import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompletionRegistry } from './useCompletionRegistry'

const K1 = '00000000-0000-4000-8000-000000000001'
const K2 = '00000000-0000-4000-8000-000000000002'
const K3 = '00000000-0000-4000-8000-000000000003'
const K4 = '00000000-0000-4000-8000-000000000004'
const K5 = '00000000-0000-4000-8000-000000000005'

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
    // O cast tira o `Readonly` do tipo de proposito: o teste precisa TENTAR
    // escrever para provar que o objeto e congelado em tempo de execucao, e o
    // compilador recusaria a escrita num tipo somente-leitura.
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

  // E17/§7: a chave e o rascunho saem por caminhos DIFERENTES. A falha sem
  // retry libera a chave, mas o rascunho so sai no sucesso.
  it('release apaga SO a chave da missao; o rascunho fica', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(K1).mockReturnValueOnce(K2)
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.saveDraft(7, { text: 'Feito', link: '' })

    registry.release(7)

    expect(registry.draftFor(7)).toEqual({ text: 'Feito', link: '' })
    expect(registry.operationIdFor(7)).toBe(K2)
    vi.restoreAllMocks()
  })

  it('discardDraft apaga SO o rascunho da missao, e so dela; a chave fica', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(K1).mockReturnValueOnce(K2)
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.saveDraft(7, { text: 'Feito', link: '' })
    registry.saveDraft(8, { text: 'Outra', link: '' })

    registry.discardDraft(7)

    expect(registry.draftFor(7)).toEqual({ text: '', link: '' })
    expect(registry.draftFor(8)).toEqual({ text: 'Outra', link: '' })
    expect(registry.operationIdFor(7)).toBe(K1)
    vi.restoreAllMocks()
  })
})

describe('useCompletionRegistry -- retry pendente', () => {
  it('comeca sem retry pendente, e marca e desmarca por missao', () => {
    const { result } = renderRegistry()
    const { registry } = result.current

    expect(registry.isRetryPending(7)).toBe(false)
    registry.markRetryPending(7)

    expect(registry.isRetryPending(7)).toBe(true)
    expect(registry.isRetryPending(8)).toBe(false)
  })

  it('release limpa o retry pendente da missao (a chave saiu), e so dela', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.markRetryPending(7)
    registry.markRetryPending(8)

    registry.release(7)

    expect(registry.isRetryPending(7)).toBe(false)
    expect(registry.isRetryPending(8)).toBe(true)
  })
})

describe('useCompletionRegistry -- as chaves de iniciar e reagendar', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
      .mockReturnValueOnce(K4)
      .mockReturnValueOnce(K5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devolve a MESMA chave a cada pedido da mesma acao da mesma missao', () => {
    const { result } = renderRegistry()
    const { registry } = result.current

    expect(registry.actionKeyFor(7, 'start')).toBe(K1)
    expect(registry.actionKeyFor(7, 'start')).toBe(K1)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('cada tipo de operacao tem a sua chave: Concluir, Iniciar e Reagendar nunca a dividem', () => {
    // A UNIQUE do banco e sobre a chave, seja qual for a operacao (F2): a chave
    // do Concluir gasta num Iniciar faria o Concluir falhar com
    // `operacao_reutilizada`. Por isso as tres chaves da mesma missao sao tres.
    const { result } = renderRegistry()
    const { registry } = result.current

    const concluir = registry.operationIdFor(7)
    const iniciar = registry.actionKeyFor(7, 'start')
    const reagendar = registry.actionKeyFor(7, 'reschedule')

    expect([concluir, iniciar, reagendar]).toEqual([K1, K2, K3])
  })

  it('cada missao tem a sua chave de cada acao', () => {
    const { result } = renderRegistry()
    const { registry } = result.current

    expect(registry.actionKeyFor(7, 'start')).toBe(K1)
    expect(registry.actionKeyFor(8, 'start')).toBe(K2)
    expect(registry.actionKeyFor(7, 'start')).toBe(K1)
  })

  it('releaseActionKey troca SO a chave daquela acao daquela missao', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.actionKeyFor(7, 'start')
    registry.actionKeyFor(7, 'reschedule')
    registry.actionKeyFor(8, 'start')

    registry.releaseActionKey(7, 'start')

    expect(registry.actionKeyFor(7, 'start')).toBe(K5)
    // As outras tres ficam.
    expect(registry.operationIdFor(7)).toBe(K1)
    expect(registry.actionKeyFor(7, 'reschedule')).toBe(K3)
    expect(registry.actionKeyFor(8, 'start')).toBe(K4)
  })

  it('o release do Concluir nao toca as chaves de iniciar e reagendar', () => {
    const { result } = renderRegistry()
    const { registry } = result.current
    registry.operationIdFor(7)
    registry.actionKeyFor(7, 'start')
    registry.actionKeyFor(7, 'reschedule')

    registry.release(7)

    expect(registry.actionKeyFor(7, 'start')).toBe(K2)
    expect(registry.actionKeyFor(7, 'reschedule')).toBe(K3)
  })

  it('as chaves de acao sobrevivem ao reload: o registro e o mesmo objeto', () => {
    const { result } = renderRegistry()
    result.current.registry.actionKeyFor(7, 'reschedule')

    act(() => {
      result.current.reload()
    })

    expect(result.current.registry.actionKeyFor(7, 'reschedule')).toBe(K1)
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

it('a leitura terminal libera retry de concluir, preservando o rascunho e as chaves do F', () => {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce(K1)
    .mockReturnValueOnce(K2)
    .mockReturnValueOnce(K3)
    .mockReturnValueOnce(K4)
  const { result } = renderRegistry()
  const { registry } = result.current
  registry.operationIdFor(7)
  registry.markRetryPending(7)
  registry.saveDraft(7, { text: 'Minha entrega preservada', link: 'https://exemplo.test' })
  expect(registry.actionKeyFor(7, 'start')).toBe(K2)
  expect(registry.actionKeyFor(7, 'reschedule')).toBe(K3)
  registry.reconcileCompleted([7])
  expect(registry.operationIdFor(7)).toBe(K4)
  expect(registry.isRetryPending(7)).toBe(false)
  expect(registry.draftFor(7)).toEqual({
    text: 'Minha entrega preservada',
    link: 'https://exemplo.test',
  })
  expect(registry.actionKeyFor(7, 'start')).toBe(K2)
  expect(registry.actionKeyFor(7, 'reschedule')).toBe(K3)
  vi.restoreAllMocks()
})
