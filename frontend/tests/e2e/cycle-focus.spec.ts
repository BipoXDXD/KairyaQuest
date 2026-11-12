import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page, type Route } from '@playwright/test'
import { test } from './saudacaoJaVista'
import type { Cycle } from '../../src/features/missions/types'
import type { Mission } from '../../src/shared/types/mission'
import { diaEMes, diaRelativo } from './datas'

// O dia antes do refresh e o dia depois dele, relativos a hoje (pendencia 207).
const DIA_ANTERIOR = diaRelativo(-1)
const DIA_ATUAL = diaRelativo(0)

const daily: Mission = {
  id: 16001,
  day: DIA_ANTERIOR,
  instructions: 'Diária anterior ao refresh de foco',
  completion_criterion: 'Entregar resumo',
  difficulty: 2,
  estimated_minutes: 30,
  mission_type: 'diaria',
  deadline: `${DIA_ANTERIOR}T23:59:59-03:00`,
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 40,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}
const nextDaily: Mission = {
  ...daily,
  id: 16002,
  day: DIA_ATUAL,
  deadline: `${DIA_ATUAL}T23:59:59-03:00`,
  instructions: 'Diária atual depois do refresh de foco',
}
const cycle = (mission: Mission | null, today = DIA_ANTERIOR): Cycle => ({
  today,
  mission,
  streak: 3,
  days_to_milestone: 4,
  special: null,
  late_daily: null,
})

// Fixtures de leitura: nenhuma escrita, persistência ou virada real do banco.
// Segura o GET do evento existente sem clicar um controle que tiraria o foco.
async function setup(page: Page) {
  let receive!: (route: Route) => void
  const requested = new Promise<Route>((resolve) => {
    receive = resolve
  })
  let cycleCalls = 0
  const unexpected: string[] = []
  const bodies: Record<string, unknown> = {
    // O boot do idioma (`ServerLocaleSync`): o mesmo idioma da tela, sem escrita.
    '/api/me': { display_name: 'Aventureira', locale: 'pt-BR' },
    '/api/missions': [],
    '/api/progress': {
      xp_total: 20,
      level: 1,
      level_floor_xp: 0,
      next_level_xp: 100,
      achievements: [],
    },
    '/api/plans/current': { plan: null },
    '/api/tutoring/status': { available: true },
    '/api/tutoring/messages': [],
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() !== 'GET' || (pathname !== '/api/cycle' && !(pathname in bodies))) {
      unexpected.push(`${request.method()} ${pathname}`)
      await route.abort()
      return
    }
    if (pathname === '/api/cycle') {
      cycleCalls += 1
      if (cycleCalls === 1) await route.fulfill({ json: cycle(daily) })
      else receive(route)
    } else {
      await route.fulfill({ json: bodies[pathname] })
    }
  })
  await page.goto('/')
  const button = page.getByRole('button', { name: `Concluir a missão: ${daily.instructions}` })
  await expect(button).toBeVisible()
  await expect(page.getByTestId('tutor-greeting')).toBeVisible()
  await button.focus()
  await expect(button).toBeFocused()
  return {
    button,
    heading: page.getByRole('heading', { level: 2, name: 'Missão de hoje — sua diária' }),
    unexpected,
    calls: () => cycleCalls,
    refresh: async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      const route = await requested
      await expect(button).toBeFocused()
      await expect(page.getByTestId('cycle-loading')).toHaveCount(0)
      return route
    },
  }
}

