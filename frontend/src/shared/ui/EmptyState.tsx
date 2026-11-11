import { useState, type ReactNode } from 'react'
import { ART } from './art'

export type EmptyArt = keyof typeof ART.empty

interface EmptyStateProps {
  art: EmptyArt
  title: string
  body?: string
  /** Uma única chamada para ação (RUI: estado vazio com um próximo passo). */
  action?: ReactNode
  headingLevel?: 2 | 3
  'data-testid'?: string
}

/** Lado da arte em px; as artes de estado vazio são quadradas. */
const ART_SIZE = 160

/**
 * Estado vazio com arte decorativa (`alt=""`). Se a arte falhar ao carregar,
 * ela some e o texto continua: o estado vazio nunca depende da imagem.
 */
export function EmptyState({
  art,
  title,
  body,
  action,
  headingLevel = 2,
  'data-testid': testId,
}: EmptyStateProps) {
  // Guarda o src que falhou, e não um booleano: trocar `art` na mesma
  // instância volta a tentar a imagem nova.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = ART.empty[art]
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-4 text-center">
      {failedSrc === src ? null : (
        <img
          src={src}
          alt=""
          width={ART_SIZE}
          height={ART_SIZE}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="size-40 rounded-ui object-cover"
        />
      )}
      <Heading className="text-xl text-text-primary">{title}</Heading>
      {body === undefined ? null : <p className="max-w-prose text-text-muted">{body}</p>}
      {action === undefined ? null : <div>{action}</div>}
    </div>
  )
}
