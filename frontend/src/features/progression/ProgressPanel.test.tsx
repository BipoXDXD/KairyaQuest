import { isInaccessible, screen, within } from '@testing-library/react'
import { HTTP_FAILURE_TEXT, renderWithI18n } from '../../test/i18n'
import { createRef } from 'react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { ProgressPanel, type ProgressPanelHandle } from './ProgressPanel'
import type { Progress } from './types'

const CATALOGO = [
  ['first_steps', 'Primeiros passos', 'Conclua a sua primeira missão.'],
  ['streak_7', 'Uma semana inteira', 'Complete a diária 7 dias seguidos.'],
  ['streak_30', 'Um mês de hábito', 'Complete a diária 30 dias seguidos.'],
  ['veteran_10', 'Veterano I', 'Conclua 10 missões.'],
  ['veteran_50', 'Veterano II', 'Conclua 50 missões.'],
  ['veteran_100', 'Veterano III', 'Conclua 100 missões.'],
  ['kairya_partnership', 'Parceria com a Kairya', 'Conclua uma missão proposta pela Kairya.'],
] as const

function progress(
  xp: number,
  level: number,
  floor: number,
  next: number,
  unlocked: string[] = [],
  rank?: string,
): Progress {
  return {
    ...(rank === undefined ? {} : { rank }),
    xp_total: xp,
    level,
    level_floor_xp: floor,
    next_level_xp: next,
    achievements: CATALOGO.map(([code, title, description]) => ({
      code,
      title,
      description,
      unlocked_at: unlocked.includes(code) ? '2026-09-21T13:02:11Z' : null,
    })),
  }
}

function serve(body: Progress) {
  return routeFetch({ 'GET /api/progress': () => Response.json(body) })
}

