import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { esperarAnimacoesFinitas } from './animacoes'
import { layoutData } from './layoutData'
import { CHAVE_DA_SAUDACAO } from './saudacaoJaVista'
import { API_URL } from './servers'

/**
 * A presenca da Kairya ponta a ponta (Fase 6): a saudacao do dia, a celebracao
 * ao concluir a diaria, o rosto sem transicao com `prefers-reduced-motion` e o
 * axe com a bolha aberta.
 *
 * Importa `test` do Playwright, e NAO o de `saudacaoJaVista`: este spec testa
 * justamente a saudacao, entao cada contexto parte com o `localStorage` limpo.
 *
 * O relogio da API e o do navegador andam juntos (como em
 * `cycle-midnight.spec.ts`), numa semana de 2025 que nao colide com a semana
 * real dos outros specs nem com a de janeiro da virada da meia-noite. Sao
 * Paulo esta em UTC-3 o ano todo, por isso as horas sao escritas em UTC.
 */
const EXECUCAO = randomUUID().slice(0, 8)

const SEGUNDA = '2025-02-03'
/** Terca 04/02, 09:00 em Sao Paulo: manha. */
const TERCA_DE_MANHA = '2025-02-04T12:00:00Z'
/** Quarta 05/02, 09:00 em Sao Paulo: o dia seguinte. */
const QUARTA_DE_MANHA = '2025-02-05T12:00:00Z'

