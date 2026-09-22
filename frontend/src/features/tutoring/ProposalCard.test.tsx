import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch, type Route } from '../../test/fetchRoutes'
import { ProposalCard } from './ProposalCard'
import type { ActionRead } from './types'
import { useActionKeys } from './useActionKeys'

const CONFIRM = 'POST /api/tutoring/actions/5/confirm'
const REJECT = 'POST /api/tutoring/actions/5/reject'
const INSTRUCTIONS = 'Estudar grafos por 40 minutos'
const BOARD = '#missions-heading'

const proposta: ActionRead = {
  id: 5,
  kind: 'create_mission',
  state: 'proposta',
  payload: {
    instructions: INSTRUCTIONS,
    completion_criterion: 'Resumo de uma pagina',
    difficulty: 2,
    estimated_minutes: 40,
    // Em Sao Paulo, 15/02 as 21:00; no fuso do processo (Tokyo), 16/02 as 09:00.
    deadline: '2027-02-15T21:00:00-03:00',
  },
  mission_id: null,
  error_code: null,
}

const executada: ActionRead = { ...proposta, state: 'executada', mission_id: 40 }

const networkFailure: Route = () => Promise.reject(new TypeError('Failed to fetch'))
const PENDING: Route = () => new Promise<Response>(() => undefined)

/**
 * O cartao como o painel o usa: a acao mora ACIMA dele e muda pelo
 * `onChanged`, e as chaves vem do registro do painel.
 */
function Harness({
  initial,
  onMissionCreated = vi.fn(),
  onRefresh = vi.fn(),
  onGoToBoard,
}: {
  initial: ActionRead
  onMissionCreated?: () => void
  onRefresh?: () => void
  onGoToBoard?: () => void
}) {
  const [action, setAction] = useState(initial)
  const keys = useActionKeys()
  return (
    <ProposalCard
      action={action}
      keys={keys}
      onChanged={setAction}
      onMissionCreated={onMissionCreated}
      onRefresh={onRefresh}
      boardHref={BOARD}
      onGoToBoard={onGoToBoard}
    />
  )
}

function card(): HTMLElement {
  return screen.getByTestId('tutor-proposal')
}

function confirmButton(): HTMLElement {
  return screen.getByTestId('proposal-confirm')
}

