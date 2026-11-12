import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { routeFetch } from '../../test/fetchRoutes'
import { HTTP_FAILURE_TEXT, renderWithI18n } from '../../test/i18n'
import type { Availability, Mission } from '../../shared/types/mission'
import { LanternTrail } from './LanternTrail'
import type { Plan, PlanDay, PlanSpecial } from './types'

/** Uma diaria revelada; o conteudo nao aparece na trilha (R10), so a disponibilidade importa. */
function diaria(id: number, day: string, availability: Availability): Mission {
  return {
    id,
    instructions: `Missao do dia ${day}`,
    completion_criterion: `Criterio do dia ${day}`,
    difficulty: 2,
    estimated_minutes: 45,
    mission_type: 'diaria',
    day,
    deadline: '2026-09-25T00:00:00-03:00',
    state: availability === 'concluida' ? 'concluida' : 'pendente',
    availability,
    started_at: null,
    completed_at: null,
    xp: 40,
    actual_duration_minutes: null,
    verification: null,
    evidence: null,
    evaluation: null,
    reschedules: [],
  }
}

const DIAS = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
]

/** Revelada ate `reveladosAte` (indice, inclusive); depois disso, so o bau (sem missao). */
function semana(disponibilidades: Availability[], reveladosAte: number): PlanDay[] {
  return DIAS.map((day, index) => {
    const availability = disponibilidades[index]
    return {
      day,
      availability,
      mission: index <= reveladosAte ? diaria(index + 1, day, availability) : null,
    }
  })
}

const especialBloqueada: PlanSpecial = { availability: 'bloqueada', progress: 1, mission: null }

function especial(availability: Availability): PlanSpecial {
  return {
    availability,
    progress: 0,
    mission: {
      ...diaria(99, '2026-09-24', availability),
      mission_type: 'especial',
      day: null,
      xp: 660,
    },
  }
}

/** O caso do plano: tres acesas, uma apagada, hoje (quinta) disponivel, sexta a domingo por vir. */
const SEMANA_MISTA: Availability[] = [
  'concluida',
  'concluida',
  'perdida',
  'concluida',
  'disponivel',
  'bloqueada',
  'bloqueada',
]

function plano(
  disponibilidades: Availability[] = SEMANA_MISTA,
  reveladosAte = 4,
  special: PlanSpecial = especialBloqueada,
): Plan {
  return { week_start: '2026-09-21', days: semana(disponibilidades, reveladosAte), special }
}

function servir(plan: Plan | null) {
  return routeFetch({ 'GET /api/plans/current': () => Response.json({ plan }) })
}

