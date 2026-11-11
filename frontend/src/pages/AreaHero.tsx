import { Panel, type ART } from '../shared/ui'

export type AreaScene = keyof typeof ART.scenes

/** A classe de cada cena, em `styles/base.css`, com a arte de `ART.scenes`. */
const SCENE_CLASS: Record<AreaScene, string> = {
  hq: 'area-hero--hq',
  campaigns: 'area-hero--campaigns',
}

interface AreaHeroProps {
  scene: AreaScene
  /** O `id` que o `App` foca ao abrir a área (decisão K5). */
  headingId: string
  title: string
  note: string
}

/**
 * O cabeçalho de uma área: a cena ao fundo e o título num `Panel` de fundo
 * sólido. O texto nunca fica direto sobre a imagem: o axe não mede contraste
 * sobre `background-image`, então o contraste garantido é o do texto sobre a
 * superfície, medido nos tokens pelo `AreaHero.test.tsx`.
 */
export function AreaHero({ scene, headingId, title, note }: AreaHeroProps) {
  return (
    <header className={`area-hero ${SCENE_CLASS[scene]} mb-6`}>
      <div className="max-w-xl">
        <Panel elevation="surface">
          <h1
            id={headingId}
            tabIndex={-1}
            className="rounded-ui text-2xl text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:text-3xl"
          >
            {title}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{note}</p>
        </Panel>
      </div>
    </header>
  )
}
