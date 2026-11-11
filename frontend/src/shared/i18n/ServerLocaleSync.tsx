import { useContext, useEffect } from 'react'
import { fetchMe } from '../api/me'
import { ServerSyncContext } from './i18nContext'

/**
 * A sincronizacao do idioma com o servidor no boot. Sem saida visual.
 *
 * Fica fora do `I18nProvider` de proposito: so `main.tsx` a monta, e os
 * testes de componente (que usam `renderWithI18n`) nao fazem `GET /api/me`.
 *
 * Captura a geracao ANTES do pedido: se o usuario trocar o idioma enquanto o
 * GET esta no caminho, o provider descarta o resultado.
 */
export function ServerLocaleSync(): null {
  const sync = useContext(ServerSyncContext)
  if (sync === null) {
    throw new Error('ServerLocaleSync precisa de um <I18nProvider> acima na árvore.')
  }
  const { beginServerSync, applyServerLocale } = sync

  useEffect(() => {
    const controller = new AbortController()
    const generation = beginServerSync()
    void fetchMe(controller.signal).then(
      (me) => {
        // Um `fetch` que resolve apesar do abort (o efeito descartado do
        // StrictMode) nao aplica: senao o caso `null` gravaria duas vezes.
        if (!controller.signal.aborted) {
          applyServerLocale(me.locale, generation)
        }
      },
      () => {
        // GET falhou, corpo fora do contrato ou desmontagem: o idioma local
        // continua valendo, sem mensagem. O proximo boot pergunta de novo.
      },
    )
    return () => {
      controller.abort()
    }
  }, [beginServerSync, applyServerLocale])

  return null
}