async function diasDaTrilha(): Promise<HTMLElement[]> {
  return screen.findAllByTestId('trail-day')
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

const statusDe = (item: HTMLElement) => within(item).getByTestId('lantern-status')

describe('LanternTrail', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
  })

  it('anuncia o carregamento numa regiao viva, sob o titulo da trilha', () => {
    routeFetch({ 'GET /api/plans/current': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<LanternTrail />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Trilha de lanternas da semana',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Consultando a trilha…')
    expect(screen.getByTestId('trail-loading')).toBeInTheDocument()
  })

  it('a regiao da trilha e uma section nomeada pelo titulo', () => {
    routeFetch({ 'GET /api/plans/current': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<LanternTrail />)
    const regiao = screen.getByTestId('campaign-trail')
    expect(regiao.tagName).toBe('SECTION')
    expect(screen.getByRole('region', { name: 'Trilha de lanternas da semana' })).toBe(regiao)
  })

  it('no erro, avisa com a mensagem e o Tentar novamente busca de novo', async () => {
    const fetchMock = routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json({ plan: plano() }),
    })
    renderWithI18n(<LanternTrail />)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Falha ao carregar a trilha.')
    expect(alerta).toHaveTextContent(HTTP_FAILURE_TEXT['pt-BR'])

    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }))
    expect(await diasDaTrilha()).toHaveLength(7)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a aba que volta durante a carga inicial, com o GET falhando, termina no erro com Tentar novamente', async () => {
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
    renderWithI18n(<LanternTrail />)
    expect(screen.getByTestId('trail-loading')).toBeInTheDocument()

    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const alerta = await screen.findByTestId('trail-error')
    expect(alerta).toHaveTextContent(HTTP_FAILURE_TEXT['pt-BR'])

    await act(async () => {
      resolverInicial(Response.json({ plan: plano() }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByTestId('trail-error')).toBeInTheDocument()
    expect(screen.queryByTestId('trail-loading')).not.toBeInTheDocument()

    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar novamente' }))
    expect(await diasDaTrilha()).toHaveLength(7)
  })

  it('sem plano na semana e um estado proprio, sem trilha, e diz que a sequencia nao quebra', async () => {
    servir(null)
    renderWithI18n(<LanternTrail />)
    const semPlano = await screen.findByTestId('trail-no-plan')
    expect(semPlano).toHaveTextContent('Sem plano nesta semana.')
    expect(semPlano).toHaveTextContent('Um dia sem plano não quebra a sequência')
    expect(screen.queryByTestId('trail-day')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mostra sete lanternas na ordem, com o dia da semana sem conversao de fuso, e a semana', async () => {
    const fetchMock = servir(plano())
    renderWithI18n(<LanternTrail />)

    const lista = await screen.findByRole('list', { name: 'Lanternas da semana' })
    const itens = within(lista).getAllByTestId('trail-day')
    // O processo de teste roda em Asia/Tokyo (vite.config.ts): a data civil
    // nao pode passar por fuso -- quem guarda a regra e `shared/lib/civilDate`.
    expect(itens.map((li) => li.querySelector('time')?.textContent)).toEqual([
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
      'domingo',
    ])
    expect(itens.map((li) => li.dataset.day)).toEqual(DIAS)
    expect(itens[0].querySelector('time')).toHaveAttribute('datetime', '2026-09-21')
    expect(screen.getByTestId('trail-week')).toHaveTextContent('Semana de segunda-feira, 21/09.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('semana carregada: estados, textos exatos, hoje, resumo e progresso da especial', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)

    const itens = await diasDaTrilha()
    expect(itens.map((li) => li.dataset.state)).toEqual([
      'lit',
      'lit',
      'out',
      'lit',
      'future',
      'future',
      'future',
    ])
    expect(itens.map((li) => li.dataset.availability)).toEqual(SEMANA_MISTA)
    expect(itens.map((li) => statusDe(li).textContent)).toEqual([
      'Acesa: diária concluída',
      'Acesa: diária concluída',
      'Apagada: sem diária neste dia',
      'Acesa: diária concluída',
      'Pronta: dá tempo hoje',
      'Ainda por vir',
      'Ainda por vir',
    ])

    const hoje = screen.getAllByTestId('trail-today')
    expect(hoje).toHaveLength(1)
    expect(hoje[0]).toHaveTextContent('Hoje')
    expect(itens[4].contains(hoje[0])).toBe(true)

    expect(screen.getByTestId('lantern-summary')).toHaveTextContent(
      '3 de 7 lanternas acesas nesta semana',
    )

    const grande = screen.getByTestId('trail-special')
    expect(grande).toHaveAttribute('data-state', 'future')
    expect(grande).toHaveAttribute('data-availability', 'bloqueada')
    expect(statusDe(grande)).toHaveTextContent('Lanterna grande: acende com 7 dias seguidos')
    expect(within(grande).getByTestId('trail-special-progress')).toHaveTextContent(
      'Progresso até a especial: 1 de 7',
    )
  })

  it('a lanterna acesa brilha; as demais nao', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    const itens = await diasDaTrilha()
    expect(itens.map((li) => li.classList.contains('shadow-glow-lantern'))).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
      false,
    ])
    expect(screen.getByTestId('trail-special')).not.toHaveClass('shadow-glow-lantern')
  })

  it('cada estado tem texto visivel e o glifo e decorativo, com a forma do estado', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    const itens = [...(await diasDaTrilha()), screen.getByTestId('trail-special')]
    for (const item of itens) {
      const status = statusDe(item)
      expect(status.textContent).not.toBe('')
      expect(status).not.toHaveClass('sr-only')
      expect(status).not.toHaveAttribute('aria-hidden')
      const glifo = item.querySelector('svg')
      expect(glifo).toHaveAttribute('aria-hidden', 'true')
      expect(glifo).toHaveAttribute('data-state', item.dataset.state)
    }
  })

  it('a especial concluida acende (grande) e a expirada apaga, sem mostrar o progresso', async () => {
    servir(plano(SEMANA_MISTA, 4, especial('concluida')))
    const { unmount } = renderWithI18n(<LanternTrail />)
    let grande = await screen.findByTestId('trail-special')
    expect(grande).toHaveAttribute('data-state', 'lit')
    expect(grande).toHaveClass('shadow-glow-lantern')
    expect(statusDe(grande)).toHaveTextContent('Lanterna grande acesa: especial concluída')
    expect(within(grande).queryByTestId('trail-special-progress')).not.toBeInTheDocument()
    // A grande nao entra na conta das sete diarias.
    expect(screen.getByTestId('lantern-summary')).toHaveTextContent(
      '3 de 7 lanternas acesas nesta semana',
    )
    unmount()

    servir(plano(SEMANA_MISTA, 4, especial('expirada')))
    renderWithI18n(<LanternTrail />)
    grande = await screen.findByTestId('trail-special')
    expect(grande).toHaveAttribute('data-state', 'out')
    expect(statusDe(grande)).toHaveTextContent(
      'Lanterna grande apagada: a especial desta semana passou',
    )
  })

  it('a especial perdida apaga; sem plano, fica por vir com o texto de acender em 7 dias', async () => {
    servir(plano(SEMANA_MISTA, 4, especial('perdida')))
    const { unmount } = renderWithI18n(<LanternTrail />)
    let grande = await screen.findByTestId('trail-special')
    expect(grande).toHaveAttribute('data-state', 'out')
    expect(statusDe(grande)).toHaveTextContent(
      'Lanterna grande apagada: a especial desta semana passou',
    )
    unmount()

    servir(plano(SEMANA_MISTA, 4, especial('fora_do_plano')))
    renderWithI18n(<LanternTrail />)
    grande = await screen.findByTestId('trail-special')
    // O glifo e o texto concordam: futura, nunca "apagada".
    expect(grande).toHaveAttribute('data-state', 'future')
    expect(statusDe(grande)).toHaveTextContent('Lanterna grande: acende com 7 dias seguidos')
    expect(within(grande).queryByTestId('trail-special-progress')).not.toBeInTheDocument()
  })

  it('a especial aberta fica pronta, e a grande usa o glifo grande', async () => {
    servir(plano(SEMANA_MISTA, 4, especial('disponivel')))
    renderWithI18n(<LanternTrail />)
    const grande = await screen.findByTestId('trail-special')
    expect(statusDe(grande)).toHaveTextContent('Lanterna grande pronta: a especial está aberta')
    const largura = (li: HTMLElement) => Number(li.querySelector('svg')?.getAttribute('width'))
    expect(largura(grande)).toBeGreaterThan(largura((await diasDaTrilha())[0]))
  })

  it('plano criado na quarta: os dias sem plano nao aparecem como apagados', async () => {
    servir(
      plano(
        [
          'fora_do_plano',
          'fora_do_plano',
          'concluida',
          'disponivel',
          'bloqueada',
          'bloqueada',
          'bloqueada',
        ],
        3,
      ),
    )
    renderWithI18n(<LanternTrail />)

    const itens = await diasDaTrilha()
    for (const item of itens.slice(0, 2)) {
      expect(item).toHaveAttribute('data-state', 'future')
      expect(statusDe(item)).toHaveTextContent('Sem plano neste dia')
    }
    for (const item of itens) {
      expect(statusDe(item).textContent).not.toContain('Apagada')
    }
    expect(screen.getByTestId('lantern-summary')).toHaveTextContent(
      '1 de 7 lanternas acesas nesta semana',
    )
  })

  it('semana sem nenhuma lanterna acesa: so o resumo neutro, sem mensagem de falta', async () => {
    servir(
      plano(
        [
          'disponivel',
          'bloqueada',
          'bloqueada',
          'bloqueada',
          'bloqueada',
          'bloqueada',
          'bloqueada',
        ],
        0,
      ),
    )
    renderWithI18n(<LanternTrail />)

    await diasDaTrilha()
    expect(screen.getByTestId('lantern-summary')).toHaveTextContent(
      '0 de 7 lanternas acesas nesta semana',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('campaign-trail').textContent).not.toMatch(
      /perd|quebr|apagada|última chance/i,
    )
  })

  it('marca como hoje so o ultimo dia revelado; com a semana revelada, o domingo', async () => {
    servir(plano(Array<Availability>(7).fill('concluida'), 6))
    renderWithI18n(<LanternTrail />)
    const hoje = await screen.findAllByTestId('trail-today')
    expect(hoje).toHaveLength(1)
    expect((await diasDaTrilha())[6].contains(hoje[0])).toBe(true)
    expect(screen.getByTestId('lantern-summary')).toHaveTextContent(
      '7 de 7 lanternas acesas nesta semana',
    )
  })

  it('nenhum dia revelado: nenhum marcador de hoje', async () => {
    servir(plano(Array<Availability>(7).fill('bloqueada'), -1))
    renderWithI18n(<LanternTrail />)
    await diasDaTrilha()
    expect(screen.queryByTestId('trail-today')).not.toBeInTheDocument()
  })

  it('nao lista o conteudo das missoes (R10)', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    await diasDaTrilha()
    expect(screen.queryByText(/Missao do dia/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('trail-mission')).not.toBeInTheDocument()
  })

  it('com lanterna disponivel e sem navegacao, orienta em texto; nao ha botao', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    await diasDaTrilha()
    expect(screen.getByTestId('trail-go-headquarters')).toHaveTextContent(
      'Conclua esta missão no Quartel-General.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('trail-go-headquarters')).toHaveLength(1)
  })

  it('com a acao de navegacao, a lanterna disponivel oferece ir ao Quartel-General', async () => {
    servir(plano())
    const irAoQuartel = vi.fn()
    renderWithI18n(<LanternTrail onOpenHeadquarters={irAoQuartel} />)
    await diasDaTrilha()

    const botao = screen.getByRole('button', { name: 'Ir ao Quartel-General' })
    expect(botao).toBe(screen.getByTestId('trail-go-headquarters'))
    fireEvent.click(botao)
    expect(irAoQuartel).toHaveBeenCalledTimes(1)
  })

  it('so a especial disponivel tambem oferece o caminho, uma vez so', async () => {
    servir(plano(Array<Availability>(7).fill('concluida'), 6, especial('disponivel')))
    renderWithI18n(<LanternTrail onOpenHeadquarters={() => undefined} />)
    await diasDaTrilha()
    expect(screen.getAllByTestId('trail-go-headquarters')).toHaveLength(1)
  })

  it('sem lanterna disponivel, nao ha caminho para o Quartel-General', async () => {
    servir(plano(Array<Availability>(7).fill('concluida'), 6))
    renderWithI18n(<LanternTrail onOpenHeadquarters={() => undefined} />)
    await diasDaTrilha()
    expect(screen.queryByTestId('trail-go-headquarters')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sem falha na atualizacao, o aviso de trilha desatualizada nao aparece', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    await diasDaTrilha()
    expect(screen.queryByTestId('trail-stale')).not.toBeInTheDocument()
  })

  it('a aba que volta a ficar visivel atualiza em silencio; se o GET falhar, a trilha fica com o aviso trail-stale', async () => {
    const fetchMock = routeFetch({
      'GET /api/plans/current': (_init, call) => {
        if (call === 1) return Response.json({ plan: plano() })
        if (call === 2) return new Response(null, { status: 500 })
        return Response.json({ plan: plano() })
      },
    })
    renderWithI18n(<LanternTrail />)
    expect(await diasDaTrilha()).toHaveLength(7)
    expect(screen.queryByTestId('trail-stale')).not.toBeInTheDocument()

    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
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
    expect(await diasDaTrilha()).toHaveLength(7)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('nao anima nada por conta propria: respeita prefers-reduced-motion sem depender dele', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />)
    await diasDaTrilha()
    const regiao = screen.getByTestId('campaign-trail')
    expect(regiao.innerHTML).not.toMatch(/animate-|transition|duration-/)
  })
})

