import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { HTTP_FAILURE_TEXT, renderWithI18n } from '../../test/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../shared/types/mission'
import { routeFetch } from '../../test/fetchRoutes'
import { CampaignTrail } from './CampaignTrail'
import type { Plan, PlanDay, PlanSpecial } from './types'

/** Uma diaria revelada, com o dia e a disponibilidade pedidos. */
function diaria(id: number, day: string, ajustes: Partial<Mission> = {}): Mission {
  return {
    id,
    instructions: `Missao do dia ${day}`,
    completion_criterion: `Criterio do dia ${day}`,
    difficulty: 2,
    estimated_minutes: 45,
    mission_type: 'diaria',
    day,
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
    ...ajustes,
  }
}

const revelado = (mission: Mission): PlanDay => ({
  day: mission.day as string,
  availability: mission.availability,
  mission,
})
const bau = (day: string): PlanDay => ({ day, availability: 'bloqueada', mission: null })

/**
 * A semana de 21/09 (segunda) a 27/09 (domingo), vista na QUINTA, 24/09: o
 * plano foi criado na terca (a segunda e `fora_do_plano`), a terca foi
 * perdida, a quarta concluida, a quinta e hoje, e sexta a domingo sao bau.
 */
const semana: PlanDay[] = [
  revelado(diaria(1, '2026-09-21', { availability: 'fora_do_plano' })),
  revelado(diaria(2, '2026-09-22', { availability: 'perdida' })),
  revelado(
    diaria(3, '2026-09-23', {
      availability: 'concluida',
      state: 'concluida',
      difficulty: 3,
      estimated_minutes: 30,
      xp: 90,
    }),
  ),
  revelado(diaria(4, '2026-09-24', { availability: 'disponivel' })),
  bau('2026-09-25'),
  bau('2026-09-26'),
  bau('2026-09-27'),
]

const especialBloqueada: PlanSpecial = { availability: 'bloqueada', progress: 3, mission: null }

const especial = (ajustes: Partial<Mission>): PlanSpecial => ({
  availability: ajustes.availability ?? 'disponivel',
  progress: 0,
  mission: diaria(9, '2026-09-24', {
    mission_type: 'especial',
    day: null,
    difficulty: 5,
    xp: 660,
    instructions: 'Prova simulada da semana',
    completion_criterion: 'Prova corrigida',
    ...ajustes,
  }),
})

const plano = (special: PlanSpecial = especialBloqueada): Plan => ({
  week_start: '2026-09-21',
  days: semana,
  special,
})

function servir(plan: Plan | null) {
  return routeFetch({ 'GET /api/plans/current': () => Response.json({ plan }) })
}

/** O item da trilha de um dia civil. */
async function diaDaTrilha(day: string): Promise<HTMLElement> {
  const itens = await screen.findAllByTestId('trail-day')
  const item = itens.find((li) => li.dataset.day === day)
  if (item === undefined) {
    throw new Error(`sem item para ${day}`)
  }
  return item
}

