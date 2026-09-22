import { afterEach, describe, expect, it, vi } from 'vitest'
import { PANEL_OPEN_KEY, readPanelOpen, writePanelOpen } from './panelPreference'

describe('panelPreference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('sem nada gravado, o painel comeca aberto', () => {
    expect(readPanelOpen()).toBe(true)
  })

  it('grava e le o fechado e o aberto', () => {
    writePanelOpen(false)
    expect(localStorage.getItem(PANEL_OPEN_KEY)).toBe('false')
    expect(readPanelOpen()).toBe(false)
    writePanelOpen(true)
    expect(readPanelOpen()).toBe(true)
  })

  it('um valor estranho conta como aberto', () => {
    localStorage.setItem(PANEL_OPEN_KEY, 'talvez')
    expect(readPanelOpen()).toBe(true)
  })

  it('armazenamento que lanca na leitura: aberto, sem quebrar', () => {
    // Navegacao privada, cota estourada, armazenamento bloqueado.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(readPanelOpen()).toBe(true)
  })

  it('armazenamento que lanca na escrita: nao quebra', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError')
    })
    expect(() => {
      writePanelOpen(false)
    }).not.toThrow()
  })
})
