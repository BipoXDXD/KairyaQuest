interface NavTabItem<T extends string> {
  id: T
  label: string
}

interface NavTabsProps<T extends string> {
  items: readonly NavTabItem<T>[]
  active: T
  onSelect: (id: T) => void
}

// `transition-colors` sem `motion-safe:`: a regra global de reduced-motion
// zera a transição, e precisa haver uma para zerar.
const ITEM_CLASS =
  'flex min-h-11 w-full items-center gap-2 rounded-ui border-l-4 px-3 py-2 text-left font-body text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'
const CURRENT_CLASS = 'border-action-primary bg-bg-raised font-bold text-text-primary'
const OTHER_CLASS = 'border-transparent text-text-muted hover:bg-bg-surface hover:text-text-primary'

/**
 * As abas de área: uma lista de botões, com `aria-current="page"` no ativo.
 * Sem landmark próprio: o `<nav>` é de quem monta (o `SideNav`), o que evita
 * landmarks aninhados. O ativo leva, além da cor, a barra lateral, o peso 700
 * e um marcador `aria-hidden` (o leitor de tela já ouve o `aria-current`).
 */
export function NavTabs<T extends string>({ items, active, onSelect }: NavTabsProps<T>) {
  return (
    <ul className="flex flex-wrap gap-2 lg:flex-col">
      {items.map((item) => {
        const current = item.id === active
        return (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`nav-${item.id}`}
              aria-current={current ? 'page' : undefined}
              onClick={() => {
                onSelect(item.id)
              }}
              className={`${ITEM_CLASS} ${current ? CURRENT_CLASS : OTHER_CLASS}`}
            >
              {current && (
                <span
                  aria-hidden="true"
                  data-testid="nav-current-marker"
                  className="inline-flex shrink-0"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
              {item.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
