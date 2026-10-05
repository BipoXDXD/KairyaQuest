import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, StrictMode } from 'react'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import type { Mission } from '../../shared/types/mission'
import * as completionRegistryHook from './useCompletionRegistry'
import type { CompletionRegistry } from './useCompletionRegistry'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { CycleSection, type CycleSectionHandle } from './CycleSection'
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
  late_daily: null,
  ...ajustes,
})

/** F25: a diaria de ontem, iniciada as 23:50, ainda concluivel hoje. */
const diariaDeOntem: Mission = {
  ...diaria,
  id: 30,
  instructions: 'Revisar a lista de ontem',
  day: '2026-09-22',
  deadline: '2026-09-23T00:00:00-03:00',
  state: 'em_andamento',
  availability: 'disponivel',
  started_at: '2026-09-23T02:50:00Z',
}

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
    // O titulo do cartao da missao de hoje e h3 por padrao, como sempre foi.
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

    // Espera o TEXTO final, e nao o elemento: a regiao ja estava na tela antes
    // do clique, entao `findByTestId` a achava na hora e a assercao podia rodar
    // antes de a resposta chegar (intermitente sob carga; mesmo conserto do
    // MissionList.test.tsx).
    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const statusDepois = screen.getByTestId('mission-completion-status')
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
    // A PAGINA usa este aviso para atualizar o painel de progresso
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

  it('o bonus da avaliacao da diaria chega ao onMissionCompleted da pagina', async () => {
    const onMissionCompleted = vi.fn()
    const comEvidencia: Mission = {
      ...diariaConcluida,
      verification: 'com_evidencia',
      evidence: { text: 'Cinco exercicios feitos.', link: null },
    }
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ mission: comEvidencia })),
      'POST /api/missions/31/evaluation': () =>
        Response.json({
          evaluation: {
            state: 'concluida',
            verdict: 'atende',
            feedback: 'Cobre o criterio.',
            error_code: null,
            model: 'modelo-x',
            finished_at: '2026-09-23T16:00:00Z',
          },
          reward: { ...recompensaPadrao, xp_awarded: 20 },
        }),
    })
    render(<CycleSection onMissionCompleted={onMissionCompleted} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Pedir avaliação da Tifa' }))

    expect(await screen.findByTestId('reward-xp')).toHaveTextContent('+20 XP de bônus')
    expect(onMissionCompleted).toHaveBeenCalledTimes(1)
  })

  it('a diaria concluida autodeclarada mostra o selo no cartao', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ mission: diariaConcluida })) })
    render(<CycleSection />)
    expect(await screen.findByTestId('evaluation-verification')).toHaveTextContent('Autodeclarada')
  })

  it('sem diaria de ontem em conclusao tardia, nao mostra a secao dela', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    await screen.findByTestId('mission-item')
    expect(screen.queryByTestId('cycle-late-daily')).toBeNull()
  })

  it('a diaria de ontem iniciada a tempo aparece com Concluir e o limite (F25)', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ streak: 0, late_daily: diariaDeOntem })),
      'POST /api/missions/30/complete': () =>
        Response.json(
          comRecompensa({
            ...diariaDeOntem,
            state: 'concluida',
            availability: 'concluida',
            completed_at: '2026-09-23T03:10:00Z',
            actual_duration_minutes: 20,
          }),
        ),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-late-daily')
    expect(
      within(secao).getByRole('heading', {
        level: 3,
        name: 'Diária de ontem — iniciada a tempo',
      }),
    ).toBeInTheDocument()
    expect(within(secao).getByTestId('cycle-late-daily-reason')).toHaveTextContent(
      'Você começou esta diária no dia dela: ela ainda pode ser concluída até o fim de hoje, e conta para a sequência.',
    )
    expect(
      within(secao).getByRole('heading', { level: 4, name: diariaDeOntem.instructions }),
    ).toBeInTheDocument()
    // A missao de hoje continua no lugar dela, fora da secao.
    expect(within(secao).queryByText(diaria.instructions)).toBeNull()
    expect(screen.getAllByTestId('mission-item')).toHaveLength(2)

    fireEvent.click(within(secao).getByTestId('mission-complete'))
    await waitFor(() => {
      expect(requestsTo(fetchMock, 'POST /api/missions/30/complete')).toHaveLength(1)
    })
  })

  it('a diaria de ontem concluida com atraso troca o texto do prazo pelo de concluida', async () => {
    const concluidaComAtraso: Mission = {
      ...diariaDeOntem,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-23T03:10:00Z',
    }
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ late_daily: concluidaComAtraso })),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-late-daily')
    expect(within(secao).getByTestId('cycle-late-daily-reason')).toHaveTextContent(
      'Concluída com atraso — você começou no dia dela, e ela contou para a sequência.',
    )
    expect(secao).not.toHaveTextContent('ainda pode ser concluída')
  })

  it('a especial em conclusao tardia ganha o motivo a vista', async () => {
    const especialTardia: Mission = {
      ...especial,
      state: 'em_andamento',
      started_at: '2026-09-29T02:50:00Z',
      deadline: '2026-09-29T00:00:00-03:00',
    }
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ today: '2026-09-29', mission: null, special: especialTardia })),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-special')
    expect(within(secao).getByTestId('cycle-special-late-reason')).toHaveTextContent(
      'Você começou esta missão dentro da janela: ela ainda pode ser concluída até o fim de hoje.',
    )
    expect(within(secao).getByTestId('mission-complete')).toBeInTheDocument()
  })

  it('a especial concluida com atraso diz que foi concluida, sem oferecer prazo', async () => {
    const especialConcluidaTarde: Mission = {
      ...especial,
      state: 'concluida',
      availability: 'concluida',
      started_at: '2026-09-29T02:50:00Z',
      completed_at: '2026-09-29T13:00:00Z',
      deadline: '2026-09-29T00:00:00-03:00',
    }
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(
          ciclo({ today: '2026-09-29', mission: null, special: especialConcluidaTarde }),
        ),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-special')
    expect(within(secao).getByTestId('cycle-special-late-reason')).toHaveTextContent(
      'Concluída depois do fim da janela — você começou a tempo.',
    )
  })

  it('a especial dentro da janela nao mostra motivo de atraso', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })),
    })
    render(<CycleSection />)
    await screen.findByTestId('cycle-special')
    expect(screen.queryByTestId('cycle-special-late-reason')).toBeNull()
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
    // O titulo da SECAO e h3, e o titulo do CARTAO dentro dela e h4
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

  it('a diaria e a especial tem rascunhos independentes, e concluir a diaria nao mexe no da especial', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })),
      'POST /api/missions/31/complete': () => Response.json(comRecompensa(diariaConcluida)),
    })
    render(<CycleSection />)
    const secaoEspecial = await screen.findByTestId('cycle-special')
    const cartaoDiaria = screen
      .getAllByTestId('mission-item')
      .find((el) => el.getAttribute('data-mission-id') === '31') as HTMLElement
    const preencher = (cartao: HTMLElement, texto: string) => {
      fireEvent.click(within(cartao).getByRole('button', { name: /Entregar com evidência/ }))
      fireEvent.change(within(cartao).getByLabelText('O que você fez'), {
        target: { value: texto },
      })
    }

    preencher(cartaoDiaria, 'Feito da diaria')
    preencher(secaoEspecial, 'Feito da especial')

    expect(within(cartaoDiaria).getByLabelText('O que você fez')).toHaveValue('Feito da diaria')
    expect(within(secaoEspecial).getByLabelText('O que você fez')).toHaveValue('Feito da especial')

    fireEvent.click(within(cartaoDiaria).getByTestId('mission-complete'))
    await within(cartaoDiaria).findByText('Missão concluída.')

    expect(within(secaoEspecial).getByLabelText('O que você fez')).toHaveValue('Feito da especial')
    const [corpo] = requestsTo(fetchMock, 'POST /api/missions/31/complete').map(
      (init) => JSON.parse(String(init.body)) as unknown,
    )
    expect(corpo).toMatchObject({ evidence: { text: 'Feito da diaria' } })
    expect(requestsTo(fetchMock, 'POST /api/missions/38/complete')).toHaveLength(0)
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

  it('a janela que recebe foco durante a carga inicial, com o GET falhando, termina no erro com Tentar novamente -- nao fica presa em Consultando', async () => {
    // O cenario: o `focus` chega enquanto a carga
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

  it('a linha da sequencia e uma regiao viva estavel (role="status") desde o primeiro render carregado', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    // O ATRIBUTO, e nao so `getByRole('status')`: o `<p>` nao tem role
    // implicita nenhuma, entao so o atributo prova que a regiao existe.
    expect(await screen.findByTestId('cycle-streak')).toHaveAttribute('role', 'status')
  })

  it('o botao de recuperacao do cartao do ciclo diz "Atualizar a missão de hoje", nao "Atualizar o quadro"', async () => {
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
      await screen.findByRole('button', {
        name: `Atualizar a missão de hoje a missão: ${diaria.instructions}`,
      }),
    ).toBeInTheDocument()
    // O rotulo padrao do MissionCard (do quadro de avulsas) nao pode aparecer
    // aqui: seria falar de um "quadro" que a secao do ciclo nao tem.
    expect(screen.queryByRole('button', { name: /^Atualizar o quadro/ })).toBeNull()
  })

  it('o botao de recuperacao da diaria de ontem diz "Atualizar a diária de ontem", nao o da missao de hoje', async () => {
    routeFetch({
      'GET /api/cycle': () => Response.json(ciclo({ streak: 0, late_daily: diariaDeOntem })),
      'POST /api/missions/30/complete': () =>
        Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-late-daily')
    fireEvent.click(within(secao).getByTestId('mission-complete'))

    expect(
      await within(secao).findByRole('button', {
        name: `Atualizar a diária de ontem a missão: ${diariaDeOntem.instructions}`,
      }),
    ).toBeInTheDocument()
    // O rotulo da missao de hoje, num cartao que nao e a de hoje, mentiria.
    expect(screen.queryByRole('button', { name: /^Atualizar a missão de hoje/ })).toBeNull()
  })

  it('o botao de recuperacao da especial diz "Atualizar a missão especial", nao o da missao de hoje', async () => {
    routeFetch({
      'GET /api/cycle': () =>
        Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })),
      'POST /api/missions/38/complete': () =>
        Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
    })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-special')
    fireEvent.click(within(secao).getByTestId('mission-complete'))

    expect(
      await within(secao).findByRole('button', {
        name: `Atualizar a missão especial a missão: ${especial.instructions}`,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Atualizar a missão de hoje/ })).toBeNull()
  })

  it('se o refresh depois da conclusao devolve OUTRA missao, o cartao troca para ela com Concluir', async () => {
    // O cenario: a diaria 31 e concluida perto da meia-noite, e a
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

  it('a especial CONCLUIDA dentro da janela mostra "Concluída" e nao oferece Concluir', async () => {
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

  describe('incremento F: o prazo da diaria e da especial vem do ciclo (F7)', () => {
    it('a diaria e a especial NAO oferecem "Reagendar prazo" nem historico', async () => {
      routeFetch({
        'GET /api/cycle': () =>
          Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })),
      })
      render(<CycleSection />)
      await screen.findByTestId('cycle-special')
      const cartoes = screen.getAllByTestId('mission-item')
      expect(cartoes).toHaveLength(2)
      for (const cartao of cartoes) {
        expect(within(cartao).queryByTestId('reschedule-toggle')).toBeNull()
        expect(within(cartao).queryByRole('button', { name: 'Reagendar prazo' })).toBeNull()
        expect(within(cartao).queryByTestId('mission-reschedule-status')).toBeNull()
      }
    })

    it('a diaria disponivel oferece Iniciar, e o inicio mostra "Em andamento" no cartao do ciclo', async () => {
      const iniciada: Mission = {
        ...diaria,
        state: 'em_andamento',
        started_at: '2026-09-23T15:00:00Z',
      }
      routeFetch({
        'GET /api/cycle': () => Response.json(ciclo()),
        'POST /api/missions/31/start': () => Response.json(iniciada),
      })
      render(<CycleSection />)
      const cartao = await screen.findByTestId('mission-item')

      fireEvent.click(within(cartao).getByTestId('mission-start'))

      expect(await within(cartao).findByText('Missão iniciada.')).toBeInTheDocument()
      expect(within(cartao).getByTestId('mission-state')).toHaveTextContent('Em andamento')
    })

    it('a falha "refresh" do Iniciar oferece "Atualizar a missão de hoje", que recarrega o ciclo', async () => {
      const fetchMock = routeFetch({
        'GET /api/cycle': () => Response.json(ciclo()),
        'POST /api/missions/31/start': () =>
          Response.json({ detail: 'x', code: 'missao_expirada' }, { status: 409 }),
      })
      render(<CycleSection />)
      const cartao = await screen.findByTestId('mission-item')
      fireEvent.click(within(cartao).getByTestId('mission-start'))

      const atualizar = await within(cartao).findByTestId('mission-start-reload')
      expect(atualizar).toHaveTextContent('Atualizar a missão de hoje')
      expect(atualizar).toHaveAccessibleName(
        `Atualizar a missão de hoje a missão: ${diaria.instructions}`,
      )
      fireEvent.click(atualizar)

      await waitFor(() => {
        expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
      })
    })
  })

  it('o handle atualiza o ciclo em silêncio e permanece estável sem remontar', async () => {
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      finish = resolve
    })
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) => (call === 1 ? Response.json(ciclo()) : pending),
    })
    const ref = createRef<CycleSectionHandle>()
    const { rerender } = render(<CycleSection ref={ref} />)
    await screen.findByTestId('cycle-today')
    const initialHandle = ref.current
    const card = screen.getByTestId('mission-item')
    expect(initialHandle).not.toBeNull()
    act(() => {
      ref.current!.refresh()
    })
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
    expect(screen.getByTestId('mission-item')).toBe(card)
    expect(screen.queryByTestId('cycle-loading')).toBeNull()
    await act(async () => {
      finish(Response.json(ciclo({ today: '2026-09-24', streak: 4, days_to_milestone: 3 })))
    })
    expect(screen.getByTestId('cycle-today')).toHaveTextContent('24/09')
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('4 dias seguidos')
    rerender(<CycleSection ref={ref} />)
    expect(ref.current).toBe(initialHandle)
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })
})

