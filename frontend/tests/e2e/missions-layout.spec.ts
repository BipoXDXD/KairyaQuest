import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { Mission } from '../../src/shared/types/mission'
import type { MissionCompletion } from '../../src/shared/types/reward'
import { layoutData } from './layoutData'

// As missões no design system (Tarefa 4.8): título longo no celular estreito e
// a lanterna da diária. Respostas determinísticas, sem depender do banco: a
// conclusão da diária de verdade já é coberta por cycle.spec.ts.
const avulsa: Mission = {
  id: 9400,
  instructions: 'A'.repeat(120),
  completion_criterion: 'Explicar o resultado com evidências.',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2027-04-01T12:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

const diaria: Mission = {
  ...avulsa,
  id: 9500,
  instructions: 'Revisar a lista de laços',
  mission_type: 'diaria',
  day: '2026-10-04',
}

const diariaConcluida: Mission = {
  ...diaria,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-10-04T15:00:00Z',
}

const conclusao: MissionCompletion = {
  ...diariaConcluida,
  reward: {
    xp_awarded: 100,
    xp_total: 100,
    level_before: 1,
    level_after: 1,
    achievements_unlocked: [],
  },
}

/** O ciclo com a diária de hoje; depois do POST de conclusão, ela volta concluída. */
async function cicloComDiaria(page: Page) {
  let completed = false
  await layoutData(page)
  // Registrada depois do `layoutData`, esta rota é consultada antes dele; o
  // que ela não trata segue (`fallback`) para as respostas do `layoutData`.
  await page.route('**/api/**', (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname === `/api/missions/${String(diaria.id)}/complete`) {
      completed = true
      return route.fulfill({ json: conclusao })
    }
    if (request.method() === 'GET' && pathname === '/api/cycle') {
      return route.fulfill({
        json: {
          today: '2026-10-04',
          mission: completed ? diariaConcluida : diaria,
          streak: completed ? 1 : 0,
          days_to_milestone: completed ? 6 : 7,
          special: null,
          late_daily: null,
        },
      })
    }
    return route.fallback()
  })
}

async function concluirDiaria(page: Page) {
  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  await ciclo.getByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }).click()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  return ciclo
}

test('título longo sem espaços a 320px não cria rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await layoutData(page, [avulsa])
  await page.goto('/')
  await expect(page.getByTestId('mission-instructions')).toHaveText(avulsa.instructions)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})

test('reduced-motion: concluir a diária mostra a lanterna acesa no estado final', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await cicloComDiaria(page)
  const ciclo = await concluirDiaria(page)

  const lanterna = ciclo.getByTestId('reward-lantern')
  await expect(lanterna).toHaveAttribute('data-lit', 'true')
  // A animação não se aplica: o estado aceso é o estilo estático do base.css.
  expect(await lanterna.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(await lanterna.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  expect(await lanterna.evaluate((el) => getComputedStyle(el).filter)).toMatch(/^drop-shadow\(/)
  await expect(ciclo.getByTestId('reward-xp')).toBeVisible()
})

test('axe sem violações no cartão concluído com a lanterna', async ({ page }) => {
  await cicloComDiaria(page)
  const ciclo = await concluirDiaria(page)

  const lanterna = ciclo.getByTestId('reward-lantern')
  await expect(lanterna).toHaveAttribute('data-lit', 'true')
  // Com movimento, a animação roda e assenta no mesmo estado aceso; o axe só
  // audita depois das duas entradas (anúncio e lanterna) terminarem.
  expect(await lanterna.evaluate((el) => getComputedStyle(el).animationName)).toBe('lantern-light')
  await expect.poll(() => lanterna.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await expect
    .poll(() => ciclo.getByTestId('reward').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1')

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
