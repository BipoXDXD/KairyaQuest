import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from './saudacaoJaVista'
import {
  ENGLISH_CASE_IDS,
  GALLERY_CASE_IDS,
  type GalleryCaseId,
} from '../../src/test/gallery/caseIds'

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
  'language-switcher-save-failed': async (page) => {
    // O setLocale do caso rejeita; a falha aparece na StatusLine danger e o
    // idioma anterior continua marcado.
    await page.getByRole('button', { name: 'EN, English' }).click()
    const status = page.getByRole('status')
    await expect(status).toHaveAttribute('data-tone', 'danger')
    // O nome do idioma na falha é o endônimo, com o `lang` do próprio idioma.
    await expect(status).toContainText('English')
    await expect(status.locator('[lang="en"]')).toHaveText('English')
    await expect(status).toBeVisible()
    await expect(page.getByRole('button', { name: 'PT, Português (Brasil)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
  'week-plan-form-error': async (page) => {
    // Envio com tudo em branco: nada sai, o resumo diz quantos faltam e o
    // primeiro campo ruim recebe o foco.
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-status')).toHaveAttribute('data-tone', 'danger')
    await expect(page.getByTestId('week-plan-day-0-instructions')).toBeFocused()
    await expect(page.getByTestId('week-plan-day-0-instructions')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  },
  'week-plan-form-sending': async (page) => {
    // O POST nunca responde: o botao fica ocupado.
    await page.route('**/api/plans', () => new Promise<void>(() => undefined))
    await preencherPlano(page)
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-submit')).toHaveAttribute('aria-busy', 'true')
  },
  'week-plan-form-failure': async (page) => {
    // 503: o texto de falha aparece na StatusLine danger e o botao volta a servir.
    await page.route('**/api/plans', (route) => route.fulfill({ status: 503, body: '' }))
    await preencherPlano(page)
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-status')).toHaveAttribute('data-tone', 'danger')
    await expect(page.getByTestId('week-plan-status')).toBeVisible()
    await expect(page.getByTestId('week-plan-submit')).not.toHaveAttribute('aria-busy', 'true')
  },
  'reschedule-proposal-confirming': async (page) => {
    // O POST nunca responde: Confirmar e Recusar ficam travados no meio da decisao.
    await page.route('**/api/tutoring/actions/31/confirm', () => new Promise<void>(() => undefined))
    await page.getByTestId('proposal-confirm').click()
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled()
    await expect(page.getByTestId('proposal-reject')).toBeDisabled()
  },
  'reschedule-proposal-confirm-failed': async (page) => {
    // 503: o aviso de falha aparece e os botoes voltam a servir.
    await page.route('**/api/tutoring/actions/31/confirm', (route) =>
      route.fulfill({ status: 503, body: '' }),
    )
    await page.getByTestId('proposal-confirm').click()
    await expect(page.getByTestId('proposal-failure')).toBeVisible()
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled()
  },
  'evidence-form-link-error': async (page) => {
    // O erro do link so aparece depois que o campo perde o foco.
    await page.getByTestId('evidence-link').focus()
    await page.getByTestId('evidence-text').focus()
    await expect(page.getByTestId('evidence-link-error')).toBeVisible()
  },
}

/** Segunda e prova preenchidas, e a segunda copiada para o resto: o formulario fica valido. */
async function preencherPlano(page: Page): Promise<void> {
  await page.getByTestId('week-plan-day-0-instructions').fill('Resolver listas')
  await page.getByTestId('week-plan-day-0-criterion').fill('Cinco corrigidos')
  await page.getByTestId('week-plan-copy-monday').click()
  await page.getByTestId('week-plan-trial-instructions').fill('Prova simulada')
  await page.getByTestId('week-plan-trial-criterion').fill('Nota 7')
}

const ALVO_MINIMO_PX = 44

// Todo caso em portugues; os do formulario do plano tambem em ingles (`&lang=en`).
const VARIANTES = [
  ...GALLERY_CASE_IDS.map((id) => ({ id, query: `case=${id}`, nome: id })),
  ...ENGLISH_CASE_IDS.map((id) => ({ id, query: `case=${id}&lang=en`, nome: `${id} (en)` })),
]

for (const { id, query, nome } of VARIANTES) {
  test(`axe sem violações e alvos de 44px: ${nome}`, async ({ page }) => {
    await page.goto(`/ui-gallery.html?${query}`)
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
