import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDeadline } from '../../shared/lib/deadline'
import { jsonBody, requestsTo, routeFetch, type Route } from '../../test/fetchRoutes'
import { RescheduleProposalCard } from './RescheduleProposalCard'
import type { ActionRead, RescheduleMissionAction } from './types'
import { useActionKeys } from './useActionKeys'

const CONFIRM = 'POST /api/tutoring/actions/31/confirm'
const REJECT = 'POST /api/tutoring/actions/31/reject'
const INSTRUCTIONS = 'Resumir o capítulo 3'
const BOARD = '#missions-heading'

// Os dois prazos caem em dias diferentes em SP e no fuso do processo (Tokyo):
// o texto so bate se o cartao formatar em SP.
const PREVIOUS = '2026-10-02T21:00:00Z'
const PROPOSED = '2026-10-05T21:00:00Z'

const proposta: RescheduleMissionAction = {
  id: 31,
  kind: 'reschedule_mission',
  state: 'proposta',
  payload: {
    mission_id: 12,
    new_deadline: PROPOSED,
    reason: 'falta_de_tempo',
    instructions: INSTRUCTIONS,
    previous_deadline: PREVIOUS,
  },
  mission_id: null,
  error_code: null,
}

const executada: RescheduleMissionAction = { ...proposta, state: 'executada', mission_id: 12 }

const networkFailure: Route = () => Promise.reject(new TypeError('Failed to fetch'))
const PENDING: Route = () => new Promise<Response>(() => undefined)
const withCode =
  (status: number, code: string): Route =>
  () =>
    Response.json({ detail: 'x', code }, { status })

const INVALIDATED_TEXT =
  'A missão mudou desde a proposta e não pôde ser reagendada. Peça à Tifa uma nova proposta.'
const EXPIRED_TEXT = 'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.'

/** O cartao como o painel o usa: a acao mora ACIMA e muda pelo `onChanged`. */
function Harness({
  initial,
  onMissionCreated = vi.fn(),
  onRefresh = vi.fn(),
  onGoToBoard,
}: {
  initial: RescheduleMissionAction
  onMissionCreated?: () => void
  onRefresh?: () => void
  onGoToBoard?: () => void
}) {
  const [action, setAction] = useState<RescheduleMissionAction>(initial)
  const keys = useActionKeys()
  return (
    <RescheduleProposalCard
      action={action}
      keys={keys}
      onChanged={(changed: ActionRead) => {
        // O backend devolve a mesma acao; o `kind` nao muda numa decisao.
        if (changed.kind === 'reschedule_mission') {
          setAction(changed)
        }
      }}
      onMissionCreated={onMissionCreated}
      onRefresh={onRefresh}
      boardHref={BOARD}
      onGoToBoard={onGoToBoard}
    />
  )
}

function card(): HTMLElement {
  return screen.getByTestId('tutor-reschedule-proposal')
}

function confirmButton(): HTMLElement {
  return within(card()).getByTestId('proposal-confirm')
}

