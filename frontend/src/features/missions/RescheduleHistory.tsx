import { formatDeadline } from '../../shared/lib/deadline'
import {
  RESCHEDULE_REASON_LABELS,
  type Reschedule,
  type RescheduleOrigin,
} from '../../shared/types/mission'
import type { MessageKey } from '../../shared/i18n/catalog'
import { plural } from '../../shared/i18n/plural'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'

/**
 * Quem reagendou, como a pessoa le. `Record` pelo mesmo motivo dos outros
 * rotulos: uma origem nova no tipo exige o texto aqui.
 */
const ORIGIN_LABELS: Readonly<Record<RescheduleOrigin, MessageKey>> = {
  usuario: 'missions.history.origin.user',
  kairya: 'missions.history.origin.kairya',
}

/**
 * O historico de prazos da missao (F12, F20): a contagem a vista e, recolhido
 * num `<details>`, um elo por linha -- de quando para quando, por que e por
 * quem. Nada quando a missao nunca foi reagendada.
 *
 * Tudo em texto (motivo e origem inclusive), nunca so cor (README §7). Os
 * prazos sao `<time>` com o instante original no `dateTime` e o texto em
 * `America/Sao_Paulo` (`formatDeadline`).
 *
 * `reschedules` aceita `undefined` de proposito: uma API anterior ao
 * incremento F devolve a missao sem a chave, e o `postJson` nao valida a
 * resposta em tempo de execucao. Sem a guarda, ler `.length` de `undefined`
 * derrubaria o quadro inteiro -- o mesmo desenho do `reward` ausente do D
 * ("deploy defasado"). O tipo `Mission` continua dizendo que a lista sempre
 * vem: a tolerancia e so deste leitor.
 */
export function RescheduleHistory({ reschedules }: { reschedules: Reschedule[] | undefined }) {
  const t = useT()
  const { locale } = useLocale()
  if (reschedules === undefined || reschedules.length === 0) {
    return null
  }
  return (
    <div className="mt-3 text-sm text-slate-300">
      <p data-testid="mission-reschedule-count" className="font-medium text-slate-200">
        {t(
          plural(locale, reschedules.length, {
            one: 'missions.history.count.one',
            other: 'missions.history.count.other',
          }),
          { count: reschedules.length },
        )}
      </p>
      <details data-testid="mission-reschedule-history" className="mt-1">
        <summary className="cursor-pointer rounded text-slate-300 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none">
          {t('missions.history.title')}
        </summary>
        <ol className="mt-2 flex flex-col gap-1">
          {reschedules.map((entry) => (
            // A chave e o instante da gravacao mais os dois prazos: o
            // historico so cresce, e dois elos nunca tem os tres iguais.
            <li
              key={`${entry.rescheduled_at}|${entry.previous_deadline}|${entry.new_deadline}`}
              data-testid="mission-reschedule-entry"
            >
              <time dateTime={entry.previous_deadline}>
                {formatDeadline(entry.previous_deadline, locale)}
              </time>
              {' → '}
              <time dateTime={entry.new_deadline}>
                {formatDeadline(entry.new_deadline, locale)}
              </time>
              {` · ${t(RESCHEDULE_REASON_LABELS[entry.reason])} · ${t(ORIGIN_LABELS[entry.origin])}`}
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
