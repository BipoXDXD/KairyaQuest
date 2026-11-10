import type { MessageKey } from './catalog'
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
}

const OPTIONS: readonly LocaleOption[] = [
  { locale: 'pt-BR', code: 'PT', nameKey: 'shell.locale.ptBR' },
  { locale: 'en', code: 'EN', nameKey: 'shell.locale.en' },
]

const BUTTON_CLASS =
  'min-h-11 min-w-11 rounded px-2 text-xs font-semibold tracking-wide focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'
const ACTIVE_CLASS = 'bg-emerald-400 text-slate-950'
const OTHER_CLASS = 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'

/**
 * O seletor de idioma: dois botoes de alternancia, com `aria-pressed` no
 * ativo. Cada botao leva o `lang` do proprio idioma, para o leitor de tela
 * pronunciar o nome na lingua certa. Clicar no idioma ativo nao faz nada.
 */
export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useT()
  return (
    <div role="group" aria-label={t('shell.locale.label')} className="ml-auto flex gap-2">
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
                void setLocale(option.locale)
              }
            }}
            className={`${BUTTON_CLASS} ${active ? ACTIVE_CLASS : OTHER_CLASS}`}
          >
            {option.code}
          </button>
        )
      })}
    </div>
  )
}
