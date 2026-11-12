import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KairyaBubble } from '../kairya'
import { jsonBody, requestsTo, routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import type { Mission } from '../../shared/types/mission'
import { LanternTrail } from './LanternTrail'
import type { Plan } from './types'

const DIAS = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
]

function diaria(id: number, day: string): Mission {
  return {
    id,
    instructions: 'Resolver listas',
    completion_criterion: 'Cinco corrigidos',
    difficulty: 2,
    estimated_minutes: 25,
    mission_type: 'diaria',
    day,
    deadline: '2026-09-25T00:00:00-03:00',
    state: 'pendente',
    availability: 'bloqueada',
    started_at: null,
    completed_at: null,
    xp: 40,
    actual_duration_minutes: null,
    verification: null,
    evidence: null,
    evaluation: null,
    reschedules: [],
  }
}

const PLANO: Plan = {
  week_start: '2026-09-21',
  days: DIAS.map((day, index) => ({
    day,
    availability: 'bloqueada',
    mission: index === 0 ? { ...diaria(1, day), availability: 'disponivel' } : null,
  })),
  special: { availability: 'bloqueada', progress: 0, mission: null },
}

function change(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

function fillWeek() {
  change('week-plan-day-0-instructions', 'Resolver listas')
  change('week-plan-day-0-criterion', 'Cinco corrigidos')
  fireEvent.click(screen.getByTestId('week-plan-copy-monday'))
  change('week-plan-trial-instructions', 'Prova simulada')
  change('week-plan-trial-criterion', 'Nota 7')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-23T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LanternTrail: criar o plano da semana', () => {
  it('sem plano, oferece o botao e abre o formulario no lugar', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: null }) })
    renderWithI18n(<LanternTrail />)
    expect(await screen.findByTestId('trail-no-plan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Criar o plano da semana' }))
    expect(screen.getByTestId('week-plan-form')).toBeInTheDocument()
    expect(screen.getByTestId('week-plan-week-current')).toHaveFocus()
    expect(screen.getByTestId('trail-no-plan')).toBeInTheDocument()
  })

  it('com plano, nao oferece o botao', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: PLANO }) })
    renderWithI18n(<LanternTrail />)
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(screen.queryByTestId('week-plan-open')).not.toBeInTheDocument()
  })

  it('plano criado: a trilha aparece sem recarregar, a Kairya comemora e o foco vai ao titulo', async () => {
    const fetchMock = routeFetch({
      'GET /api/plans/current': (_init, call) => Response.json({ plan: call === 1 ? null : PLANO }),
      'POST /api/plans': () => Response.json(PLANO, { status: 201 }),
    })
    renderWithI18n(
      <>
        <KairyaBubble />
        <LanternTrail />
      </>,
    )
    await screen.findByTestId('trail-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trail-no-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trilha de lanternas da semana' })).toHaveFocus()
    expect(screen.getByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST /api/plans')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/plans/current')).toHaveLength(2)
    const body = jsonBody(requestsTo(fetchMock, 'POST /api/plans')[0]) as { week_start: string }
    expect(body.week_start).toBe('2026-09-21')
  })

  it('semana que ja tinha plano (409): a trilha recarrega e mostra o plano existente', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) => Response.json({ plan: call === 1 ? null : PLANO }),
      'POST /api/plans': () =>
        Response.json({ detail: 'x', code: 'plano_existente' }, { status: 409 }),
    })
    renderWithI18n(<LanternTrail />)
    await screen.findByTestId('trail-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
  })

  it('falha de rede: o formulario fica com os dados e a trilha continua sem plano', async () => {
    routeFetch({
      'GET /api/plans/current': () => Response.json({ plan: null }),
      'POST /api/plans': () => new Response(null, { status: 503 }),
    })
    renderWithI18n(<LanternTrail />)
    await screen.findByTestId('trail-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    await waitFor(() => {
      expect(screen.getByTestId('week-plan-status')).toHaveTextContent('Seus dados continuam aqui')
    })
    expect(screen.getByTestId('week-plan-day-6-instructions')).toHaveValue('Resolver listas')
    expect(screen.getByTestId('trail-no-plan')).toBeInTheDocument()
  })

  it('em ingles, o botao e o formulario falam ingles', async () => {
    routeFetch({ 'GET /api/plans/current': () => Response.json({ plan: null }) })
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    await screen.findByTestId('trail-no-plan')
    fireEvent.click(screen.getByRole('button', { name: "Create this week's plan" }))
    expect(
      within(screen.getByTestId('week-plan-form')).getByText(
        'Set up seven drills and one trial. Starting small is fine.',
      ),
    ).toBeInTheDocument()
  })

  it('plano da proxima semana: confirma com a data, nao recarrega e o botao continua', async () => {
    const fetchMock = routeFetch({
      'GET /api/plans/current': () => Response.json({ plan: null }),
      'POST /api/plans': () => Response.json({ week_start: '2026-09-28' }, { status: 201 }),
    })
    renderWithI18n(
      <>
        <KairyaBubble />
        <LanternTrail />
      </>,
    )
    await screen.findByTestId('trail-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    const confirmation = await screen.findByTestId('week-plan-created-next')
    expect(confirmation).toHaveTextContent('Ele começa segunda-feira, 28/09.')
    expect(confirmation).toHaveFocus()
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('trail-no-plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar o plano da semana' })).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'GET /api/plans/current')).toHaveLength(1)
    expect(screen.getByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
  })
})
