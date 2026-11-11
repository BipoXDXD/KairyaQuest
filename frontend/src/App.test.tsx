import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Cycle } from './features/missions/types'
import type { Progress } from './features/progression/types'
import type { Mission } from './shared/types/mission'
import { controlledStream, sseFrame } from './test/sse'
import { requestsTo, routeFetch } from './test/fetchRoutes'
import { memoryStorage } from './test/audioDoubles'
import { renderWithI18n } from './test/i18n'
import { stubViewport } from './test/viewport'

/**
 * O que o Quartel-General busca na montagem: ciclo, missoes, status,
 * historico da Kairya e progresso; e o que Campanhas
 * busca ao abrir: a trilha da semana (`GET /api/plans/current`). O `plan` e
 * parametrizavel porque um teste precisa de um dia `disponivel` na trilha
 * (o botao "Ir ao Quartel-General"); os demais usam o padrao `null` ("sem
 * plano nesta semana").
 */
function stubPage(plan: unknown = null) {
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
    'GET /api/plans/current': () => Response.json({ plan }),
    'GET /api/progress': () =>
      Response.json({
        xp_total: 20,
        level: 1,
        level_floor_xp: 0,
        next_level_xp: 100,
        achievements: [],
      }),
  })
}

/** Espera os efeitos do Quartel-General assentarem. */
async function settleHeadquarters() {
  await screen.findByTestId('missions-empty')
  await screen.findByTestId('tutor-greeting')
  await screen.findByTestId('cycle-no-plan')
  await screen.findByTestId('progress-level')
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('monta o Quartel-General como tela inicial', async () => {
    stubPage()

    renderWithI18n(<App />)

    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Quartel-General/)
    await settleHeadquarters()
  })

  it('sem opções de áudio, o convite de som não aparece', async () => {
    stubPage()

    renderWithI18n(<App />)

    expect(screen.queryByTestId('sound-invite')).toBeNull()
    await settleHeadquarters()
  })

  it('com o convite pendente, o cartão fica acima do Quartel-General', async () => {
    stubPage()

    renderWithI18n(<App />, { audio: { storage: memoryStorage({}) } })

    const invite = screen.getByTestId('sound-invite')
    const headquarters = screen.getByTestId('headquarters')
    expect(
      invite.compareDocumentPosition(headquarters) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await settleHeadquarters()
  })

  it('so a raiz do App pinta o fundo e fixa a altura minima; a do Quartel-General so organiza o layout', async () => {
    stubPage()

    const { container } = renderWithI18n(<App />)

    const raizDoApp = container.firstElementChild
    const raizDoQuartel = screen.getByTestId('headquarters').parentElement
    expect(raizDoApp).toHaveClass('min-h-screen', 'bg-bg-canvas', 'text-text-primary')
    // Duplicar `min-h-screen` na pagina soma a altura da navegacao no celular:
    // a tela curta ganha uma rolagem sem conteudo (medido: 905px contra 844px).
    for (const classe of ['min-h-screen', 'bg-bg-canvas', 'text-text-primary']) {
      expect(raizDoQuartel).not.toHaveClass(classe)
    }
    await settleHeadquarters()
  })

  it('abre no Quartel-General, marcado como area atual na navegacao', async () => {
    stubPage()

    renderWithI18n(<App />)

    expect(screen.getByRole('navigation', { name: 'Áreas' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    await settleHeadquarters()
  })

  it('Campanhas abre pela navegacao: o titulo dela recebe o foco e o Quartel-General fica oculto', async () => {
    stubPage()
    renderWithI18n(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))

    const heading = screen.getByRole('heading', { level: 1, name: 'Campanhas — planos de estudo' })
    expect(heading).toBeVisible()
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).not.toBeVisible()
    expect(screen.getByTestId('nav-campaigns')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-headquarters')).not.toHaveAttribute('aria-current')
    // Aguarda o `GET /api/plans/current` que a trilha fez ao montar: sem
    // isto, a resposta assenta depois do fim do teste e o React avisa
    // "not wrapped in act(...)".
    await screen.findByTestId('trail-no-plan')
  })

  it('voltar ao Quartel-General devolve o foco ao titulo dele e desmonta Campanhas', async () => {
    stubPage()
    renderWithI18n(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-headquarters'))
    })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/Quartel-General/)
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
  })

  it('so um main visivel; o do Quartel-General oculto tem o proprio hidden', async () => {
    stubPage()
    renderWithI18n(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))

    // O HTML proibe mais de um `main` SEM o atributo `hidden` no proprio
    // elemento -- um ancestral oculto nao basta para a regra.
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByTestId('headquarters')).toHaveAttribute('hidden')
    // Aguarda a trilha assentar (mesmo motivo do teste acima: aviso act()).
    await screen.findByTestId('trail-no-plan')
  })

  it('o rascunho da Kairya sobrevive a ida e volta por Campanhas, sem remontar nada', async () => {
    const fetchMock = stubPage()
    renderWithI18n(<App />)
    await settleHeadquarters()
    fireEvent.change(screen.getByTestId('tutor-input'), {
      target: { value: 'Como estudo recursao?' },
    })

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-headquarters'))
    })

    // Desmontar o Quartel-General desmontaria o painel: o rascunho sumiria e
    // um stream em andamento seria abortado (decisao K2 do plano do C).
    expect(screen.getByTestId('tutor-input')).toHaveValue('Como estudo recursao?')
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    // O ciclo atualiza em silêncio ao retornar; não é uma remontagem.
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('cada abertura de Campanhas busca a trilha de novo', async () => {
    const fetchMock = stubPage()
    renderWithI18n(<App />)
    await settleHeadquarters()

    // ida
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findByTestId('trail-no-plan')
    // volta: Campanhas desmonta (K2), sem pedido novo a trilha
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-headquarters'))
    })
    // ida de novo: Campanhas remonta e busca a trilha outra vez
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findByTestId('trail-no-plan')

    expect(requestsTo(fetchMock, 'GET /api/plans/current')).toHaveLength(2)
  })

  it('o botao "Ir ao Quartel-General" da trilha volta ao Quartel-General, com Campanhas desmontada e o foco no titulo do QG', async () => {
    const planoComHojeDisponivel = {
      week_start: '2026-09-21',
      days: [
        {
          day: '2026-09-24',
          availability: 'disponivel',
          mission: {
            id: 1,
            instructions: 'Revisar recursao',
            completion_criterion: 'Resolver 3 exercicios',
            difficulty: 2,
            estimated_minutes: 30,
            mission_type: 'diaria',
            day: '2026-09-24',
            deadline: '2026-09-25T00:00:00-03:00',
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
          },
        },
      ],
      special: { availability: 'bloqueada', progress: 3, mission: null },
    }
    stubPage(planoComHojeDisponivel)
    renderWithI18n(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    const botao = await screen.findByRole('button', {
      name: 'Ir ao Quartel-General',
    })

    await act(async () => {
      fireEvent.click(botao)
    })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/Quartel-General/)
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')
  })
})

