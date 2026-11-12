import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefCallback,
} from 'react'
import { MUTATION_TIMEOUT_MS, postJson } from '../../shared/api/client'
import type { MessageKey } from '../../shared/i18n/catalog'
import type { Locale } from '../../shared/i18n/locale'
import { plural } from '../../shared/i18n/plural'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT, type Translate } from '../../shared/i18n/useT'
import { formatCivilDate } from '../../shared/lib/civilDate'
import { Badge, Button, Field, Panel, StatusLine, type StatusTone } from '../../shared/ui'
import { addCivilDays, weekStartsOf, type WeekChoice } from './planDates'
import { describePlanFailure, type PlanFailure } from './planFailure'
import type { Plan } from './types'
import {
  COUNTER_VISIBLE_FROM,
  MAX_DIFFICULTY,
  MAX_MINUTES,
  MAX_TEXT_LENGTH,
  MIN_DIFFICULTY,
  MIN_MINUTES,
  copyMondayToUntouched,
  dayFieldKey,
  emptyDraft,
  isDayReady,
  toPlanBody,
  trialFieldKey,
  validateDraft,
  type DayDraft,
  type FieldError,
  type PlanDraft,
  type TrialDraft,
} from './weekPlanDraft'

const WEEKS: readonly WeekChoice[] = ['current', 'next']

const WEEK_LABEL: Record<WeekChoice, MessageKey> = {
  current: 'campaigns.form.week.current',
  next: 'campaigns.form.week.next',
}

const ERROR_TEXT: Record<FieldError, MessageKey> = {
  required: 'campaigns.form.error.required',
  tooLong: 'campaigns.form.error.tooLong',
  minutesRange: 'campaigns.form.error.minutesRange',
  invalidChars: 'campaigns.form.error.invalidChars',
}

const DIFFICULTIES = Array.from(
  { length: MAX_DIFFICULTY - MIN_DIFFICULTY + 1 },
  (_, index) => MIN_DIFFICULTY + index,
)

const LEGEND_CLASS = 'mb-2 font-body text-base font-bold text-text-primary'
const FIELDSET_CLASS = 'flex min-w-0 flex-col gap-4'

/** O que a linha de status diz agora; o rascunho e as falhas de campo vivem fora dele. */
type Notice =
  | { kind: 'none' }
  | { kind: 'copied' }
  | { kind: 'sending' }
  | { kind: 'created' }
  | { kind: 'failed'; failure: PlanFailure }

function failureText(failure: PlanFailure, t: Translate): string {
  return failure.recovery === undefined
    ? t(failure.message)
    : `${t(failure.message)} ${t(failure.recovery)}`
}

/** A linha de status: texto e tom, ou texto vazio no repouso (a `StatusLine` fica montada). */
function statusOf(
  notice: Notice,
  summaryCount: number,
  t: Translate,
  locale: Locale,
): { tone: StatusTone; text: string } {
  if (notice.kind === 'failed') {
    return { tone: 'danger', text: failureText(notice.failure, t) }
  }
  if (notice.kind === 'created') {
    return { tone: 'success', text: t('campaigns.form.success') }
  }
  if (summaryCount > 0) {
    const key = plural(locale, summaryCount, {
      one: 'campaigns.form.error.summary.one',
      other: 'campaigns.form.error.summary.other',
    })
    return { tone: 'danger', text: t(key, { n: summaryCount }) }
  }
  if (notice.kind === 'copied') {
    return { tone: 'neutral', text: t('campaigns.form.copyMonday.done') }
  }
  return { tone: 'neutral', text: '' }
}

interface Binding {
  /** O erro a mostrar neste campo agora, ou `undefined`. */
  error: (key: string) => string | undefined
  touch: (key: string) => void
  register: (key: string) => RefCallback<HTMLElement>
}

