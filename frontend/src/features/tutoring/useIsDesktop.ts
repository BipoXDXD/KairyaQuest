import { useSyncExternalStore } from 'react'

/** O `lg` do Tailwind: a partir daqui o painel e lateral; abaixo, folha. */
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * Se a tela e de desktop, acompanhando a janela.
 *
 * `useSyncExternalStore`, e nao `useState` + `useEffect`: o valor e de uma
 * fonte externa ao React, e ler no efeito daria um primeiro render com o
 * layout errado e um segundo corrigindo -- o painel piscaria.
 *
 * O layout nao e decidido so por CSS porque a SEMANTICA muda junto: no
 * celular a conversa e um dialogo modal, com foco e Esc; no desktop e uma
 * regiao da pagina. Atributo ARIA nao tem media query.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