const daily = (id: number, day: string): Mission => ({
  id,
  day,
  instructions: `Diária de ${day}`,
  completion_criterion: 'Entregar resumo',
  difficulty: 2,
  estimated_minutes: 30,
  mission_type: 'diaria',
  deadline: `${day}T23:59:59-03:00`,
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
})
const oldCycle: Cycle = {
  today: '2026-10-04',
  mission: daily(700, '2026-10-04'),
  streak: 3,
  days_to_milestone: 4,
  special: null,
  late_daily: null,
}
const newCycle: Cycle = {
  today: '2026-10-05',
  mission: daily(701, '2026-10-05'),
  streak: 0,
  days_to_milestone: 7,
  special: null,
  late_daily: null,
}
const oldPlan = {
  plan: {
    week_start: '2026-09-28',
    days: Array.from({ length: 7 }, (_, index) => ({
      day: index < 3 ? `2026-09-${String(28 + index)}` : `2026-10-0${String(index - 2)}`,
      availability: index === 6 ? 'disponivel' : 'fora_do_plano',
      mission: index === 6 ? oldCycle.mission : null,
    })),
    special: { availability: 'bloqueada', progress: 3, mission: null },
  },
}
const progressAt = (xp: number): Progress => ({
  xp_total: xp,
  level: 1,
  level_floor_xp: 0,
  next_level_xp: 100,
  achievements: [],
})

function returnRoutes(
  cycle: () => Response | Promise<Response>,
  progress: () => Response | Promise<Response>,
) {
  stubViewport('desktop')
  return routeFetch({
    'GET /api/cycle': (_init, call) => (call === 1 ? Response.json(oldCycle) : cycle()),
    'GET /api/progress': (_init, call) => (call === 1 ? Response.json(progressAt(20)) : progress()),
    'GET /api/missions': () => Response.json([]),
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
    'GET /api/plans/current': () => Response.json(oldPlan),
  })
}

async function initialDaily() {
  await screen.findByText('Diária de 2026-10-04')
  await screen.findByTestId('progress-level')
  await screen.findByTestId('tutor-greeting')
}

