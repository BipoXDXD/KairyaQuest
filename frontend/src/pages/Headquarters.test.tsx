import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Progress } from '../features/progression'
import type { ActionRead, MessageRead } from '../features/tutoring'
import type { Mission } from '../shared/types/mission'
import type { MissionCompletion, Reward } from '../shared/types/reward'
import { useKairya } from '../features/kairya'
import { flushPendingEffects } from '../test/flushEffects'
import { requestsTo, routeFetch, type Route } from '../test/fetchRoutes'
import { memoryStorage } from '../test/audioDoubles'
import { renderWithI18n } from '../test/i18n'
import { stubViewport } from '../test/viewport'
import { Headquarters } from './Headquarters'
import { HEADQUARTERS_HEADING_ID } from './headings'

/** O progresso que `GET /api/progress` devolve, sem conquista nenhuma por padrao. */
function progressBody(xp: number, level = 1, floor = 0, next = 100): Progress {
  return { xp_total: xp, level, level_floor_xp: floor, next_level_xp: next, achievements: [] }
}

/**
 * A pagina busca cinco recursos na montagem: ciclo, missoes, status e
 * historico da Kairya, e o progresso.
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
        late_daily: null,
      }),
    'GET /api/missions': () => Response.json([]),
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
    'GET /api/progress': () => Response.json(progressBody(20)),
  })
}

/** Espera os efeitos das features assentarem, para o teste nao terminar no meio de uma atualizacao. */
async function settle() {
  await screen.findByTestId('missions-empty')
  await screen.findByTestId('tutor-greeting')
  await screen.findByTestId('progress-level')
}

/** Despacha uma celebracao assim que monta, como farao as features que conhecem a Kairya. */
function CelebrateOnMount() {
  const { dispatch } = useKairya()
  useEffect(() => {
    dispatch({ type: 'celebrate', reason: 'missionDone', detail: null })
  }, [dispatch])
  return null
}