function TextArea({
  fieldKey,
  label,
  help,
  value,
  bind,
  onChange,
}: {
  fieldKey: string
  label: string
  help: string
  value: string
  bind: Binding
  onChange: (value: string) => void
}) {
  const t = useT()
  const used = value.length
  const counter =
    used >= COUNTER_VISIBLE_FROM
      ? ` ${t('campaigns.form.counter', { used, max: MAX_TEXT_LENGTH })}`
      : ''
  return (
    <Field label={label} help={`${help}${counter}`} error={bind.error(fieldKey)}>
      {(control) => (
        <textarea
          {...control}
          ref={bind.register(fieldKey)}
          data-testid={`week-plan-${fieldKey}`}
          rows={3}
          maxLength={MAX_TEXT_LENGTH}
          required
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          onBlur={() => {
            bind.touch(fieldKey)
          }}
        />
      )}
    </Field>
  )
}

function MinutesInput({
  fieldKey,
  value,
  bind,
  onChange,
}: {
  fieldKey: string
  value: string
  bind: Binding
  onChange: (value: string) => void
}) {
  const t = useT()
  return (
    <Field label={t('campaigns.form.field.minutes')} error={bind.error(fieldKey)}>
      {(control) => (
        <input
          {...control}
          ref={bind.register(fieldKey)}
          data-testid={`week-plan-${fieldKey}`}
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          step={1}
          required
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          onBlur={() => {
            bind.touch(fieldKey)
          }}
        />
      )}
    </Field>
  )
}