describe('App: retorno ao Quartel-General', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('retornar na mesma aba consulta o servidor e preserva ciclo e progresso enquanto os pedidos estão em voo', async () => {
    let finishCycle!: (response: Response) => void
    let finishProgress!: (response: Response) => void
    const cycle = new Promise<Response>((resolve) => {
      finishCycle = resolve
    })
    const progress = new Promise<Response>((resolve) => {
      finishProgress = resolve
    })
    const fetchMock = returnRoutes(
      () => cycle,
      () => progress,
    )
    renderWithI18n(<App />)
    await initialDaily()
    const input = screen.getByTestId('tutor-input')
    const card = screen.getByTestId('cycle').querySelector('[data-mission-id="700"]')
    fireEvent.change(input, { target: { value: 'Quero continuar meu estudo.' } })
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findAllByTestId('trail-day')
    // Nenhum evento de foco ou visibilitychange é emitido: só navegação no app.
    fireEvent.click(screen.getByTestId('nav-headquarters'))
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
    expect(requestsTo(fetchMock, 'GET /api/progress')).toHaveLength(2)
    expect(screen.queryByTestId('cycle-loading')).toBeNull()
    expect(screen.queryByTestId('progress-loading')).toBeNull()
    expect(screen.getByTestId('cycle').querySelector('[data-mission-id="700"]')).toBe(card)
    expect(screen.getByTestId('progress-total')).toHaveTextContent('20 XP no total')
    await act(async () => {
      finishCycle(Response.json(newCycle))
      finishProgress(Response.json(progressAt(60)))
    })
    expect(screen.getByTestId('cycle-today')).toHaveTextContent('05/10')
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('0 dias seguidos')
    expect(screen.getByText('Diária de 2026-10-05')).toBeVisible()
    expect(screen.queryByText('Diária de 2026-10-04')).toBeNull()
    expect(screen.getByTestId('progress-total')).toHaveTextContent('60 XP no total')
    expect(screen.getByTestId('tutor-input')).toBe(input)
    expect(input).toHaveValue('Quero continuar meu estudo.')
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/status')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
  })

  it('falha na atualização ao retornar preserva os dados e os retries existentes recuperam os dois recursos', async () => {
    let cycleCalls = 0
    let progressCalls = 0
    returnRoutes(
      () => (++cycleCalls === 1 ? Response.json({}, { status: 503 }) : Response.json(newCycle)),
      () =>
        ++progressCalls === 1 ? Response.json({}, { status: 503 }) : Response.json(progressAt(60)),
    )
    renderWithI18n(<App />)
    await initialDaily()
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findAllByTestId('trail-day')
    fireEvent.click(screen.getByTestId('nav-headquarters'))
    expect(await screen.findByTestId('cycle-stale')).toHaveTextContent(
      'Não foi possível atualizar a sequência.',
    )
    expect(await screen.findByTestId('progress-stale')).toHaveTextContent(
      'Não foi possível atualizar o progresso.',
    )
    expect(screen.getByText('Diária de 2026-10-04')).toBeVisible()
    expect(screen.getByTestId('progress-total')).toHaveTextContent('20 XP no total')
    fireEvent.click(screen.getByTestId('cycle-refresh'))
    fireEvent.click(screen.getByTestId('progress-refresh'))
    await screen.findByText('Diária de 2026-10-05')
    await waitFor(() =>
      expect(screen.getByTestId('progress-total')).toHaveTextContent('60 XP no total'),
    )
    expect(screen.queryByTestId('cycle-stale')).toBeNull()
    expect(screen.queryByTestId('progress-stale')).toBeNull()
  })

  it('o stream em voo sobrevive à navegação e termina na conversa original', async () => {
    const stream = controlledStream()
    const fetchMock = returnRoutes(
      () => Response.json(newCycle),
      () => Response.json(progressAt(60)),
    )
    // Mantém as rotas GET reais do componente e controla só o envio em stream.
    const fetchGet = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Promise.resolve(stream.response) : fetchGet(url, init),
      ),
    )
    renderWithI18n(<App />)
    await initialDaily()
    fireEvent.change(screen.getByTestId('tutor-input'), { target: { value: 'Uma pista' } })
    fireEvent.click(screen.getByTestId('tutor-send'))
    const question = {
      id: 800,
      role: 'user',
      content: 'Uma pista',
      status: 'completa',
      client_message_id: 'c800',
      reply_to_id: null,
      error_code: null,
      fallback_model: null,
      created_at: '2026-10-04T23:59:00-03:00',
      actions: [],
    }
    await act(async () => {
      stream.push(sseFrame('user_message', question))
      stream.push(sseFrame('delta', { text: 'Prefixo' }))
    })
    expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Prefixo')
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findAllByTestId('trail-day')
    await act(async () => {
      stream.push(
        sseFrame('done', {
          ...question,
          id: 801,
          role: 'tutor',
          content: 'Resposta completa',
          client_message_id: null,
          reply_to_id: 800,
        }),
      )
      stream.close()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-headquarters'))
    })
    expect(screen.getByText('Resposta completa')).toBeVisible()
    expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(screen.getByText('Diária de 2026-10-05')).toBeVisible()
  })
})
