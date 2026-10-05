import { CampaignTrail } from '../features/campaigns/CampaignTrail'
import { CAMPAIGNS_HEADING_ID } from './headings'

/**
 * Campanhas — planos de estudo (README §7; spec do ciclo diario, "Campanhas
 * — a trilha").
 *
 * A pagina COMPOE, como o Quartel-General: o `main`, o titulo e a trilha da
 * semana -- `<CampaignTrail />`, de `features/campaigns/CampaignTrail.tsx`,
 * com titulos a partir do `h2`. `onOpenHeadquarters` e opcional e so
 * atravessa: quem decide a navegacao e o `App`, nao esta pagina; Campanhas
 * repassa o callback, e a trilha decide mostrar o botao "Ir ao
 * Quartel-General" so quando ele existe. Por isso Campanhas recebe uma prop,
 * e a fronteira da pagina (so compoe o `main`, o titulo e a trilha) continua
 * a mesma.
 */
export function Campaigns({
  onOpenHeadquarters,
}: {
  onOpenHeadquarters?: () => void
} = {}) {
  return (
    <main
      data-testid="campaigns"
      className="rpg-main campaigns-main mx-auto w-full max-w-3xl px-4 py-8"
    >
      <header className="rpg-hero rpg-hero-citadel mb-6">
        <p className="rpg-eyebrow">O próximo capítulo</p>
        <h1
          id={CAMPAIGNS_HEADING_ID}
          tabIndex={-1}
          className="rounded text-2xl font-bold tracking-tight text-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
        >
          Campanhas — planos de estudo
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          A semana inteira, dia a dia, e a missão especial.
        </p>
      </header>
      <CampaignTrail onOpenHeadquarters={onOpenHeadquarters} />
    </main>
  )
}
