import { useId, useState } from 'react'
import { describeEvidence } from './evidenceLimit'
import type { EvidenceDraft } from './types'

const TOGGLE_CLASS =
  'rounded text-sm font-medium text-emerald-200 underline-offset-2 hover:underline ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'

const FIELD_CLASS =
  'w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none ' +
  'disabled:opacity-60'

/**
 * A entrega com evidencia, recolhida por padrao (E17): Concluir continua a um
 * clique, e quem quer mostrar o que fez abre o disclosure.
 *
 * E CONTROLADO: o rascunho vem de fora e cada mudanca sai por `onChange`. Quem
 * guarda o rascunho e o cartao, que o grava no registro do quadro -- o reload
 * remonta os cartoes, e um rascunho guardado aqui morreria com eles.
 *
 * O aberto/fechado, esse, e estado local: perder a abertura na remontagem nao
 * perde nada da pessoa. Por isso ele comeca aberto quando o rascunho ja tem
 * conteudo -- um cartao remontado com texto guardado mostra o texto, e um
 * Concluir desabilitado por um link ruim nunca fica sem o motivo a vista.
 *
 * Os campos ficam FORA do documento quando recolhido (e nao so escondidos):
 * nada invisivel entra na ordem de tabulacao.
 */
export function EvidenceForm({
  draft,
  onChange,
  disabled,
}: {
  draft: EvidenceDraft
  onChange: (draft: EvidenceDraft) => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState(() => draft.text !== '' || draft.link !== '')
  const id = useId()
  const regionId = `${id}-region`
  const textId = `${id}-text`
  const linkId = `${id}-link`
  const counterId = `${id}-counter`
  const linkErrorId = `${id}-link-error`
  const described = describeEvidence(draft)
  const textMissing = draft.text.trim() === '' && draft.link.trim() !== ''

  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="evidence-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => {
          setExpanded((open) => !open)
        }}
        className={TOGGLE_CLASS}
      >
        Entregar com evidência (opcional)
      </button>
      <div id={regionId} className="mt-2 flex flex-col gap-2">
        {expanded && (
          <>
            <label htmlFor={textId} className="text-sm font-medium text-slate-200">
              O que você fez
            </label>
            <textarea
              id={textId}
              data-testid="evidence-text"
              rows={3}
              value={draft.text}
              disabled={disabled}
              aria-describedby={described.counter === null ? undefined : counterId}
              onChange={(event) => {
                onChange({ ...draft, text: event.target.value })
              }}
              className={`${FIELD_CLASS} resize-y`}
            />
            <p id={counterId} data-testid="evidence-counter" className="text-xs text-slate-400">
              {described.counter}
            </p>
            {textMissing && (
              <p data-testid="evidence-text-missing" className="text-xs text-amber-200">
                Para entregar o link, conte também o que você fez.
              </p>
            )}
            <label htmlFor={linkId} className="text-sm font-medium text-slate-200">
              Link (opcional)
            </label>
            <input
              id={linkId}
              data-testid="evidence-link"
              type="url"
              inputMode="url"
              value={draft.link}
              disabled={disabled}
              aria-invalid={described.linkError === null ? undefined : true}
              aria-describedby={described.linkError === null ? undefined : linkErrorId}
              onChange={(event) => {
                onChange({ ...draft, link: event.target.value })
              }}
              className={FIELD_CLASS}
            />
            {described.linkError !== null && (
              <p
                id={linkErrorId}
                role="alert"
                data-testid="evidence-link-error"
                className="text-xs text-red-300"
              >
                {described.linkError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
