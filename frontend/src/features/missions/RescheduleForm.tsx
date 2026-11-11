import { useEffect, useId, useRef, useState } from 'react'
import { isoToSaoPauloCivil, saoPauloCivilToIso } from '../../shared/lib/deadline'
import {
  RESCHEDULE_REASON_LABELS,
  type Mission,
  type RescheduleReason,
} from '../../shared/types/mission'
import { sameDraft } from './rescheduleDraft'
import type { RescheduleFailure } from './rescheduleFailure'
import type { OpenReschedule, RescheduleDraft } from './types'
import { FailureMessage } from '../../shared/i18n/FailureMessage'
import type { MessageKey } from '../../shared/i18n/catalog'
import { useT } from '../../shared/i18n/useT'

const TOGGLE_CLASS =
  'rounded text-sm font-medium text-emerald-200 underline-offset-2 hover:underline ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'

const FIELD_CLASS =
  'rounded border border-slate-500 bg-slate-900 p-2 text-sm text-slate-100 ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none ' +
  'disabled:opacity-60'

const SUBMIT_CLASS =
  'self-start rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

/** A ordem dos motivos na tela: a do README §5. */
const REASONS: RescheduleReason[] = ['dificuldade', 'falta_de_tempo', 'mudanca_de_prioridade']

/**
 * O horizonte do prazo da avulsa, o mesmo do servidor (pendencia 26). O
 * servidor continua sendo quem decide (`prazo_fora_do_limite`); aqui ele so
 * evita um envio que voltaria recusado.
 */
const HORIZONTE_DO_PRAZO_MS = 365 * 24 * 60 * 60 * 1000

/** A janela do novo prazo, em hora civil de Sao Paulo, a partir de `nowMs`. */
function deadlineWindow(nowMs: number): { min: string; max: string; maxMs: number } {
  const maxMs = nowMs + HORIZONTE_DO_PRAZO_MS
  return {
    min: isoToSaoPauloCivil(new Date(nowMs).toISOString()),
    max: isoToSaoPauloCivil(new Date(maxMs).toISOString()),
    maxMs,
  }
}

/** Os ids de `aria-describedby` presentes, juntos; `undefined` sem nenhum. */
function joinIds(...ids: (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null)
  return present.length === 0 ? undefined : present.join(' ')
}

/** Por que o rascunho nao pode sair, ou `null` se pode. */
function blockedReason(draft: RescheduleDraft, maxMs: number): MessageKey | null {
  if (draft.civil === '') {
    return 'missions.reschedule.blocked.missingDeadline'
  }
  const iso = saoPauloCivilToIso(draft.civil)
  if (iso === null) {
    return 'missions.reschedule.blocked.nonexistentTime'
  }
  // O passado fica com o servidor (`prazo_expirado`): o minuto civil nao
  // decide sozinho se "agora" ja passou, e o teto sim.
  if (Date.parse(iso) > maxMs) {
    return 'missions.reschedule.blocked.tooFar'
  }
  if (draft.reason === null) {
    return 'missions.reschedule.blocked.missingReason'
  }
  return null
}