function rejectButton(): HTMLElement {
  return within(card()).getByTestId('proposal-reject')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RescheduleProposalCard', () => {
  it('R1 mostra a missao, o prazo atual, o proposto e o motivo em texto', () => {
    render(<Harness initial={proposta} />)

    expect(card()).toHaveAttribute('data-action-id', '31')
    expect(card()).toHaveAttribute('data-state', 'proposta')
    expect(
      within(card()).getByRole('heading', { name: 'Proposta de reagendamento' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('reschedule-instructions')).toHaveTextContent(INSTRUCTIONS)

    // "Prazo atual" e o RETRATO do backend (`previous_deadline`), nunca o novo.
    const atual = screen.getByTestId('reschedule-previous-deadline')
    expect(atual.tagName).toBe('TIME')
    expect(atual).toHaveAttribute('dateTime', PREVIOUS)
    expect(atual).toHaveTextContent(formatDeadline(PREVIOUS))
    expect(atual).toHaveTextContent(/02\/10\/2026.*18:00/)

    const proposto = screen.getByTestId('reschedule-new-deadline')
    expect(proposto.tagName).toBe('TIME')
    expect(proposto).toHaveAttribute('dateTime', PROPOSED)
    expect(proposto).toHaveTextContent(formatDeadline(PROPOSED))
    expect(proposto).toHaveTextContent(/05\/10\/2026.*18:00/)

    expect(card()).toHaveTextContent(`Prazo atual${formatDeadline(PREVIOUS)}`)
    expect(card()).toHaveTextContent(`Prazo proposto${formatDeadline(PROPOSED)}`)
    expect(screen.getByTestId('reschedule-reason')).toHaveTextContent('Motivo: Falta de tempo')
    // O valor cru do motivo nunca vai para a tela.
    expect(card()).not.toHaveTextContent('falta_de_tempo')
  })

  it.each([
    ['dificuldade', 'Motivo: Dificuldade'],
    ['falta_de_tempo', 'Motivo: Falta de tempo'],
    ['mudanca_de_prioridade', 'Motivo: Mudança de prioridade'],
  ] as const)('R2 o motivo %s vira texto', (reason, text) => {
    render(<Harness initial={{ ...proposta, payload: { ...proposta.payload, reason } }} />)

    expect(screen.getByTestId('reschedule-reason')).toHaveTextContent(text)
  })

  it('R3 Confirmar e Recusar dizem qual missao reagendam', () => {
    render(<Harness initial={proposta} />)

    expect(screen.getByRole('button', { name: `Confirmar o reagendamento: ${INSTRUCTIONS}` })).toBe(
      confirmButton(),
    )
    expect(screen.getByRole('button', { name: `Recusar o reagendamento: ${INSTRUCTIONS}` })).toBe(
      rejectButton(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('R4 clique duplo no Confirmar faz UM POST: os dois botoes desabilitados em voo', () => {
    const fetchMock = routeFetch({ [CONFIRM]: PENDING })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())
    fireEvent.click(confirmButton())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(confirmButton()).toHaveTextContent('Confirmando…')
    expect(confirmButton()).toBeDisabled()
    expect(rejectButton()).toBeDisabled()
  })

  it('R4 clique duplo no Recusar faz UM POST', () => {
    const fetchMock = routeFetch({ [REJECT]: PENDING })
    render(<Harness initial={proposta} />)

    fireEvent.click(rejectButton())
    fireEvent.click(rejectButton())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rejectButton()).toHaveTextContent('Recusando…')
    expect(rejectButton()).toBeDisabled()
    expect(confirmButton()).toBeDisabled()
  })

  it('R5 confirmada: Prazo reagendado, o link do quadro, e o quadro recarrega', async () => {
    routeFetch({
      [CONFIRM]: () =>
        Response.json({ action: executada, mission: { id: 12, instructions: INSTRUCTIONS } }),
    })
    const onMissionCreated = vi.fn()
    const onGoToBoard = vi.fn()
    render(
      <Harness initial={proposta} onMissionCreated={onMissionCreated} onGoToBoard={onGoToBoard} />,
    )

    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('proposal-rescheduled')).toHaveTextContent('Prazo reagendado')
    expect(card()).toHaveAttribute('data-state', 'executada')
    // F22: o callback significa "o quadro mudou".
    expect(onMissionCreated).toHaveBeenCalledTimes(1)
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    const link = within(card()).getByRole('link', { name: 'Ver no Quartel-General' })
    expect(link).toHaveAttribute('href', BOARD)
    fireEvent.click(link)
    expect(onGoToBoard).toHaveBeenCalledTimes(1)
  })

  it('R5 executada sem onGoToBoard: o link segue so pelo href', () => {
    render(<Harness initial={executada} />)

    const link = screen.getByRole('link', { name: 'Ver no Quartel-General' })
    expect(link).toHaveAttribute('href', BOARD)
    fireEvent.click(link)
    expect(screen.getByTestId('proposal-rescheduled')).toHaveTextContent('Prazo reagendado')
  })

  it('R6 recusada: marcada, sem botoes nem link', () => {
    render(<Harness initial={{ ...proposta, state: 'recusada' }} />)

    expect(screen.getByTestId('proposal-rejected')).toHaveTextContent('Proposta recusada')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it.each([
    ['prazo_expirado', EXPIRED_TEXT],
    ['reagendamento_invalido', INVALIDATED_TEXT],
    ['outro', 'Esta proposta não pôde ser executada. Peça à Tifa uma nova proposta.'],
  ])('R7 falhou com %s: o texto certo, sem botoes', (code, text) => {
    render(<Harness initial={{ ...proposta, state: 'falhou', error_code: code }} />)

    expect(screen.getByTestId('proposal-expired')).toHaveTextContent(text)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(card()).not.toHaveTextContent(code)
  })

  it('R8 confirmar com 409 reagendamento_invalido leva o cartao a falhou, sem recarregar', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: withCode(409, 'reagendamento_invalido') })
    const onRefresh = vi.fn()
    const onMissionCreated = vi.fn()
    render(<Harness initial={proposta} onRefresh={onRefresh} onMissionCreated={onMissionCreated} />)

    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('proposal-expired')).toHaveTextContent(INVALIDATED_TEXT)
    expect(card()).toHaveAttribute('data-state', 'falhou')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onMissionCreated).not.toHaveBeenCalled()
  })

  it('R9 confirmar com 422 prazo_expirado leva o cartao a falhou pelo prazo', async () => {
    const fetchMock = routeFetch({ [CONFIRM]: withCode(422, 'prazo_expirado') })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('proposal-expired')).toHaveTextContent(EXPIRED_TEXT)
    expect(card()).toHaveAttribute('data-state', 'falhou')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('R10 falha de rede: o aviso fala do prazo, e o Confirmar vira Tentar de novo', async () => {
    routeFetch({ [CONFIRM]: networkFailure })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes.',
    )
    expect(confirmButton()).toHaveAccessibleName(`Tentar de novo o reagendamento: ${INSTRUCTIONS}`)
    expect(confirmButton()).toBeEnabled()
    expect(rejectButton()).toHaveAccessibleName(`Recusar o reagendamento: ${INSTRUCTIONS}`)
  })

  it('R11 ja decidida: Atualizar a conversa no lugar dos botoes', async () => {
    routeFetch({ [CONFIRM]: withCode(409, 'transicao_ilegal') })
    const onRefresh = vi.fn()
    render(<Harness initial={proposta} onRefresh={onRefresh} />)

    fireEvent.click(confirmButton())

    const refresh = await screen.findByTestId('proposal-refresh')
    expect(screen.queryByTestId('proposal-confirm')).not.toBeInTheDocument()
    fireEvent.click(refresh)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('R12 recusar: um POST sem corpo, o cartao marcado, e o quadro nao recarrega', async () => {
    const fetchMock = routeFetch({
      [REJECT]: () => Response.json({ action: { ...proposta, state: 'recusada' } }),
    })
    const onMissionCreated = vi.fn()
    render(<Harness initial={proposta} onMissionCreated={onMissionCreated} />)

    fireEvent.click(rejectButton())

    expect(await screen.findByTestId('proposal-rejected')).toHaveTextContent('Proposta recusada')
    expect(card()).toHaveAttribute('data-state', 'recusada')
    expect(requestsTo(fetchMock, REJECT).map((init) => jsonBody(init))).toEqual([{}])
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    expect(onMissionCreated).not.toHaveBeenCalled()
  })

  it('R13 falha ao recusar: o Recusar vira Tentar de novo, e o Confirmar volta ao normal', async () => {
    routeFetch({ [REJECT]: networkFailure })
    render(<Harness initial={proposta} />)

    fireEvent.click(rejectButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível recusar a proposta. Tentar de novo é seguro.',
    )
    expect(rejectButton()).toHaveAccessibleName(`Tentar de novo o reagendamento: ${INSTRUCTIONS}`)
    expect(rejectButton()).toBeEnabled()
    expect(confirmButton()).toHaveAccessibleName(`Confirmar o reagendamento: ${INSTRUCTIONS}`)
    expect(confirmButton()).toBeEnabled()
  })
})