const diaria = (numero: number) => ({
  instructions: `Diaria ${String(numero)} da presenca (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(numero)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
})
const DIAS = [1, 2, 3, 4, 5, 6, 7].map(diaria)
const DIARIA_DE_TERCA = diaria(2).instructions
const DIARIA_DE_QUARTA = diaria(3).instructions

const FALA_DE_MANHA = /^Bom dia\./
const ALT_NEUTRO = 'Kairya, serena, com as mãos juntas à frente'
const ALT_COMEMORANDO = 'Kairya comemora, de punho erguido e sorriso aberto'

let api: APIRequestContext

test.use({ timezoneId: 'America/Sao_Paulo' })
test.describe.configure({ mode: 'serial' })

async function fixarRelogioDaApi(instante: string): Promise<void> {
  const resposta = await api.put('/_e2e/clock', { data: { now: instante } })
  expect(resposta.status(), await resposta.text()).toBe(200)
}

/** Instala o relogio do navegador no instante; ele anda sozinho ate ser pausado. */
async function instalarRelogio(page: Page, instante: string): Promise<void> {
  await fixarRelogioDaApi(instante)
  await page.clock.install({ time: new Date(instante) })
}

/**
 * Congela o relogio do navegador, 10 s depois do instante (ainda no mesmo dia
 * civil): dai em diante so `runFor`/`fastForward` fazem os timers dispararem, e
 * a celebracao de 3 s nao expira sozinha numa maquina lenta.
 */
async function pausarRelogio(page: Page, instante: string): Promise<void> {
  await page.clock.pauseAt(new Date(new Date(instante).getTime() + 10_000))
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: API_URL })
  await fixarRelogioDaApi(TERCA_DE_MANHA)
  const plano = await api.post('/api/plans', {
    data: {
      week_start: SEGUNDA,
      days: DIAS,
      bonus: {
        instructions: `Especial da presenca (e2e ${EXECUCAO})`,
        completion_criterion: `Criterio da especial (e2e ${EXECUCAO})`,
        estimated_minutes: 120,
      },
    },
  })
  expect(plano.status(), await plano.text()).toBe(201)
})

// O relogio volta a ser o real mesmo se um teste reprovar no meio: os outros
// arquivos do E2E rodam contra a mesma API.
test.afterAll(async () => {
  const resposta = await api.delete('/_e2e/clock')
  expect(resposta.status()).toBe(204)
  await api.dispose()
})

const bolha = (page: Page) => page.getByTestId('kairya-bubble-anchor').getByRole('figure')
const rostoDeCena = (page: Page) => page.getByTestId('tutor-portrait').locator('img')

test('a saudacao sai uma vez por dia: nao repete ao recarregar e volta no dia seguinte', async ({
  page,
}) => {
  await instalarRelogio(page, TERCA_DE_MANHA)
  await page.goto('/')

  await expect(bolha(page)).toBeVisible()
  await expect(bolha(page).getByRole('paragraph').first()).toHaveText(FALA_DE_MANHA)
  await expect(bolha(page).getByText('Kairya', { exact: true })).toBeVisible()
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), CHAVE_DA_SAUDACAO))
    .toBe('2025-02-04')

  // Mesmo contexto, mesmo dia: o `localStorage` guarda o dia e a bolha nao volta.
  await page.reload()
  // A saudacao nasce da leitura do ciclo: com a missao e o composer da tutora
  // na tela, a decisao de saudar ja foi tomada e a ausencia da bolha e real.
  await expect(page.getByTestId('cycle').getByTestId('mission-instructions')).toHaveText(
    DIARIA_DE_TERCA,
  )
  await expect(page.getByLabel('Sua mensagem para a Kairya')).toBeVisible()
  await expect(bolha(page)).toHaveCount(0)
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), CHAVE_DA_SAUDACAO))
    .toBe('2025-02-04')

  // Dia seguinte, com os dois relogios: a saudacao volta.
  await fixarRelogioDaApi(QUARTA_DE_MANHA)
  await page.clock.setSystemTime(new Date(QUARTA_DE_MANHA))
  await page.reload()
  await expect(bolha(page).getByRole('paragraph').first()).toHaveText(FALA_DE_MANHA)
})

test('concluir a diaria celebra, volta ao neutro em 3 s com a fala na bolha, e fechar remove a bolha', async ({
  page,
}) => {
  await instalarRelogio(page, TERCA_DE_MANHA)
  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  await expect(ciclo.getByTestId('mission-instructions')).toHaveText(DIARIA_DE_TERCA)
  await expect(bolha(page)).toHaveAttribute('data-tone', 'neutral')
  await expect(rostoDeCena(page)).toHaveAttribute('alt', ALT_NEUTRO)
  const falaDaSaudacao = await bolha(page).getByRole('paragraph').first().textContent()
  await pausarRelogio(page, TERCA_DE_MANHA)

  await ciclo.getByRole('button', { name: `Concluir a missão: ${DIARIA_DE_TERCA}` }).click()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')

  await expect(bolha(page)).toHaveAttribute('data-tone', 'celebrating')
  await expect(rostoDeCena(page)).toHaveAttribute('alt', ALT_COMEMORANDO)
  await expect(bolha(page).getByRole('paragraph').first()).not.toHaveText(falaDaSaudacao ?? '')
  const fala = await bolha(page).getByRole('paragraph').first().textContent()

  await page.clock.runFor(3000)
  await expect(rostoDeCena(page)).toHaveAttribute('alt', ALT_NEUTRO)
  // A fala continua na bolha depois que o rosto volta ao repouso.
  await expect(bolha(page).getByRole('paragraph').first()).toHaveText(fala ?? '')

  await bolha(page).getByRole('button', { name: 'Fechar a fala da Kairya' }).click()
  await expect(bolha(page)).toHaveCount(0)
})

test.describe('com movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' })

  test('o rosto troca de expressao na hora, sem transicao', async ({ page }) => {
    await instalarRelogio(page, QUARTA_DE_MANHA)
    await page.goto('/')
    const ciclo = page.getByTestId('cycle')
    await expect(ciclo.getByTestId('mission-instructions')).toHaveText(DIARIA_DE_QUARTA)
    const rosto = rostoDeCena(page)
    await pausarRelogio(page, QUARTA_DE_MANHA)
    // O navegador devolve `1e-05s` (o piso que ele aplica a "zero") em vez de `0s`.
    const semTransicao = async () =>
      expect(
        Number.parseFloat(await rosto.evaluate((img) => getComputedStyle(img).transitionDuration)),
      ).toBeLessThan(0.001)
    const neutro = await rosto.getAttribute('src')
    await semTransicao()

    await ciclo.getByRole('button', { name: `Concluir a missão: ${DIARIA_DE_QUARTA}` }).click()
    await expect(rosto).toHaveAttribute('alt', ALT_COMEMORANDO)
    // O `src` ja e outro no mesmo quadro em que o `alt` trocou, e nada transita.
    expect(await rosto.getAttribute('src')).not.toBe(neutro)
    await semTransicao()

    await page.clock.runFor(3000)
    await expect(rosto).toHaveAttribute('alt', ALT_NEUTRO)
    expect(await rosto.getAttribute('src')).toBe(neutro)
    await semTransicao()
  })
})

// O app tem um tema so; as duas preferencias de cor do navegador provam que
// nenhuma delas (inclusive `dark`) muda o contraste da bolha.
for (const esquema of ['light', 'dark'] as const) {
  test(`axe sem violacoes com a bolha aberta, esquema ${esquema}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: esquema })
    await page.goto('/')
    await expect(page.getByLabel('Sua mensagem para a Kairya')).toBeVisible()
    await expect(bolha(page)).toBeVisible()
    await esperarAnimacoesFinitas(page)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}

test.describe('layout com a saudacao aberta', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('o campo do composer da tutora cabe inteiro no viewport', async ({ page }) => {
    await layoutData(page)
    await page.goto('/')
    await expect(bolha(page)).toBeVisible()
    // `ratio: 1`: o campo inteiro dentro do viewport do `test.use`, com retry.
    await expect(page.getByLabel('Sua mensagem para a Kairya')).toBeInViewport({ ratio: 1 })
  })
})
