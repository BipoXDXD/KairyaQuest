import { vi } from 'vitest'

/**
 * `matchMedia` falso: o jsdom nao implementa `window.matchMedia` (chamar
 * lanca TypeError). O painel da Kairya decide entre lateral e folha pelo
 * `(min-width: 1024px)`, e todo teste que monta o painel -- inclusive os da
 * pagina, do App e do main -- precisa declarar em qual tela esta.
 *
 * `setDesktop` muda a resposta e avisa os ouvintes, como o navegador faz
 * quando a janela cruza o limite.
 */
export function stubViewport(kind: 'desktop' | 'mobile'): {
  setDesktop: (desktop: boolean) => void
} {
  let matches = kind === 'desktop'
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matches
    },
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      listeners.delete(listener)
    },
  }))
  return {
    setDesktop: (desktop) => {
      matches = desktop
      for (const listener of listeners) {
        listener()
      }
    },
  }
}
