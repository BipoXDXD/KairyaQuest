import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { CycleSection } from './CycleSection'
import type { Cycle } from './types'

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

/**
 * A recompensa que os testes de conclusao usam quando o CONTEUDO dela nao e o
 * que o teste prova -- isso e `RewardAnnouncement.test.tsx`. Aqui so importa
 * que o POST de conclusao devolve `reward` desde o incremento D.
 */
const recompensaPadrao: Reward = {
  xp_awarded: 40,
  xp_total: 1180,
  level_before: 3,
  level_after: 3,
  achievements_unlocked: [],
}

/** Embrulha a missao concluida no `MissionCompletion` que o POST devolve. */
function comRecompensa(mission: Mission, reward: Reward = recompensaPadrao): MissionCompletion {
  return { ...mission, reward }
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
    // m3: o titulo do cartao da missao de hoje e h3 por padrao, como sempre foi.
    expect(
      within(cartao).getByRole('heading', { level: 3, name: diaria.instructions }),
    ).toBeInTheDocument()
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
      'POST /api/missions/31/complete': () => Response.json(comRecompensa(diariaConcluida)),
    })
    render(<CycleSection />)
    // P4: a regiao viva e o MESMO elemento de antes do clique -- um `role`
    // novo que nasce ja com texto nao e anunciado por todo leitor de tela.
    const statusAntes = await screen.findByTestId('mission-completion-status')

    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    const statusDepois = await screen.findByTestId('mission-completion-status')
    expect(statusDepois).toBe(statusAntes)
    expect(within(statusDepois).getByTestId('mission-completion-text')).toHaveTextContent(
      'Missão concluída.',
    )
    expect(within(statusDepois).getByTestId('reward-xp')).toHaveTextContent('+40 XP')
    await waitFor(() => {
      expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 4 dias seguidos')
    })
    // O anuncio continua la: o refresh nao passou por "carregando".
    expect(screen.getByTestId('mission-completion-status')).toHaveTextContent('Missão concluída.')
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('avisa a página quando a missão de hoje é concluída', async () => {
    // Task 8: a PAGINA usa este aviso para atualizar o painel de progresso
    // (`refreshProgress`, em `Headquarters.tsx`) -- aqui so importa que o
    // callback e chamado, e que o refresh do PROPRIO ciclo continua
    // acontecendo do mesmo jeito (o segundo GET /api/cycle).
    const onMissionCompleted = vi.fn()
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(
          call === 1
            ? ciclo()
            : ciclo({ mission: diariaConcluida, streak: 4, days_to_milestone: 3 }),
        ),
      'POST /api/missions/31/complete': () => Response.json(comRecompensa(diariaConcluida)),
    })
    render(<CycleSection onMissionCompleted={onMissionCompleted} />)

    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    await waitFor(() => {
      expect(onMissionCompleted).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
    })
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
    // m3: o titulo da SECAO e h3, e o titulo do CARTAO dentro dela e h4
    // (`titleLevel={4}`, em CycleSection.tsx) -- por isso os dois cabem na
    // mesma secao sem colidir no mesmo nivel. Antes do conserto os dois eram
    // h3, e so o `name` desambiguava a consulta abaixo.
    expect(
      within(secao).getByRole('heading', {
        level: 3,
        name: 'Missão especial — bônus da sequência',
      }),
    ).toBeInTheDocument()
    expect(
      within(secao).getByRole('heading', { level: 4, name: especial.instructions }),
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

  it('I1: a janela que recebe foco durante a carga inicial, com o GET falhando, termina no erro com Tentar novamente -- nao fica presa em Consultando', async () => {
    // O cenario medido pela revisao final: o `focus` chega enquanto a carga
    // inicial esta em voo, o `refresh` dele falha, e a carga inicial so
    // assenta DEPOIS (e e descartada, por ser mais velha). Antes do conserto
    // a secao ficava em "Consultando o ciclo..." para sempre, sem botao.
    let resolverInicial: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1)
          return new Promise<Response>((resolve) => {
            resolverInicial = resolve
          })
        if (call === 2) return new Response(null, { status: 503 })
        return Response.json(ciclo())
      },
    })
    render(<CycleSection />)
    expect(screen.getByTestId('cycle-loading')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    const erro = await screen.findByTestId('cycle-error')
    expect(erro).toHaveTextContent('O servidor respondeu 503.')

    await act(async () => {
      resolverInicial(Response.json(ciclo()))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByTestId('cycle-error')).toBeInTheDocument()
    expect(screen.queryByTestId('cycle-loading')).not.toBeInTheDocument()

    fireEvent.click(within(erro).getByRole('button', { name: 'Tentar novamente' }))
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
      'POST /api/missions/31/complete': () => Response.json(comRecompensa(diariaConcluida)),
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

  it('m4: a linha da sequencia e uma regiao viva estavel (role="status") desde o primeiro render carregado', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    // O ATRIBUTO, e nao so `getByRole('status')`: o `<p>` nao tem role
    // implicita nenhuma, entao so o atributo prova que a regiao existe.
    expect(await screen.findByTestId('cycle-streak')).toHaveAttribute('role', 'status')
  })

  it('m5: o botao de recuperacao do cartao do ciclo diz "Atualizar a missão de hoje", nao "Atualizar o quadro"', async () => {
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo()),
      'POST /api/missions/31/complete': () =>
        Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
    })
    render(<CycleSection />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )

    expect(
      await screen.findByRole('button', { name: 'Atualizar a missão de hoje' }),
    ).toBeInTheDocument()
    // O rotulo padrao do MissionCard (do quadro de avulsas) nao pode aparecer
    // aqui: seria falar de um "quadro" que a secao do ciclo nao tem.
    expect(screen.queryByRole('button', { name: 'Atualizar o quadro' })).toBeNull()
  })

  it('m1: se o refresh depois da conclusao devolve OUTRA missao, o cartao troca para ela com Concluir', async () => {
    // O cenario da revisao: a diaria 31 e concluida perto da meia-noite, e a
    // resposta do refresh ja e a diaria 32 de amanha. Sem `key={mission.id}`
    // em CycleSection.tsx, o MESMO MissionCard continua montado, preso em
    // `completion.status === 'completed'` da missao 31 -- a tela mostraria a
    // diaria de ONTEM, ja concluida, no lugar da de hoje.
    const diaria32: Mission = {
      ...diaria,
      id: 32,
      day: '2026-09-24',
      deadline: '2026-09-25T00:00:00-03:00',
      instructions: 'Resolver 3 exercicios de grafos',
    }
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(
          call === 1 ? ciclo() : ciclo({ mission: diaria32, streak: 4, days_to_milestone: 3 }),
        ),
      'POST /api/missions/31/complete': () => Response.json(comRecompensa(diariaConcluida)),
    })
    render(<CycleSection />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )
    await screen.findByTestId('mission-completion-status')

    await waitFor(() => {
      expect(screen.getByTestId('mission-item')).toHaveAttribute('data-mission-id', '32')
    })
    const cartao = screen.getByTestId('mission-item')
    expect(within(cartao).getByTestId('mission-instructions')).toHaveTextContent(
      diaria32.instructions,
    )
    // A 32 e nova (`pendente`/`disponivel`): oferece Concluir, e nao "Missão
    // concluída." presa da 31.
    expect(within(cartao).getByTestId('mission-complete')).toBeInTheDocument()
  })

  it('m7: a especial CONCLUIDA dentro da janela mostra "Concluída" e nao oferece Concluir', async () => {
    const especialConcluida: Mission = {
      ...especial,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-24T10:00:00Z',
    }
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especialConcluida })),
    })
    render(<CycleSection />)

    const secao = await screen.findByTestId('cycle-special')
    expect(within(secao).getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(within(secao).queryByTestId('mission-complete')).toBeNull()
  })
})
