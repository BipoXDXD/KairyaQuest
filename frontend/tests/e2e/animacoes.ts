import type { Page } from '@playwright/test'

/**
 * Espera as animações finitas da página terminarem. O axe audita a UI estável:
 * no meio do fade-in da bolha da Kairya o texto está semitransparente e o
 * contraste medido sai falso. O contraste da bolha em si é verificado na 6.3h.
 *
 * Só as animações com `iterations` finito: uma infinita (spinner) nunca
 * terminaria e travaria a espera.
 */
export async function esperarAnimacoesFinitas(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animacao) =>
          animacao.playState !== 'running' ||
          animacao.effect?.getComputedTiming().iterations === Infinity,
      ),
  )
}
