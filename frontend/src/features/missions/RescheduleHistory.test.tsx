import { screen, within } from '@testing-library/react'
import { renderWithI18n } from '../../test/i18n'
import { describe, expect, it } from 'vitest'
import { formatDeadline } from '../../shared/lib/deadline'
import { en } from '../../shared/i18n/messages/en'
import { RESCHEDULE_REASON_LABELS, type Reschedule } from '../../shared/types/mission'
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
    const { container } = renderWithI18n(<RescheduleHistory reschedules={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sem a lista (API anterior ao incremento F), nao mostra nada e nao quebra', () => {
    const { container } = renderWithI18n(<RescheduleHistory reschedules={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('com um reagendamento, diz "Reagendada 1 vez", no singular', () => {
    renderWithI18n(<RescheduleHistory reschedules={[primeiro]} />)
    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(/^Reagendada 1 vez$/)
  })

  it('com dois, diz "Reagendada 2 vezes" e lista cada elo, com os dois prazos, o motivo e quem', () => {
    renderWithI18n(<RescheduleHistory reschedules={[primeiro, segundo]} />)

    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(/^Reagendada 2 vezes$/)
    const historico = screen.getByTestId('mission-reschedule-history')
    expect(historico.tagName).toBe('DETAILS')
    expect(within(historico).getByText('Histórico de prazos').tagName).toBe('SUMMARY')

    const linhas = within(historico).getAllByTestId('mission-reschedule-entry')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toHaveTextContent(
      `${formatDeadline(primeiro.previous_deadline, 'pt-BR')} → ${formatDeadline(primeiro.new_deadline, 'pt-BR')} · Falta de tempo · por você`,
    )
    expect(linhas[1]).toHaveTextContent(
      `${formatDeadline(segundo.previous_deadline, 'pt-BR')} → ${formatDeadline(segundo.new_deadline, 'pt-BR')} · Mudança de prioridade · proposto pela Kairya`,
    )
  })

  it('cada prazo e um <time> com o instante original no dateTime', () => {
    renderWithI18n(<RescheduleHistory reschedules={[primeiro]} />)
    const [antes, depois] = within(screen.getByTestId('mission-reschedule-entry')).getAllByText(
      (_, element) => element?.tagName === 'TIME',
    )
    expect(antes).toHaveAttribute('dateTime', primeiro.previous_deadline)
    expect(depois).toHaveAttribute('dateTime', primeiro.new_deadline)
  })

  it('o motivo sai em texto, pelo rotulo, e nunca o valor cru', () => {
    renderWithI18n(<RescheduleHistory reschedules={[{ ...primeiro, reason: 'dificuldade' }]} />)
    const linha = screen.getByTestId('mission-reschedule-entry')
    expect(linha).toHaveTextContent('· Dificuldade ·')
    expect(linha).not.toHaveTextContent(/dificuldade|falta_de_tempo|usuario/)
  })

  it('em en, contagem, titulo, prazos, motivo e origem saem em ingles', () => {
    renderWithI18n(<RescheduleHistory reschedules={[primeiro, segundo]} />, { locale: 'en' })

    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(
      /^Rescheduled 2 times$/,
    )
    expect(screen.getByText(en['missions.history.title']).tagName).toBe('SUMMARY')
    const linhas = screen.getAllByTestId('mission-reschedule-entry')
    expect(linhas[0]).toHaveTextContent(
      `${formatDeadline(primeiro.previous_deadline, 'en')} → ${formatDeadline(primeiro.new_deadline, 'en')} · ${en[RESCHEDULE_REASON_LABELS.falta_de_tempo]} · by you`,
    )
    expect(linhas[1]).toHaveTextContent(/· proposed by Kairya$/)
  })

  it('em en, um reagendamento diz "Rescheduled once"', () => {
    renderWithI18n(<RescheduleHistory reschedules={[primeiro]} />, { locale: 'en' })

    expect(screen.getByTestId('mission-reschedule-count')).toHaveTextContent(/^Rescheduled once$/)
  })
})