function rejectButton(): HTMLElement {
  return screen.getByTestId('proposal-reject')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProposalCard', () => {
  it('C1 mostra instrucoes, criterio, dificuldade, minutos e prazo em Sao Paulo', () => {
    render(<Harness initial={proposta} />)

    expect(card()).toHaveAttribute('data-action-id', '5')
    expect(card()).toHaveAttribute('data-state', 'proposta')
    expect(within(card()).getByRole('heading', { name: 'Proposta de missão' })).toBeInTheDocument()
    expect(card()).toHaveTextContent(INSTRUCTIONS)
    expect(card()).toHaveTextContent('Critério de conclusão: Resumo de uma pagina')
    expect(screen.getByTestId('proposal-difficulty')).toHaveTextContent('2 de 5')
    expect(screen.getByTestId('proposal-estimated-minutes')).toHaveTextContent('40 min')
    const prazo = screen.getByTestId('proposal-deadline')
    expect(prazo.tagName).toBe('TIME')
    expect(prazo).toHaveAttribute('dateTime', '2027-02-15T21:00:00-03:00')
    expect(prazo).toHaveTextContent(/15\/02\/2027.*21:00/)
  })

  it('C2 Confirmar e Recusar dizem qual proposta afetam', () => {
    render(<Harness initial={proposta} />)

    expect(screen.getByRole('button', { name: `Confirmar a proposta: ${INSTRUCTIONS}` })).toBe(
      confirmButton(),
    )
    expect(screen.getByRole('button', { name: `Recusar a proposta: ${INSTRUCTIONS}` })).toBe(
      rejectButton(),
    )
    // Nenhum aviso antes de qualquer decisao.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('C3 confirmando: os dois botoes desabilitados', () => {
    routeFetch({ [CONFIRM]: PENDING })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())

    expect(confirmButton()).toHaveTextContent('Confirmando…')
    expect(confirmButton()).toBeDisabled()
    expect(rejectButton()).toBeDisabled()
    expect(rejectButton()).toHaveTextContent('Recusar')
  })

  it('C3 recusando: os dois botoes desabilitados', () => {
    routeFetch({ [REJECT]: PENDING })
    render(<Harness initial={proposta} />)

    fireEvent.click(rejectButton())

    expect(rejectButton()).toHaveTextContent('Recusando…')
    expect(rejectButton()).toBeDisabled()
    expect(confirmButton()).toBeDisabled()
    expect(confirmButton()).toHaveTextContent('Confirmar')
  })

  it('C4 executada: Missao criada e o link para o quadro', async () => {
    routeFetch({
      [CONFIRM]: () =>
        Response.json({ action: executada, mission: { id: 40, instructions: INSTRUCTIONS } }),
    })
    const onMissionCreated = vi.fn()
    const onGoToBoard = vi.fn()
    render(
      <Harness initial={proposta} onMissionCreated={onMissionCreated} onGoToBoard={onGoToBoard} />,
    )

    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('proposal-created')).toHaveTextContent('Missão criada')
    expect(card()).toHaveAttribute('data-state', 'executada')
    expect(onMissionCreated).toHaveBeenCalledTimes(1)
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Ver no Quartel-General' })
    expect(link).toBe(screen.getByTestId('proposal-board-link'))
    expect(link).toHaveAttribute('href', BOARD)
    fireEvent.click(link)
    expect(onGoToBoard).toHaveBeenCalledTimes(1)
  })

  it('C4 executada sem onGoToBoard: o link segue so pelo href', () => {
    render(<Harness initial={executada} />)

    const link = screen.getByRole('link', { name: 'Ver no Quartel-General' })
    expect(link).toHaveAttribute('href', BOARD)
    fireEvent.click(link)
    expect(screen.getByTestId('proposal-created')).toHaveTextContent('Missão criada')
  })

  it('C5 recusada: marcada, sem botoes', () => {
    render(<Harness initial={{ ...proposta, state: 'recusada' }} />)

    expect(screen.getByTestId('proposal-rejected')).toHaveTextContent('Proposta recusada')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('C6 falhou por prazo: a explicacao e a sugestao', () => {
    render(<Harness initial={{ ...proposta, state: 'falhou', error_code: 'prazo_expirado' }} />)

    expect(screen.getByTestId('proposal-expired')).toHaveTextContent(
      'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('C7 falhou por outro motivo: o texto generico', () => {
    render(<Harness initial={{ ...proposta, state: 'falhou', error_code: 'outro' }} />)

    expect(screen.getByTestId('proposal-expired')).toHaveTextContent(
      'Esta proposta não pôde ser executada. Peça à Tifa uma nova proposta.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // O `code` cru nunca vai para a tela.
    expect(card()).not.toHaveTextContent('outro')
  })

  it('C8 falha de rede: alerta e o Confirmar vira Tentar de novo', async () => {
    routeFetch({ [CONFIRM]: networkFailure })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
    )
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('proposal-failure'))
    expect(screen.getByRole('button', { name: `Tentar de novo a proposta: ${INSTRUCTIONS}` })).toBe(
      confirmButton(),
    )
    expect(confirmButton()).toBeEnabled()
    expect(rejectButton()).toHaveAccessibleName(`Recusar a proposta: ${INSTRUCTIONS}`)
    expect(rejectButton()).toBeEnabled()
  })

  it('C9 refresh: Atualizar a conversa no lugar dos botoes', async () => {
    routeFetch({
      [CONFIRM]: () => Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
    })
    const onRefresh = vi.fn()
    render(<Harness initial={proposta} onRefresh={onRefresh} />)

    fireEvent.click(confirmButton())

    const refresh = await screen.findByTestId('proposal-refresh')
    expect(refresh).toHaveTextContent('Atualizar a conversa')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
    )
    expect(screen.queryByTestId('proposal-confirm')).not.toBeInTheDocument()
    expect(screen.queryByTestId('proposal-reject')).not.toBeInTheDocument()
    fireEvent.click(refresh)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('C10 falha ao recusar: o Recusar vira Tentar de novo, e o Confirmar volta ao normal', async () => {
    routeFetch({ [REJECT]: networkFailure })
    render(<Harness initial={proposta} />)

    fireEvent.click(rejectButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível recusar a proposta. Tentar de novo é seguro.',
    )
    expect(rejectButton()).toHaveAccessibleName(`Tentar de novo a proposta: ${INSTRUCTIONS}`)
    expect(rejectButton()).toBeEnabled()
    expect(confirmButton()).toHaveAccessibleName(`Confirmar a proposta: ${INSTRUCTIONS}`)
    expect(confirmButton()).toBeEnabled()
  })

  it('o prazo expirado na confirmacao leva o cartao ao estado falhou, sem outra ida a rede', async () => {
    const fetchMock = routeFetch({
      [CONFIRM]: () => Response.json({ detail: 'x', code: 'prazo_expirado' }, { status: 422 }),
    })
    render(<Harness initial={proposta} />)

    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('proposal-expired')).toHaveTextContent(
      'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.',
    )
    expect(card()).toHaveAttribute('data-state', 'falhou')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
