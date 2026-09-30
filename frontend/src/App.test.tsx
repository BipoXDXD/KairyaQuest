import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { requestsTo, routeFetch } from './test/fetchRoutes'
import { stubViewport } from './test/viewport'

/**
 * O que o Quartel-General busca na montagem: ciclo, missoes, status,
 * historico da Tifa e progresso; e o que Campanhas
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

    render(<App />)

    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Quartel-General/)
    await settleHeadquarters()
  })

  it('so a raiz do App pinta o fundo e fixa a altura minima; a do Quartel-General so organiza o layout', async () => {
    stubPage()

    const { container } = render(<App />)

    const raizDoApp = container.firstElementChild
    const raizDoQuartel = screen.getByTestId('headquarters').parentElement
    expect(raizDoApp).toHaveClass('min-h-screen', 'bg-slate-950', 'text-slate-100')
    // Duplicar `min-h-screen` na pagina soma a altura da navegacao no celular:
    // a tela curta ganha uma rolagem sem conteudo (medido: 905px contra 844px).
    for (const classe of ['min-h-screen', 'bg-slate-950', 'text-slate-100']) {
      expect(raizDoQuartel).not.toHaveClass(classe)
    }
    await settleHeadquarters()
  })

  it('abre no Quartel-General, marcado como area atual na navegacao', async () => {
    stubPage()

    render(<App />)

    expect(screen.getByRole('navigation', { name: 'Áreas' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    await settleHeadquarters()
  })

  it('Campanhas abre pela navegacao: o titulo dela recebe o foco e o Quartel-General fica oculto', async () => {
    stubPage()
    render(<App />)
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
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    fireEvent.click(screen.getByTestId('nav-headquarters'))

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/Quartel-General/)
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
  })

  it('so um main visivel; o do Quartel-General oculto tem o proprio hidden', async () => {
    stubPage()
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))

    // O HTML proibe mais de um `main` SEM o atributo `hidden` no proprio
    // elemento -- um ancestral oculto nao basta para a regra.
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByTestId('headquarters')).toHaveAttribute('hidden')
    // Aguarda a trilha assentar (mesmo motivo do teste acima: aviso act()).
    await screen.findByTestId('trail-no-plan')
  })

  it('o rascunho da Tifa sobrevive a ida e volta por Campanhas, sem remontar nada', async () => {
    const fetchMock = stubPage()
    render(<App />)
    await settleHeadquarters()
    fireEvent.change(screen.getByTestId('tutor-input'), {
      target: { value: 'Como estudo recursao?' },
    })

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    fireEvent.click(screen.getByTestId('nav-headquarters'))

    // Desmontar o Quartel-General desmontaria o painel: o rascunho sumiria e
    // um stream em andamento seria abortado (decisao K2 do plano do C).
    expect(screen.getByTestId('tutor-input')).toHaveValue('Como estudo recursao?')
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(1)
  })

  it('cada abertura de Campanhas busca a trilha de novo', async () => {
    const fetchMock = stubPage()
    render(<App />)
    await settleHeadquarters()

    // ida
    fireEvent.click(screen.getByTestId('nav-campaigns'))
    await screen.findByTestId('trail-no-plan')
    // volta: Campanhas desmonta (K2), sem pedido novo a trilha
    fireEvent.click(screen.getByTestId('nav-headquarters'))
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
    render(<App />)
    await settleHeadquarters()

    fireEvent.click(screen.getByTestId('nav-campaigns'))
    const botao = await screen.findByRole('button', {
      name: 'Ir ao Quartel-General para concluir: Revisar recursao',
    })

    fireEvent.click(botao)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/Quartel-General/)
    expect(heading).toHaveFocus()
    expect(screen.getByTestId('headquarters')).toBeVisible()
    expect(screen.queryByTestId('campaigns')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')
  })
})
