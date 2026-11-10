import { useEffect, useId, useRef, useState } from 'react'
import { isoToSaoPauloCivil, saoPauloCivilToIso } from '../../shared/lib/deadline'
import {
  RESCHEDULE_REASON_LABELS,
  type Mission,
  type RescheduleReason,
} from '../../shared/types/mission'
import { sameDraft } from './rescheduleDraft'
import type { RescheduleFailure } from './rescheduleFailure'
import type { RescheduleDraft } from './types'
import { FailureMessage } from '../../shared/i18n/FailureMessage'
import { useT } from '../../shared/i18n/useT'

const TOGGLE_CLASS =
  'rounded text-sm font-medium text-emerald-200 underline-offset-2 hover:underline ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'

const FIELD_CLASS =
  'rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none ' +
  'disabled:opacity-60'

const SUBMIT_CLASS =
  'self-start rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

/** A ordem dos motivos na tela: a do README §5. */
const REASONS: RescheduleReason[] = ['dificuldade', 'falta_de_tempo', 'mudanca_de_prioridade']

const RETRY_NOTICE =
  'O pedido anterior pode ter chegado. Sem mudar nada, “Tentar de novo” o reenvia com segurança.'

/** Os ids de `aria-describedby` presentes, juntos; `undefined` sem nenhum. */
function joinIds(...ids: (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null)
  return present.length === 0 ? undefined : present.join(' ')
}

/** Por que o rascunho nao pode sair, ou `null` se pode. */
function blockedReason(draft: RescheduleDraft): string | null {
  if (draft.civil === '') {
    return 'Informe a data e a hora do novo prazo.'
  }
  if (saoPauloCivilToIso(draft.civil) === null) {
    return 'Esse horário não existe no horário de Brasília. Escolha outro.'
  }
  if (draft.reason === null) {
    return 'Escolha o motivo para salvar o novo prazo.'
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
 * - **O rascunho mora aqui**, e nao no registro (F20): perder um instante e um
 *   botao de opcao numa recarga custa dois cliques (pendencia 112). Abrir
 *   recomeca do prazo ATUAL, sem motivo marcado.
 * - **Aberto e derivado do prazo**: o disclosure fica aberto enquanto o prazo
 *   da missao e o mesmo de quando foi aberto. O sucesso muda o prazo (o
 *   servidor recusa o prazo igual com `prazo_inalterado`), e o disclosure fecha
 *   sozinho -- sem efeito que muda estado ao ver a prop mudar. A falha nao muda
 *   o prazo: o formulario fica com o que foi digitado.
 * - **Salvar desabilitado com o porque em texto**, ligado por
 *   `aria-describedby`, como o motivo do Concluir bloqueado.
 * - **Falha `retry`** (nao se sabe se o prazo mudou): os campos continuam
 *   editaveis; sem mudar nada, o botao diz "Tentar de novo" e reenvia o MESMO
 *   rascunho (a chave retida so vale para o mesmo conteudo, F13). Mudou o
 *   rascunho, o botao volta a "Salvar novo prazo" -- e o cartao troca a chave
 *   antes de enviar.
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
  describedBy,
}: {
  mission: Mission
  /** Um envio do cartao (iniciar, reagendar, concluir) esta em voo. */
  disabled: boolean
  /** A ultima falha do reagendamento que se corrige ou se repete aqui. */
  failure: RescheduleFailure | null
  onSubmit: (draft: RescheduleDraft) => void
  describedBy?: string
}) {
  const t = useT()
  // O prazo da missao quando o disclosure foi aberto; `null` = fechado.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const [draft, setDraft] = useState<RescheduleDraft>({ civil: '', reason: null })
  // O ultimo rascunho enviado: e com ele que "Tentar de novo" se compara.
  const [sent, setSent] = useState<RescheduleDraft | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const regionId = `${id}-region`
  const fieldId = `${id}-deadline`
  const blockedId = `${id}-blocked`
  const noticeId = `${id}-retry-notice`

  const expanded = openedFor === mission.deadline
  const closedBySuccess = openedFor !== null && !expanded
  useEffect(() => {
    if (closedBySuccess && document.activeElement === document.body) {
      toggleRef.current?.focus({ preventScroll: true })
    }
  }, [closedBySuccess])

  const blocked = blockedReason(draft)
  const retrySame = failure?.action === 'retry' && sent !== null && sameDraft(sent, draft)
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
            setOpenedFor(null)
            return
          }
          setOpenedFor(mission.deadline)
          setDraft({
            civil: isoToSaoPauloCivil(mission.deadline),
            reason: null,
            originalDeadline: mission.deadline,
          })
          setSent(null)
        }}
        className={TOGGLE_CLASS}
      >
        Reagendar prazo
      </button>
      <div id={regionId} className="mt-2 flex flex-col gap-2">
        {expanded && (
          <>
            <label htmlFor={fieldId} className="text-sm font-medium text-slate-200">
              Novo prazo (horário de Brasília)
            </label>
            <input
              id={fieldId}
              data-testid="reschedule-deadline"
              type="datetime-local"
              value={draft.civil}
              disabled={disabled}
              onChange={(event) => {
                setDraft({ ...draft, civil: event.target.value })
              }}
              className={`${FIELD_CLASS} self-start`}
            />
            <fieldset className="flex flex-col gap-1" disabled={disabled}>
              <legend className="text-sm font-medium text-slate-200">Por que reagendar?</legend>
              {REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={reason}
                    data-testid={`reschedule-reason-${reason}`}
                    checked={draft.reason === reason}
                    onChange={() => {
                      setDraft({ ...draft, reason })
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
                {RETRY_NOTICE}
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
                setSent(draft)
                onSubmit(draft)
              }}
              className={SUBMIT_CLASS}
            >
              {retryLabel ? 'Tentar de novo' : 'Salvar novo prazo'}
            </button>
            {blocked !== null && (
              <p id={blockedId} data-testid="reschedule-blocked" className="text-sm text-amber-200">
                {blocked}
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
