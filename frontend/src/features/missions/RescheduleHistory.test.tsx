import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatDeadline } from '../../shared/lib/deadline'
import type { Reschedule } from '../../shared/types/mission'
import { RescheduleHistory } from './RescheduleHistory'

// Os textos de data saem de `formatDeadline`, nunca de um literal: o separador
// entre data e hora e do ICU, nao nosso.
const primeiro: Reschedule = {
  previous_deadline: '2026-10-02T21:00:00Z',
  new_deadline: '2026-10-05T21:00:00Z',
  reason: 'falta_de_tempo',
  origin: 'usuario',
  rescheduled_at: '2026-10-01T14:03:11Z',
}
const segundo: Reschedule = {
  previous_deadline: '2026-10-05T21:00:00Z',
  new_deadline: '2026-10-07T13:30:00Z',
  reason: 'mudanca_de_prioridade',
  origin: 'kairya',
  rescheduled_at: '2026-10-04T10:00:00Z',
}

describe('RescheduleHistory', () => {
  it('sem reagendamento, nao mostra nada', () => {
    const { container } = render(<RescheduleHistory reschedules={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sem a lista (API anterior ao incremento F), nao mostra nada e nao quebra', () => {
    const { container } = render(<RescheduleHistory reschedules={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('com um reagendamento, diz "Reagendada 1 vez", no singular', () => {
    render(<RescheduleHistory reschedules={[primeiro]} />)
    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(/^Reagendada 1 vez$/)
  })

  it('com dois, diz "Reagendada 2 vezes" e lista cada elo, com os dois prazos, o motivo e quem', () => {
    render(<RescheduleHistory reschedules={[primeiro, segundo]} />)

    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(/^Reagendada 2 vezes$/)
    const historico = screen.getByTestId('mission-reschedule-history')
    expect(historico.tagName).toBe('DETAILS')
    expect(within(historico).getByText('Histórico de prazos').tagName).toBe('SUMMARY')

    const linhas = within(historico).getAllByTestId('mission-reschedule-entry')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toHaveTextContent(
      `${formatDeadline(primeiro.previous_deadline)} → ${formatDeadline(primeiro.new_deadline)} · Falta de tempo · por você`,
    )
    expect(linhas[1]).toHaveTextContent(
      `${formatDeadline(segundo.previous_deadline)} → ${formatDeadline(segundo.new_deadline)} · Mudança de prioridade · proposto pela Kairya`,
    )
  })

  it('cada prazo e um <time> com o instante original no dateTime', () => {
    render(<RescheduleHistory reschedules={[primeiro]} />)
    const [antes, depois] = within(screen.getByTestId('mission-reschedule-entry')).getAllByText(
      (_, element) => element?.tagName === 'TIME',
    )
    expect(antes).toHaveAttribute('dateTime', primeiro.previous_deadline)
    expect(depois).toHaveAttribute('dateTime', primeiro.new_deadline)
  })

  it('o motivo sai em texto, pelo rotulo, e nunca o valor cru', () => {
    render(<RescheduleHistory reschedules={[{ ...primeiro, reason: 'dificuldade' }]} />)
    const linha = screen.getByTestId('mission-reschedule-entry')
    expect(linha).toHaveTextContent('· Dificuldade ·')
    expect(linha).not.toHaveTextContent(/dificuldade|falta_de_tempo|usuario/)
  })
})
