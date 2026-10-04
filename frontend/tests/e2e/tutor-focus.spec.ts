import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Cada requisição é local: nenhum POST destes cenários chega à API/banco.
async function fixtures(page: Page, available = true, history: unknown[] = []) {
  const unexpected: string[] = []
  const responses: Record<string, unknown> = {
    '/api/missions': [
      {
        id: 901,
        instructions: 'Missão de fundo',
        completion_criterion: 'Resumo',
        difficulty: 1,
        estimated_minutes: 10,
        mission_type: 'avulsa',
        day: null,
        deadline: '2027-01-01T12:00:00Z',
        state: 'pendente',
        availability: 'disponivel',
        started_at: null,
        completed_at: null,
        xp: 10,
        actual_duration_minutes: null,
      },
    ],
    '/api/tutoring/status': { available },
    '/api/tutoring/messages': history,
    '/api/plans/current': { plan: null },
    '/api/cycle': {
      today: '2026-10-04',
      mission: null,
      streak: 0,
      days_to_milestone: 7,
      special: null,
    },
    '/api/progress': {
      xp_total: 0,
      level: 1,
      level_floor_xp: 0,
      next_level_xp: 100,
      achievements: [],
    },
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path in responses) {
      await route.fulfill({ json: responses[path] })
    } else {
      unexpected.push(`${request.method()} ${path}`)
      await route.abort()
    }
  })
  return unexpected
}

async function insideSheet(page: Page) {
  await expect
    .poll(() =>
      page
        .getByRole('dialog', { name: 'Tifa' })
        .evaluate((node) => node.contains(document.activeElement)),
    )
    .toBe(true)
}

for (const available of [true, false]) {
  test(`resize da folha contém teclado com status ${available ? 'disponível' : 'indisponível'}`, async ({
    page,
  }) => {
    const unexpected = await fixtures(page, available)
    await page.setViewportSize({ width: 375, height: 844 })
    await page.goto('/')
    await page.getByTestId('tutor-sheet-open').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId(available ? 'tutor-greeting' : 'tutor-unavailable')).toBeVisible()
    await page.getByTestId('tutor-sheet-close').focus()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByTestId('tutor-panel-toggle')).toBeVisible()
    await expect(page.getByTestId(available ? 'tutor-input' : 'tutor-panel-toggle')).toBeFocused()
    await page.setViewportSize({ width: 375, height: 844 })
    await expect(page.getByRole('dialog', { name: 'Tifa' })).toBeVisible()
    await insideSheet(page)
    for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      await insideSheet(page)
    }
    // Mesmo foco programático no fundo é recusado pelo navegador.
    const backgroundFocused = await page.getByTestId('nav-campaigns').evaluate((node) => {
      let focused = false
      const onFocus = () => {
        focused = true
      }
      node.addEventListener('focus', onFocus)
      node.focus()
      node.removeEventListener('focus', onFocus)
      return focused
    })
    expect(backgroundFocused).toBe(false)
    await insideSheet(page)
    await expect(page.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    await page.getByTestId('nav-campaigns').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: /Campanhas/ })).toBeFocused()
    expect(unexpected).toEqual([])
  })
}

test('resize fechado só transfere foco que pertencia à Tifa e respeita recolhimento', async ({
  page,
}) => {
  const unexpected = await fixtures(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('tutor-input')).toBeEnabled()
  await page.getByTestId('tutor-input').fill('Rascunho preservado')
  await page.setViewportSize({ width: 375, height: 844 })
  await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('tutor-input')).toBeFocused()
  await expect(page.getByTestId('tutor-input')).toHaveValue('Rascunho preservado')
  await page.getByTestId('tutor-panel-toggle').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.setViewportSize({ width: 375, height: 844 })
  await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('tutor-panel-toggle')).toBeFocused()
  await expect(page.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('nav-campaigns').focus()
  await page.setViewportSize({ width: 375, height: 844 })
  await expect(page.getByTestId('nav-campaigns')).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('nav-campaigns')).toBeFocused()
  expect(unexpected).toEqual([])
})

type StreamHarness = {
  posts: number
  aborted: boolean
  emit: (event: string, data: unknown) => void
  finish: () => void
  request: { client_message_id: string; content: string }
}
type StreamWindow = Window & typeof globalThis & { focusStream: StreamHarness }

