import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KairyaBubble } from '../kairya'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import type { Mission } from '../../shared/types/mission'
import { CycleSection } from './CycleSection'
import type { Cycle } from './types'

const diaria: Mission = {
  id: 31,
  instructions: 'Resolver listas',
  completion_criterion: 'Cinco corrigidos',
  difficulty: 2,
  estimated_minutes: 25,
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

const ciclo = (mission: Mission | null): Cycle => ({
  today: '2026-09-23',
  mission,
  streak: 0,
  days_to_milestone: 7,
  special: null,
  late_daily: null,
})

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

describe('CycleSection: criar o plano da semana', () => {
  it('sem plano, oferece o botao; com diaria, nao', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo(null)) })
    const { unmount } = renderWithI18n(<CycleSection />)
    expect(await screen.findByTestId('cycle-no-plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar o plano da semana' })).toBeInTheDocument()
    unmount()
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo(diaria)) })
    renderWithI18n(<CycleSection />)
    await screen.findByTestId('mission-item')
    expect(screen.queryByTestId('week-plan-open')).not.toBeInTheDocument()
  })

  it('plano criado: o ciclo mostra a diaria sem recarregar, a Kairya comemora e o foco vai ao titulo', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(ciclo(call === 1 ? null : diaria)),
      'POST /api/plans': () => Response.json({ week_start: '2026-09-21' }, { status: 201 }),
    })
    renderWithI18n(
      <>
        <KairyaBubble />
        <CycleSection />
      </>,
    )
    await screen.findByTestId('cycle-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    expect(screen.getByTestId('week-plan-week-current')).toHaveFocus()
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    expect(await screen.findByTestId('mission-item')).toBeInTheDocument()
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cycle-no-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Missão de hoje — sua diária' })).toHaveFocus()
    expect(screen.getByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('semana que ja tinha plano (409): o ciclo recarrega', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(ciclo(call === 1 ? null : diaria)),
      'POST /api/plans': () =>
        Response.json({ detail: 'x', code: 'plano_existente' }, { status: 409 }),
    })
    renderWithI18n(<CycleSection />)
    await screen.findByTestId('cycle-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    expect(await screen.findByTestId('mission-item')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('plano da proxima semana: confirma com a data, nao recarrega e o botao continua', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': () => Response.json(ciclo(null)),
      'POST /api/plans': () => Response.json({ week_start: '2026-09-28' }, { status: 201 }),
    })
    renderWithI18n(
      <>
        <KairyaBubble />
        <CycleSection />
      </>,
    )
    await screen.findByTestId('cycle-no-plan')
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    const confirmation = await screen.findByTestId('week-plan-created-next')
    expect(confirmation).toHaveTextContent('Ele começa segunda-feira, 28/09.')
    // O foco vai para a confirmacao num efeito passivo, que o React roda numa
    // tarefa do Scheduler DEPOIS do commit que o `findBy` ja viu: espera-se o
    // proprio efeito, nao o tempo.
    await waitFor(() => {
      expect(confirmation).toHaveFocus()
    })
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('cycle-no-plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar o plano da semana' })).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(1)
    expect(screen.getByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
  })
})
