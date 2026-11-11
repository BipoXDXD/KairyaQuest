import { useT } from '../shared/i18n/useT'
import { LanguageSwitcher, NavTabs } from '../shared/ui'
import { AREAS, type Area } from './areas'

interface SideNavProps {
  active: Area
  onNavigate: (area: Area) => void
}

/**
 * A navegacao entre as areas (README §7; spec do ciclo diario, C15).
 *
 * O `<nav>` e o unico landmark: as abas (`NavTabs`, botoes com
 * `aria-current="page"` e marcador `aria-hidden`) nao tem landmark proprio, e
 * o seletor de idioma fica no bloco da marca, fora da lista das areas.
 *
 * O layout muda so por CSS: no celular, uma barra no topo, no fluxo da
 * pagina (nada fixo que cubra botoes, e `flex-wrap` contra rolagem
 * horizontal); no desktop, uma coluna lateral. Ao contrario do painel da
 * Kairya, a semantica e a mesma nas duas larguras, entao media query basta.
 */
export function SideNav({ active, onNavigate }: SideNavProps) {
  const t = useT()
  const items = AREAS.map((area) => ({ id: area.id, label: t(area.labelKey) }))
  return (
    <nav
      aria-label={t('shell.nav.label')}
      data-testid="side-nav"
      className="border-b border-border-subtle px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 lg:mb-8">
        <div>
          <p className="font-display text-xl text-text-primary">{t('shell.brand.name')}</p>
          <p className="text-sm text-text-muted">{t('shell.brand.note')}</p>
        </div>
        <LanguageSwitcher />
      </div>
      <NavTabs items={items} active={active} onSelect={onNavigate} />
    </nav>
  )
}