test('SSE local em voo e rascunho sobrevivem aos dois breakpoints sem aborto ou reenvio', async ({
  page,
}) => {
  const unexpected = await fixtures(page)
  await page.addInitScript(() => {
    const host = window as StreamWindow
    const originalFetch = window.fetch
    host.focusStream = { posts: 0, aborted: false } as StreamHarness
    window.fetch = (url, init) => {
      if (init?.method === 'POST' && String(url).endsWith('/tutoring/messages')) {
        const state = host.focusStream
        state.posts++
        state.request = JSON.parse(init.body as string)
        init.signal?.addEventListener('abort', () => {
          state.aborted = true
        })
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            state.emit = (event, data) =>
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              )
            state.finish = () => controller.close()
          },
        })
        return Promise.resolve(
          new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
        )
      }
      return originalFetch(url, init)
    }
  })
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/')
  await page.getByTestId('tutor-sheet-open').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tutor-input')).toBeEnabled()
  await page.getByTestId('tutor-input').fill('Pergunta local')
  await page.getByTestId('tutor-send').focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => (window as StreamWindow).focusStream.posts)).toBe(1)
  await page.evaluate(() => {
    const state = (window as StreamWindow).focusStream
    state.emit('user_message', {
      id: 801,
      role: 'user',
      content: state.request.content,
      status: 'completa',
      client_message_id: state.request.client_message_id,
      reply_to_id: null,
      error_code: null,
      created_at: '2026-10-04T12:00:00Z',
      actions: [],
    })
    state.emit('delta', { text: 'Prefixo local' })
  })
  await expect(page.getByTestId('tutor-partial')).toHaveText(/Prefixo local/)
  // O campo continua editável durante SSE; só o envio está desabilitado.
  await page.getByTestId('tutor-input').fill('Rascunho seguinte')
  await expect(page.getByTestId('tutor-input')).toHaveValue('Rascunho seguinte')
  await expect(page.getByTestId('tutor-send')).toBeDisabled()
  await page.getByTestId('tutor-sheet-close').focus()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('tutor-input')).toBeFocused()
  await page.getByTestId('tutor-panel-toggle').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await page.getByTestId('nav-campaigns').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: /Campanhas/ })).toBeFocused()
  await page.setViewportSize({ width: 375, height: 844 })
  await expect(page.getByTestId('tutor-sheet')).toHaveCount(1)
  await page.getByTestId('nav-headquarters').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Tifa' })).toBeVisible()
  await expect(page.getByTestId('tutor-input')).toBeFocused()
  await expect(page.getByTestId('tutor-input')).toHaveValue('Rascunho seguinte')
  await expect(page.getByTestId('tutor-partial')).toHaveText(/Prefixo local/)
  await page.keyboard.press('Shift+Tab')
  await insideSheet(page)
  await page.keyboard.press('Tab')
  await insideSheet(page)
  await page.evaluate(() => {
    const state = (window as StreamWindow).focusStream
    const user = {
      id: 801,
      role: 'user',
      content: state.request.content,
      status: 'completa',
      client_message_id: state.request.client_message_id,
      reply_to_id: null,
      error_code: null,
      created_at: '2026-10-04T12:00:00Z',
      actions: [],
    }
    state.emit('done', {
      ...user,
      id: 802,
      role: 'tutor',
      content: 'Resposta local completa',
      client_message_id: null,
      reply_to_id: 801,
    })
    state.finish()
  })
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa terminou de responder.')
  await expect(page.getByText('Resposta local completa')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Resposta local completa')).toBeVisible()
  expect(
    await page.evaluate(() => ({
      posts: (window as StreamWindow).focusStream.posts,
      aborted: (window as StreamWindow).focusStream.aborted,
    })),
  ).toEqual({ posts: 1, aborted: false })
  expect(unexpected).toEqual([])
})

test('fechar, backdrop e link do quadro liberam o teclado do fundo', async ({ page }) => {
  const unexpected = await fixtures(page, true, [
    {
      id: 9300,
      role: 'tutor',
      content: 'Missão criada localmente',
      status: 'completa',
      client_message_id: null,
      reply_to_id: 9299,
      error_code: null,
      created_at: '2026-10-04T12:00:00Z',
      actions: [
        {
          id: 9200,
          kind: 'create_mission',
          state: 'executada',
          payload: {
            instructions: 'Estudar',
            completion_criterion: 'Resumo',
            difficulty: 1,
            estimated_minutes: 10,
            deadline: '2027-01-01T12:00:00Z',
          },
          mission_id: 901,
          error_code: null,
        },
      ],
    },
  ])
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/')
  for (const close of ['button', 'backdrop', 'board']) {
    await page.getByTestId('tutor-sheet-open').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tutor-input')).toBeEnabled()
    if (close === 'backdrop') {
      await page
        .locator('div[aria-hidden="true"].fixed.inset-0')
        .click({ position: { x: 5, y: 5 } })
    } else {
      await page
        .getByTestId(close === 'board' ? 'proposal-board-link' : 'tutor-sheet-close')
        .focus()
      await page.keyboard.press('Enter')
    }
    await expect(page.getByRole('dialog', { name: 'Tifa' })).toHaveCount(0)
    if (close === 'board') {
      await expect(page).toHaveURL(/#missions-heading$/)
      await page.keyboard.press('Tab')
      await expect(page.getByTestId('mission-complete')).toBeFocused()
    } else {
      await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    }
    await page.getByTestId('nav-campaigns').focus()
    await expect(page.getByTestId('nav-campaigns')).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: /Campanhas/ })).toBeFocused()
  expect(unexpected).toEqual([])
})

test('folha lembrada no QG oculto não bloqueia Campanhas e restaura foco ao voltar', async ({
  page,
}) => {
  const unexpected = await fixtures(page)
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto('/')
  await page.getByTestId('tutor-sheet-open').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tutor-input')).toBeEnabled()
  await page.getByTestId('tutor-input').fill('Rascunho entre áreas')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('tutor-panel-toggle')).toBeVisible()
  await page.getByTestId('nav-campaigns').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: /Campanhas/ })).toBeFocused()
  await page.setViewportSize({ width: 375, height: 844 })
  // Espera a subtree mobile mesmo quando QG está hidden.
  await expect(page.getByTestId('tutor-sheet')).toHaveCount(1)
  await page.getByTestId('nav-headquarters').focus()
  await expect(page.getByTestId('nav-headquarters')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Tifa' })).toBeVisible()
  await insideSheet(page)
  await expect(page.getByTestId('tutor-input')).toHaveValue('Rascunho entre áreas')
  await page.keyboard.press('Escape')
  await page.getByTestId('nav-campaigns').focus()
  await expect(page.getByTestId('nav-campaigns')).toBeFocused()
  expect(unexpected).toEqual([])
})