const proximaDiaria: Mission = {
  ...diaria,
  id: 32,
  day: '2026-09-24',
  deadline: '2026-09-25T00:00:00-03:00',
  instructions: 'Resolver 3 exercicios de grafos',
}

function respostaPendente() {
  let release!: (response: Response) => void
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

// Mantém hook/cartão/registro reais. Só a fronteira HTTP é controlada.
async function montarFoco({
  strict = false,
  special = null,
}: { strict?: boolean; special?: Mission | null } = {}) {
  const pending = respostaPendente()
  let refreshing = false
  const fetchMock = routeFetch({
    'GET /api/cycle': () => (refreshing ? pending.promise : Response.json(ciclo({ special }))),
  })
  const ref = createRef<CycleSectionHandle>()
  const content = (
    <>
      <button>Controle externo</button>
      <CycleSection ref={ref} />
    </>
  )
  const view = render(strict ? <StrictMode>{content}</StrictMode> : content)
  const button = await screen.findByRole('button', {
    name: `Concluir a missão: ${diaria.instructions}`,
  })
  const heading = screen.getByRole('heading', { level: 2, name: 'Missão de hoje — sua diária' })
  return {
    ...view,
    button,
    heading,
    pending,
    fetchMock,
    refresh: () => {
      refreshing = true
      act(() => ref.current!.refresh())
    },
  }
}

describe('foco da diária durante refresh silencioso', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    { strict: false, mission: proximaDiaria, label: 'outra ID' },
    { strict: false, mission: null, label: 'sem plano' },
    { strict: true, mission: proximaDiaria, label: 'outra ID em StrictMode' },
    { strict: true, mission: null, label: 'sem plano em StrictMode' },
  ])('leva foco perdido da diária ao título: $label', async ({ strict, mission }) => {
    const { button, heading, refresh, pending } = await montarFoco({ strict })
    button.focus()
    expect(button).toHaveFocus()
    refresh()
    // Não muda para loading nem move foco enquanto a resposta está pendente.
    expect(button).toHaveFocus()
    expect(screen.queryByTestId('cycle-loading')).toBeNull()
    await act(async () => pending.release(Response.json(ciclo({ today: '2026-09-24', mission }))))
    expect(screen.getByTestId('cycle-today')).toHaveTextContent('24/09')
    expect(button).not.toBeInTheDocument()
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    if (mission === null) {
      expect(screen.getByTestId('cycle-no-plan')).toBeInTheDocument()
    } else {
      expect(screen.getByTestId('mission-item')).toHaveAttribute('data-mission-id', '32')
      expect(
        screen.getByRole('button', { name: `Concluir a missão: ${proximaDiaria.instructions}` }),
      ).toBeEnabled()
    }
  })

  it('captura foco adquirido durante o GET, antes da remoção, não só ao pedir refresh', async () => {
    const { button, heading, refresh, pending } = await montarFoco()
    screen.getByRole('button', { name: 'Controle externo' }).focus()
    refresh()
    button.focus()
    await act(async () => pending.release(Response.json(ciclo({ mission: proximaDiaria }))))
    expect(heading).toHaveFocus()
  })

  it('não rouba foco que saiu da diária antes da resposta', async () => {
    const { button, refresh, pending } = await montarFoco()
    button.focus()
    refresh()
    const external = screen.getByRole('button', { name: 'Controle externo' })
    external.focus()
    await act(async () => pending.release(Response.json(ciclo({ mission: proximaDiaria }))))
    expect(screen.getByTestId('mission-item')).toHaveAttribute('data-mission-id', '32')
    expect(external).toHaveFocus()
  })

  it('não toma foco atribuído a outro controle entre a remoção e o layout', async () => {
    const { button, heading, refresh, pending } = await montarFoco()
    const external = screen.getByRole('button', { name: 'Controle externo' })
    button.focus()
    refresh()
    const removeChild = Node.prototype.removeChild
    // Encaminha a remoção nativa e simula um foco concorrente no mesmo commit,
    // depois da captura e antes do efeito de layout da seção.
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(
      this: Node,
      child: T,
    ): T {
      const removed = removeChild.call(this, child) as T
      if (child.contains(button)) external.focus()
      return removed
    })
    await act(async () => pending.release(Response.json(ciclo({ mission: proximaDiaria }))))
    expect(screen.getByTestId('mission-item')).toHaveAttribute('data-mission-id', '32')
    expect(external).toHaveFocus()
    expect(heading).not.toHaveFocus()
  })

  it('mesma ID conserva o controle e o foco, mesmo com novos dados', async () => {
    const { button, refresh, pending } = await montarFoco()
    button.focus()
    refresh()
    await act(async () =>
      pending.release(
        Response.json(
          ciclo({
            today: '2026-09-24',
            streak: 4,
            mission: { ...diaria, instructions: 'Enunciado atualizado' },
          }),
        ),
      ),
    )
    expect(screen.getByTestId('mission-complete')).toBe(button)
    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleName('Concluir a missão: Enunciado atualizado')
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('4 dias seguidos')
  })

  it('falha conserva cartão e foco, com o aviso de dado antigo', async () => {
    const { button, refresh, pending } = await montarFoco()
    button.focus()
    refresh()
    await act(async () => pending.release(new Response(null, { status: 503 })))
    expect(screen.getByTestId('mission-complete')).toBe(button)
    expect(button).toHaveFocus()
    expect(screen.getByTestId('cycle-stale')).toHaveTextContent(
      'Não foi possível atualizar a sequência.',
    )
  })

  it('carga inicial não toma foco externo', async () => {
    const pending = respostaPendente()
    routeFetch({ 'GET /api/cycle': () => pending.promise })
    render(
      <>
        <button>Controle externo</button>
        <CycleSection />
      </>,
    )
    const external = screen.getByRole('button', { name: 'Controle externo' })
    external.focus()
    await act(async () => pending.release(Response.json(ciclo())))
    expect(screen.getByTestId('mission-item')).toBeInTheDocument()
    expect(external).toHaveFocus()
  })

  it.each(['hidden', 'inert'] as const)(
    'não transfere para seção sob ancestral %s, nem deixa transferência atrasada',
    async (attribute) => {
      const { button, heading, refresh, pending, rerender } = await montarFoco()
      button.focus()
      refresh()
      const section = screen.getByTestId('cycle')
      section.setAttribute(attribute, '')
      await act(async () => pending.release(Response.json(ciclo({ mission: proximaDiaria }))))
      expect(heading).not.toHaveFocus()
      expect(document.body).toHaveFocus()
      section.removeAttribute(attribute)
      rerender(
        <>
          <button>Controle externo</button>
          <CycleSection />
        </>,
      )
      expect(document.body).toHaveFocus()
      expect(heading).not.toHaveFocus()
    },
  )

  it('desmontagem não tenta conservar foco em título removido', async () => {
    const { button, heading, unmount } = await montarFoco()
    button.focus()
    unmount()
    expect(heading).not.toBeInTheDocument()
    expect(document.body).toHaveFocus()
  })

  it('troca da diária não interfere no foco da especial preservada', async () => {
    const { refresh, pending } = await montarFoco({ special: especial })
    const specialButton = within(screen.getByTestId('cycle-special')).getByTestId(
      'mission-complete',
    )
    specialButton.focus()
    refresh()
    await act(async () =>
      pending.release(Response.json(ciclo({ mission: proximaDiaria, special: especial }))),
    )
    expect(screen.getAllByTestId('mission-item')[0]).toHaveAttribute('data-mission-id', '32')
    expect(within(screen.getByTestId('cycle-special')).getByTestId('mission-complete')).toBe(
      specialButton,
    )
    expect(specialButton).toHaveFocus()
  })
})

