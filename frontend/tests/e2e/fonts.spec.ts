import { expect } from '@playwright/test'
import { test } from './saudacaoJaVista'
import { layoutData } from './layoutData'

// Roda dentro da página: a Alegreya registrada e com o arquivo carregado.
const alegreyaLoaded = () =>
  [...document.fonts].some(
    (f) => f.family.replace(/['"]/g, '') === 'Alegreya' && f.status === 'loaded',
  )

test('com as fontes, a Alegreya carrega de fato', async ({ page }) => {
  await layoutData(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  expect(await page.evaluate(alegreyaLoaded)).toBe(true)
})

test('sem as fontes (rota pendente), o título aparece na hora com o fallback', async ({ page }) => {
  await layoutData(page)
  // A rota nunca responde: a fonte fica pendente, não abortada. Abortar
  // deixaria o teste vácuo, porque a falha de carga também cai no fallback.
  await page.route('**/fonts/**', () => undefined)
  // O preload e as @font-face pendentes seguram o evento load; por isso a
  // navegação espera só o DOM e a espera real fica no toBeVisible.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toBeVisible()
  expect(await h1.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0)
  expect(await page.evaluate(alegreyaLoaded)).toBe(false)
})
