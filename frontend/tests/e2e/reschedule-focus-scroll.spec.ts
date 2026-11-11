import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { test } from './saudacaoJaVista'
import type { Mission } from '../../src/shared/types/mission'
import { campoDeHorario, diaRelativo, instanteRelativo, isoUtc } from './datas'

// Datas relativas a hoje (pendencia 207): o prazo original, o novo prazo
// pedido e um prazo ja passado para o caso recusado.
const PRAZO_ORIGINAL = isoUtc(instanteRelativo(140, 12))
const NOVO_PRAZO = instanteRelativo(149, 12)
const PRAZO_PASSADO = instanteRelativo(-70, 8)

const original: Mission = {
  id: 47001,
  instructions: 'Reagendar sem perder a posição da leitura',
  completion_criterion: 'Explicar o resultado com exemplos',
  difficulty: 2,
  estimated_minutes: 30,
  mission_type: 'avulsa',
  day: null,
  deadline: PRAZO_ORIGINAL,
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
const changed: Mission = {
  ...original,
  deadline: isoUtc(NOVO_PRAZO),
  reschedules: [
    {
      previous_deadline: PRAZO_ORIGINAL,
      new_deadline: isoUtc(NOVO_PRAZO),
      reason: 'falta_de_tempo',
      origin: 'usuario',
      rescheduled_at: isoUtc(instanteRelativo(-1, 7)),
    },
  ],
}

async function setup(page: Page) {
  let receive!: (route: Route) => void
  const requested = new Promise<Route>((resolve) => {
    receive = resolve
  })
  const pending = new Set<Route>()
  const posts: unknown[] = []
  const unexpected: string[] = []
  const bodies: Record<string, unknown> = {
    // O boot do idioma (`ServerLocaleSync`): o mesmo idioma da tela, sem escrita.
    '/api/me': { display_name: 'Aventureira', locale: 'pt-BR' },
    '/api/missions': [
      original,
      ...Array.from({ length: 7 }, (_, index) => ({
        ...original,
        id: 47002 + index,
        instructions: `Leitura complementar ${String(index + 1)}`,
      })),
    ],
    '/api/progress': {
      xp_total: 0,
      level: 1,
      level_floor_xp: 0,
      next_level_xp: 100,
      achievements: [],
    },
    '/api/plans/current': { plan: null },
    '/api/cycle': {
      today: diaRelativo(0),
      mission: null,
      streak: 0,
      days_to_milestone: 7,
      special: null,
      late_daily: null,
    },
    '/api/tutoring/status': { available: true },
    '/api/tutoring/messages': [],
  }
  // Respostas HTTP de apresentação: nenhum pedido alcança escrita no banco.
  // React, cliente HTTP, foco e rolagem são os do app/navegador reais.
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname === '/api/missions/47001/reschedule') {
      posts.push(request.postDataJSON())
      pending.add(route)
      receive(route)
    } else if (request.method() === 'GET' && pathname in bodies) {
      await route.fulfill({ json: bodies[pathname] })
    } else {
      unexpected.push(`${request.method()} ${pathname}`)
      await route.abort()
    }
  })
  await page.goto('/')
  await expect(page.getByTestId('missions-list')).toBeVisible()
  await expect(page.getByTestId('tutor-greeting')).toBeVisible()
  // Altura invariável e espaço sobrando isolam scroll por foco de scroll
  // anchoring/recolhimento do formulário. A geometria é só desta fixture.
  await page.addStyleTag({
    content: `
      html, [data-testid="missions-list"] { overflow-anchor: none; }
      [data-testid="missions-list"] {
        height: 320px;
        overflow-y: auto;
        scroll-behavior: auto;
      }
      [data-testid="missions-list"] > [data-testid="mission-item"] {
        min-height: 700px;
        flex-shrink: 0;
      }
    `,
  })
  const card = page.locator('[data-mission-id="47001"]')
  return {
    card,
    list: page.getByTestId('missions-list'),
    toggle: card.getByTestId('reschedule-toggle'),
    requested,
    posts,
    unexpected,
    reply: async (failed: boolean) => {
      const route = await requested
      await route.fulfill(
        failed
          ? { status: 422, json: { code: 'prazo_expirado', detail: 'Prazo expirado' } }
          : { json: changed },
      )
      pending.delete(route)
    },
    cleanup: async () => {
      await Promise.all(Array.from(pending, (route) => route.abort()))
    },
  }
}