/**
 * "Reagendar prazo": o disclosure com o novo prazo, em horario de Brasilia, e
 * o motivo (F10, F20, F21).
 *
 * Decisoes, cada uma com o motivo:
 *
 * - **Recolhido por padrao**, como a evidencia: o cartao continua curto, e os
 *   campos ficam FORA do documento quando fechado (nada invisivel na ordem de
 *   tabulacao).
 * - **O rascunho mora no registro** (pendencia 112), como o da evidencia: o
 *   reload remonta os cartoes, e o formulario recomeca de `saved` -- aberto,
 *   com o que foi digitado e a janela de quando abriu. Cada mudanca vai para
 *   `onSave`; fechar pelo botao descarta (`onSave(null)`). Abrir recomeca do
 *   prazo ATUAL, sem motivo marcado.
 * - **Aberto e derivado do prazo**: o disclosure fica aberto enquanto o prazo
 *   da missao e o mesmo de quando foi aberto. Um `saved` de outro prazo monta
 *   fechado e sai do registro: o prazo mudou fora deste formulario (outra aba,
 *   outro dispositivo), e o rascunho foi escrito contra um prazo que ja nao
 *   vale -- reabri-lo mostraria um novo prazo e uma janela calculados sobre o
 *   antigo. Montar fechado nao mexe no foco, porque ninguem fechou nada: a
 *   devolucao do foco ao disclosure e so para o fechamento pelo sucesso, logo
 *   abaixo. O sucesso muda o prazo (o servidor recusa o prazo igual com
 *   `prazo_inalterado`), e o disclosure fecha sozinho -- sem efeito que muda
 *   estado ao ver a prop mudar. A falha nao muda o prazo: o formulario fica com
 *   o que foi digitado.
 * - **Salvar desabilitado com o porque em texto**, ligado por
 *   `aria-describedby`, como o motivo do Concluir bloqueado.
 * - **Janela do prazo de agora a agora+365 dias** (pendencia 26), contada do
 *   instante em que o disclosure abriu: `min`/`max` no campo e o teto no
 *   bloqueio. O passado fica com o servidor (`prazo_expirado`).
 * - **Chave retida** (`pendingRetry`: o envio com resultado desconhecido): os
 *   campos continuam editaveis; sem mudar nada, o botao diz "Tentar de novo" e
 *   reenvia o MESMO rascunho (a chave retida so vale para o mesmo conteudo,
 *   F13). Mudou o rascunho, o botao volta a "Salvar novo prazo" -- e o registro
 *   troca a chave antes de enviar. O "ultimo enviado" vem do registro, e nao
 *   daqui: sobrevive a remontagem junto com a chave.
 * - **Foco**: o botao de salvar sai do documento no sucesso; o foco que caiu
 *   no `body` volta ao botao do disclosure. Foco que ja foi para outro lugar
 *   nao se rouba.
 *
 * `describedBy` e o id do titulo da missao: o nome do disclosure e o mesmo em
 * todos os cartoes, e a descricao diz DE QUAL missao.
 */
