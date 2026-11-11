import { useId, useState } from 'react'
import { useLocale } from '../../shared/i18n/useLocale'
import { useT } from '../../shared/i18n/useT'
import { describeEvidence, stripEnds } from './evidenceLimit'
import { counterText, linkErrorText } from './evidenceText'
import type { EvidenceDraft } from './types'

const TOGGLE_CLASS =
  'rounded text-sm font-medium text-emerald-200 underline-offset-2 hover:underline ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'

const FIELD_CLASS =
  'w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 ' +
  'focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none ' +
  'disabled:opacity-60'

/** Os ids de `aria-describedby` presentes, juntos; `undefined` sem nenhum. */
function joinIds(...ids: (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null)
  return present.length === 0 ? undefined : present.join(' ')
}

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
 *
 * `retryPending`: a ultima conclusao falhou de um jeito que segura a chave (a
 * entrega anterior pode ter chegado ao servidor). Com a MESMA chave, uma
 * evidencia editada seria recusada (409) e a edicao, perdida em silencio:
 * os campos ficam SOMENTE LEITURA (`readOnly` + `aria-readonly`, e nao
 * `disabled`: continuam focaveis e o leitor de tela le o aviso ligado a eles), e o
 * "Tentar de novo" reenvia o mesmo rascunho.
 *
 * `describedBy` e o id do titulo da missao: o nome do toggle e o mesmo em
 * todos os cartoes (o E2E depende dele), e a descricao diz DE QUAL missao.
 */
export function EvidenceForm({
  draft,
  onChange,
  disabled,
  retryPending = false,
  describedBy,
}: {
  draft: EvidenceDraft
  onChange: (draft: EvidenceDraft) => void
  disabled: boolean
  retryPending?: boolean
  describedBy?: string
}) {
  const t = useT()
  const { locale } = useLocale()
  const [linkTouched, setLinkTouched] = useState(false)
  const [expanded, setExpanded] = useState(() => draft.text !== '' || draft.link !== '')
  const id = useId()
  const regionId = `${id}-region`
  const textId = `${id}-text`
  const linkId = `${id}-link`
  const counterId = `${id}-counter`
  const linkErrorId = `${id}-link-error`
  const textMissingId = `${id}-text-missing`
  const retryNoticeId = `${id}-retry-notice`
  const described = describeEvidence(draft)
  // O erro do link so aparece (e so e anunciado) depois que a pessoa SAI do
  // campo: `role="alert"` no primeiro caractere ("h") interromperia o leitor de
  // tela no meio da digitacao. E o mais simples que serve -- sem timer, e
  // o motivo do Concluir bloqueado ja esta a vista fora do disclosure.
  const linkError = linkTouched ? described.linkError : null
  const textMissing = stripEnds(draft.text) === '' && stripEnds(draft.link) !== ''

  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="evidence-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-describedby={describedBy}
        onClick={() => {
          setExpanded((open) => !open)
        }}
        className={TOGGLE_CLASS}
      >
        {t('missions.evidence.toggle')}
      </button>
      <div id={regionId} className="mt-2 flex flex-col gap-2">
        {expanded && (
          <>
            {retryPending && (
              <p
                id={retryNoticeId}
                data-testid="evidence-retry-notice"
                className="text-xs text-amber-200"
              >
                {t('missions.evidence.retryNotice')}
              </p>
            )}
            <label htmlFor={textId} className="text-sm font-medium text-slate-200">
              {t('missions.evidence.textLabel')}
            </label>
            <textarea
              id={textId}
              data-testid="evidence-text"
              rows={3}
              value={draft.text}
              disabled={disabled}
              readOnly={retryPending}
              aria-readonly={retryPending ? true : undefined}
              aria-describedby={joinIds(
                retryPending ? retryNoticeId : null,
                described.counter === null ? null : counterId,
                textMissing ? textMissingId : null,
              )}
              onChange={(event) => {
                onChange({ ...draft, text: event.target.value })
              }}
              className={`${FIELD_CLASS} resize-y`}
            />
            <p id={counterId} data-testid="evidence-counter" className="text-xs text-slate-400">
              {described.counter === null ? null : counterText(described.counter, locale, t)}
            </p>
            {textMissing && (
              <p
                id={textMissingId}
                data-testid="evidence-text-missing"
                className="text-xs text-amber-200"
              >
                {t('missions.evidence.textMissing')}
              </p>
            )}
            <label htmlFor={linkId} className="text-sm font-medium text-slate-200">
              {t('missions.evidence.linkLabel')}
            </label>
            <input
              id={linkId}
              data-testid="evidence-link"
              type="url"
              inputMode="url"
              value={draft.link}
              disabled={disabled}
              readOnly={retryPending}
              aria-readonly={retryPending ? true : undefined}
              aria-invalid={linkError === null ? undefined : true}
              aria-describedby={joinIds(
                retryPending ? retryNoticeId : null,
                linkError === null ? null : linkErrorId,
              )}
              onBlur={() => {
                setLinkTouched(true)
              }}
              onChange={(event) => {
                // O erro reaparece so no proximo blur: com o link valido (ou
                // vazio) o "tocado" volta a falso, e digitar depois de um blur
                // nao dispara o `alert` a cada tecla.
                if (describeEvidence({ ...draft, link: event.target.value }).linkError === null) {
                  setLinkTouched(false)
                }
                onChange({ ...draft, link: event.target.value })
              }}
              className={FIELD_CLASS}
            />
            {linkError !== null && (
              <p
                id={linkErrorId}
                role="alert"
                data-testid="evidence-link-error"
                className="text-xs text-red-300"
              >
                {linkErrorText(linkError, t)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