describe('LanternTrail em ingles', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
  })

  it('carregando: titulo e regiao viva no catalogo ingles', () => {
    routeFetch({ 'GET /api/plans/current': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('This week’s lantern trail')
    expect(screen.getByRole('status')).toHaveTextContent('Checking your trail…')
  })

  it('erro: cabecalho, mensagem e Try again', async () => {
    routeFetch({ 'GET /api/plans/current': () => new Response(null, { status: 503 }) })
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    const alerta = await screen.findByTestId('trail-error')
    expect(alerta).toHaveTextContent("Couldn't load your trail.")
    expect(alerta).toHaveTextContent(HTTP_FAILURE_TEXT.en)
    expect(within(alerta).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a falha que nao e da API mostra a mensagem fixa da area, no idioma', async () => {
    routeFetch({ 'GET /api/plans/current': () => new Response('nao e json', { status: 200 }) })
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    expect(await screen.findByTestId('trail-error')).toHaveTextContent(
      'Something unexpected went wrong while loading. Try again.',
    )
  })

  it('sem plano: o texto do estado proprio', async () => {
    servir(null)
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    expect(await screen.findByTestId('trail-no-plan')).toHaveTextContent(
      "No plan this week. A day without a plan doesn't break your streak",
    )
  })

  it('a semana, os dias, o hoje, os estados e o resumo em ingles', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />, { locale: 'en' })

    expect(await screen.findByRole('list', { name: 'This week’s lanterns' })).toBeInTheDocument()
    expect(screen.getByTestId('trail-week')).toHaveTextContent('Week of Monday, 09/21.')
    expect(screen.getByTestId('trail-today')).toHaveTextContent('Today')
    const itens = await diasDaTrilha()
    expect(itens[0].querySelector('time')).toHaveTextContent('Monday')
    expect(itens.map((li) => statusDe(li).textContent)).toEqual([
      'Lit: daily completed',
      'Lit: daily completed',
      'Unlit: no daily this day',
      'Lit: daily completed',
      'Ready: there is time today',
      'Still ahead',
      'Still ahead',
    ])
    expect(screen.getByTestId('lantern-summary')).toHaveTextContent('3 of 7 lanterns lit this week')
  })

  it('o dia sem plano, a grande e o progresso em ingles', async () => {
    servir(
      plano(
        [
          'fora_do_plano',
          'concluida',
          'concluida',
          'concluida',
          'disponivel',
          'bloqueada',
          'bloqueada',
        ],
        4,
      ),
    )
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    const itens = await diasDaTrilha()
    expect(statusDe(itens[0])).toHaveTextContent('No plan this day')
    const grande = screen.getByTestId('trail-special')
    expect(statusDe(grande)).toHaveTextContent('Great lantern: lights after 7 days in a row')
    expect(within(grande).getByTestId('trail-special-progress')).toHaveTextContent(
      'Progress to the special: 1 of 7',
    )
  })

  it('a especial concluida, aberta e expirada em ingles', async () => {
    for (const [availability, texto] of [
      ['concluida', 'Great lantern lit: special completed'],
      ['disponivel', 'Great lantern ready: the special is open'],
      ['expirada', 'Great lantern unlit: this week’s special has passed'],
    ] as const) {
      servir(plano(SEMANA_MISTA, 4, especial(availability)))
      const { unmount } = renderWithI18n(<LanternTrail />, { locale: 'en' })
      expect(statusDe(await screen.findByTestId('trail-special'))).toHaveTextContent(texto)
      unmount()
    }
  })

  it('o botao e o aviso de trilha desatualizada em ingles', async () => {
    routeFetch({
      'GET /api/plans/current': (_init, call) =>
        call === 1 ? Response.json({ plan: plano() }) : new Response(null, { status: 500 }),
    })
    renderWithI18n(<LanternTrail onOpenHeadquarters={() => undefined} />, { locale: 'en' })
    await diasDaTrilha()
    expect(screen.getByRole('button', { name: 'Go to Headquarters' })).toBeInTheDocument()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const aviso = await screen.findByTestId('trail-stale')
    expect(aviso).toHaveTextContent("Couldn't update your trail. It may be out of date.")
    expect(within(aviso).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('sem o callback, a orientacao em ingles', async () => {
    servir(plano())
    renderWithI18n(<LanternTrail />, { locale: 'en' })
    await diasDaTrilha()
    expect(screen.getByTestId('trail-go-headquarters')).toHaveTextContent(
      'Complete this mission at Headquarters.',
    )
  })
})

describe('LanternTrail -- efeitos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mount(special: PlanSpecial, onOpenHeadquarters?: () => void) {
    servir(plano(SEMANA_MISTA, 4, special))
    const elements: FakeAudio[] = []
    renderWithI18n(<LanternTrail onOpenHeadquarters={onOpenHeadquarters} />, {
      audio: {
        storage: memoryStorage({
          'kairyaquest.sound': '{"voice":true,"sfx":true}',
          'kairyaquest.soundInvite': '1',
        }),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    })
    return {
      elements,
      played: () =>
        elements.flatMap((element) =>
          element.play.mock.calls.map(() => /\/audio\/sfx\/(\w+)\.mp3$/.exec(element.src)?.[1]),
        ),
    }
  }

  /**
   * O som sai de um efeito passivo, que o React roda DEPOIS do commit que troca
   * o DOM (em outra tarefa, quando o render passa do frame do scheduler). Esperar
   * so o DOM deixa a leitura de `played()` correr contra esse efeito: sob carga
   * ela vem vazia. Por isso espera-se o proprio som e, depois que o React
   * esvazia a fila, confere-se que nao tocou uma segunda vez.
   */
  async function expectPlayedOnce(played: () => (string | undefined)[]) {
    await waitFor(() => {
      expect(played()).toEqual(['weekly_trial_unlocked'])
    })
    await act(async () => {})
    expect(played()).toEqual(['weekly_trial_unlocked'])
  }

  it('a especial disponivel toca weekly_trial_unlocked uma vez por montagem', async () => {
    const { played } = mount(especial('disponivel'))
    await screen.findByTestId('trail-special-art')

    await expectPlayedOnce(played)
  })

  it('a especial que fica disponivel depois da montagem toca weekly_trial_unlocked uma vez', async () => {
    const { played } = mount(especialBloqueada)
    await screen.findByTestId('trail-special-art')
    expect(played()).toEqual([])

    servir(plano(SEMANA_MISTA, 4, especial('disponivel')))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expectPlayedOnce(played)
    expect(screen.getByTestId('trail-special')).toHaveAttribute('data-availability', 'disponivel')
  })

  it('a especial bloqueada nao toca nada', async () => {
    const { elements } = mount(especialBloqueada)
    await screen.findByTestId('trail-special-art')

    expect(elements).toHaveLength(0)
  })

  it('o clique em trail-go-headquarters toca trail_step antes de onOpenHeadquarters', async () => {
    let playing: string | undefined
    const holder: { elements: FakeAudio[] } = { elements: [] }
    const onOpen = vi.fn(() => {
      playing = holder.elements.at(-1)?.src
    })
    const rig = mount(especialBloqueada, onOpen)
    holder.elements = rig.elements

    fireEvent.click(await screen.findByTestId('trail-go-headquarters'))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(playing).toMatch(/\/audio\/sfx\/trail_step\.mp3$/)
    expect(rig.played()).toEqual(['trail_step'])
  })
})