/** Troca `document.visibilityState`, como o navegador faz ao trocar de aba. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('CampaignTrail', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
  })

  it('anuncia o carregamento numa regiao viva', () => {
    routeFetch({ 'GET /api/plans/current': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<CampaignTrail />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Trilha da semana')
    expect(screen.getByRole('status')).toHaveTextContent('Consultando a trilha…')
  })

  it('em ingles, o erro de carga sai do catalogo', async () => {
    routeFetch({ 'GET /api/plans/current': () => new Response(null, { status: 503 }) })
    renderWithI18n(<CampaignTrail />, { locale: 'en' })

    expect(await screen.findByTestId('trail-error')).toHaveTextContent(HTTP_FAILURE_TEXT.en)
  })

  it('no erro, avisa com a mensagem e o Tentar novamente busca de novo', async () => {
    const fetchMock = routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json({ plan: plano() }),
    })
    renderWithI18n(<CampaignTrail />)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Falha ao carregar a trilha.')
    expect(alerta).toHaveTextContent(HTTP_FAILURE_TEXT['pt-BR'])

    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a aba que volta durante a carga inicial, com o GET falhando, termina no erro com Tentar novamente -- nao fica presa em Consultando', async () => {
    let resolverInicial: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1)
          return new Promise<Response>((resolve) => {
            resolverInicial = resolve
          })
        if (call === 2) return new Response(null, { status: 503 })
        return Response.json({ plan: plano() })
      },
    })
    renderWithI18n(<CampaignTrail />)
    expect(screen.getByTestId('trail-loading')).toBeInTheDocument()

    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const alerta = await screen.findByTestId('trail-error')
    expect(alerta).toHaveTextContent(HTTP_FAILURE_TEXT['pt-BR'])

    // A carga inicial assenta DEPOIS, e e descartada por ser mais velha: o
    // erro continua, com a saida pelo botao.
    await act(async () => {
      resolverInicial(Response.json({ plan: plano() }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByTestId('trail-error')).toBeInTheDocument()
    expect(screen.queryByTestId('trail-loading')).not.toBeInTheDocument()

    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
  })

  it('sem plano na semana e um estado proprio, sem trilha, e diz que a sequencia nao quebra', async () => {
    servir(null)
    renderWithI18n(<CampaignTrail />)
    const semPlano = await screen.findByTestId('trail-no-plan')
    expect(semPlano).toHaveTextContent('Sem plano nesta semana.')
    // Mesma garantia do Quartel-General (`CycleSection`, "sem plano"): um dia
    // sem plano nao quebra a sequencia -- a trilha nao pode parecer uma falha.
    expect(semPlano).toHaveTextContent('Um dia sem plano não quebra a sequência')
    expect(screen.queryByTestId('trail-day')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mostra os sete dias da semana atual, em ordem, com a data civil sem conversao de fuso', async () => {
    const fetchMock = servir(plano())
    renderWithI18n(<CampaignTrail />)

    const lista = await screen.findByRole('list', { name: 'Dias da semana' })
    const itens = within(lista).getAllByTestId('trail-day')
    // O processo de teste roda em Asia/Tokyo (vite.config.ts): um
    // `new Date('2026-09-21')` formatado no fuso local ainda daria segunda,
    // mas em Sao Paulo daria domingo -- quem guarda a regra e
    // `shared/lib/civilDate`, e aqui confere-se que a trilha a usa.
    expect(itens.map((li) => within(li).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'segunda-feira, 21/09',
      'terça-feira, 22/09',
      'quarta-feira, 23/09',
      'quinta-feira, 24/09 Hoje',
      'sexta-feira, 25/09',
      'sábado, 26/09',
      'domingo, 27/09',
    ])
    expect(screen.getByTestId('trail-week')).toHaveTextContent('Semana de segunda-feira, 21/09.')
    // Exatamente os sete dias da semana, nenhum a mais: a lista acima ja e a
    // prova (sete textos, de segunda a domingo). Nenhuma semana futura: um
    // unico pedido, o da semana atual.
    expect(itens).toHaveLength(7)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a disponibilidade de cada dia vem em texto e icone, nunca so em cor', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />)

    const esperado: [string, string, string][] = [
      ['2026-09-21', 'Fora do plano', 'fora_do_plano'],
      ['2026-09-22', 'Perdida', 'perdida'],
      ['2026-09-23', 'Concluída', 'concluida'],
      ['2026-09-24', 'Disponível', 'disponivel'],
      ['2026-09-25', 'Bloqueada', 'bloqueada'],
    ]
    for (const [day, texto, icone] of esperado) {
      const selo = within(await diaDaTrilha(day)).getByTestId('trail-availability')
      expect(selo).toHaveTextContent(texto)
      const svg = selo.querySelector('svg')
      // O icone e decorativo: o texto ao lado e o que o leitor de tela le.
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('data-icon', icone)
    }
  })

  it('os dias revelados mostram instrucao, criterio, dificuldade e o estado', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />)

    const quarta = await diaDaTrilha('2026-09-23')
    const missao = within(quarta).getByTestId('trail-mission')
    expect(missao).toHaveTextContent('Missao do dia 2026-09-23')
    expect(missao).toHaveTextContent('Critério de conclusão: Criterio do dia 2026-09-23')
    expect(within(missao).getByTestId('trail-difficulty')).toHaveTextContent('3 de 5')
    expect(within(missao).getByTestId('trail-estimated-minutes')).toHaveTextContent('30 min')
    expect(within(missao).getByTestId('trail-xp')).toHaveTextContent('90 XP')
    for (const [testId, label] of [
      ['trail-difficulty', 'Dificuldade'],
      ['trail-estimated-minutes', 'Estimativa'],
      ['trail-xp', 'Recompensa'],
    ]) {
      const value = within(missao).getByTestId(testId!)
      const pair = value.parentElement!
      expect(pair.tagName).toBe('DIV')
      expect(pair.parentElement?.tagName).toBe('DL')
      expect(pair.querySelector('dt')).toHaveTextContent(label!)
      expect(pair.querySelectorAll('dd')).toHaveLength(1)
    }
    expect(within(quarta).getByTestId('trail-availability')).toHaveTextContent('Concluída')

    const terca = await diaDaTrilha('2026-09-22')
    expect(within(terca).getByTestId('trail-mission')).toHaveTextContent('Missao do dia 2026-09-22')
    expect(within(terca).getByTestId('trail-availability')).toHaveTextContent('Perdida')

    // Um plano criado no meio da semana: os dias ANTERIORES ao inicio do
    // acompanhamento aparecem revelados, com conteudo, e Fora do plano -- nao
    // sao bau, e nao quebram nada.
    const segunda = await diaDaTrilha('2026-09-21')
    expect(within(segunda).getByTestId('trail-mission')).toHaveTextContent(
      'Missao do dia 2026-09-21',
    )
    expect(within(segunda).getByTestId('trail-availability')).toHaveTextContent('Fora do plano')
  })

  it('os dias futuros sao bau fechado: sem conteudo, com o texto de quando se revelam', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />)

    for (const [day, weekday] of [
      ['2026-09-25', 'sexta-feira'],
      ['2026-09-26', 'sábado'],
      ['2026-09-27', 'domingo'],
    ]) {
      const item = await diaDaTrilha(day)
      expect(within(item).getByTestId('trail-chest')).toHaveTextContent(
        `Missão de ${weekday} — revelada no dia`,
      )
      expect(within(item).queryByTestId('trail-mission')).not.toBeInTheDocument()
      // O bau e desenhado, mas o desenho e decorativo: o texto e que informa.
      expect(within(item).getByTestId('trail-chest').querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      )
    }
    // Um dia revelado nunca e bau.
    expect(
      within(await diaDaTrilha('2026-09-24')).queryByTestId('trail-chest'),
    ).not.toBeInTheDocument()
  })

  it('marca como hoje so o ultimo dia revelado', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />)

    const hoje = await screen.findAllByTestId('trail-today')
    expect(hoje).toHaveLength(1)
    expect((await diaDaTrilha('2026-09-24')).contains(hoje[0])).toBe(true)
  })

  it('num plano em que o ultimo dia revelado e domingo, o domingo e marcado como hoje', async () => {
    const semanaCompleta: PlanDay[] = [
      revelado(diaria(11, '2026-09-21', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(12, '2026-09-22', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(13, '2026-09-23', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(14, '2026-09-24', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(15, '2026-09-25', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(16, '2026-09-26', { availability: 'concluida', state: 'concluida' })),
      revelado(diaria(17, '2026-09-27', { availability: 'disponivel' })),
    ]
    servir({ week_start: '2026-09-21', days: semanaCompleta, special: especialBloqueada })
    renderWithI18n(<CampaignTrail />)

    const hoje = await screen.findAllByTestId('trail-today')
    expect(hoje).toHaveLength(1)
    expect((await diaDaTrilha('2026-09-27')).contains(hoje[0])).toBe(true)
  })

  it('a missao de hoje nao e concluida na trilha: orienta ir ao Quartel-General', async () => {
    const fetchMock = servir(plano())
    renderWithI18n(<CampaignTrail />)

    const quinta = await diaDaTrilha('2026-09-24')
    expect(within(quinta).getByTestId('trail-go-headquarters')).toHaveTextContent(
      'Conclua esta missão no Quartel-General.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // So os disponiveis recebem a orientacao.
    expect(screen.getAllByTestId('trail-go-headquarters')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('com a acao de navegacao, o dia de hoje oferece ir ao Quartel-General', async () => {
    servir(plano())
    const irAoQuartel = vi.fn()
    renderWithI18n(<CampaignTrail onOpenHeadquarters={irAoQuartel} />)

    const quinta = await diaDaTrilha('2026-09-24')
    const botao = within(quinta).getByRole('button', {
      name: 'Ir ao Quartel-General para concluir: Missao do dia 2026-09-24',
    })
    fireEvent.click(botao)
    expect(irAoQuartel).toHaveBeenCalledTimes(1)
  })

  it('a especial bloqueada e bau fechado, com o progresso N de 7 e sem conteudo', async () => {
    servir(plano(especialBloqueada))
    renderWithI18n(<CampaignTrail />)

    const secao = await screen.findByTestId('trail-special')
    expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Missão especial — bônus da sequência',
    )
    expect(within(secao).getByTestId('trail-availability')).toHaveTextContent('Bloqueada')
    expect(within(secao).getByTestId('trail-chest')).toHaveTextContent(
      'Missão especial — revelada ao completar 7 dias seguidos',
    )
    expect(within(secao).getByTestId('trail-special-progress')).toHaveTextContent(
      'Progresso até a especial: 3 de 7',
    )
    expect(within(secao).queryByTestId('trail-mission')).not.toBeInTheDocument()
  })

  it('a especial desbloqueada e disponivel mostra o conteudo e orienta ir ao Quartel-General', async () => {
    servir(plano(especial({ availability: 'disponivel' })))
    renderWithI18n(<CampaignTrail />)

    const secao = await screen.findByTestId('trail-special')
    expect(within(secao).getByTestId('trail-availability')).toHaveTextContent('Disponível')
    expect(within(secao).getByTestId('trail-mission')).toHaveTextContent('Prova simulada da semana')
    expect(within(secao).getByTestId('trail-xp')).toHaveTextContent('660 XP')
    expect(within(secao).getByTestId('trail-go-headquarters')).toBeInTheDocument()
    expect(within(secao).queryByTestId('trail-chest')).not.toBeInTheDocument()
    // O "N de 7" conta o PROXIMO marco; ao lado da especial ja desbloqueada
    // ele confundiria, entao so aparece no bau.
    expect(within(secao).queryByTestId('trail-special-progress')).not.toBeInTheDocument()
  })

  it('a especial concluida ou expirada mostra o conteudo e o estado, sem mandar concluir', async () => {
    servir(plano(especial({ availability: 'concluida', state: 'concluida' })))
    const { unmount } = renderWithI18n(<CampaignTrail />)
    let secao = await screen.findByTestId('trail-special')
    expect(within(secao).getByTestId('trail-availability')).toHaveTextContent('Concluída')
    expect(within(secao).getByTestId('trail-mission')).toBeInTheDocument()
    expect(within(secao).queryByTestId('trail-go-headquarters')).not.toBeInTheDocument()
    unmount()

    servir(plano(especial({ availability: 'expirada' })))
    renderWithI18n(<CampaignTrail />)
    secao = await screen.findByTestId('trail-special')
    const selo = within(secao).getByTestId('trail-availability')
    expect(selo).toHaveTextContent('Expirada')
    expect(selo.querySelector('svg')).toHaveAttribute('data-icon', 'expirada')
    expect(within(secao).getByTestId('trail-mission')).toHaveTextContent('Prova simulada da semana')
    expect(within(secao).queryByTestId('trail-go-headquarters')).not.toBeInTheDocument()
  })

  it('sem falha na atualizacao, o aviso de trilha desatualizada nao aparece', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />)
    await screen.findAllByTestId('trail-day')
    expect(screen.queryByTestId('trail-stale')).not.toBeInTheDocument()
  })

  it('a aba que volta a ficar visivel atualiza a trilha em silencio; se o GET falhar, ela continua na tela com o aviso trail-stale', async () => {
    // O caminho REAL: antes, o unico
    // jeito de exercitar `refreshFailed` era dar o estado pronto direto a
    // `TrailContent`, porque nada chamava `refresh()`. Agora `useRefreshOnReturn`
    // liga o evento real, e este teste dispara o MESMO evento que o navegador
    // dispara ao voltar para a aba.
    const fetchMock = routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano() })
        if (call === 2) return new Response(null, { status: 500 })
        return Response.json({ plan: plano() })
      },
    })
    renderWithI18n(<CampaignTrail />)
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(screen.queryByTestId('trail-stale')).not.toBeInTheDocument()

    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // A trilha continua na tela, sem sumir e sem voltar a "carregando",
    // enquanto o segundo pedido esta em voo.
    expect(screen.getAllByTestId('trail-day')).toHaveLength(7)
    expect(screen.queryByTestId('trail-loading')).not.toBeInTheDocument()

    const aviso = await screen.findByTestId('trail-stale')
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveTextContent('Não foi possível atualizar a trilha.')
    expect(screen.getAllByTestId('trail-day')).toHaveLength(7)

    fireEvent.click(within(aviso).getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => {
      expect(screen.queryByTestId('trail-stale')).not.toBeInTheDocument()
    })
    expect(await screen.findAllByTestId('trail-day')).toHaveLength(7)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('CampaignTrail em ingles', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
  })

  it('carregando: titulo e regiao viva no catalogo ingles', () => {
    routeFetch({ 'GET /api/plans/current': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("This week's trail")
    expect(screen.getByRole('status')).toHaveTextContent('Checking your trail…')
  })

  it('erro: cabecalho e Try again', async () => {
    routeFetch({ 'GET /api/plans/current': () => new Response(null, { status: 503 }) })
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    const alerta = await screen.findByTestId('trail-error')
    expect(alerta).toHaveTextContent("Couldn't load your trail.")
    expect(within(alerta).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a falha que nao e da API mostra a mensagem fixa da area, no idioma', async () => {
    routeFetch({ 'GET /api/plans/current': () => new Response('nao e json', { status: 200 }) })
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    expect(await screen.findByTestId('trail-error')).toHaveTextContent(
      'Something unexpected went wrong while loading. Try again.',
    )
  })

  it('sem plano: o texto do estado proprio', async () => {
    servir(null)
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    expect(await screen.findByTestId('trail-no-plan')).toHaveTextContent(
      "No plan this week. A day without a plan doesn't break your streak",
    )
  })

  it('a semana, os dias, o hoje, os selos, a missao e o bau em ingles', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail />, { locale: 'en' })

    expect(await screen.findByRole('list', { name: 'Days of the week' })).toBeInTheDocument()
    expect(screen.getByTestId('trail-week')).toHaveTextContent('Week of Monday, 09/21.')
    expect(screen.getByTestId('trail-today')).toHaveTextContent('Today')

    const quarta = await diaDaTrilha('2026-09-23')
    expect(within(quarta).getByTestId('trail-availability')).toHaveTextContent('Completed')
    const missao = within(quarta).getByTestId('trail-mission')
    expect(missao).toHaveTextContent('Completion criterion: Criterio do dia 2026-09-23')
    expect(within(missao).getByTestId('trail-difficulty')).toHaveTextContent('3 of 5')
    expect(within(missao).getByTestId('trail-estimated-minutes')).toHaveTextContent('30 min')
    expect(within(missao).getByTestId('trail-xp')).toHaveTextContent('90 XP')
    expect([...missao.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Difficulty',
      'Estimate',
      'Reward',
    ])

    for (const [day, label] of [
      ['2026-09-21', 'Outside the plan'],
      ['2026-09-22', 'Missed'],
      ['2026-09-24', 'Available'],
      ['2026-09-25', 'Locked'],
    ]) {
      expect(within(await diaDaTrilha(day)).getByTestId('trail-availability')).toHaveTextContent(
        label,
      )
    }

    expect(
      within(await diaDaTrilha('2026-09-24')).getByTestId('trail-go-headquarters'),
    ).toHaveTextContent('Complete this mission at Headquarters.')
    expect(within(await diaDaTrilha('2026-09-25')).getByTestId('trail-chest')).toHaveTextContent(
      "Friday's mission — revealed on the day",
    )
  })

  it('a especial bloqueada: titulo, bau e progresso em ingles', async () => {
    servir(plano(especialBloqueada))
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    const secao = await screen.findByTestId('trail-special')
    expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Special mission — streak bonus',
    )
    expect(within(secao).getByTestId('trail-chest')).toHaveTextContent(
      'Special mission — revealed after 7 days in a row',
    )
    expect(within(secao).getByTestId('trail-special-progress')).toHaveTextContent(
      'Progress to the special: 3 of 7',
    )
  })

  it('a especial expirada mostra o selo em ingles', async () => {
    servir(plano(especial({ availability: 'expirada' })))
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    const secao = await screen.findByTestId('trail-special')
    expect(within(secao).getByTestId('trail-availability')).toHaveTextContent('Expired')
  })

  it('com a navegacao, o botao diz qual missao, em ingles', async () => {
    servir(plano())
    renderWithI18n(<CampaignTrail onOpenHeadquarters={() => undefined} />, { locale: 'en' })
    const quinta = await diaDaTrilha('2026-09-24')
    expect(
      within(quinta).getByRole('button', {
        name: 'Go to Headquarters to complete: Missao do dia 2026-09-24',
      }),
    ).toBeInTheDocument()
  })

  it('o aviso de trilha desatualizada e o Refresh em ingles', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? Response.json({ plan: plano() }) : new Response(null, { status: 500 }),
    })
    renderWithI18n(<CampaignTrail />, { locale: 'en' })
    await screen.findAllByTestId('trail-day')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const aviso = await screen.findByTestId('trail-stale')
    expect(aviso).toHaveTextContent("Couldn't update your trail. It may be out of date.")
    expect(within(aviso).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})
