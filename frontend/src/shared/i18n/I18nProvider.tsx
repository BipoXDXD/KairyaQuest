import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { saveLocale, type ServerLocale } from '../api/me'
import { I18nContext, ServerSyncContext } from './i18nContext'
import { initialLocale as bootLocale, openStorage, writeCachedLocale, type Locale } from './locale'

interface I18nProviderProps {
  children: ReactNode
  /** Idioma fixo (testes). Sem ele, vale o cache e depois o navegador. */
  initialLocale?: Locale
}

function browserStorage(): Storage | null {
  return openStorage(() => window.localStorage)
}

/**
 * Guarda o idioma corrente, o espelha em `<html lang>` e no cache local, e
 * grava a troca no servidor (`PATCH /api/me`).
 *
 * O provider nao faz `fetch` no boot: quem le `GET /api/me` e o
 * `ServerLocaleSync`, montado so em `main.tsx`. Assim o `renderWithI18n` dos
 * testes de componente nao ganha um pedido extra.
 *
 * Duas ordens diferentes, com dois mecanismos:
 *
 * - **no cliente**, um contador de geracao: so a operacao mais recente decide
 *   o estado. A resposta de uma troca antiga, ou o boot que comecou antes de
 *   uma troca, nao aplica, nao reverte nem confirma nada;
 * - **no servidor**, uma fila: cada `saveLocale` so parte depois que o
 *   anterior terminou, com sucesso ou falha. O servidor recebe os PATCHes na
 *   ordem em que o usuario agiu, e o ultimo a chegar e a escolha mais recente.
 */
export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? bootLocale(browserStorage(), navigator.language),
  )
  /** O idioma corrente, lido pelos callbacks sem depender do render. */
  const currentLocale = useRef(locale)
  const generation = useRef(0)
  /** A cauda da fila de escritas; nunca rejeita, para a falha nao travar a fila. */
  const writes = useRef<Promise<void>>(Promise.resolve())

  // Layout effect, nao `useEffect`: o `lang` muda no mesmo commit que o resto
  // da tela. Com `useEffect` ele ficava para depois, e a tela chegava a
  // mostrar o aviso de falha, ja em PT, com o `<html lang>` ainda em `en`.
  useLayoutEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const apply = useCallback((next: Locale) => {
    currentLocale.current = next
    setLocaleState(next)
    writeCachedLocale(browserStorage(), next)
  }, [])

  const enqueueSave = useCallback((target: Locale): Promise<void> => {
    const write = writes.current.then(() => saveLocale(target))
    writes.current = write.catch(() => undefined)
    return write
  }, [])

  const setLocale = useCallback(
    async (next: Locale) => {
      const previous = currentLocale.current
      if (next === previous) {
        return
      }
      generation.current += 1
      const mine = generation.current
      apply(next)
      try {
        await enqueueSave(next)
      } catch (error) {
        // Uma troca mais nova ja decidiu o estado: esta falha nao reverte nem
        // avisa. A escolha nova tem a propria escrita na fila.
        if (generation.current === mine) {
          apply(previous)
          throw error
        }
      }
    },
    [apply, enqueueSave],
  )

  const beginServerSync = useCallback(() => generation.current, [])

  const applyServerLocale = useCallback(
    (result: ServerLocale, startedAt: number) => {
      if (generation.current !== startedAt) {
        return
      }
      switch (result.kind) {
        case 'chosen':
          apply(result.locale)
          return
        case 'unset':
          // Ninguem escolheu: o idioma local vira a escolha, para a tutora
          // falar o mesmo idioma da interface desde a primeira pergunta. A
          // falha e silenciosa: a coluna segue `NULL` e o proximo boot tenta
          // de novo.
          writeCachedLocale(browserStorage(), currentLocale.current)
          void enqueueSave(currentLocale.current).catch(() => undefined)
          return
        case 'unknown':
          return
      }
    },
    [apply, enqueueSave],
  )

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  const sync = useMemo(
    () => ({ beginServerSync, applyServerLocale }),
    [beginServerSync, applyServerLocale],
  )

  return (
    <I18nContext value={value}>
      <ServerSyncContext value={sync}>{children}</ServerSyncContext>
    </I18nContext>
  )
}
