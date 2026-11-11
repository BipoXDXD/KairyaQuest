import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { CurrentPlan } from '../../src/features/campaigns/types'
import type { ActionRead, MessageRead } from '../../src/features/tutoring/types'
import type { Mission } from '../../src/shared/types/mission'
import { diaRelativo, instanteRelativo, isoUtc, somarDias } from './datas'
import { layoutData } from './layoutData'

/** Folga mínima entre o fim do último cartão e o topo do botão fixo da Kairya. */
const MARGEM_MINIMA_KAIRYA_PX = 8

// Datas relativas a hoje (pendencia 207): o dia do ciclo, a semana do plano
// que termina nele, um instante ja passado e os prazos futuros.
const HOJE = diaRelativo(0)
const INICIO_DA_SEMANA = somarDias(HOJE, -6)
const ONTEM = isoUtc(instanteRelativo(-1, 9))

// Estes cenários isolam a apresentação com respostas GET determinísticas.
// Persistência/ações reais são verificadas nas outras specs; aqui o tamanho
// e o conteúdo dos dados não dependem da ordem dos cenários do banco.
const LONG_TEXT = `https://exemplo.test/${'transações'.repeat(60)}`
const mission: Mission = {
  id: 9100,
  instructions: 'Estudar transações no PostgreSQL',
  completion_criterion: 'Explicar o resultado com evidências.',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: isoUtc(instanteRelativo(142, 9)),
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
const proposal: ActionRead = {
  id: 9200,
  kind: 'create_mission',
  state: 'proposta',
  payload: {
    instructions: LONG_TEXT,
    completion_criterion: LONG_TEXT,
    difficulty: mission.difficulty,
    estimated_minutes: mission.estimated_minutes,
    deadline: mission.deadline,
  },
  mission_id: null,
  error_code: null,
}
const message: MessageRead = {
  id: 9300,
  role: 'tutor',
  content: 'Uma explicação com texto normal.',
  status: 'completa',
  client_message_id: null,
  reply_to_id: 9299,
  error_code: null,
  fallback_model: null,
  created_at: ONTEM,
  actions: [],
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    })),
  ).toEqual({ width: page.viewportSize()!.width, content: page.viewportSize()!.width })
}

async function readableText(locator: Locator, text: string) {
  await expect(locator).toContainText(text)
  const metrics = await locator.evaluate((node) => {
    const element = node as HTMLElement
    const style = getComputedStyle(element)
    return {
      width: element.clientWidth,
      content: element.scrollWidth,
      ellipsis: style.textOverflow,
      overflow: style.overflowX,
    }
  })
  expect(metrics.content).toBeLessThanOrEqual(metrics.width + 1)
  expect(metrics.ellipsis).not.toBe('ellipsis')
  expect(['hidden', 'clip']).not.toContain(metrics.overflow)
}

async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

for (const width of [1440, 1024]) {
  test(`desktop ${String(width)}: o controle recolhido cabe no painel e abre pelo teclado`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await layoutData(page, [mission])
    await page.goto('/')
    await expect(page.getByTestId('tutor-greeting')).toBeVisible()
    const toggle = page.getByTestId('tutor-panel-toggle')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAccessibleName('Abrir o painel da Kairya')
    await expect(toggle).toBeFocused()
    const panel = await page.getByTestId('tutor-panel').boundingBox()
    const control = await toggle.boundingBox()
    expect(panel).not.toBeNull()
    expect(control).not.toBeNull()
    expect(control!.x).toBeGreaterThanOrEqual(panel!.x)
    expect(control!.x + control!.width).toBeLessThanOrEqual(panel!.x + panel!.width)
    expect(control!.width).toBeGreaterThanOrEqual(24)
    expect(control!.height).toBeGreaterThanOrEqual(24)
    await noHorizontalOverflow(page)
    await expect(toggle).toHaveAttribute('title', 'Abrir o painel da Kairya')
    await accessible(page)
    await page.screenshot({ path: testInfo.outputPath('collapsed.png'), fullPage: true })
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAccessibleName('Recolher o painel da Kairya')
    await expect(page.getByTestId('tutor-greeting')).toBeVisible()
    await expect(toggle).toBeFocused()
  })
}

