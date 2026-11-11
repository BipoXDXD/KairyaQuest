import { Fragment, useState } from 'react'
import { translateParts, type MessageKey } from './catalog'
import type { Locale } from './locale'
import { useLocale } from './useLocale'
import { useT } from './useT'

interface LocaleOption {
  locale: Locale
  /** A sigla visivel. E codigo de idioma, igual em qualquer interface. */
  code: string
  /**
   * O nome acessivel: a sigla visivel seguida do endonimo ("PT, Português
   * (Brasil)"). Comecar pelo texto visivel deixa quem usa controle por voz
   * acionar o botao dizendo "PT" (WCAG 2.5.3).
   */
  nameKey: MessageKey
  /**
   * O nome do idioma na propria lingua, igual nos dois catalogos. Entra na
   * mensagem de falha ao salvar ("Não foi possível salvar o idioma English"),
   * com o `lang` do proprio idioma.
   */
  endonymKey: MessageKey
}

const OPTIONS: readonly LocaleOption[] = [
  {
    locale: 'pt-BR',
    code: 'PT',
    nameKey: 'shell.locale.ptBR',
    endonymKey: 'shell.locale.ptBR.endonym',
  },
  { locale: 'en', code: 'EN', nameKey: 'shell.locale.en', endonymKey: 'shell.locale.en.endonym' },
]

const BUTTON_CLASS =
  'min-h-11 min-w-11 rounded px-2 text-xs font-semibold tracking-wide focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'
const ACTIVE_CLASS = 'bg-emerald-400 text-slate-950'
const OTHER_CLASS = 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'

/**
 * O seletor de idioma: dois botoes de alternancia, com `aria-pressed` no
 * ativo. Cada botao leva o `lang` do proprio idioma, para o leitor de tela
 * pronunciar o nome na lingua certa. Clicar no idioma ativo nao faz nada.
 *
 * A troca aplica na hora; se o servidor recusar, o provider volta ao idioma
 * anterior e o seletor avisa na regiao `role="status"`. A regiao existe desde
 * o primeiro render, vazia: o leitor de tela so anuncia mudanca numa regiao
 * viva que ja estava no documento.
 */
export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useT()
  /** O idioma cuja gravacao falhou, ou `null` sem falha a mostrar. */
  const [failed, setFailed] = useState<LocaleOption | null>(null)
  return (
    <div className="ml-auto flex flex-col items-end">
      <div role="group" aria-label={t('shell.locale.label')} className="flex gap-2">
        {OPTIONS.map((option) => {
          const active = option.locale === locale
          return (
            <button
              key={option.locale}
              type="button"
              lang={option.locale}
              aria-label={t(option.nameKey)}
              aria-pressed={active}
              onClick={() => {
                if (!active) {
                  setFailed(null)
                  setLocale(option.locale).catch(() => {
                    setFailed(option)
                  })
                }
              }}
              className={`${BUTTON_CLASS} ${active ? ACTIVE_CLASS : OTHER_CLASS}`}
            >
              {option.code}
            </button>
          )
        })}
      </div>
      <p role="status" className="mt-1 max-w-40 text-right text-xs text-amber-200 empty:mt-0">
        {failed === null
          ? null
          : translateParts(locale, 'shell.locale.saveFailed', {
              language: <span lang={failed.locale}>{t(failed.endonymKey)}</span>,
            }).map((part, index) => <Fragment key={index}>{part}</Fragment>)}
      </p>
    </div>
  )
}
