import { AREAS, type Area } from './areas'

const ITEM_CLASS =
  'flex w-full items-center gap-2 rounded border-l-4 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none'
const CURRENT_CLASS = 'border-emerald-400 bg-slate-800 font-semibold text-slate-50'
const OTHER_CLASS = 'border-transparent text-slate-300 hover:bg-slate-900 hover:text-slate-100'

interface SideNavProps {
  active: Area
  onNavigate: (area: Area) => void
}

/**
 * A navegacao entre as areas (README §7; spec do ciclo diario, C15).
 *
 * Botoes, e nao links: sem URL por area nao ha `href` de verdade, e um `<a>`
 * sem `href` nao recebe foco. A area ativa leva `aria-current="page"` e,
 * para quem nao distingue a cor da barra, o marcador visivel ▸ e o peso da
 * fonte -- o marcador e `aria-hidden`, porque o leitor de tela ja ouve o
 * `aria-current`.
 *
 * O layout muda so por CSS: no celular, uma barra no topo, no fluxo da
 * pagina (nada fixo que cubra botoes, e `flex-wrap` contra rolagem
 * horizontal); no desktop, uma coluna lateral. Ao contrario do painel da
 * Tifa, a semantica e a mesma nas duas larguras, entao media query basta.
 */
export function SideNav({ active, onNavigate }: SideNavProps) {
  return (
    <nav
      aria-label="Áreas"
      data-testid="side-nav"
      className="border-b border-slate-800 px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-8"
    >
      <ul className="flex flex-wrap gap-2 lg:flex-col">
        {AREAS.map((area) => {
          const current = area.id === active
          return (
            <li key={area.id}>
              <button
                type="button"
                data-testid={`nav-${area.id}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => {
                  onNavigate(area.id)
                }}
                className={`${ITEM_CLASS} ${current ? CURRENT_CLASS : OTHER_CLASS}`}
              >
                {current && (
                  <span aria-hidden="true" data-testid="nav-current-marker">
                    ▸
                  </span>
                )}
                {area.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
