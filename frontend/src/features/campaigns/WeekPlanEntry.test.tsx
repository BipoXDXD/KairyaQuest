import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KairyaBubble } from '../kairya'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { WeekPlanEntry } from './WeekPlanEntry'

function change(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

/** Segunda e prova preenchidas, e a segunda copiada para o resto da semana. */
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

describe('WeekPlanEntry', () => {
  it('fechado, e so o botao primario, sem formulario', () => {
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />)
    const open = screen.getByRole('button', { name: 'Criar o plano da semana' })
    expect(open).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
  })

  it('em ingles, o botao diz "Create this week\'s plan"', () => {
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />, { locale: 'en' })
    expect(screen.getByRole('button', { name: "Create this week's plan" })).toBeInTheDocument()
  })

  it('abre o formulario no lugar do botao, com o foco no primeiro campo', () => {
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />)
    fireEvent.click(screen.getByTestId('week-plan-open'))
    expect(screen.getByTestId('week-plan-form')).toBeInTheDocument()
    expect(screen.queryByTestId('week-plan-open')).not.toBeInTheDocument()
    expect(screen.getByTestId('week-plan-week-current')).toHaveFocus()
  })

  it('cancelar fecha o formulario e devolve o foco ao botao', () => {
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />)
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fireEvent.click(screen.getByTestId('week-plan-cancel'))
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('week-plan-open')).toHaveFocus()
  })

  it('o botao fechado, na primeira montagem, nao rouba o foco', () => {
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />)
    expect(screen.getByTestId('week-plan-open')).not.toHaveFocus()
  })

  it('plano criado: a Kairya comemora e quem chama e avisado', async () => {
    routeFetch({
      'POST /api/plans': () => Response.json({ week_start: '2026-09-21' }, { status: 201 }),
    })
    const onCreated = vi.fn()
    renderWithI18n(
      <>
        <KairyaBubble />
        <WeekPlanEntry onCreated={onCreated} onExists={vi.fn()} />
      </>,
    )
    expect(screen.queryByText('Plano feito. Agora é um dia de cada vez.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
  })

  it('semana que ja tem plano: so pede para recarregar, sem comemorar', async () => {
    const fetchMock = routeFetch({
      'POST /api/plans': () =>
        Response.json({ detail: 'x', code: 'plano_existente' }, { status: 409 }),
    })
    const onCreated = vi.fn()
    const onExists = vi.fn()
    renderWithI18n(
      <>
        <KairyaBubble />
        <WeekPlanEntry onCreated={onCreated} onExists={onExists} />
      </>,
    )
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    await waitFor(() => {
      expect(onExists).toHaveBeenCalledTimes(1)
    })
    expect(onCreated).not.toHaveBeenCalled()
    expect(requestsTo(fetchMock, 'POST /api/plans')).toHaveLength(1)
    expect(screen.queryByText('Plano feito. Agora é um dia de cada vez.')).not.toBeInTheDocument()
  })

  it('plano da proxima semana: fecha o formulario, confirma com a data, foca a confirmacao e a Kairya comemora', async () => {
    const fetchMock = routeFetch({
      'POST /api/plans': () => Response.json({ week_start: '2026-09-28' }, { status: 201 }),
    })
    const onCreated = vi.fn()
    renderWithI18n(
      <>
        <KairyaBubble />
        <WeekPlanEntry onCreated={onCreated} onExists={vi.fn()} />
      </>,
    )
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    const confirmation = await screen.findByTestId('week-plan-created-next')
    expect(confirmation).toHaveTextContent(
      'Plano da próxima semana criado. Ele começa segunda-feira, 28/09.',
    )
    expect(confirmation).toHaveAttribute('tabindex', '-1')
    expect(confirmation).toHaveFocus()
    expect(within(confirmation).getByRole('status')).toHaveAttribute('data-tone', 'success')
    expect(screen.queryByTestId('week-plan-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('week-plan-open')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(requestsTo(fetchMock, 'POST /api/plans')).toHaveLength(1)
    expect(await screen.findByText('Plano feito. Agora é um dia de cada vez.')).toBeInTheDocument()
  })

  it('a confirmacao fala ingles e some quando o formulario reabre', async () => {
    routeFetch({
      'POST /api/plans': () => Response.json({ week_start: '2026-09-28' }, { status: 201 }),
    })
    renderWithI18n(<WeekPlanEntry onCreated={vi.fn()} onExists={vi.fn()} />, { locale: 'en' })
    fireEvent.click(screen.getByTestId('week-plan-open'))
    fillWeek()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    fireEvent.click(screen.getByTestId('week-plan-submit'))
    expect(await screen.findByTestId('week-plan-created-next')).toHaveTextContent(
      "Next week's plan is created. It starts Monday, 09/28.",
    )
    fireEvent.click(screen.getByTestId('week-plan-open'))
    expect(screen.queryByTestId('week-plan-created-next')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('week-plan-cancel'))
    expect(screen.getByTestId('week-plan-open')).toHaveFocus()
  })
})