export function RescheduleForm({
  mission,
  disabled,
  failure,
  onSubmit,
  saved,
  onSave,
  pendingRetry,
  describedBy,
}: {
  mission: Mission
  /** Um envio do cartao (iniciar, reagendar, concluir) esta em voo. */
  disabled: boolean
  /** A ultima falha do reagendamento que se corrige ou se repete aqui. */
  failure: RescheduleFailure | null
  onSubmit: (draft: RescheduleDraft) => void
  /** O reagendamento aberto guardado no registro. Lido so na montagem. */
  saved: OpenReschedule | null
  /** Guarda o reagendamento aberto no registro; `null` o descarta. */
  onSave: (open: OpenReschedule | null) => void
  /** O rascunho do envio cuja chave ficou retida, ou `null`. */
  pendingRetry: RescheduleDraft | null
  describedBy?: string
}) {
  const t = useT()
  // `null` = fechado. O instante de abertura e lido no clique, nunca no render
  // (render puro); um `saved` de outro prazo nao reabre.
  const [open, setOpen] = useState<OpenReschedule | null>(() =>
    saved !== null && saved.openedFor === mission.deadline ? saved : null,
  )
  const keep = (next: OpenReschedule | null) => {
    setOpen(next)
    onSave(next)
  }
  // Um `saved` de outro prazo tambem sai do registro, uma vez, na montagem: o
  // prazo mudou fora deste formulario, e se ele voltasse ao de antes o rascunho
  // velho reabriria. A ref garante a vez unica -- `onSave` muda a cada render
  // do cartao, e um descarte repetido apagaria o que a pessoa abriu depois.
  const staleOnMount = useRef(saved !== null && saved.openedFor !== mission.deadline)
  useEffect(() => {
    if (staleOnMount.current) {
      staleOnMount.current = false
      onSave(null)
    }
  }, [onSave])
  const toggleRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const regionId = `${id}-region`
  const fieldId = `${id}-deadline`
  const blockedId = `${id}-blocked`
  const noticeId = `${id}-retry-notice`

  // So o aberto para o prazo ATUAL vale: o sucesso muda o prazo e fecha.
  const current = open?.openedFor === mission.deadline ? open : null
  const expanded = current !== null
  const closedBySuccess = open !== null && !expanded
  useEffect(() => {
    if (closedBySuccess && document.activeElement === document.body) {
      toggleRef.current?.focus({ preventScroll: true })
    }
  }, [closedBySuccess])

  const draft: RescheduleDraft = current?.draft ?? { civil: '', reason: null }
  const bounds = deadlineWindow(current?.openedAtMs ?? 0)
  const blocked = blockedReason(draft, bounds.maxMs)
  const retrySame = pendingRetry !== null && sameDraft(pendingRetry, draft)
  const retryLabel = retrySame || failure?.action === 'retry-with-new-operation'

  return (
    <div className="mt-3">
      <button
        ref={toggleRef}
        type="button"
        data-testid="reschedule-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-describedby={describedBy}
        onClick={() => {
          if (expanded) {
            keep(null)
            return
          }
          keep({
            openedFor: mission.deadline,
            openedAtMs: Date.now(),
            draft: {
              civil: isoToSaoPauloCivil(mission.deadline),
              reason: null,
              originalDeadline: mission.deadline,
            },
          })
        }}
        className={TOGGLE_CLASS}
      >
        {t('missions.reschedule.toggle')}
      </button>
      <div id={regionId} className="mt-2 flex flex-col gap-2">
        {current !== null && (
          <>
            <label htmlFor={fieldId} className="text-sm font-medium text-slate-200">
              {t('missions.reschedule.deadlineLabel')}
            </label>
            <input
              id={fieldId}
              data-testid="reschedule-deadline"
              type="datetime-local"
              min={bounds.min}
              max={bounds.max}
              value={draft.civil}
              disabled={disabled}
              onChange={(event) => {
                keep({ ...current, draft: { ...draft, civil: event.target.value } })
              }}
              className={`${FIELD_CLASS} self-start`}
            />
            <fieldset className="flex flex-col gap-1" disabled={disabled}>
              <legend className="text-sm font-medium text-slate-200">
                {t('missions.reschedule.reasonLegend')}
              </legend>
              {REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={reason}
                    data-testid={`reschedule-reason-${reason}`}
                    checked={draft.reason === reason}
                    onChange={() => {
                      keep({ ...current, draft: { ...draft, reason } })
                    }}
                    className="focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
                  />
                  {t(RESCHEDULE_REASON_LABELS[reason])}
                </label>
              ))}
            </fieldset>
            {retrySame && (
              <p
                id={noticeId}
                data-testid="reschedule-retry-notice"
                className="text-xs text-amber-200"
              >
                {t('missions.reschedule.retryNotice')}
              </p>
            )}
            <button
              type="button"
              data-testid="reschedule-submit"
              disabled={disabled || blocked !== null}
              aria-describedby={joinIds(
                blocked === null ? null : blockedId,
                retrySame ? noticeId : null,
              )}
              onClick={() => {
                onSubmit(draft)
              }}
              className={SUBMIT_CLASS}
            >
              {t(retryLabel ? 'missions.action.retry' : 'missions.reschedule.submit')}
            </button>
            {blocked !== null && (
              <p id={blockedId} data-testid="reschedule-blocked" className="text-sm text-amber-200">
                {t(blocked)}
              </p>
            )}
            {failure !== null && (
              <p role="alert" data-testid="reschedule-error" className="text-sm text-red-300">
                <FailureMessage failure={failure} />
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
