import { Fragment, useRef, useState } from 'react'
import { translateParts, type MessageKey } from '../i18n/catalog'
import type { Locale } from '../i18n/locale'
import { useLocale } from '../i18n/useLocale'
import { useT } from '../i18n/useT'
import { Button } from './Button'
import { StatusLine } from './StatusLine'

interface LocaleOption {
  locale: Locale
  /** A sigla visível. É código de idioma, igual em qualquer interface. */
  shortKey: MessageKey
  /**
   * O nome acessível: a sigla visível seguida do endônimo ("PT, Português
   * (Brasil)"), já montado assim no catálogo da F3. Começar pelo texto
   * visível deixa quem usa controle por voz acionar o botão dizendo "PT"
   * (WCAG 2.5.3); o teste confere que um começa pelo outro.
   */
  nameKey: MessageKey
  /**
   * O nome do idioma na própria língua, igual nos dois catálogos. Entra na
   * mensagem de falha ao salvar ("Não foi possível salvar o idioma English"),
   * com o `lang` do próprio idioma (WCAG 3.1.2).
   */
  endonymKey: MessageKey
}

const OPTIONS: readonly LocaleOption[] = [
  {
    locale: 'pt-BR',
    shortKey: 'ui.language.short.ptBR',
    nameKey: 'shell.locale.ptBR',
    endonymKey: 'shell.locale.ptBR.endonym',
  },
  {
    locale: 'en',
    shortKey: 'ui.language.short.en',
    nameKey: 'shell.locale.en',
    endonymKey: 'shell.locale.en.endonym',
  },
]

/**
 * O seletor de idioma: dois botões terciários de alternância, com
 * `aria-pressed`, marcador `aria-hidden` e sublinhado grosso no ativo
 * (o `hover:underline` do terciário imita o sublinhado, não o marcador).
 * Cada botão leva o `lang` do próprio idioma, para o leitor de tela
 * pronunciar o nome na língua certa.
 * Clicar no idioma ativo não faz nada.
 *
 * A falha ao salvar aparece numa `StatusLine` montada desde o início (uma
 * live region que nasce com conteúdo pode ficar muda) e escondida só da vista
 * (`sr-only`) enquanto vazia, para o ícone do tom não aparecer sozinho.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [failed, setFailed] = useState<LocaleOption | null>(null)
  // Só a tentativa mais recente fala: a rejeição atrasada de uma anterior não
  // pode anunciar falha depois que a nova já trocou o idioma.
  const latestAttempt = useRef(0)

  function choose(option: LocaleOption) {
    latestAttempt.current += 1
    const attempt = latestAttempt.current
    setFailed(null)
    setLocale(option.locale).catch(() => {
      if (attempt === latestAttempt.current) {
        setFailed(option)
      }
    })
  }

  return (
    <div className="ml-auto flex flex-col items-end gap-2">
      <div role="group" aria-label={t('shell.locale.label')} className="flex gap-2">
        {OPTIONS.map((option) => {
          const active = option.locale === locale
          return (
            <Button
              key={option.locale}
              variant="tertiary"
              lang={option.locale}
              aria-label={t(option.nameKey)}
              aria-pressed={active}
              onClick={() => {
                if (!active) {
                  choose(option)
                }
              }}
            >
              {active && (
                <span
                  aria-hidden="true"
                  data-testid="language-current-marker"
                  className="inline-flex shrink-0"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <circle cx="12" cy="12" r="6" />
                  </svg>
                </span>
              )}
              <span className={active ? 'underline decoration-2 underline-offset-4' : undefined}>
                {t(option.shortKey)}
              </span>
            </Button>
          )
        })}
      </div>
      <div className={failed === null ? 'sr-only' : undefined}>
        <StatusLine tone="danger">
          {failed === null
            ? ''
            : translateParts(locale, 'shell.locale.saveFailed', {
                language: <span lang={failed.locale}>{t(failed.endonymKey)}</span>,
              }).map((part, index) => <Fragment key={index}>{part}</Fragment>)}
        </StatusLine>
      </div>
    </div>
  )
}