async function readScroll(list: Locator) {
  return list.evaluate((element) => ({
    list: element.scrollTop,
    page: window.scrollY,
    maximum: element.scrollHeight - element.clientHeight,
  }))
}

for (const scenario of [
  { failed: false, movedFocus: false, name: 'bem sucedido devolve foco' },
  { failed: false, movedFocus: true, name: 'bem sucedido conserva rascunho e foco da Kairya' },
  { failed: true, movedFocus: true, name: 'recusado conserva rascunho e foco da Kairya' },
]) {
  test(`reagendamento ${scenario.name} sem alterar a rolagem`, async ({ page }) => {
    const { card, list, toggle, requested, posts, unexpected, reply, cleanup } = await setup(page)
    const { failed, movedFocus } = scenario
    try {
      await toggle.click()
      const pedido = failed ? PRAZO_PASSADO : NOVO_PRAZO
      const civil = campoDeHorario(pedido)
      await card.getByLabel('Novo prazo (horário de Brasília)').fill(civil)
      await card.getByLabel('Falta de tempo', { exact: true }).check()
      await card.getByTestId('reschedule-submit').click()
      await requested
      await expect(card.getByTestId('reschedule-submit')).toBeDisabled()
      expect(posts).toEqual([
        {
          operation_id: expect.any(String),
          new_deadline: pedido.toISOString(),
          reason: 'falta_de_tempo',
        },
      ])
      const field = page.getByLabel('Sua mensagem para a Kairya')
      if (movedFocus) await field.fill('Rascunho durante reagendamento')
      // Todas as ações que podem rolar já aconteceram. Depois desta foto,
      // apenas entregar HTTP e observar: não click/focus/scrollIntoView.
      await list.evaluate((element) => {
        element.scrollTop = 800
      })
      const before = await readScroll(list)
      expect(before.list).toBe(800)
      expect(before.maximum).toBeGreaterThan(1600)
      const geometry = await toggle.evaluate((element) => {
        const container = element.closest('[data-testid="missions-list"]')!
        return {
          bottom: element.getBoundingClientRect().bottom,
          containerTop: container.getBoundingClientRect().top,
        }
      })
      expect(geometry.bottom).toBeLessThan(geometry.containerTop)
      expect(geometry.bottom).toBeLessThan(0)

      await reply(failed)
      if (failed) {
        await expect(card.getByTestId('reschedule-error')).toHaveText(
          'O novo prazo precisa estar no futuro. Escolha uma data e um horário futuros.',
        )
        await expect(card.getByTestId('reschedule-error')).toHaveAttribute('role', 'alert')
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(card.getByLabel('Novo prazo (horário de Brasília)')).toHaveValue(civil)
        await expect(card.getByLabel('Falta de tempo', { exact: true })).toBeChecked()
        await expect(card.getByTestId('mission-deadline')).toHaveAttribute(
          'datetime',
          PRAZO_ORIGINAL,
        )
        await expect(card.getByTestId('mission-reschedule-entry')).toHaveCount(0)
      } else {
        await expect(card.getByTestId('mission-reschedule-status')).toHaveText('Prazo reagendado.')
        await expect(card.getByTestId('mission-deadline')).toHaveAttribute(
          'datetime',
          isoUtc(NOVO_PRAZO),
        )
        await expect(card.getByTestId('mission-reschedule-count')).toHaveText('Reagendada 1 vez')
        await expect(card.getByTestId('mission-reschedule-entry')).toHaveCount(1)
        await expect(card.getByTestId('mission-reschedule-entry')).toContainText(
          'Falta de tempo · por você',
        )
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await expect(card.getByTestId('reschedule-submit')).toHaveCount(0)
      }
      if (movedFocus) {
        await expect(field).toBeFocused()
        await expect(field).toHaveValue('Rascunho durante reagendamento')
      } else {
        await expect(toggle).toBeFocused()
      }
      await expect(card.getByTestId('mission-state')).toHaveText('Pendente')
      expect(unexpected).toEqual([])
      // Resultado/efeito/erro e foco passam ANTES do oráculo de scroll.
      const after = await readScroll(list)
      expect(after.maximum).toBeGreaterThan(1600)
      expect({ list: after.list, page: after.page }).toEqual({
        list: before.list,
        page: before.page,
      })
    } finally {
      await cleanup()
    }
  })
}