describe('Headquarters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('em ingles, o cabecalho vem do catalogo', async () => {
    stubPage()

    renderWithI18n(<Headquarters />, { locale: 'en' })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/^Headquarters — your study dashboard$/)
    // Cada texto preso ao seu lugar no cabecalho: trocar duas chaves irmas reprova.
    expect(heading.nextElementSibling).toHaveTextContent(
      /^What's open, with its deadline and reward\.$/,
    )
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
  })

  it('anuncia a tela no titulo de nivel 1, em portugues', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Quartel-General/)
    // Espera os efeitos das features assentarem, para o teste nao terminar no
    // meio de uma atualizacao de estado.
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
  })

  it('compoe a feature de missoes, e nao busca dado por conta propria', async () => {
    const fetchMock = stubPage()

    renderWithI18n(<Headquarters />)

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

    renderWithI18n(<Headquarters />)

    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('cycle-no-plan')
    await screen.findByTestId('progress-level')
    expect(
      screen.getByTestId('cycle').compareDocumentPosition(screen.getByTestId('missions')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it('a bolha da Kairya fica no main, logo abaixo do cabeçalho e acima do progresso', async () => {
    stubPage()

    renderWithI18n(
      <>
        <Headquarters />
        <CelebrateOnMount />
      </>,
    )

    const bubble = await screen.findByRole('figure', { name: 'Kairya' })
    await screen.findByTestId('progress-level')
    const main = screen.getByTestId('headquarters')
    expect(main).toContainElement(bubble)
    const hero = screen.getByRole('heading', { level: 1 })
    const before = (a: Node, b: Node) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(before(hero, bubble)).not.toBe(0)
    expect(before(bubble, screen.getByTestId('progress'))).not.toBe(0)
    expect(bubble).toHaveTextContent('Feito. Isso é treino de verdade.')
    await settle()
  })

  it('o painel de progresso fica acima da missão de hoje', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

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

    renderWithI18n(<Headquarters />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveAttribute('id', HEADQUARTERS_HEADING_ID)
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByTestId('headquarters')).toBeVisible()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
  })

  it('o cabeçalho da área usa a cena do QG', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

    const header = screen.getByRole('heading', { level: 1 }).closest('header')
    expect(header).toHaveClass('area-hero', 'area-hero--hq')
    await settle()
  })

  it('o texto do hero fica sobre um Panel surface, não sobre a imagem', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

    const heading = screen.getByRole('heading', { level: 1 })
    const panel = heading.closest('[data-elevation]')
    expect(panel).toHaveAttribute('data-elevation', 'surface')
    expect(panel).toHaveTextContent('O que está em aberto, com prazo e recompensa.')
    expect(panel).not.toHaveClass('area-hero')
    await settle()
  })

  it('o h1 continua sendo o primeiro heading', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

    await settle()
    expect(screen.getAllByRole('heading')[0]).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('em inglês, o título e a nota vêm do catálogo', async () => {
    stubPage()

    renderWithI18n(<Headquarters />, { locale: 'en' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Headquarters — your study dashboard',
    )
    expect(screen.getByText("What's open, with its deadline and reward.")).toBeInTheDocument()
    await settle()
  })

  it('oculta, esconde o main e o painel da Kairya, sem desmontar', async () => {
    stubPage()

    renderWithI18n(<Headquarters hidden />)

    // O `main` leva o proprio `hidden` (so um `main` sem ele por documento);
    // o painel da Kairya, fora do `main`, some pela raiz.
    expect(screen.getByTestId('headquarters')).toHaveAttribute('hidden')
    expect(screen.getByTestId('tutor-panel')).not.toBeVisible()
    // Montado: as features buscaram os dados mesmo ocultas.
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
  })

  it('compoe o painel da Kairya ao lado do quadro', async () => {
    stubPage()

    renderWithI18n(<Headquarters />)

    expect(screen.getByRole('complementary', { name: 'Kairya' })).toBeInTheDocument()
    expect(screen.getByTestId('missions')).toBeInTheDocument()
    await screen.findByTestId('missions-empty')
    await screen.findByTestId('tutor-greeting')
    await screen.findByTestId('progress-level')
  })

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'só oculto→visível atualiza, sem carga adicional na montagem (oculta: %s, StrictMode: %s)',
    async (initialHidden, strict) => {
      const fetchMock = stubPage()
      const { rerender } = renderWithI18n(<Headquarters hidden={initialHidden} />, { strict })
      await screen.findByTestId('progress-level')
      await screen.findByTestId('cycle-no-plan')
      await screen.findByTestId('tutor-greeting')
      const initialCalls = strict ? 2 : 1
      expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(initialCalls)
      expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(initialCalls)
      const input = screen.getByTestId('tutor-input')
      rerender(<Headquarters hidden={initialHidden} />)
      if (!initialHidden) rerender(<Headquarters hidden />)
      rerender(<Headquarters hidden />)
      expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(initialCalls)
      expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(initialCalls)
      await act(async () => rerender(<Headquarters hidden={false} />))
      expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(initialCalls + 1)
      expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(initialCalls + 1)
      expect(screen.getByTestId('tutor-input')).toBe(input)
      await act(async () => rerender(<Headquarters />))
      expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(initialCalls + 1)
      expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(initialCalls + 1)
    },
  )

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
      reschedules: [],
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
          late_daily: null,
        }),
      'GET /api/missions': () => Response.json([avulsa]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': (_init, call) =>
        call === 1 ? Response.json(progressBody(20)) : segundoProgresso,
      'POST /api/missions/21/complete': () => Response.json(completion),
    })

    renderWithI18n(<Headquarters />)
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
      reschedules: [],
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
                late_daily: null,
              }
            : {
                today: '2026-09-23',
                mission: diariaConcluida,
                streak: 1,
                days_to_milestone: 6,
                special: null,
                late_daily: null,
              },
        ),
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': (_init, call) =>
        Response.json(call === 1 ? progressBody(20) : progressBody(60)),
      'POST /api/missions/22/complete': () => Response.json(completion),
    })

    renderWithI18n(<Headquarters />)
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

