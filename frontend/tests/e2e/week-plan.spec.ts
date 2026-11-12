import { AxeBuilder } from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { diaCivil } from './datas'
import { CHAVE_DA_SAUDACAO, test } from './saudacaoJaVista'
import { API_URL } from './servers'

/**
 * Tracer bullet da #142: o plano da semana nasce PELA UI, sem semeadura por
 * API. O usuario abre o QG sem plano, preenche o formulario e ve o treino de
 * hoje aparecer sem recarregar, com a fala da Kairya.
 *
 * Cada idioma usa uma semana propria de 2025, longe da semana real e das
 * semanas literais dos outros specs (2025-01-06, 2025-02-03, 2025-03-03): a
 * unicidade do plano por semana nao colide. Os dois relogios (API e
 * navegador) sao fixados numa terca-feira dessa semana antes de qualquer
 * leitura, e o da API volta ao real no `afterAll`, mesmo se um teste reprovar.
 */
const EXECUCAO = randomUUID().slice(0, 8)

const CENARIOS = [
  { locale: 'pt-BR', instante: '2025-04-08T12:00:00Z', criar: 'Criar plano' },
  { locale: 'en', instante: '2025-05-06T12:00:00Z', criar: 'Create plan' },
] as const

let api: APIRequestContext

async function fixarRelogio(page: Page, instante: string): Promise<void> {
  const resposta = await api.put('/_e2e/clock', { data: { now: instante } })
  expect(resposta.status(), await resposta.text()).toBe(200)
  await page.clock.setFixedTime(new Date(instante))
  await page.addInitScript(
    ({ chave, dia }) => {
      try {
        window.localStorage.setItem(chave, dia)
      } catch {
        // Sem localStorage nao ha o que gravar; a saudacao sai por cima.
      }
    },
    { chave: CHAVE_DA_SAUDACAO, dia: diaCivil(new Date(instante)) },
  )
}

async function definirIdioma(locale: string): Promise<void> {
  const resposta = await api.patch('/api/me', { data: { locale } })
  expect(resposta.status(), await resposta.text()).toBe(200)
}

/** Preenche os sete treinos e a prova; dificuldade e minutos ficam no padrao. */
async function preencherPlano(page: Page, rotulo: string): Promise<void> {
  const formulario = page.getByTestId('week-plan-form')
  for (let dia = 0; dia < 7; dia += 1) {
    const detalhes = formulario.getByTestId(`week-plan-day-${String(dia)}`)
    if ((await detalhes.getAttribute('open')) === null) {
      await formulario.getByTestId(`week-plan-day-${String(dia)}-summary`).click()
    }
    await formulario
      .getByTestId(`week-plan-day-${String(dia)}-instructions`)
      .fill(`${rotulo} dia ${String(dia + 1)} (e2e ${EXECUCAO})`)
    await formulario
      .getByTestId(`week-plan-day-${String(dia)}-criterion`)
      .fill(`Criterio ${String(dia + 1)} (e2e ${EXECUCAO})`)
  }
  await formulario
    .getByTestId('week-plan-trial-instructions')
    .fill(`Prova ${rotulo} (e2e ${EXECUCAO})`)
  await formulario
    .getByTestId('week-plan-trial-criterion')
    .fill(`Criterio da prova (e2e ${EXECUCAO})`)
}

test.describe.configure({ mode: 'serial' })
test.use({ timezoneId: 'America/Sao_Paulo' })

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: API_URL })
})

test.afterAll(async () => {
  const relogio = await api.delete('/_e2e/clock')
  expect(relogio.status()).toBe(204)
  // O idioma dos specs seguintes e o pt-BR do config; o PATCH nao aceita null.
  await definirIdioma('pt-BR')
  await api.dispose()
})

for (const cenario of CENARIOS) {
  test(`o plano da semana e criado pela UI e aparece sem recarregar (${cenario.locale})`, async ({
    page,
  }) => {
    await definirIdioma(cenario.locale)
    await fixarRelogio(page, cenario.instante)
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('lang', cenario.locale)
    await expect(page.getByTestId('cycle-no-plan')).toBeVisible()
    await page.getByTestId('week-plan-open').first().click()
    await expect(page.getByTestId('week-plan-form')).toBeVisible()
    await expect(page.getByTestId('week-plan-week-current')).toBeFocused()

    const axe = await new AxeBuilder({ page }).include('[data-testid="week-plan-form"]').analyze()
    expect(axe.violations).toEqual([])

    await preencherPlano(page, cenario.locale)
    const submit = page.getByTestId('week-plan-submit')
    await expect(submit).toHaveText(cenario.criar)

    const criado = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/plans',
    )
    await submit.click()
    expect((await criado).status()).toBe(201)

    // Terca-feira: o treino de hoje e o segundo dia do plano, sem recarregar.
    await expect(page.getByTestId('cycle-no-plan')).toHaveCount(0)
    await expect(page.getByTestId('cycle').getByTestId('mission-instructions')).toHaveText(
      `${cenario.locale} dia 2 (e2e ${EXECUCAO})`,
    )
    await expect(page.getByTestId('kairya-bubble-anchor').getByRole('figure')).toBeVisible()
  })
}

// A proxima semana nao aparece na tela de hoje: o formulario fecha, a
// confirmacao recebe o foco e a semana atual continua sem plano. Relogio em
// 2025-06-03; o plano nasce para a semana de 2025-06-09, livre nos outros specs.
test('o plano da proxima semana e criado pela UI e confirmado sem prender o formulario', async ({
  page,
}) => {
  await definirIdioma('pt-BR')
  await fixarRelogio(page, '2025-06-03T12:00:00Z')
  await page.goto('/')

  await page.getByTestId('week-plan-open').first().click()
  await page.getByTestId('week-plan-week-next').check()
  await preencherPlano(page, 'proxima')

  const criado = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/plans',
  )
  await page.getByTestId('week-plan-submit').click()
  const resposta = await criado
  expect(resposta.status()).toBe(201)
  expect((resposta.request().postDataJSON() as { week_start: string }).week_start).toBe(
    '2025-06-09',
  )

  await expect(page.getByTestId('week-plan-form')).toHaveCount(0)
  await expect(page.getByTestId('week-plan-created-next')).toBeFocused()
  await expect(page.getByTestId('cycle-no-plan')).toBeVisible()
})
