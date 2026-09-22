/** A chave do `localStorage` onde mora o aberto/fechado do painel. */
export const PANEL_OPEN_KEY = 'focusquest.tutor-panel.open'

/**
 * Se o painel do desktop comeca aberto.
 *
 * O `localStorage` pode LANCAR -- navegacao privada em alguns navegadores,
 * armazenamento bloqueado, cota estourada. Lembrar o painel e conveniencia:
 * sem armazenamento, ele comeca aberto e a pagina funciona.
 */
export function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writePanelOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, String(open))
  } catch {
    // Sem armazenamento, o painel so nao lembra a escolha na proxima visita.
  }
}
