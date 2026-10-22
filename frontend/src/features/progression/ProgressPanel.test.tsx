import { isInaccessible, render, screen, within } from '@testing-library/react'
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
  ['tifa_partnership', 'Parceria com a Kairya', 'Conclua uma missão proposta pela Kairya.'],
] as const

function progress(
  xp: number,
  level: number,
  floor: number,
  next: number,
  unlocked: string[] = [],
): Progress {
  return {
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
    render(<ProgressPanel />)
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
    render(<ProgressPanel />)
    const barra = await screen.findByRole('progressbar', { name: 'Progresso até o nível 6' })
    expect(barra).toHaveAttribute('aria-valuetext', '340 de 500 XP')
    const texto = screen.getByTestId('progress-bar-text')
    expect(texto).toHaveTextContent('340 de 500 XP até o nível 6')
    expect(isInaccessible(texto)).toBe(true)
  })

  it('o piso do nivel mostra a barra vazia do nivel novo', async () => {
    serve(progress(1000, 5, 1000, 1500))
    render(<ProgressPanel />)
    const barra = await screen.findByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '0')
    expect(barra).toHaveAttribute('aria-valuetext', '0 de 500 XP')
  })

  it('saldo grande formatado em pt-BR', async () => {
    serve(progress(19000, 20, 19000, 21000))
    render(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 20')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('19.000 XP no total')
  })

  it('conquista destravada tem titulo e data; bloqueada diz como destravar, em texto', async () => {
    serve(progress(20, 1, 0, 100, ['first_steps']))
    render(<ProgressPanel />)
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
    serve(progress(260, 2, 100, 300, ['first_steps', 'tifa_partnership']))
    render(<ProgressPanel />)
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
    render(<ProgressPanel />)
    const loading = screen.getByTestId('progress-loading')
    expect(loading).toHaveAttribute('role', 'status')
  })

  it('erro com Tentar novamente refaz o pedido', async () => {
    const mock = routeFetch({
      'GET /api/progress': (_init, call) =>
        call === 1 ? new Response(null, { status: 500 }) : Response.json(progress(20, 1, 0, 100)),
    })
    render(<ProgressPanel />)
    const erro = await screen.findByTestId('progress-error')
    expect(erro).toHaveAttribute('role', 'alert')
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
    render(<ProgressPanel ref={ref} />)
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

  it('a secao tem titulo de nivel 2 ligado por aria-labelledby', async () => {
    serve(progress(20, 1, 0, 100))
    render(<ProgressPanel />)
    const secao = screen.getByTestId('progress')
    const tituloId = secao.getAttribute('aria-labelledby')
    expect(tituloId).toBeTruthy()
    const titulo = document.getElementById(tituloId!)
    expect(titulo).not.toBeNull()
    expect(titulo?.tagName).toBe('H2')
    await screen.findByTestId('progress-level')
  })
})
