import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from './saudacaoJaVista'
import type { Cycle } from '../../src/features/missions/types'
import type { Progress } from '../../src/features/progression/types'
import type { Mission } from '../../src/shared/types/mission'
import { diaEMes, diaRelativo, diasEntre, segundaDaSemana, somarDias } from './datas'

// O dia do ciclo antigo e o do novo, relativos a hoje (pendencia 207); a
// semana do plano antigo e a que contem o dia do ciclo antigo, comecando na
// segunda-feira, como o backend gera.
const DIA_ANTIGO = diaRelativo(-1)
const DIA_NOVO = diaRelativo(0)
const INICIO_DA_SEMANA = segundaDaSemana(DIA_ANTIGO)
const INDICE_DO_DIA_ANTIGO = diasEntre(INICIO_DA_SEMANA, DIA_ANTIGO)

const daily = (id: number, day: string): Mission => ({
  id,
  day,
  instructions: `Diária de ${day}`,
  completion_criterion: 'Entregar resumo',
  difficulty: 2,
  estimated_minutes: 30,
  mission_type: 'diaria',
  deadline: `${day}T23:59:59-03:00`,
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
})
const oldCycle: Cycle = {
  today: DIA_ANTIGO,
  mission: daily(7700, DIA_ANTIGO),
  streak: 3,
  days_to_milestone: 4,
  special: null,
  late_daily: null,
}
const newCycle: Cycle = {
  today: DIA_NOVO,
  mission: daily(7701, DIA_NOVO),
  streak: 0,
  days_to_milestone: 7,
  special: null,
  late_daily: null,
}
const oldPlan = {
  plan: {
    week_start: INICIO_DA_SEMANA,
    days: Array.from({ length: 7 }, (_, index) => ({
      day: somarDias(INICIO_DA_SEMANA, index),
      availability: index === INDICE_DO_DIA_ANTIGO ? 'disponivel' : 'fora_do_plano',
      mission: index === INDICE_DO_DIA_ANTIGO ? oldCycle.mission : null,
    })),
    special: { availability: 'bloqueada', progress: 3, mission: null },
  },
}
const progress = (xp: number): Progress => ({
  xp_total: xp,
  level: 1,
  level_floor_xp: 0,
  next_level_xp: 100,
  achievements: [],
})

// O relógio do servidor é representado pelas respostas controladas dos GETs.
// Não muda o relógio local nem apresenta esta simulação como meia-noite no banco.
async function setup(page: Page, next: () => Promise<'success' | 'failure'>) {
  const calls = new Map<string, number>()
  let serverAdvanced = false
  const bodies: Record<string, unknown> = {
    '/api/missions': [],
    '/api/tutoring/status': { available: true },
    '/api/tutoring/messages': [],
    '/api/plans/current': oldPlan,
  }
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const call = (calls.get(pathname) ?? 0) + 1
    calls.set(pathname, call)
    if (pathname === '/api/cycle' || pathname === '/api/progress') {
      const result = call === 1 ? 'success' : await next()
      await route.fulfill({
        status: result === 'failure' ? 503 : 200,
        json:
          result === 'failure'
            ? {}
            : pathname === '/api/cycle'
              ? serverAdvanced
                ? newCycle
                : oldCycle
              : progress(serverAdvanced ? 60 : 20),
      })
    } else if (pathname in bodies) {
      await route.fulfill({ json: bodies[pathname] })
    } else {
      await route.continue()
    }
  })
  await page.goto('/')
  await expect(page.getByText(`Diária de ${DIA_ANTIGO}`, { exact: true })).toBeVisible()
  await expect(page.getByTestId('progress-total')).toHaveText('20 XP no total')
  await expect(page.getByTestId('tutor-greeting')).toBeVisible()
  expect(calls.get('/api/cycle')).toBe(1)
  expect(calls.get('/api/progress')).toBe(1)
  await page.evaluate(() => {
    sessionStorage.setItem('navigation-window-events', '0')
    const record = () =>
      sessionStorage.setItem(
        'navigation-window-events',
        String(Number(sessionStorage.getItem('navigation-window-events')) + 1),
      )
    window.addEventListener('focus', record)
    document.addEventListener('visibilitychange', record)
  })
  return {
    calls,
    advanceServerDay: () => {
      serverAdvanced = true
    },
  }
}

async function sameTabReturn(page: Page, advanceServerDay: () => void) {
  await page.getByTestId('nav-campaigns').click()
  await expect(page.getByTestId('trail-mission')).toBeVisible()
  advanceServerDay()
  await page.getByTestId('nav-headquarters').click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quartel-General — seu painel de estudos' }),
  ).toBeFocused()
  expect(await page.evaluate(() => sessionStorage.getItem('navigation-window-events'))).toBe('0')
}

async function currentData(page: Page) {
  await expect(page.getByTestId('cycle-today')).toContainText(diaEMes(DIA_NOVO))
  await expect(page.getByTestId('cycle-streak')).toContainText('0 dias seguidos')
  await expect(page.getByText(`Diária de ${DIA_NOVO}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`Diária de ${DIA_ANTIGO}`, { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('progress-total')).toHaveText('60 XP no total')
}

test('retorno na mesma aba depois da virada do servidor atualiza em silêncio sem remontar a Kairya', async ({
  page,
}) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const { calls, advanceServerDay } = await setup(page, async () => {
    await pending
    return 'success'
  })
  await page.getByLabel('Sua mensagem para a Kairya').fill('Rascunho antes da meia-noite.')
  await sameTabReturn(page, advanceServerDay)
  await expect.poll(() => calls.get('/api/cycle')).toBe(2)
  await expect.poll(() => calls.get('/api/progress')).toBe(2)
  await expect(page.getByText(`Diária de ${DIA_ANTIGO}`, { exact: true })).toBeVisible()
  await expect(page.getByTestId('progress-total')).toHaveText('20 XP no total')
  await expect(page.getByTestId('cycle-loading')).toHaveCount(0)
  await expect(page.getByTestId('progress-loading')).toHaveCount(0)
  release()
  await currentData(page)
  await expect(page.getByLabel('Sua mensagem para a Kairya')).toHaveValue(
    'Rascunho antes da meia-noite.',
  )
  expect(calls.get('/api/missions')).toBe(1)
  expect(calls.get('/api/tutoring/messages')).toBe(1)
  expect(calls.get('/api/tutoring/status')).toBe(1)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('falha ao retornar preserva os dados e os botões Atualizar recuperam ciclo e progresso', async ({
  page,
}) => {
  let fail = true
  const { calls, advanceServerDay } = await setup(page, () =>
    Promise.resolve(fail ? 'failure' : 'success'),
  )
  await sameTabReturn(page, advanceServerDay)
  await expect(page.getByTestId('cycle-stale')).toBeVisible()
  await expect(page.getByTestId('progress-stale')).toBeVisible()
  await expect(page.getByText(`Diária de ${DIA_ANTIGO}`, { exact: true })).toBeVisible()
  await expect(page.getByTestId('progress-total')).toHaveText('20 XP no total')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  fail = false
  await page.getByTestId('cycle-refresh').click()
  await page.getByTestId('progress-refresh').click()
  await currentData(page)
  await expect(page.getByTestId('cycle-stale')).toHaveCount(0)
  await expect(page.getByTestId('progress-stale')).toHaveCount(0)
  expect(calls.get('/api/cycle')).toBe(3)
  expect(calls.get('/api/progress')).toBe(3)
})