for (const noPlan of [false, true]) {
  test(`refresh ${noPlan ? 'sem diária' : 'com outra diária'} leva foco perdido ao título e Tab aos controles atuais`, async ({
    page,
  }) => {
    const { heading, refresh, unexpected, calls } = await setup(page)
    const route = await refresh()
    await route.fulfill({ json: cycle(noPlan ? null : nextDaily, DIA_ATUAL) })
    await expect(page.getByTestId('cycle-today')).toContainText(diaEMes(DIA_ATUAL))
    await expect(page.getByText(daily.instructions, { exact: true })).toHaveCount(0)
    if (noPlan) await expect(page.getByTestId('cycle-no-plan')).toBeVisible()
    else await expect(page.getByText(nextDaily.instructions, { exact: true })).toBeVisible()
    await expect(heading).toBeFocused()
    await page.keyboard.press('Tab')
    if (noPlan) {
      // A #142 pôs a entrada do formulário do plano sob o aviso de sem plano:
      // é o primeiro controle depois do título, antes do painel da Kairya.
      await expect(page.getByTestId('week-plan-open')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByTestId('tutor-panel-toggle')).toBeFocused()
    } else {
      // E/F acrescentaram Evidência e Iniciar antes de Concluir. O foco
      // recuperado alcança todos os controles da diária ATUAL pelo teclado.
      await expect(page.getByTestId('evidence-toggle')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        page.getByRole('button', { name: `Iniciar a missão: ${nextDaily.instructions}` }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        page.getByRole('button', { name: `Concluir a missão: ${nextDaily.instructions}` }),
      ).toBeFocused()
    }
    expect(calls()).toBe(2)
    expect(unexpected).toEqual([])
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}

test('refresh da mesma ID conserva Concluir focado', async ({ page }) => {
  const { button, heading, refresh, unexpected } = await setup(page)
  const route = await refresh()
  await route.fulfill({ json: cycle({ ...daily, estimated_minutes: 35 }, DIA_ATUAL) })
  await expect(page.getByTestId('cycle-today')).toContainText(diaEMes(DIA_ATUAL))
  await expect(page.getByTestId('mission-estimated-minutes')).toHaveText('35 min')
  await expect(button).toBeFocused()
  await expect(heading).not.toBeFocused()
  expect(unexpected).toEqual([])
})

test('erro silencioso conserva cartão e foco no Concluir', async ({ page }) => {
  const { button, heading, refresh, unexpected } = await setup(page)
  const route = await refresh()
  await route.fulfill({ status: 503, json: {} })
  await expect(page.getByTestId('cycle-stale')).toBeVisible()
  await expect(button).toBeFocused()
  await expect(heading).not.toBeFocused()
  expect(unexpected).toEqual([])
})

test('resposta não toma foco e rascunho da Kairya', async ({ page }) => {
  const { heading, refresh, unexpected } = await setup(page)
  const route = await refresh()
  const field = page.getByLabel('Sua mensagem para a Kairya')
  await field.fill('Rascunho durante refresh da diária')
  await expect(field).toBeFocused()
  await route.fulfill({ json: cycle(nextDaily, DIA_ATUAL) })
  await expect(page.getByText(nextDaily.instructions, { exact: true })).toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('Rascunho durante refresh da diária')
  await expect(heading).not.toBeFocused()
  expect(unexpected).toEqual([])
})

test('GET pendente aplicado com QG oculto não toma foco de Campanhas nem do retorno', async ({
  page,
}) => {
  const { refresh, unexpected } = await setup(page)
  const route = await refresh()
  await page.getByTestId('nav-campaigns').click()
  const campaigns = page.getByRole('heading', { level: 1, name: 'Campanhas — planos de estudo' })
  await expect(campaigns).toBeFocused()
  await route.fulfill({ json: cycle(nextDaily, DIA_ATUAL) })
  await expect(page.locator('[data-mission-id="16002"]')).toHaveCount(1)
  await expect(page.getByTestId('cycle')).toBeHidden()
  await expect(campaigns).toBeFocused()
  await page.getByTestId('nav-headquarters').click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quartel-General — seu painel de estudos' }),
  ).toBeFocused()
  await expect(page.getByText(nextDaily.instructions, { exact: true })).toBeVisible()
  expect(unexpected).toEqual([])
})

test('GET pendente não atravessa folha modal móvel nem altera retorno do foco', async ({
  page,
}) => {
  const { heading, refresh, unexpected } = await setup(page)
  const route = await refresh()
  await page.setViewportSize({ width: 375, height: 844 })
  await page.getByTestId('tutor-sheet-open').click()
  const dialog = page.getByRole('dialog')
  const field = dialog.getByLabel('Sua mensagem para a Kairya')
  await expect(field).toBeFocused()
  await expect(page.getByTestId('headquarters')).toHaveAttribute('inert', '')
  await route.fulfill({ json: cycle(nextDaily, DIA_ATUAL) })
  await expect(page.locator('[data-mission-id="16002"]')).toHaveCount(1)
  await expect(field).toBeFocused()
  await expect(heading).not.toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('region', { name: 'Conversa com a Kairya' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByTestId('tutor-sheet-close')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  await expect(page.getByText(nextDaily.instructions, { exact: true })).toBeVisible()
  await expect(heading).not.toBeFocused()
  expect(unexpected).toEqual([])
})