describe('ProgressPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra o nivel, o saldo e a barra com texto e valores ARIA', async () => {
    serve(progress(1340, 5, 1000, 1500, ['first_steps']))
    renderWithI18n(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 5')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('1.340 XP no total')
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuemin', '0')
    expect(barra).toHaveAttribute('aria-valuemax', '500')
    expect(barra).toHaveAttribute('aria-valuenow', '340')
    expect(barra).toHaveAttribute('aria-valuetext', '340 de 500 XP')
    expect(screen.getByTestId('progress-bar-text')).toHaveTextContent('340 de 500 XP até o nível 6')
  })

  it('a barra tem nome acessivel e o texto visivel nao e anunciado duas vezes', async () => {
    serve(progress(1340, 5, 1000, 1500))
    renderWithI18n(<ProgressPanel />)
    const barra = await screen.findByRole('progressbar', { name: 'Progresso até o nível 6' })
    expect(barra).toHaveAttribute('aria-valuetext', '340 de 500 XP')
    const texto = screen.getByTestId('progress-bar-text')
    expect(texto).toHaveTextContent('340 de 500 XP até o nível 6')
    expect(isInaccessible(texto)).toBe(true)
  })

  it('o piso do nivel mostra a barra vazia do nivel novo', async () => {
    serve(progress(1000, 5, 1000, 1500))
    renderWithI18n(<ProgressPanel />)
    const barra = await screen.findByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '0')
    expect(barra).toHaveAttribute('aria-valuetext', '0 de 500 XP')
  })

  it('saldo grande formatado em pt-BR', async () => {
    serve(progress(19000, 20, 19000, 21000))
    renderWithI18n(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 20')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('19.000 XP no total')
  })

  it('conquista destravada tem titulo e data; bloqueada diz como destravar, em texto', async () => {
    serve(progress(20, 1, 0, 100, ['first_steps']))
    renderWithI18n(<ProgressPanel />)
    const itens = await screen.findAllByTestId('progress-achievement')
    screen.getByText('Conquistas', { selector: 'h3' }).click()
    expect(itens[0]).toBeVisible()
    expect(itens.map((i) => i.dataset.code)).toEqual(CATALOGO.map(([code]) => code))
    const primeira = itens[0]!
    expect(primeira).toHaveAttribute('data-unlocked', 'true')
    expect(primeira).toHaveTextContent('Primeiros passos')
    expect(primeira).toHaveTextContent('Conquistada em 21/09/2026')
    const bloqueada = itens[1]!
    expect(bloqueada).toHaveAttribute('data-unlocked', 'false')
    expect(within(bloqueada).getByText('Bloqueada:', { exact: false })).toBeInTheDocument()
    expect(bloqueada).toHaveTextContent('Complete a diária 7 dias seguidos.')
  })

  it('conquistas recolhem sem esconder nivel ou XP e abrem as sete informacoes', async () => {
    serve(progress(260, 2, 100, 300, ['first_steps', 'kairya_partnership']))
    renderWithI18n(<ProgressPanel />)
    const level = await screen.findByTestId('progress-level')
    const total = screen.getByTestId('progress-total')
    const summary = screen.getByText('Conquistas', { selector: 'h3' }).closest('summary')
    expect(summary).not.toBeNull()
    const details = summary?.parentElement
    expect(details?.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    expect(level).toBeVisible()
    expect(total).toBeVisible()
    const items = screen.getAllByTestId('progress-achievement')
    expect(items).toHaveLength(7)
    for (const item of items) expect(item).not.toBeVisible()

    summary?.click()
    expect(details).toHaveAttribute('open')
    for (const item of items) expect(item).toBeVisible()
    expect(items[0]).toHaveTextContent('Conquistada em 21/09/2026')
    expect(items[1]).toHaveTextContent('Bloqueada: Complete a diária 7 dias seguidos.')
    summary?.click()
    expect(details).not.toHaveAttribute('open')
    for (const item of items) expect(item).not.toBeVisible()
    expect(level).toBeVisible()
    expect(total).toBeVisible()
  })

  it('carregando tem role status', () => {
    routeFetch({ 'GET /api/progress': () => new Promise<Response>(() => undefined) })
    renderWithI18n(<ProgressPanel />)
    const loading = screen.getByTestId('progress-loading')
    expect(loading).toHaveAttribute('role', 'status')
  })

  it('em ingles, o erro de carga sai do catalogo', async () => {
    routeFetch({ 'GET /api/progress': () => new Response(null, { status: 500 }) })
    renderWithI18n(<ProgressPanel />, { locale: 'en' })

    expect(await screen.findByTestId('progress-error')).toHaveTextContent(HTTP_FAILURE_TEXT.en)
  })

  it('erro com Tentar novamente refaz o pedido', async () => {
    const mock = routeFetch({
      'GET /api/progress': (_init, call) =>
        call === 1 ? new Response(null, { status: 500 }) : Response.json(progress(20, 1, 0, 100)),
    })
    renderWithI18n(<ProgressPanel />)
    const erro = await screen.findByTestId('progress-error')
    expect(erro).toHaveAttribute('role', 'alert')
    expect(erro).toHaveTextContent(HTTP_FAILURE_TEXT['pt-BR'])
    const retry = screen.getByTestId('progress-retry')
    await act(async () => {
      retry.click()
      await Promise.resolve()
    })
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 1')
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('o aviso de desatualizado aparece quando o refresh falha', async () => {
    const ref = createRef<ProgressPanelHandle>()
    routeFetch({
      'GET /api/progress': (_init, call) =>
        call === 1 ? Response.json(progress(20, 1, 0, 100)) : new Response(null, { status: 500 }),
    })
    renderWithI18n(<ProgressPanel ref={ref} />)
    await screen.findByTestId('progress-level')
    await act(async () => {
      ref.current?.refresh()
      await Promise.resolve()
    })
    const aviso = await screen.findByTestId('progress-stale')
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveTextContent('Não foi possível atualizar o progresso.')
    const botao = screen.getByTestId('progress-refresh')
    expect(botao).toHaveTextContent('Atualizar')
  })

  it.each([
    ['en', '12,345 XP total'],
    ['pt-BR', '12.345 XP no total'],
  ] as const)('em %s, o saldo sai com o separador de milhar do idioma', async (locale, texto) => {
    serve(progress(12345, 16, 12000, 13600))
    renderWithI18n(<ProgressPanel />, { locale })
    expect(await screen.findByTestId('progress-total')).toHaveTextContent(texto)
  })

  it('em en, nivel, barra, titulo, conquistas e datas saem do catalogo ingles', async () => {
    serve(progress(1340, 5, 1000, 1500, ['first_steps']))
    renderWithI18n(<ProgressPanel />, { locale: 'en' })
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Level 5')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Your progress — level and achievements',
    )
    const barra = screen.getByRole('progressbar', { name: 'Progress to level 6' })
    expect(barra).toHaveAttribute('aria-valuetext', '340 of 500 XP')
    expect(screen.getByTestId('progress-bar-text')).toHaveTextContent('340 of 500 XP to level 6')
    expect(screen.getByText('Achievements', { selector: 'h3' })).toBeInTheDocument()
    const [primeira, segunda] = screen.getAllByTestId('progress-achievement')
    expect(primeira).toHaveTextContent('First Steps')
    expect(primeira).toHaveTextContent('Unlocked on 09/21/2026')
    expect(segunda).toHaveTextContent('A Whole Week')
    expect(segunda).toHaveTextContent('Locked: Complete your daily 7 days in a row.')
    expect(segunda).not.toHaveTextContent('Uma semana inteira')
  })

  it('mostra a faixa ao lado do nivel, nos dois idiomas', async () => {
    serve(progress(1340, 5, 1000, 1500, [], 'rank_sprout'))
    const { unmount } = renderWithI18n(<ProgressPanel />)
    expect(await screen.findByTestId('progress-rank')).toHaveTextContent('Faixa: Broto')
    unmount()
    renderWithI18n(<ProgressPanel />, { locale: 'en' })
    expect(await screen.findByTestId('progress-rank')).toHaveTextContent('Rank: Sprout')
  })

  it.each([
    ['ausente (back antigo)', undefined],
    ['desconhecida (back novo)', 'rank_novo'],
  ])('faixa %s some, e o resto do painel continua', async (_caso, rank) => {
    serve(progress(1340, 5, 1000, 1500, [], rank))
    renderWithI18n(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 5')
    expect(screen.queryByTestId('progress-rank')).not.toBeInTheDocument()
    expect(screen.queryByText(/rank_novo/)).not.toBeInTheDocument()
  })

  it('conquista com code desconhecido aparece com o texto do back, nos dois estados', async () => {
    const body = progress(20, 1, 0, 100)
    body.achievements = [
      { code: 'conquista_nova', title: 'Nova', description: 'Desc nova', unlocked_at: null },
      {
        code: 'outra_nova',
        title: 'Outra',
        description: 'Desc outra',
        unlocked_at: '2026-09-21T13:02:11Z',
      },
    ]
    serve(body)
    renderWithI18n(<ProgressPanel />, { locale: 'en' })
    const [bloqueada, destravada] = await screen.findAllByTestId('progress-achievement')
    expect(bloqueada).toHaveTextContent('Nova')
    expect(bloqueada).toHaveTextContent('Locked: Desc nova')
    expect(destravada).toHaveTextContent('Outra')
    expect(destravada).not.toHaveTextContent('progression.')
  })

  it('em en, carregando, aviso de desatualizado e os botoes saem do catalogo ingles', async () => {
    const ref = createRef<ProgressPanelHandle>()
    let liberar: (r: Response) => void = () => undefined
    routeFetch({
      'GET /api/progress': (_init, call) =>
        call === 1
          ? new Promise<Response>((resolve) => {
              liberar = resolve
            })
          : new Response(null, { status: 500 }),
    })
    renderWithI18n(<ProgressPanel ref={ref} />, { locale: 'en' })
    expect(screen.getByTestId('progress-loading')).toHaveTextContent('Checking your progress…')
    await act(async () => {
      liberar(Response.json(progress(20, 1, 0, 100)))
      await Promise.resolve()
    })
    await screen.findByTestId('progress-level')
    await act(async () => {
      ref.current?.refresh()
      await Promise.resolve()
    })
    expect(await screen.findByTestId('progress-stale')).toHaveTextContent(
      "Couldn't update your progress. It may be out of date.",
    )
    expect(screen.getByTestId('progress-refresh')).toHaveTextContent('Refresh')
  })

  it('em en, o erro tem o Try again', async () => {
    routeFetch({ 'GET /api/progress': () => new Response(null, { status: 500 }) })
    renderWithI18n(<ProgressPanel />, { locale: 'en' })
    await screen.findByTestId('progress-error')
    expect(screen.getByTestId('progress-retry')).toHaveTextContent('Try again')
  })

  it('a falha que nao e da API mostra a mensagem fixa da area, no idioma', async () => {
    routeFetch({ 'GET /api/progress': () => new Response('nao e json', { status: 200 }) })
    renderWithI18n(<ProgressPanel />, { locale: 'en' })
    expect(await screen.findByTestId('progress-error')).toHaveTextContent(
      "Couldn't load your progress. Something unexpected went wrong. Try again.",
    )
  })

  it('a secao tem titulo de nivel 2 ligado por aria-labelledby', async () => {
    serve(progress(20, 1, 0, 100))
    renderWithI18n(<ProgressPanel />)
    const secao = screen.getByTestId('progress')
    const tituloId = secao.getAttribute('aria-labelledby')
    expect(tituloId).toBeTruthy()
    const titulo = document.getElementById(tituloId!)
    expect(titulo).not.toBeNull()
    expect(titulo?.tagName).toBe('H2')
    await screen.findByTestId('progress-level')
  })
})