describe('ciclo reconcilia chaves pelo GET autoritativo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { mission: diaria, strict: false },
    { mission: especial, strict: false },
    { mission: diaria, strict: true },
    { mission: especial, strict: true },
  ])(
    'POST desconhecido e GET terminal soltam chave da $mission.mission_type (StrictMode=$strict)',
    async ({ mission, strict }) => {
      const k1 = '00000000-0000-4000-8000-000000000001'
      const k2 = '00000000-0000-4000-8000-000000000002'
      vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(k1).mockReturnValueOnce(k2)
      let registry!: CompletionRegistry
      const original = completionRegistryHook.useCompletionRegistry
      vi.spyOn(completionRegistryHook, 'useCompletionRegistry').mockImplementation((reload) => {
        const result = original(reload)
        registry = result.registry
        return result
      })
      let terminal = false
      const read = () => {
        const value = terminal
          ? {
              ...mission,
              state: 'concluida' as const,
              availability: 'concluida' as const,
              completed_at: '2026-09-23T15:00:00Z',
            }
          : mission
        return ciclo(
          mission.mission_type === 'diaria'
            ? { mission: value }
            : { mission: null, special: value },
        )
      }
      const route = `POST /api/missions/${String(mission.id)}/complete`
      const fetchMock = routeFetch({
        'GET /api/cycle': () => Response.json(read()),
        [route]: () => Promise.reject(new TypeError('resposta perdida')),
      })
      const ref = createRef<CycleSectionHandle>()
      const content = <CycleSection ref={ref} />
      render(strict ? <StrictMode>{content}</StrictMode> : content)
      fireEvent.click(await screen.findByTestId('mission-complete'))
      await screen.findByTestId('mission-completion-error')
      expect(JSON.parse(requestsTo(fetchMock, route)[0].body as string)).toEqual({
        operation_id: k1,
      })
      terminal = true
      // A leitura terminal tambem precisa assentar o efeito que libera a chave.
      await act(async () => ref.current!.refresh())
      await waitFor(() =>
        expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída'),
      )
      expect(screen.queryByTestId('mission-complete')).toBeNull()
      expect(screen.queryByTestId('reward-announcement')).toBeNull()
      expect(requestsTo(fetchMock, route)).toHaveLength(1)
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
      expect(registry.operationIdFor(mission.id)).toBe(k2)
    },
  )
})