describe('Headquarters: a celebracao da Kairya', () => {
  const base: Mission = {
    id: 31,
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
    reschedules: [],
  }
  const concluida: Mission = {
    ...base,
    state: 'concluida',
    availability: 'concluida',
    completed_at: '2026-09-23T15:00:00Z',
    verification: 'autodeclarada',
  }

  function stubBoard(
    cycleMission: Mission | null,
    missions: Mission[],
    extra: Record<string, Route>,
  ) {
    stubViewport('desktop')
    routeFetch({
      'GET /api/cycle': () =>
        Response.json({
          today: '2026-09-23',
          mission: cycleMission,
          streak: 0,
          days_to_milestone: 7,
          special: null,
          late_daily: null,
        }),
      'GET /api/missions': () => Response.json(missions),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': () => Response.json(progressBody(20)),
      ...extra,
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('concluir a diária que sobe de nível e destrava conquista celebra uma bolha só, com a fala do nível', async () => {
    const reward: Reward = {
      xp_awarded: 40,
      xp_total: 140,
      level_before: 1,
      level_after: 2,
      achievements_unlocked: [
        { code: 'streak_7', title: 'Sequência de 7', description: 'Sete dias seguidos' },
      ],
    }
    const diaria: Mission = { ...base, id: 32, mission_type: 'diaria', day: '2026-09-23' }
    const completion: MissionCompletion = {
      ...diaria,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-23T15:00:00Z',
      verification: 'autodeclarada',
      reward,
    }
    stubBoard(diaria, [], { 'POST /api/missions/32/complete': () => Response.json(completion) })

    renderWithI18n(<Headquarters />)
    await settle()
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    const bubble = await screen.findByRole('figure', { name: 'Kairya' })
    expect(bubble).toHaveAttribute('data-tone', 'celebrating')
    expect(bubble).toHaveTextContent('Você construiu isso, dia após dia.')
    expect(bubble).toHaveTextContent('Subiu para o nível 2!')
    // O reducer guarda so a celebracao de maior prioridade (D2): a legenda da
    // conquista nao entra na bolha; ela aparece no anuncio da recompensa.
    expect(bubble).not.toHaveTextContent('Conquista:')
    expect(await screen.findByTestId('reward')).toHaveTextContent('Conquista: Uma semana inteira')
  })

  it('concluir uma avulsa sem reward celebra só a missão, sem erro no console', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubBoard(null, [base], {
      'POST /api/missions/31/complete': () => Response.json(concluida),
    })

    renderWithI18n(<Headquarters />)
    await screen.findByTestId('missions-list')
    await screen.findByTestId('progress-level')
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${base.instructions}` }),
    )

    const bubble = await screen.findByRole('figure', { name: 'Kairya' })
    expect(bubble).toHaveTextContent('Feito. Isso é treino de verdade.')
    expect(bubble).not.toHaveTextContent(/Subiu para o nível|Conquista:/)
    expect(erro).not.toHaveBeenCalled()
  })

  it('avaliação que não atende deixa a Kairya preocupada, com a fala dela', async () => {
    const comEvidencia: Mission = {
      ...concluida,
      verification: 'com_evidencia',
      evidence: { text: 'Resolvi os exercicios.', link: null },
    }
    stubBoard(null, [comEvidencia], {
      'POST /api/missions/31/evaluation': () =>
        Response.json({
          evaluation: {
            state: 'concluida',
            verdict: 'nao_atende',
            feedback: 'Faltou o ultimo exercicio.',
            error_code: null,
            model: 'm',
          },
          reward: null,
        }),
    })

    renderWithI18n(<Headquarters />)
    await screen.findByTestId('missions-list')
    await screen.findByTestId('progress-level')
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir avaliação da Kairya' }))

    const bubble = await screen.findByRole('figure', { name: 'Kairya' })
    expect(bubble).toHaveAttribute('data-tone', 'concerned')
    expect(bubble).toHaveTextContent('Ainda não atende. Vamos olhar juntos o que falta?')
  })
})

describe('Headquarters: a missao criada pela Kairya', () => {
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
      fallback_model: null,
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
      fallback_model: null,
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
    reschedules: [],
  }

  const confirmed: Route = () =>
    Response.json({
      action: { ...proposal, state: 'executada', mission_id: 40 },
      mission: { id: 40, instructions: proposal.payload.instructions },
    })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Q1 confirmar uma proposta da Kairya recarrega o quadro', async () => {
    stubViewport('desktop')
    const fetchMock = routeFetch({
      [MISSIONS]: () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json(history),
      [CONFIRM]: confirmed,
    })
    renderWithI18n(<Headquarters />)
    await screen.findByTestId('missions-empty')

    fireEvent.click(await screen.findByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    await waitFor(() => {
      expect(requestsTo(fetchMock, MISSIONS)).toHaveLength(2)
    })
    await screen.findByTestId('missions-empty')
  })

  it('Q2 com uma conclusao em voo, a recarga pedida pela Kairya espera', async () => {
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
    renderWithI18n(<Headquarters />)
    fireEvent.click(await screen.findByTestId('mission-complete'))

    fireEvent.click(await screen.findByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    expect(requestsTo(fetchMock, MISSIONS)).toHaveLength(1)
    expect(screen.getByTestId('missions-reload-status')).toHaveTextContent(
      'Aguardando o pedido em andamento para atualizar o quadro.',
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

describe('Headquarters: saudação do dia', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const MORNING = () => new Date('2026-11-10T12:00:00Z')
  const NEXT_DAY = () => new Date('2026-11-11T12:00:00Z')

  /** Ciclo sem plano, com a sequência pedida por leitura (a última se repete). */
  function stubCycle(streaks: readonly number[]) {
    stubViewport('desktop')
    return routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json({
          today: '2026-11-10',
          mission: null,
          streak: streaks[Math.min(call, streaks.length) - 1],
          days_to_milestone: 7,
          special: null,
          late_daily: null,
        }),
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': () => Response.json(progressBody(20)),
    })
  }

  /**
   * A bolha da saudação sai de um efeito, depois do commit que traz o ciclo.
   * Espera o ciclo (o dado observável), descarrega os efeitos desse commit e só
   * então espera a bolha: a cadeia efeito -> estado -> efeito não paga, uma a
   * uma, as tarefas do Scheduler, e o teste não depende da velocidade dele.
   */
  async function findGreeting() {
    await screen.findByTestId('cycle-today')
    flushPendingEffects()
    return screen.findByRole('figure', { name: 'Kairya' })
  }

  function presence(clock: () => Date, storage: Storage | null) {
    return { presence: { greeting: true, clock, storage, random: () => 0 } }
  }

  it('saúda de manhã, anuncia a fala e grava o dia', async () => {
    stubCycle([3])
    const storage = memoryStorage()

    renderWithI18n(<Headquarters />, presence(MORNING, storage))

    const bubble = await findGreeting()
    expect(bubble).toHaveTextContent('Bom dia. Qual é o primeiro passo de hoje?')
    expect(screen.getByTestId('kairya-announcement')).toHaveTextContent(
      'Bom dia. Qual é o primeiro passo de hoje?',
    )
    expect(storage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    await settle()
  })

  it.each([
    { hour: '15:00Z', text: 'Boa tarde. Bom te ver. O que cabe agora?' },
    { hour: '21:00Z', text: 'Boa noite. Bom te ver. Qual é o passo de hoje?' },
  ])('a saudação segue o período pelo relógio ($hour)', async ({ hour, text }) => {
    stubCycle([3])

    renderWithI18n(
      <Headquarters />,
      presence(() => new Date(`2026-11-10T${hour}`), memoryStorage()),
    )

    expect(await findGreeting()).toHaveTextContent(text)
    await settle()
  })

  it('uma vez por dia: remontar no mesmo dia não saúda, e no dia seguinte saúda', async () => {
    stubCycle([3])
    const storage = memoryStorage()
    const first = renderWithI18n(<Headquarters />, presence(MORNING, storage))
    await findGreeting()
    await settle()
    first.unmount()

    const same = renderWithI18n(<Headquarters />, presence(MORNING, storage))
    await settle()
    // Ausência: só vale depois de os efeitos do commit terem rodado.
    flushPendingEffects()
    expect(screen.queryByRole('figure', { name: 'Kairya' })).toBeNull()
    same.unmount()

    renderWithI18n(<Headquarters />, presence(NEXT_DAY, storage))
    expect(await findGreeting()).toHaveTextContent('Bom dia.')
    await settle()
  })

  it('concluir a diária e reler o ciclo não saúdam de novo e lembram a sequência', async () => {
    const diaria: Mission = {
      id: 22,
      instructions: 'Resolver 5 exercicios de recursao',
      completion_criterion: 'Cinco exercicios corrigidos',
      difficulty: 2,
      estimated_minutes: 45,
      mission_type: 'diaria',
      day: '2026-11-10',
      deadline: '2026-11-11T00:00:00-03:00',
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
    const concluida: Mission = {
      ...diaria,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-11-10T15:00:00Z',
      verification: 'autodeclarada',
    }
    const reward: Reward = {
      xp_awarded: 40,
      xp_total: 60,
      level_before: 1,
      level_after: 1,
      achievements_unlocked: [],
    }
    stubViewport('desktop')
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json({
          today: '2026-11-10',
          mission: call === 1 ? diaria : concluida,
          streak: call === 1 ? 3 : 4,
          days_to_milestone: 4,
          special: null,
          late_daily: null,
        }),
      'GET /api/missions': () => Response.json([]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': () => Response.json(progressBody(20)),
      'POST /api/missions/22/complete': () => Response.json({ ...concluida, reward }),
    })
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')

    renderWithI18n(<Headquarters />, presence(MORNING, storage))
    await findGreeting()
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    await waitFor(() => {
      expect(storage.getItem('kairyaquest.lastStreak')).toBe('4')
    })
    const greetingWrites = setItem.mock.calls.filter(([key]) => key === 'kairyaquest.lastGreeting')
    expect(greetingWrites).toHaveLength(1)
  })

  it('sequência zerada depois de uma sequência: fala de retorno, preocupada', async () => {
    stubCycle([0])
    const storage = memoryStorage({
      'kairyaquest.lastStreak': '3',
      'kairyaquest.lastGreeting': '2026-11-09',
    })

    renderWithI18n(<Headquarters />, presence(MORNING, storage))

    const bubble = await findGreeting()
    expect(bubble).toHaveTextContent(
      'A sequência zerou. O que você aprendeu, não. Vamos de novo hoje?',
    )
    expect(bubble).toHaveAttribute('data-tone', 'concerned')
    await settle()
  })

  it('storage que lança: saúda uma vez e não quebra', async () => {
    stubCycle([3])
    const storage = memoryStorage()
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('cota', 'QuotaExceededError')
    })

    renderWithI18n(<Headquarters />, presence(MORNING, storage))

    expect(await findGreeting()).toHaveTextContent('Bom dia.')
    await settle()
  })

  it('storage nulo: saúda e não lança', async () => {
    stubCycle([3])

    renderWithI18n(<Headquarters />, presence(MORNING, null))

    expect(await findGreeting()).toHaveTextContent('Bom dia.')
    await settle()
  })

  it('valor inválido na chave da saudação conta como sem registro', async () => {
    stubCycle([3])
    const storage = memoryStorage({ 'kairyaquest.lastGreeting': 'lixo' })

    renderWithI18n(<Headquarters />, presence(MORNING, storage))

    expect(await findGreeting()).toHaveTextContent('Bom dia.')
    expect(storage.getItem('kairyaquest.lastGreeting')).toBe('2026-11-10')
    await settle()
  })
})
