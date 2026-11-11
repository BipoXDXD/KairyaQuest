import { useRef, type ReactElement } from 'react'
import { useT } from '../../shared/i18n/useT'
import { IconButton } from '../../shared/ui/IconButton'
import { SpeechBubble, type SpeechTone } from '../../shared/ui/SpeechBubble'
import { captionLines } from './captionText'
import type { Mood } from './events'
import { KairyaFace } from './KairyaFace'
import { isOpeningLine, lineKey } from './lines'
import { useKairya } from './useKairya'

/** Só a comemoração e a preocupação têm tom próprio; o resto é neutro. */
const TONE: Readonly<Record<Mood, SpeechTone>> = {
  idle: 'neutral',
  listening: 'neutral',
  thinking: 'neutral',
  speaking: 'neutral',
  celebrating: 'celebrating',
  concerned: 'concerned',
}

function CloseIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

/**
 * A fala da Kairya, em linha na página. Guarda o `LineId` (não o texto): trocar
 * o idioma com a bolha aberta mostra a mesma fala no outro idioma.
 *
 * A região `role="status"` existe desde o primeiro render (uma região nova já
 * com texto pode ficar muda) e só leva a fala de abertura do dia: a celebração
 * já é anunciada pelo `RewardAnnouncement`.
 *
 * O botão de fechar some junto com a bolha; sem destino, o foco cairia no
 * `body`. Por isso tudo mora num contêiner estável (`tabIndex={-1}`) que
 * recebe o foco ao fechar, como `CycleSection` e `MissionCard` fazem.
 */
export function KairyaBubble(): ReactElement {
  const t = useT()
  const { state, dispatch } = useKairya()
  const { cue, mood } = state
  const anchor = useRef<HTMLDivElement>(null)
  const announced = cue !== null && isOpeningLine(cue.line) ? t(lineKey(cue.line)) : ''
  return (
    <div
      ref={anchor}
      tabIndex={-1}
      data-testid="kairya-bubble-anchor"
      className="focus:outline-none"
    >
      <div role="status" data-testid="kairya-announcement" className="sr-only">
        {announced}
      </div>
      {cue !== null && (
        <div className="mb-4 motion-safe:animate-reward-in">
          <SpeechBubble speaker={t('kairya.speaker')} tone={TONE[mood]}>
            <div className="flex items-start gap-3">
              <span className="w-12 shrink-0">
                <KairyaFace mood={mood} size="thumb" />
              </span>
              <div className="min-w-0 flex-1">
                <p>{t(lineKey(cue.line))}</p>
                {captionLines(cue.detail, t).map((line, index) => (
                  // A ordem da legenda é fixa e o texto pode repetir (dois códigos
                  // desconhecidos com o mesmo título), então o índice entra na chave.
                  <p key={`${index}:${line}`} className="text-sm text-text-muted">
                    {line}
                  </p>
                ))}
              </div>
              <IconButton
                label={t('kairya.bubble.close')}
                icon={<CloseIcon />}
                onClick={() => {
                  dispatch({ type: 'dismissed' })
                  // O `!`: o clique só existe com o contêiner montado; um `?.` criaria
                  // um ramo que nenhum uso real alcança.
                  anchor.current!.focus()
                }}
              />
            </div>
          </SpeechBubble>
        </div>
      )}
    </div>
  )
}
