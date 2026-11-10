import { useId, type ReactNode } from 'react'

export type SpeechTone = 'neutral' | 'celebrating' | 'concerned'

interface SpeechBubbleProps {
  /** Quem fala; vira a `figcaption` e o nome acessível da `figure`. */
  speaker: string
  tone?: SpeechTone
  children: ReactNode
}

/** Só a comemoração ganha o brilho da lanterna; a preocupação, a borda de alerta. */
const TONE_CLASS: Record<SpeechTone, string> = {
  neutral: 'border-border-subtle',
  celebrating: 'border-action-primary shadow-glow-lantern',
  concerned: 'border-feedback-danger',
}

/**
 * A fala de um personagem (a Kairya), como `figure` com o falante na legenda.
 * O `aria-labelledby` explicita o nome que o HTML-AAM daria pela `figcaption`:
 * nem todo motor de acessibilidade faz essa ligação sozinho (o jsdom não faz).
 */
export function SpeechBubble({ speaker, tone = 'neutral', children }: SpeechBubbleProps) {
  const captionId = useId()
  return (
    <figure
      aria-labelledby={captionId}
      data-tone={tone}
      className={`flex flex-col gap-1 rounded-ui border bg-bg-raised p-4 ${TONE_CLASS[tone]}`}
    >
      <figcaption id={captionId} className="text-sm font-bold text-text-muted">
        {speaker}
      </figcaption>
      <div className="text-text-primary">{children}</div>
    </figure>
  )
}
