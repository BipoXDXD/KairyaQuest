import { LanternTrail } from '../features/campaigns/LanternTrail'
import { useT } from '../shared/i18n/useT'
import { AreaHero } from './AreaHero'
import { CAMPAIGNS_HEADING_ID } from './headings'

/**
 * Campanhas — planos de estudo (README §7; spec do ciclo diario, "Campanhas
 * — a trilha").
 *
 * A pagina COMPOE, como o Quartel-General: o `main`, o titulo e a trilha de
 * lanternas da semana -- `<LanternTrail />`, de
 * `features/campaigns/LanternTrail.tsx`, com titulos a partir do `h2`.
 * `onOpenHeadquarters` e opcional e so atravessa: quem decide a navegacao e o
 * `App`, nao esta pagina; Campanhas repassa o callback, e a trilha decide
 * mostrar o botao "Ir ao Quartel-General" so quando ele existe e ha lanterna
 * pronta. Por isso Campanhas recebe uma prop, e a fronteira da pagina (so
 * compoe o `main`, o titulo e a trilha) continua a mesma.
 */
export function Campaigns({
  onOpenHeadquarters,
}: {
  onOpenHeadquarters?: () => void
} = {}) {
  const t = useT()
  return (
    <main
      data-testid="campaigns"
      className="area-main campaigns-main mx-auto w-full min-w-0 px-4 py-8 lg:px-6 xl:p-8"
    >
      <AreaHero
        scene="campaigns"
        headingId={CAMPAIGNS_HEADING_ID}
        title={t('campaigns.page.title')}
        note={t('campaigns.page.subtitle')}
      />
      <LanternTrail onOpenHeadquarters={onOpenHeadquarters} />
    </main>
  )
}
