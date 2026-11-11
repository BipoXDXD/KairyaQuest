import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../shared/i18n/messages/en'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion } from '../../shared/types/reward'
import { routeFetch } from '../../test/fetchRoutes'
import { HTTP_FAILURE_TEXT, renderWithI18n } from '../../test/i18n'
import { CycleSection } from './CycleSection'
import type { Cycle } from './types'

/**
 * A secao do ciclo em ingles. Os casos em pt-BR moram em
 * `CycleSection.test.tsx`; aqui, cada texto que muda de idioma, e o zero da
 * sequencia nos dois idiomas (no CLDR `pt` o 0 cai na forma `one`).
 */

const diaria: Mission = {
  id: 31,
  instructions: 'Solve 5 recursion exercises',
  completion_criterion: 'Five exercises checked',
  difficulty: 2,
  estimated_minutes: 45,
  mission_type: 'diaria',
  day: '2026-09-23',
  deadline: '2026-09-24T00:00:00-03:00',
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

const iniciadaOntem: Mission = {
  ...diaria,
  id: 30,
  day: '2026-09-22',
  deadline: '2026-09-23T00:00:00-03:00',
  state: 'em_andamento',
  started_at: '2026-09-23T02:50:00Z',
}

const concluida = (mission: Mission): Mission => ({
  ...mission,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-09-23T15:00:00Z',
  verification: 'autodeclarada',
})

/** A especial cujo prazo (a meia-noite que fecha a janela) ja abriu hoje. */
const especialTardia: Mission = {
  ...iniciadaOntem,
  id: 38,
  mission_type: 'especial',
  day: null,
}

const ciclo = (ajustes: Partial<Cycle> = {}): Cycle => ({
  today: '2026-09-23',
  mission: diaria,
  streak: 3,
  days_to_milestone: 4,
  special: null,
  late_daily: null,
  ...ajustes,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CycleSection em en', () => {
  it('carregando: o titulo e o aviso em ingles', () => {
    routeFetch({ 'GET /api/cycle': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(screen.getByRole('heading', { name: en['missions.cycle.title'] })).toBeInTheDocument()
    expect(screen.getByTestId('cycle-loading')).toHaveTextContent(en['missions.cycle.loading'])
  })

  it('carregado: o dia, a sequencia e o progresso em ingles', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-today')).toHaveTextContent('Today is Wednesday, 09/23.')
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Streak: 3 days in a row')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent(
      'Special mission: 3 of 7 — 4 days left.',
    )
  })

  it('no singular: um dia seguido e um dia restante', async () => {
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ streak: 1, days_to_milestone: 1 })),
    })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-streak')).toHaveTextContent('Streak: 1 day in a row')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent('— 1 day left.')
  })

  it.each([
    ['en', 'Streak: 0 days in a row'],
    ['pt-BR', 'Sequência: 0 dias seguidos'],
  ] as const)('sequencia zero em %s fica no plural', async (locale, esperado) => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ mission: null, streak: 0, days_to_milestone: 7 })),
    })
    renderWithI18n(<CycleSection />, { locale })

    expect(await screen.findByTestId('cycle-streak')).toHaveTextContent(esperado)
  })

  it('sem plano: o aviso em ingles', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ mission: null })) })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-no-plan')).toHaveTextContent(
      en['missions.cycle.noPlan'],
    )
  })

  it('diaria de ontem e especial tardias, em andamento: titulos e motivos em ingles', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ late_daily: iniciadaOntem, special: especialTardia })),
    })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-late-daily')).toHaveTextContent(
      en['missions.cycle.lateDaily.title'],
    )
    expect(screen.getByTestId('cycle-late-daily-reason')).toHaveTextContent(
      en['missions.cycle.lateDaily.pending'],
    )
    expect(screen.getByTestId('cycle-special')).toHaveTextContent(
      en['missions.cycle.special.title'],
    )
    expect(screen.getByTestId('cycle-special-late-reason')).toHaveTextContent(
      en['missions.cycle.lateSpecial.pending'],
    )
  })

  it('diaria de ontem e especial tardias, concluidas: os motivos em ingles', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(
          ciclo({ late_daily: concluida(iniciadaOntem), special: concluida(especialTardia) }),
        ),
    })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-late-daily-reason')).toHaveTextContent(
      en['missions.cycle.lateDaily.completed'],
    )
    expect(screen.getByTestId('cycle-special-late-reason')).toHaveTextContent(
      en['missions.cycle.lateSpecial.completed'],
    )
  })

  it('falha de API: titulo, texto e botao em ingles', async () => {
    routeFetch({ 'GET /api/cycle': () => new Response(null, { status: 500 }) })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    const erro = await screen.findByTestId('cycle-error')
    expect(erro).toHaveTextContent(en['missions.cycle.loadFailed'])
    expect(erro).toHaveTextContent(HTTP_FAILURE_TEXT.en)
    expect(screen.getByTestId('cycle-retry')).toHaveTextContent(en['missions.action.retryLoad'])
  })

  it('falha inesperada: o texto do catalogo ingles', async () => {
    routeFetch({ 'GET /api/cycle': () => new Response('not json') })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    expect(await screen.findByTestId('cycle-error')).toHaveTextContent(
      en['missions.cycle.unexpectedFailure'],
    )
  })

  it('a atualizacao depois da conclusao falha: o aviso e o botao em ingles', async () => {
    const completion: MissionCompletion = {
      ...concluida(diaria),
      reward: {
        xp_awarded: 40,
        xp_total: 40,
        level_before: 1,
        level_after: 1,
        achievements_unlocked: [],
      },
    }
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 2 ? new Response(null, { status: 500 }) : Response.json(ciclo()),
      'POST /api/missions/31/complete': () => Response.json(completion),
    })
    renderWithI18n(<CycleSection />, { locale: 'en' })

    fireEvent.click(
      await screen.findByRole('button', { name: `Complete (mission: ${diaria.instructions})` }),
    )

    expect(await screen.findByTestId('cycle-stale')).toHaveTextContent(
      en['missions.cycle.refreshFailed'],
    )
    expect(screen.getByTestId('cycle-refresh')).toHaveTextContent(en['missions.cycle.refresh'])
  })
})
