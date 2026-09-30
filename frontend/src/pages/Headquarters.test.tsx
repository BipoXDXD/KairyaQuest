import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Progress } from '../features/progression/types'
import type { ActionRead, MessageRead } from '../features/tutoring/types'
import type { Mission } from '../shared/types/mission'
import type { MissionCompletion, Reward } from '../shared/types/reward'
import { requestsTo, routeFetch, type Route } from '../test/fetchRoutes'
import { stubViewport } from '../test/viewport'
import { Headquarters } from './Headquarters'
import { HEADQUARTERS_HEADING_ID } from './headings'

/** O progresso que `GET /api/progress` devolve, sem conquista nenhuma por padrao. */
function progressBody(xp: number, level = 1, floor = 0, next = 100): Progress {
  return { xp_total: xp, level, level_floor_xp: floor, next_level_xp: next, achievements: [] }
}

/**
 * A pagina busca cinco recursos na montagem: ciclo, missoes, status e
 * historico da Tifa, e o progresso.
 */
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
    'GET /api/progress': () => Response.json(progressBody(20)),
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
    await screen.findByTestId('progress-level')
  })

  it('compoe a feature de missoes, e nao busca dado por conta propria', async () => {
    const fetchMock = stubPage()

    render(<Headquarters />)

    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    await screen.findByTestId('progress-level')
    // Uma ida a rede por recurso, e cada uma e de uma feature: a pagina nao
    // chama a API. Contar o total deixou de servir quando a pagina passou a
    // compor mais de uma feature (1b-2, o ciclo no B e o progresso no D).
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/status')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('compoe a missao de hoje acima do quadro de avulsas', async () => {
    stubPage()

    render(<Headquarters />)

    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    await screen.findByTestId('progress-level')
    expect(
      screen.getByTestId('cycle').compareDocumentPosition(screen.getByTestId('missions')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it('o painel de progresso fica acima da missão de hoje', async () => {
    stubPage()

    render(<Headquarters />)

    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    await screen.findByTestId('progress-level')
    expect(
      screen.getByTestId('progress').compareDocumentPosition(screen.getByTestId('cycle')) &
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
    await screen.findByTestId('progress-level')
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
    await screen.findByTestId('progress-level')
  })

  it('compoe o painel da Tifa ao lado do quadro', async () => {
    stubPage()

    render(<Headquarters />)

    expect(screen.getByRole('complementary', { name: 'Tifa' })).toBeInTheDocument()
    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
  })

  it('concluir uma avulsa atualiza o painel sem passar por carregando', async () => {
    const avulsa: Mission = {
      id: 21,
      instructions: 'Resolver 5 exercicios de recursao',
      completion_criterion: 'Cinco exercicios corrigidos',
      difficulty: 2,
      estimated_minutes: 45,
      mission_type: 'avulsa',
      day: null,
      deadline: '2026-09-24T00:00:00-03:00',
      state: 'pendente',
      availability: 'disponivel',
      started_at: null,
      completed_at: null,
      xp: 80,
      actual_duration_minutes: null,
      verification: null,
      evidence: null,
      evaluation: null,
    }
    const recompensa: Reward = {
      xp_awarded: 80,
      xp_total: 100,
      level_before: 1,
      level_after: 1,
      achievements_unlocked: [],
    }
    const completion: MissionCompletion = {
      ...avulsa,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-24T10:00:00Z',
      verification: 'autodeclarada',
      reward: recompensa,
    }
    stubViewport('desktop')
    // O segundo GET /api/progress (o `refresh` pedido pela conclusao) fica
    // PENDENTE ate o teste resolve-lo -- e enquanto ele esta em voo que a
    // guarda contra "carregando" precisa valer. Sem controlar o instante, a
    // asserção logo apos o clique so prova algo se acontecer ANTES do POST
    // assentar (nada mudou ainda), e a de depois do `waitFor` so olha o
    // estado final -- as duas passam mesmo se o painel passar por
    // "carregando" no meio (mutacao medida: `refresh` chamando `reload`).
    let resolveSegundoProgresso!: (response: Response) => void
    const segundoProgresso = new Promise<Response>((resolve) => {
      resolveSegundoProgresso = resolve
    })
    const fetchMock = routeFetch({
      'GET /api/cycle': () =>
        Response.json({
          today: '2026-09-23',
          mission: null,
          streak: 0,
          days_to_milestone: 7,
          special: null,
        }),
      'GET /api/missions': () => Response.json([avulsa]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': (_init, call) =>
        call === 1 ? Response.json(progressBody(20)) : segundoProgresso,
      'POST /api/missions/21/complete': () => Response.json(completion),
    })

    render(<Headquarters />)
    await screen.findByTestId('missions-list')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    await screen.findByTestId('progress-level')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('20 XP no total')

    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${avulsa.instructions}` }),
    )

    // O segundo GET /api/progress ja foi pedido (o `refresh` que a conclusao
    // disparou), mas ainda esta em voo -- e e justo AQUI, com ele pendente,
    // que a guarda importa: em SILENCIO, sem "carregando", com o valor
    // antigo ainda na tela.
    await waitFor(() => {
      expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(2)
    })
    expect(screen.queryByTestId('progress-loading')).toBeNull()
    expect(screen.getByTestId('progress-total')).toHaveTextContent('20 XP no total')

    await act(async () => {
      resolveSegundoProgresso(Response.json(progressBody(100)))
      await segundoProgresso
    })

    expect(screen.getByTestId('progress-total')).toHaveTextContent('100 XP no total')
    expect(screen.queryByTestId('progress-loading')).toBeNull()
  })

  it('concluir a diária também atualiza o painel', async () => {
    const diaria: Mission = {
      id: 22,
      instructions: 'Resolver 5 exercicios de recursao',
      completion_criterion: 'Cinco exercicios corrigidos',
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
    }
    const diariaConcluida: Mission = {
      ...diaria,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-23T15:00:00Z',
      verification: 'autodeclarada',
    }
    const recompensa: Reward = {
      xp_awarded: 40,
      xp_total: 60,
      level_before: 1,
      level_after: 1,
      achievements_unlocked: [],
    }
    const completion: MissionCompletion = { ...diariaConcluida, reward: recompensa }
    stubViewport('desktop')
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(
          call === 1
            ? {
                today: '2026-09-23',
                mission: diaria,
                streak: 0,
                days_to_milestone: 7,
                special: null,
              }
            : {
                today: '2026-09-23',
                mission: diariaConcluida,
                streak: 1,
                days_to_milestone: 6,
                special: null,
              },
        ),
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': (_init, call) =>
        Response.json(call === 1 ? progressBody(20) : progressBody(60)),
      'POST /api/missions/22/complete': () => Response.json(completion),
    })

    render(<Headquarters />)
    await screen.findByTestId('mission-item')
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('20 XP no total')

    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('progress-total')).toHaveTextContent('60 XP no total')
    })
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
    verification: null,
    evidence: null,
    evaluation: null,
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
      resolver(Response.json({ ...pendente, state: 'concluida', verification: 'autodeclarada' }))
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