// Observacao de API publica: o hook e seu estado continuam reais.
function observeRegistry() {
  let registry!: CompletionRegistry
  const original = completionRegistryHook.useCompletionRegistry
  vi.spyOn(completionRegistryHook, 'useCompletionRegistry').mockImplementation((reload) => {
    const result = original(reload)
    registry = result.registry
    return result
  })
  return () => registry
}

describe('ciclo conserva chaves sem prova terminal atual', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['pendente', 'em_andamento', 'sem plano', 'outra ID', 'refreshFailed'])(
    '%s conserva a chave, inclusive no retry apos refresh',
    async (scene) => {
      const key = '00000000-0000-4000-8000-000000000001'
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(key)
      const registry = observeRegistry()
      const fetchMock = routeFetch({
        'GET /api/cycle': (_init, call) => {
          if (call !== 2) return Response.json(ciclo())
          if (scene === 'refreshFailed') return Response.json({}, { status: 503 })
          return Response.json(
            ciclo({
              mission:
                scene === 'sem plano'
                  ? null
                  : scene === 'outra ID'
                    ? proximaDiaria
                    : { ...diaria, state: scene as 'pendente' | 'em_andamento' },
            }),
          )
        },
        'POST /api/missions/31/complete': () => Promise.reject(new TypeError('resposta perdida')),
      })
      const ref = createRef<CycleSectionHandle>()
      render(<CycleSection ref={ref} />)
      fireEvent.click(await screen.findByTestId('mission-complete'))
      await screen.findByTestId('mission-completion-error')
      await act(async () => ref.current!.refresh())
      if (scene === 'refreshFailed') expect(screen.getByTestId('cycle-stale')).toBeInTheDocument()
      expect(registry().operationIdFor(31)).toBe(key)
      await act(async () => ref.current!.refresh())
      fireEvent.click(screen.getByTestId('mission-complete'))
      await screen.findByTestId('mission-completion-error')
      expect(
        requestsTo(fetchMock, 'POST /api/missions/31/complete').map((init) =>
          JSON.parse(init.body as string),
        ),
      ).toEqual([{ operation_id: key }, { operation_id: key }])
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    },
  )

  it('terminal antiga mantida em refreshFailed nao prova conclusao de chave posterior', async () => {
    const k1 = '00000000-0000-4000-8000-000000000001'
    const k2 = '00000000-0000-4000-8000-000000000002'
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(k1).mockReturnValueOnce(k2)
    const registry = observeRegistry()
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1
          ? Response.json(ciclo({ mission: diariaConcluida }))
          : Response.json({}, { status: 503 }),
    })
    const ref = createRef<CycleSectionHandle>()
    // A chave posterior nasce so depois do efeito da leitura inicial assentar.
    await act(async () => {
      render(<CycleSection ref={ref} />)
    })
    expect(screen.getByTestId('cycle-today')).toBeInTheDocument()
    // Controle da fronteira publica: nao inicia POST para uma missao terminal.
    expect(registry().operationIdFor(31)).toBe(k1)
    act(() => ref.current!.refresh())
    await screen.findByTestId('cycle-stale')
    expect(registry().operationIdFor(31)).toBe(k1)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('GET terminal obsoleto nao poda a chave da diaria ainda pendente', async () => {
    const key = '00000000-0000-4000-8000-000000000001'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(key)
    const registry = observeRegistry()
    let finish!: (response: Response) => void
    const old = new Promise<Response>((resolve) => {
      finish = resolve
    })
    routeFetch({
      'GET /api/cycle': (_init, call) => (call === 2 ? old : Response.json(ciclo())),
      'POST /api/missions/31/complete': () => Promise.reject(new TypeError('resposta perdida')),
    })
    const ref = createRef<CycleSectionHandle>()
    render(<CycleSection ref={ref} />)
    fireEvent.click(await screen.findByTestId('mission-complete'))
    await screen.findByTestId('mission-completion-error')
    act(() => ref.current!.refresh())
    await act(async () => ref.current!.refresh())
    await act(async () => finish(Response.json(ciclo({ mission: diariaConcluida }))))
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Pendente')
    expect(registry().operationIdFor(31)).toBe(key)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('GET terminal durante POST conserva a chave ate terminar, sem reward inventado', async () => {
    const k1 = '00000000-0000-4000-8000-000000000001'
    const k2 = '00000000-0000-4000-8000-000000000002'
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(k1).mockReturnValueOnce(k2)
    const registry = observeRegistry()
    let fail!: (reason: Error) => void
    const post = new Promise<Response>((_resolve, reject) => {
      fail = reject
    })
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(ciclo({ mission: call === 1 ? diaria : diariaConcluida })),
      'POST /api/missions/31/complete': () => post,
    })
    const ref = createRef<CycleSectionHandle>()
    render(<CycleSection ref={ref} />)
    fireEvent.click(await screen.findByTestId('mission-complete'))
    await act(async () => ref.current!.refresh())
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(registry().operationIdFor(31)).toBe(k1)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    await act(async () => fail(new TypeError('resposta perdida')))
    expect(screen.queryByTestId('reward-announcement')).toBeNull()
    expect(requestsTo(fetchMock, 'POST /api/missions/31/complete')).toHaveLength(1)
    expect(registry().operationIdFor(31)).toBe(k2)
  })
})