// O painel sticky preserva o composer nas alturas curtas; as sete conquistas
// não empurram a próxima ação para fora da primeira dobra.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 500 },
]) {
  test(`desktop ${String(viewport.width)}x${String(viewport.height)}: a jornada e o composer continuam acessiveis`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await layoutData(
      page,
      Array.from({ length: 10 }, (_, index) => ({ ...mission, id: 9500 + index })),
    )
    await page.route('**/api/progress', (route) =>
      route.fulfill({
        json: {
          xp_total: 260,
          level: 2,
          level_floor_xp: 100,
          next_level_xp: 300,
          achievements: [
            ['first_steps', 'Primeiros passos'],
            ['streak_7', 'Uma semana inteira'],
            ['streak_30', 'Um mês de hábito'],
            ['veteran_10', 'Veterano I'],
            ['veteran_50', 'Veterano II'],
            ['veteran_100', 'Veterano III'],
            ['tifa_partnership', 'Parceria com a Kairya'],
          ].map(([code, title]) => ({
            code,
            title,
            description: 'Continue estudando.',
            unlocked_at: null,
          })),
        },
      }),
    )
    await page.route('**/api/cycle', (route) =>
      route.fulfill({
        json: {
          today: HOJE,
          mission: { ...mission, id: 9600, mission_type: 'diaria', day: HOJE },
          streak: 3,
          days_to_milestone: 4,
          special: null,
          late_daily: null,
        },
      }),
    )
    await page.goto('/')
    await expect(page.getByTestId('tutor-greeting')).toBeVisible()
    const achievements = page.getByTestId('progress-achievement')
    await expect(achievements).toHaveCount(7)
    await expect(achievements.first()).toBeHidden()
    await expect(page.getByTestId('progress-total')).toBeVisible()
    if (viewport.height === 900) {
      const daily = page.getByTestId('cycle').getByTestId('mission-instructions')
      const start = page
        .getByTestId('cycle')
        .getByRole('button', { name: `Iniciar a missão: ${mission.instructions}`, exact: true })
      for (const target of [daily, start]) {
        const bounds = await target.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      }
    }
    const input = page.getByLabel('Sua mensagem para a Kairya')
    const draft = 'Meu rascunho continua na jornada.'
    await input.fill(draft)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    async function composerFits() {
      for (const target of [input, page.getByRole('button', { name: 'Enviar', exact: true })]) {
        const bounds = await target.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      }
    }
    await composerFits()
    const toggle = page.getByTestId('tutor-panel-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(input).toHaveValue(draft)
    await composerFits()
    await page.getByTestId('nav-campaigns').click()
    await expect(page.getByTestId('campaigns')).toBeVisible()
    await expect(page.getByTestId('tutor-panel')).toBeHidden()
    await expect(page.getByTestId('headquarters')).toBeHidden()
    await page.getByTestId('nav-headquarters').click()
    await expect(input).toHaveValue(draft)
    await composerFits()
    await noHorizontalOverflow(page)
    await accessible(page)
  })
}

