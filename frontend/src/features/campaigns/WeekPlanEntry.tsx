import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { formatCivilDate } from '../../shared/lib/civilDate'
import { Button, StatusLine } from '../../shared/ui'
import { useKairya } from '../kairya'
import { WeekPlanForm } from './WeekPlanForm'

/**
 * A entrada do formulario de plano na tela "sem plano": um botao primario que
 * abre o formulario no lugar (inline, sem modal), com o foco no primeiro
 * campo. Cancelar fecha e devolve o foco ao botao.
 *
 * Quem chama passa o que a tela dele sabe fazer:
 * - `onCreated`: o plano foi criado; recarregue a leitura e leve o foco ao
 *   titulo da secao (o formulario sai de cena quando o plano aparece). A
 *   Kairya comemora aqui.
 * - `onExists`: a semana ja tinha plano; so recarregue.
 */
export function WeekPlanEntry({
  onCreated,
  onExists,
}: {
  onCreated: () => void
  onExists: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const { dispatch } = useKairya()
  const [open, setOpen] = useState(false)
  // A segunda (data civil) do plano da semana SEGUINTE recem-criado, ou `null`.
  const [createdNext, setCreatedNext] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const confirmation = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  // Fechou: o formulario saiu do documento com o foco dentro dele, e o foco
  // volta ao unico botao que sobra.
  useEffect(() => {
    if (wasOpen.current && !open && createdNext === null) {
      root.current?.querySelector('button')?.focus()
    }
    wasOpen.current = open
  }, [open, createdNext])
  // A confirmacao nasce com o foco: o formulario, que o tinha, acabou de sair.
  useEffect(() => {
    if (createdNext !== null) {
      confirmation.current?.focus()
    }
  }, [createdNext])
  return (
    <div ref={root} className="flex flex-col gap-4">
      {createdNext !== null && (
        <div
          ref={confirmation}
          tabIndex={-1}
          data-testid="week-plan-created-next"
          className="rounded-ui focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <StatusLine tone="success">
            {t('campaigns.form.createdNext', { date: formatCivilDate(createdNext, locale) })}
          </StatusLine>
        </div>
      )}
      {open ? (
        <WeekPlanForm
          onCreated={(week, weekStart) => {
            dispatch({ type: 'say', topic: 'weekPlanCreated' })
            if (week === 'next') {
              // A trilha e o ciclo so leem a semana atual: nada a recarregar.
              setCreatedNext(weekStart)
              setOpen(false)
              return
            }
            onCreated()
          }}
          onExists={onExists}
          onCancel={() => {
            setOpen(false)
          }}
        />
      ) : (
        <Button
          variant="primary"
          data-testid="week-plan-open"
          onClick={() => {
            setCreatedNext(null)
            setOpen(true)
          }}
        >
          {t('campaigns.form.open')}
        </Button>
      )}
    </div>
  )
}
