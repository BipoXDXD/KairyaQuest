import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { GALLERY_CASE_IDS, type GalleryCaseId } from '../../src/test/gallery/caseIds'

/**
 * axe sem violacoes e alvos de toque de 44px em cada estado dos componentes de
 * `shared/ui/`, montados um por pagina na galeria (`ui-gallery.html`). Roda no
 * projeto `ui-states`, com servidor proprio (ver `playwright.config.ts`).
 */

// Estados que so existem depois de uma interacao: o spec a faz e afirma o
// estado antes do axe (decisao N3: a API dos componentes nao ganha prop so
// para a galeria).
const SETUP: Partial<Record<GalleryCaseId, (page: Page) => Promise<void>>> = {
  'confirm-dialog-confirming': async (page) => {
    // O onConfirm do caso nunca resolve.
    const confirm = page.getByRole('dialog').locator('[data-variant="danger-confirm"]')
    await confirm.click()
    await expect(confirm).toHaveAttribute('aria-busy', 'true')
  },
}

const ALVO_MINIMO_PX = 44

for (const id of GALLERY_CASE_IDS) {
  test(`axe sem violações e alvos de 44px: ${id}`, async ({ page }) => {
    await page.goto(`/ui-gallery.html?case=${id}`)
    const root = page.locator(`[data-gallery-case="${id}"]`)
    // Nao deixa o axe rodar sobre uma pagina vazia. A guarda olha o conteudo, e
    // nao a secao: um <dialog> modal vai para a top layer e deixa a secao com
    // tamanho zero, que o Playwright considera oculta.
    await expect(root.locator('*').filter({ visible: true }).first()).toBeVisible()
    await SETUP[id]?.(page)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    for (const b of await page.getByRole('button').all()) {
      const box = await b.boundingBox()
      expect(box !== null && box.width >= ALVO_MINIMO_PX && box.height >= ALVO_MINIMO_PX).toBe(true)
    }
  })
}
