import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import { CycleSection } from './CycleSection'
import type { Cycle, Mission } from './types'

const diaria: Mission = {
  id: 31,
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
}
const diariaConcluida: Mission = {
  ...diaria,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-09-23T15:00:00Z',
}
const especial: Mission = {
  ...diaria,
  id: 38,
  mission_type: 'especial',
  day: null,
  difficulty: 5,
  xp: 660,
  instructions: 'Prova simulada',
  deadline: '2026-09-29T00:00:00-03:00',
}

const ciclo = (ajustes: Partial<Cycle> = {}): Cycle => ({
  today: '2026-09-23',
  mission: diaria,
  streak: 3,
  days_to_milestone: 4,
  special: null,
  ...ajustes,
})

describe('CycleSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia o carregamento', () => {
    routeFetch({ 'GET /api/cycle': () => new Promise<Response>(() => undefined) })
    render(<CycleSection />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando o ciclo…')
  })

  it('sem plano, diz que nao ha diaria e que o dia sem plano nao quebra a sequencia', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ mission: null, streak: 0, days_to_milestone: 7 })),
    })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-no-plan')).toHaveTextContent(/não quebra/)
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent(
      'Missão especial: 0 de 7 — faltam 7 dias.',
    )
  })

  it('mostra a data civil de hoje sem conversao de fuso', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-today')).toHaveTextContent(
      'Hoje é quarta-feira, 23/09.',
    )
  })

  it('mostra a missao de hoje com a sequencia e o progresso ate a especial', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    const cartao = await screen.findByTestId('mission-item')
    expect(within(cartao).getByTestId('mission-instructions')).toHaveTextContent(
      diaria.instructions,
    )
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 3 dias seguidos')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent(
      'Missão especial: 3 de 7 — faltam 4 dias.',
    )
  })

  it('usa o singular para um dia', async () => {
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ streak: 1, days_to_milestone: 1 })),
    })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-streak')).toHaveTextContent('Sequência: 1 dia seguido')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent(
      'Missão especial: 1 de 7 — falta 1 dia.',
    )
  })

  it('concluir a missao de hoje atualiza a sequencia sem desmontar o cartao', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(
          call === 1
            ? ciclo()
            : ciclo({ mission: diariaConcluida, streak: 4, days_to_milestone: 3 }),
        ),
      'POST /api/missions/31/complete': () => Response.json(diariaConcluida),
    })
    render(<CycleSection />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    expect(await screen.findByTestId('mission-completion-status')).toHaveTextContent(
      'Missão concluída.',
    )
    await waitFor(() => {
      expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 4 dias seguidos')
    })
    // O anuncio continua la: o refresh nao passou por "carregando".
    expect(screen.getByTestId('mission-completion-status')).toHaveTextContent('Missão concluída.')
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('a missao de hoje ja concluida nao oferece Concluir', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ mission: diariaConcluida })) })
    render(<CycleSection />)
    await screen.findByTestId('mission-item')
    expect(screen.queryByTestId('mission-complete')).toBeNull()
  })

  it('com a especial vigente, mostra o cartao dela no lugar do progresso', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-special')
    // `{ level: 3 }` sozinho colide com o `<h3>` do titulo do CARTAO
    // (`mission-instructions`, em `MissionCard.tsx`): a secao tem os dois.
    // O `name` desambigua sem mudar a intencao -- ainda e o titulo da secao
    // da especial que o teste confere.
    expect(
      within(secao).getByRole('heading', {
        level: 3,
        name: 'Missão especial — bônus da sequência',
      }),
    ).toBeInTheDocument()
    expect(within(secao).getByTestId('mission-xp')).toHaveTextContent('660 XP')
    expect(screen.queryByTestId('cycle-progress')).toBeNull()
  })

  it('o erro de carregamento oferece Tentar novamente', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json(ciclo()),
    })
    render(<CycleSection />)
    const erro = await screen.findByTestId('cycle-error')
    expect(erro).toHaveTextContent('Falha ao carregar o ciclo.')
    fireEvent.click(screen.getByTestId('cycle-retry'))
    expect(await screen.findByTestId('mission-item')).toBeInTheDocument()
  })

  it('se a atualizacao depois da conclusao falha, avisa e oferece Atualizar', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 2) return new Response(null, { status: 500 })
        return Response.json(
          call === 1
            ? ciclo()
            : ciclo({ mission: diariaConcluida, streak: 4, days_to_milestone: 3 }),
        )
      },
      'POST /api/missions/31/complete': () => Response.json(diariaConcluida),
    })
    render(<CycleSection />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )
    expect(await screen.findByTestId('cycle-stale')).toHaveTextContent(
      'Não foi possível atualizar a sequência.',
    )
    fireEvent.click(screen.getByTestId('cycle-refresh'))
    await waitFor(() => {
      expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 4 dias seguidos')
    })
    expect(screen.queryByTestId('cycle-stale')).toBeNull()
  })
})
