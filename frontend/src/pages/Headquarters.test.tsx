import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRead, MessageRead } from '../features/tutoring/types'
import type { Mission } from '../shared/types/mission'
import { requestsTo, routeFetch, type Route } from '../test/fetchRoutes'
import { stubViewport } from '../test/viewport'
import { Headquarters } from './Headquarters'
import { HEADQUARTERS_HEADING_ID } from './headings'

/** A pagina busca quatro recursos na montagem: ciclo, missoes, status e historico da Tifa. */
function stubPage() {
  stubViewport('desktop')
  return routeFetch({
    'GET /api/cycle': () =>
      Response.json({
        today: '2026-09-23',
        mission: null,
        streak: 0,
        days_to_milestone: 7,
        special: null,
      }),
    'GET /api/missions': () => Response.json([]),
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
  })
}

describe('Headquarters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia a tela no titulo de nivel 1, em portugues', async () => {
    stubPage()

    render(<Headquarters />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Quartel-General/)
    // Espera os efeitos das features assentarem, para o teste nao terminar no
    // meio de uma atualizacao de estado.
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })

  it('compoe a feature de missoes, e nao busca dado por conta propria', async () => {
    const fetchMock = stubPage()

    render(<Headquarters />)

    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    // Uma ida a rede por recurso, e cada uma e de uma feature: a pagina nao
    // chama a API. Contar o total deixou de servir quando a pagina passou a
    // compor mais de uma feature (1b-2, e agora o ciclo no B).
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/status')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('compoe a missao de hoje acima do quadro de avulsas', async () => {
    stubPage()

    render(<Headquarters />)

    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    expect(
      screen.getByTestId('cycle').compareDocumentPosition(screen.getByTestId('missions')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it('o titulo de nivel 1 e focavel por programa, com o id combinado com o App', async () => {
    stubPage()

    render(<Headquarters />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveAttribute('id', HEADQUARTERS_HEADING_ID)
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByTestId('headquarters')).toBeVisible()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })

  it('oculta, esconde o main e o painel da Tifa, sem desmontar', async () => {
    stubPage()

    render(<Headquarters hidden />)

    // O `main` leva o proprio `hidden` (so um `main` sem ele por documento);
    // o painel da Tifa, fora do `main`, some pela raiz.
    expect(screen.getByTestId('headquarters')).toHaveAttribute('hidden')
    expect(screen.getByTestId('tutor-panel')).not.toBeVisible()
    // Montado: as features buscaram os dados mesmo ocultas.
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })

  it('compoe o painel da Tifa ao lado do quadro', async () => {
    stubPage()

    render(<Headquarters />)

    expect(screen.getByRole('complementary', { name: 'Tifa' })).toBeInTheDocument()
    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })
})

describe('Headquarters: a missao criada pela Tifa', () => {
  const MISSIONS = 'GET /api/missions'
  const CONFIRM = 'POST /api/tutoring/actions/5/confirm'
  const COMPLETE = 'POST /api/missions/7/complete'

  const proposal: ActionRead = {
    id: 5,
    kind: 'create_mission',
    state: 'proposta',
    payload: {
      instructions: 'Estudar grafos por 40 minutos',
      completion_criterion: 'Resumo de uma pagina',
      difficulty: 2,
      estimated_minutes: 40,
      deadline: '2027-02-15T21:00:00-03:00',
    },
    mission_id: null,
    error_code: null,
  }

  const history: MessageRead[] = [
    {
      id: 1,
      role: 'user',
      content: 'Me dá uma missão',
      status: 'completa',
      client_message_id: 'c1',
      reply_to_id: null,
      error_code: null,
      created_at: '2026-09-22T12:00:00Z',
      actions: [],
    },
    {
      id: 2,
      role: 'tutor',
      content: 'Proponho esta missão.',
      status: 'completa',
      client_message_id: null,
      reply_to_id: 1,
      error_code: null,
      created_at: '2026-09-22T12:00:01Z',
      actions: [proposal],
    },
  ]

  const pendente: Mission = {
    id: 7,
    instructions: 'Ler o capitulo 3 de algoritmos',
    completion_criterion: 'Resumo de uma pagina entregue',
    difficulty: 3,
    estimated_minutes: 45,
    mission_type: 'avulsa',
    day: null,
    deadline: '2026-09-20T13:00:00Z',
    state: 'pendente',
    availability: 'disponivel',
    started_at: null,
    completed_at: null,
    xp: 100,
    actual_duration_minutes: null,
  }

  const confirmed: Route = () =>
    Response.json({
      action: { ...proposal, state: 'executada', mission_id: 40 },
      mission: { id: 40, instructions: proposal.payload.instructions },
    })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Q1 confirmar uma proposta da Tifa recarrega o quadro', async () => {
    stubViewport('desktop')
    const fetchMock = routeFetch({
      [MISSIONS]: () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json(history),
      [CONFIRM]: confirmed,
    })
    render(<Headquarters />)
    await screen.findByTestId('missions-empty')

    fireEvent.click(await screen.findByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    await waitFor(() => {
      expect(requestsTo(fetchMock, MISSIONS)).toHaveLength(2)
    })
    await screen.findByTestId('missions-empty')
  })

  it('Q2 com uma conclusao em voo, a recarga pedida pela Tifa espera', async () => {
    stubViewport('desktop')
    let resolver!: (response: Response) => void
    const post = new Promise<Response>((resolve) => {
      resolver = resolve
    })
    const fetchMock = routeFetch({
      [MISSIONS]: () => Response.json([pendente]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json(history),
      [CONFIRM]: confirmed,
      [COMPLETE]: () => post,
    })
    render(<Headquarters />)
    fireEvent.click(await screen.findByTestId('mission-complete'))

    fireEvent.click(await screen.findByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    expect(requestsTo(fetchMock, MISSIONS)).toHaveLength(1)
    expect(screen.getByTestId('missions-reload-status')).toHaveTextContent(
      'Aguardando a conclusão em andamento para atualizar o quadro.',
    )

    await act(async () => {
      resolver(Response.json({ ...pendente, state: 'concluida' }))
      await post
    })

    await waitFor(() => {
      expect(requestsTo(fetchMock, MISSIONS)).toHaveLength(2)
    })
    await waitFor(() => {
      expect(screen.getByTestId('missions-reload-status')).toBeEmptyDOMElement()
    })
    await screen.findByTestId('missions-list')
  })
})