describe('limites da reconciliacao no ciclo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('especial ausente conserva a chave e seu reenvio real', async () => {
    const key = '00000000-0000-4000-8000-000000000001'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(key)
    const registry = observeRegistry()
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(ciclo({ special: call === 2 ? null : especial })),
      'POST /api/missions/38/complete': () => Promise.reject(new TypeError('resposta perdida')),
    })
    const ref = createRef<CycleSectionHandle>()
    render(<CycleSection ref={ref} />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${especial.instructions}` }),
    )
    await screen.findByTestId('mission-completion-error')
    await act(async () => ref.current!.refresh())
    expect(screen.queryByTestId('cycle-special')).toBeNull()
    expect(registry().operationIdFor(38)).toBe(key)
    await act(async () => ref.current!.refresh())
    fireEvent.click(
      screen.getByRole('button', { name: `Tentar de novo a missão: ${especial.instructions}` }),
    )
    await screen.findByTestId('mission-completion-error')
    expect(
      requestsTo(fetchMock, 'POST /api/missions/38/complete').map((init) =>
        JSON.parse(init.body as string),
      ),
    ).toEqual([{ operation_id: key }, { operation_id: key }])
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('reload em loading e erro conserva a chave ate retry no cartao remontado', async () => {
    const key = '00000000-0000-4000-8000-000000000001'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(key)
    const registry = observeRegistry()
    let finish!: (response: Response) => void
    const loading = new Promise<Response>((resolve) => {
      finish = resolve
    })
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 2
          ? Response.json({}, { status: 503 })
          : call === 3
            ? loading
            : Response.json(ciclo()),
      'POST /api/missions/31/complete': () => Promise.reject(new TypeError('resposta perdida')),
    })
    const ref = createRef<CycleSectionHandle>()
    render(<CycleSection ref={ref} />)
    fireEvent.click(await screen.findByTestId('mission-complete'))
    await screen.findByTestId('mission-completion-error')
    act(() => ref.current!.refresh())
    await screen.findByTestId('cycle-stale')
    fireEvent.click(screen.getByTestId('cycle-refresh'))
    expect(screen.getByTestId('cycle-loading')).toBeInTheDocument()
    expect(registry().operationIdFor(31)).toBe(key)
    await act(async () => finish(Response.json({}, { status: 503 })))
    expect(screen.getByTestId('cycle-error')).toBeInTheDocument()
    expect(registry().operationIdFor(31)).toBe(key)
    fireEvent.click(screen.getByTestId('cycle-retry'))
    fireEvent.click(await screen.findByTestId('mission-complete'))
    await screen.findByTestId('mission-completion-error')
    expect(
      requestsTo(fetchMock, 'POST /api/missions/31/complete').map((init) =>
        JSON.parse(init.body as string),
      ),
    ).toEqual([{ operation_id: key }, { operation_id: key }])
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('duas conclusoes reais em voo adiam ambas candidatas ate o ultimo POST terminar', async () => {
    const keys = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ] as const
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(keys[0])
      .mockReturnValueOnce(keys[1])
      .mockReturnValueOnce(keys[2])
      .mockReturnValueOnce(keys[3])
    const registry = observeRegistry()
    let failDaily!: (reason: Error) => void
    let failSpecial!: (reason: Error) => void
    const dailyPost = new Promise<Response>((_resolve, reject) => {
      failDaily = reject
    })
    const specialPost = new Promise<Response>((_resolve, reject) => {
      failSpecial = reject
    })
    const terminalSpecial: Mission = {
      ...especial,
      state: 'concluida',
      availability: 'concluida',
      completed_at: '2026-09-23T15:00:00Z',
    }
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(
          ciclo({
            mission: call === 1 ? diaria : diariaConcluida,
            special: call === 1 ? especial : terminalSpecial,
          }),
        ),
      'POST /api/missions/31/complete': () => dailyPost,
      'POST /api/missions/38/complete': () => specialPost,
    })
    const ref = createRef<CycleSectionHandle>()
    render(<CycleSection ref={ref} />)
    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: `Concluir a missão: ${especial.instructions}` }),
    )
    await act(async () => ref.current!.refresh())
    expect(registry().operationIdFor(31)).toBe(keys[0])
    expect(registry().operationIdFor(38)).toBe(keys[1])
    await act(async () => failDaily(new TypeError('resposta diaria perdida')))
    expect(registry().operationIdFor(31)).toBe(keys[0])
    expect(registry().operationIdFor(38)).toBe(keys[1])
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
    await act(async () => failSpecial(new TypeError('resposta especial perdida')))
    expect(
      requestsTo(fetchMock, 'POST /api/missions/31/complete').map((init) =>
        JSON.parse(init.body as string),
      ),
    ).toEqual([{ operation_id: keys[0] }])
    expect(
      requestsTo(fetchMock, 'POST /api/missions/38/complete').map((init) =>
        JSON.parse(init.body as string),
      ),
    ).toEqual([{ operation_id: keys[1] }])
    expect(screen.queryByTestId('reward-announcement')).toBeNull()
    expect(registry().operationIdFor(31)).toBe(keys[2])
    expect(registry().operationIdFor(38)).toBe(keys[3])
  })
})

it('a leitura terminal da diária tardia libera sua chave, sem inventar recompensa', async () => {
  const k1 = '00000000-0000-4000-8000-000000000001'
  const k2 = '00000000-0000-4000-8000-000000000002'
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(k1).mockReturnValueOnce(k2)
  const registry = observeRegistry()
  const late: Mission = {
    ...diaria,
    id: 30,
    day: '2026-09-22',
    state: 'em_andamento',
    started_at: '2026-09-22T12:00:00Z',
  }
  routeFetch({
    'GET /api/cycle': (_init, call) =>
      Response.json(
        ciclo({
          late_daily:
            call === 1
              ? late
              : { ...late, state: 'concluida', completed_at: '2026-09-23T12:00:00Z' },
        }),
      ),
    'POST /api/missions/30/complete': () => Promise.reject(new TypeError('resposta perdida')),
  })
  const ref = createRef<CycleSectionHandle>()
  render(<CycleSection ref={ref} />)
  const card = within(await screen.findByTestId('cycle-late-daily'))
  fireEvent.click(card.getByTestId('mission-complete'))
  await card.findByTestId('mission-completion-error')
  expect(registry().operationIdFor(30)).toBe(k1)
  await act(async () => ref.current!.refresh())
  expect(card.getByTestId('mission-state')).toHaveTextContent('Concluída')
  expect(screen.queryByTestId('reward-announcement')).toBeNull()
  expect(registry().operationIdFor(30)).toBe(k2)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