for (const width of [320, 375]) {
  test.describe(`celular ${String(width)} com texto sem espaços`, () => {
    test.use({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    })

    test('missão e critério permanecem inteiros sem rolagem horizontal', async ({
      page,
    }, testInfo) => {
      await layoutData(page, [
        { ...mission, instructions: LONG_TEXT, completion_criterion: LONG_TEXT },
      ])
      await page.goto('/')
      const card = page.getByTestId('mission-item')
      await readableText(card.getByTestId('mission-instructions'), LONG_TEXT)
      await readableText(card.getByTestId('mission-completion-criterion'), LONG_TEXT)
      await expect(card.getByTestId('mission-state')).toHaveText('Pendente')
      await noHorizontalOverflow(page)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('mission-long.png'), fullPage: true })
    })

    test('no fim da rolagem, o botão da Kairya não cobre botão do último cartão', async ({
      page,
    }) => {
      await layoutData(page, [mission, { ...mission, id: mission.id + 1 }])
      await page.goto('/')
      const lastCard = page.getByTestId('mission-item').last()
      await expect(lastCard).toBeVisible()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const kairya = await page.getByTestId('tutor-sheet-open').boundingBox()
      expect(kairya).not.toBeNull()
      const buttons = await lastCard.getByRole('button').all()
      expect(buttons.length).toBeGreaterThan(0)
      for (const button of buttons) {
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        // Encostar (base do botão = topo da Kairya) não é sobrepor, e passaria
        // com a folga antiga de 64 px; a margem mínima pega esse caso.
        if (kairya !== null && box !== null) {
          expect(kairya.y - (box.y + box.height)).toBeGreaterThanOrEqual(MARGEM_MINIMA_KAIRYA_PX)
        }
      }
    })

    test('a trilha mantém instruções e critério completos e a navegação operável', async ({
      page,
    }, testInfo) => {
      const daily: Mission = {
        ...mission,
        mission_type: 'diaria',
        day: HOJE,
        instructions: LONG_TEXT,
        completion_criterion: LONG_TEXT,
      }
      const plan: CurrentPlan = {
        plan: {
          week_start: INICIO_DA_SEMANA,
          days: Array.from({ length: 7 }, (_, index) => ({
            day: somarDias(INICIO_DA_SEMANA, index),
            availability: index === 6 ? 'disponivel' : 'fora_do_plano',
            mission: index === 6 ? daily : null,
          })),
          special: { availability: 'bloqueada', progress: 0, mission: null },
        },
      }
      await layoutData(page, [], [], plan)
      await page.goto('/')
      await page.getByRole('button', { name: 'Campanhas', exact: true }).click()
      const content = page.getByTestId('trail-mission')
      await readableText(content.locator('p').nth(0), LONG_TEXT)
      await readableText(content.locator('p').nth(1), LONG_TEXT)
      await noHorizontalOverflow(page)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('trail-long.png'), fullPage: true })
      await page.getByTestId('trail-go-headquarters').focus()
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Quartel-General — seu painel de estudos' }),
      ).toBeFocused()
    })

    test('a proposta mostra os dois textos completos dentro da folha', async ({
      page,
    }, testInfo) => {
      await layoutData(page, [], [{ ...message, actions: [proposal] }])
      await page.goto('/')
      await page.getByTestId('tutor-sheet-open').click()
      const card = page.getByTestId('tutor-proposal')
      await readableText(card.getByTestId('proposal-instructions'), LONG_TEXT)
      await readableText(card.locator('p').filter({ hasText: 'Critério de conclusão:' }), LONG_TEXT)
      const region = page.getByRole('region', { name: 'Conversa com a Kairya' })
      expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
      await noHorizontalOverflow(page)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('proposal-long.png') })
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    })

    test('evidência, avaliação e formulário de reagendamento cabem no cartão', async ({ page }) => {
      await layoutData(page, [
        mission,
        {
          ...mission,
          id: 9101,
          state: 'concluida',
          availability: 'concluida',
          completed_at: ONTEM,
          verification: 'com_evidencia',
          evidence: { text: LONG_TEXT, link: LONG_TEXT },
          evaluation: {
            state: 'concluida',
            verdict: 'atende',
            feedback: LONG_TEXT,
            error_code: null,
            model: 'modelo-teste',
            finished_at: ONTEM,
          },
        },
      ])
      await page.goto('/')
      await readableText(page.getByTestId('evaluation-evidence-text'), LONG_TEXT)
      await readableText(page.getByTestId('evaluation-evidence-link'), LONG_TEXT)
      await readableText(page.getByTestId('evaluation-feedback'), LONG_TEXT)
      await page.getByTestId('reschedule-toggle').click()
      await expect(page.getByTestId('reschedule-deadline')).toBeVisible()
      await noHorizontalOverflow(page)
      await accessible(page)
    })

    test('a proposta de reagendamento quebra a URL dentro da folha', async ({ page }) => {
      const reschedule: ActionRead = {
        id: 9201,
        kind: 'reschedule_mission',
        state: 'proposta',
        payload: {
          mission_id: mission.id,
          instructions: LONG_TEXT,
          previous_deadline: mission.deadline,
          new_deadline: isoUtc(instanteRelativo(143, 9)),
          reason: 'falta_de_tempo',
        },
        mission_id: null,
        error_code: null,
      }
      await layoutData(page, [], [{ ...message, actions: [reschedule] }])
      await page.goto('/')
      await page.getByTestId('tutor-sheet-open').click()
      await readableText(page.getByTestId('reschedule-instructions'), LONG_TEXT)
      const region = page.getByRole('region', { name: 'Conversa com a Kairya' })
      expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
      await noHorizontalOverflow(page)
      await accessible(page)
    })

    test('a conversa quebra a URL e preserva o rascunho ao fechar', async ({ page }, testInfo) => {
      await layoutData(page, [], [{ ...message, content: LONG_TEXT }])
      await page.goto('/')
      await page.getByTestId('tutor-sheet-open').click()
      await readableText(page.getByTestId('tutor-message').locator('p').nth(1), LONG_TEXT)
      const region = page.getByRole('region', { name: 'Conversa com a Kairya' })
      expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
      await noHorizontalOverflow(page)
      await accessible(page)
      await page
        .getByLabel('Sua mensagem para a Kairya')
        .fill('Rascunho com acentos: ação e conclusão.')
      await page.screenshot({ path: testInfo.outputPath('conversation-long.png') })
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByLabel('Sua mensagem para a Kairya')).toHaveValue(
        'Rascunho com acentos: ação e conclusão.',
      )
    })
  })
}

// Uma largura só basta: a regra de movimento reduzido é global, sem media de
// largura, e o NavTabs tem a mesma transição no celular e no desktop.
test('reduced-motion zera as transições que existem sem ele', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByTestId('nav-campaigns')
  const duration = async () =>
    parseFloat(await nav.evaluate((el) => getComputedStyle(el).transitionDuration))
  // Sem a primeira asserção o teste passaria vazio: precisa haver transição para zerar.
  expect(await duration()).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await duration()).toBeLessThan(0.001)
})