function DifficultySelect({
  fieldKey,
  value,
  bind,
  onChange,
}: {
  fieldKey: string
  value: number
  bind: Binding
  onChange: (value: number) => void
}) {
  const t = useT()
  return (
    <Field label={t('campaigns.form.field.difficulty')} error={bind.error(fieldKey)}>
      {(control) => (
        <select
          {...control}
          ref={bind.register(fieldKey)}
          data-testid={`week-plan-${fieldKey}`}
          required
          value={value}
          onChange={(event) => {
            onChange(Number(event.target.value))
          }}
        >
          {DIFFICULTIES.map((n) => (
            <option key={n} value={n}>
              {t('campaigns.form.field.difficulty.option', { n })}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function DayFields({
  index,
  day,
  bind,
  onChange,
}: {
  index: number
  day: DayDraft
  bind: Binding
  onChange: (patch: Partial<DayDraft>) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4 pt-4">
      <TextArea
        fieldKey={dayFieldKey(index, 'instructions')}
        label={t('campaigns.form.field.instructions')}
        help={t('campaigns.form.field.instructions.help')}
        value={day.instructions}
        bind={bind}
        onChange={(instructions) => {
          onChange({ instructions })
        }}
      />
      <TextArea
        fieldKey={dayFieldKey(index, 'criterion')}
        label={t('campaigns.form.field.criterion')}
        help={t('campaigns.form.field.criterion.help')}
        value={day.criterion}
        bind={bind}
        onChange={(criterion) => {
          onChange({ criterion })
        }}
      />
      <DifficultySelect
        fieldKey={dayFieldKey(index, 'difficulty')}
        value={day.difficulty}
        bind={bind}
        onChange={(difficulty) => {
          onChange({ difficulty })
        }}
      />
      <MinutesInput
        fieldKey={dayFieldKey(index, 'minutes')}
        value={day.minutes}
        bind={bind}
        onChange={(minutes) => {
          onChange({ minutes })
        }}
      />
    </div>
  )
}

function TrialFields({
  trial,
  bind,
  onChange,
}: {
  trial: TrialDraft
  bind: Binding
  onChange: (patch: Partial<TrialDraft>) => void
}) {
  const t = useT()
  return (
    <>
      <TextArea
        fieldKey={trialFieldKey('instructions')}
        label={t('campaigns.form.field.instructions')}
        help={t('campaigns.form.field.instructions.help')}
        value={trial.instructions}
        bind={bind}
        onChange={(instructions) => {
          onChange({ instructions })
        }}
      />
      <TextArea
        fieldKey={trialFieldKey('criterion')}
        label={t('campaigns.form.field.criterion')}
        help={t('campaigns.form.field.criterion.help')}
        value={trial.criterion}
        bind={bind}
        onChange={(criterion) => {
          onChange({ criterion })
        }}
      />
      <MinutesInput
        fieldKey={trialFieldKey('minutes')}
        value={trial.minutes}
        bind={bind}
        onChange={(minutes) => {
          onChange({ minutes })
        }}
      />
    </>
  )
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className={FIELDSET_CLASS}>
      <legend className={LEGEND_CLASS}>{legend}</legend>
      {children}
    </fieldset>
  )
}

/**
 * O formulario do plano da semana (#142): a semana, sete treinos e a prova.
 *
 * Decisoes, cada uma com o motivo:
 *
 * - **As segundas-feiras sao fixadas na abertura** (`weekStartsOf(new Date())`
 *   num `useState`): os rotulos dos dias e o `week_start` enviado saem do mesmo
 *   valor, entao a tela nunca mostra um dia e manda outro. Se a aba atravessar
 *   o domingo, o servidor responde `semana_encerrada` e a tela sugere a seguinte.
 * - **O erro e derivado do rascunho**, nao guardado: aparece no campo depois do
 *   saida do campo ou do primeiro envio, e some quando a pessoa corrige. O envio invalido
 *   abre o treino do primeiro campo ruim e leva o foco a ele.
 * - **Nada invalido vai a API**: `toPlanBody` so roda com `validateDraft` vazio,
 *   e e ele que converte o texto da tela em numero e tira as pontas do texto.
 * - **Toda falha preserva o rascunho**; o botao volta a habilitar. `plano_existente`
 *   na semana atual chama `onExists` (a trilha recarrega e mostra o plano) e
 *   `semana_encerrada` marca a semana seguinte.
 * - **Sucesso** (201) chama `onCreated`, e o dono da tela recarrega a trilha.
 *   O botao continua ocupado ate o formulario sair: reenviar daria
 *   `plano_existente`.
 * - **A linha de status e uma so, montada desde o inicio** (uma live region que
 *   nasce com conteudo pode ficar muda) e escondida so da vista enquanto vazia.
 */
export function WeekPlanForm({
  onCreated,
  onExists,
  onCancel,
}: {
  /** O servidor criou o plano (201). */
  onCreated: (week: WeekChoice, weekStart: string) => void
  /** A semana atual ja tinha plano (409): quem chama recarrega para mostra-lo. */
  onExists: () => void
  onCancel: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const titleId = useId()
  const weekName = useId()
  const [weeks] = useState(() => weekStartsOf(new Date()))
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft)
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [attempted, setAttempted] = useState(false)
  const [notice, setNotice] = useState<Notice>({ kind: 'none' })
  const [openDays, setOpenDays] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [focusRequest, setFocusRequest] = useState<{ key: string } | null>(null)
  const fields = useRef(new Map<string, HTMLElement>())
  const firstRadio = useRef<HTMLInputElement>(null)
  const statusBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    firstRadio.current?.focus()
  }, [])
  useEffect(() => {
    if (focusRequest !== null) {
      fields.current.get(focusRequest.key)?.focus()
    }
  }, [focusRequest])

  const issues = validateDraft(draft)
  const invalidKeys = new Map(issues.map((issue) => [issue.key, issue.error]))
  const bind: Binding = {
    error: (key) => {
      const error = invalidKeys.get(key)
      return error !== undefined && (attempted || touched.has(key))
        ? t(ERROR_TEXT[error], { max: MAX_TEXT_LENGTH })
        : undefined
    },
    touch: (key) => {
      setTouched((previous) => new Set(previous).add(key))
    },
    register: (key) => (node) => {
      if (node === null) {
        fields.current.delete(key)
      } else {
        fields.current.set(key, node)
      }
    },
  }

  const busy = notice.kind === 'sending' || notice.kind === 'created'
  const status = statusOf(notice, attempted ? issues.length : 0, t, locale)

  function updateDay(index: number, patch: Partial<DayDraft>) {
    setDraft((previous) => ({
      ...previous,
      days: previous.days.map((day, i) => (i === index ? { ...day, ...patch } : day)),
    }))
  }

  function setDayOpen(index: number, open: boolean) {
    setOpenDays((previous) => {
      const next = new Set(previous)
      if (open) {
        next.add(index)
      } else {
        next.delete(index)
      }
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) {
      return
    }
    setAttempted(true)
    const [first] = issues
    if (first !== undefined) {
      setNotice({ kind: 'none' })
      if (first.day !== null) {
        setDayOpen(first.day, true)
      }
      setFocusRequest({ key: first.key })
      return
    }
    setNotice({ kind: 'sending' })
    try {
      await postJson<Plan>('/plans', toPlanBody(draft, weeks[draft.week]), {
        timeoutMs: MUTATION_TIMEOUT_MS,
      })
    } catch (error) {
      const failure = describePlanFailure(error, draft.week)
      setNotice({ kind: 'failed', failure })
      // O foco estava no botao; a falha e dita na linha de status.
      statusBox.current?.focus()
      if (failure.action === 'choose-next') {
        setDraft((previous) => ({ ...previous, week: 'next' }))
      }
      if (failure.action === 'refresh') {
        onExists()
      }
      return
    }
    setNotice({ kind: 'created' })
    onCreated(draft.week, weeks[draft.week])
  }

  return (
    <form
      noValidate
      aria-labelledby={titleId}
      data-testid="week-plan-form"
      onSubmit={(event) => {
        void submit(event)
      }}
      className="flex flex-col gap-6 text-left"
    >
      <div className="flex flex-col gap-2">
        <h3 id={titleId} className="text-xl text-text-primary">
          {t('campaigns.form.title')}
        </h3>
        <p className="text-text-muted">{t('campaigns.form.intro')}</p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className={LEGEND_CLASS}>{t('campaigns.form.week.legend')}</legend>
        {WEEKS.map((choice) => (
          <label
            key={choice}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-text-primary"
          >
            <input
              ref={choice === 'current' ? firstRadio : null}
              type="radio"
              name={weekName}
              value={choice}
              data-testid={`week-plan-week-${choice}`}
              checked={draft.week === choice}
              onChange={() => {
                setDraft((previous) => ({ ...previous, week: choice }))
              }}
              className="size-6 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            />
            {t(WEEK_LABEL[choice])}
          </label>
        ))}
      </fieldset>

      <Fieldset legend={t('campaigns.form.daily.legend')}>
        {draft.days.map((day, index) => {
          const ready = isDayReady(day, index)
          return (
            <details
              key={index}
              open={openDays.has(index)}
              data-testid={`week-plan-day-${index}`}
              onToggle={(event) => {
                setDayOpen(index, event.currentTarget.open)
              }}
              className="rounded-ui border border-border-subtle bg-bg-raised p-4"
            >
              <summary
                data-testid={`week-plan-day-${index}-summary`}
                className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 rounded-ui font-body text-base font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span>{formatCivilDate(addCivilDays(weeks[draft.week], index), locale)}</span>
                <Badge
                  tone={ready ? 'success' : 'neutral'}
                  data-testid={`week-plan-day-${index}-badge`}
                >
                  {t(ready ? 'campaigns.form.daily.ready' : 'campaigns.form.daily.missing')}
                </Badge>
              </summary>
              <DayFields
                index={index}
                day={day}
                bind={bind}
                onChange={(patch) => {
                  updateDay(index, patch)
                }}
              />
            </details>
          )
        })}
        <div>
          <Button
            data-testid="week-plan-copy-monday"
            disabled={busy}
            onClick={() => {
              setDraft(copyMondayToUntouched)
              setNotice({ kind: 'copied' })
            }}
          >
            {t('campaigns.form.copyMonday')}
          </Button>
        </div>
      </Fieldset>

      <Panel elevation="raised">
        <Fieldset legend={t('campaigns.form.trial.legend')}>
          <TrialFields
            trial={draft.trial}
            bind={bind}
            onChange={(patch) => {
              setDraft((previous) => ({ ...previous, trial: { ...previous.trial, ...patch } }))
            }}
          />
        </Fieldset>
      </Panel>

      <div ref={statusBox} tabIndex={-1} className={status.text === '' ? 'sr-only' : undefined}>
        <StatusLine tone={status.tone} data-testid="week-plan-status">
          {status.text}
        </StatusLine>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={busy} data-testid="week-plan-submit">
          {t(busy ? 'campaigns.form.submitting' : 'campaigns.form.submit')}
        </Button>
        <Button data-testid="week-plan-cancel" onClick={onCancel}>
          {t('campaigns.form.cancel')}
        </Button>
      </div>
    </form>
  )
}
