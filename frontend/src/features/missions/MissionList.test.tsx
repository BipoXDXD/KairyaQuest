import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionList } from './MissionList'
import type { Mission } from './types'

const pendente: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  deadline: '2026-09-20T13:00:00Z',
  state: 'pendente',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
}

const concluida: Mission = {
  id: 8,
  instructions: 'Resolver a lista de recorrencias',
  completion_criterion: 'Dez exercicios corrigidos',
  difficulty: 5,
  estimated_minutes: 90,
  deadline: '2026-09-21T13:00:00-03:00',
  state: 'concluida',
  started_at: '2026-09-19T12:00:00Z',
  completed_at: '2026-09-19T13:10:00Z',
  xp: 220,
  actual_duration_minutes: 70,
}

const emAndamento: Mission = { ...pendente, id: 9, state: 'em_andamento' }

function stubFetchResolving(body: unknown, init?: ResponseInit) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, init)))
}

describe('MissionList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra o estado de carregamento enquanto a resposta nao chega', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    render(<MissionList />)

    const carregando = screen.getByTestId('missions-loading')
    expect(carregando).toHaveAttribute('role', 'status')
    expect(carregando).toHaveTextContent(/missões/i)
    expect(screen.queryByTestId('missions-list')).not.toBeInTheDocument()
  })

  it('mostra o estado vazio quando a API responde [] -- e nao o de erro', async () => {
    stubFetchResolving([])

    render(<MissionList />)

    const vazio = await screen.findByTestId('missions-empty')
    expect(vazio).toHaveTextContent(/nenhuma missão/i)
    // O ponto do teste: vazio e erro NAO podem ser o mesmo no DOM.
    expect(screen.queryByTestId('missions-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('missions-retry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('missions-list')).not.toBeInTheDocument()
  })

  it('mostra o estado de erro quando a API falha -- e nao o vazio', async () => {
    stubFetchResolving({ detail: 'Banco indisponível.' }, { status: 503 })

    render(<MissionList />)

    const erro = await screen.findByTestId('missions-error')
    expect(erro).toHaveAttribute('role', 'alert')
    expect(erro).toHaveTextContent('Banco indisponível.')
    expect(erro).toHaveTextContent(/falha ao carregar/i)
    // O ponto do teste: o erro nao diz "nenhuma missão", porque nao se sabe
    // se existem missoes -- so se sabe que nao foi possivel ler.
    expect(erro).not.toHaveTextContent(/nenhuma missão/i)
    expect(screen.queryByTestId('missions-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('missions-list')).not.toBeInTheDocument()
  })

  it('mostra o estado de erro quando a rede falha, sem status para exibir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<MissionList />)

    expect(await screen.findByTestId('missions-error')).toHaveTextContent(
      /não foi possível falar com o servidor/i,
    )
  })

  it('tenta de novo quando a pessoa aciona o botao do estado de erro', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ detail: 'Caiu.' }, { status: 500 }))
      .mockResolvedValueOnce(Response.json([pendente]))
    vi.stubGlobal('fetch', fetchMock)

    render(<MissionList />)
    await screen.findByTestId('missions-error')

    fireEvent.click(screen.getByTestId('missions-retry'))

    expect(await screen.findByTestId('missions-list')).toBeInTheDocument()
    expect(screen.queryByTestId('missions-error')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lista as missoes na ordem que a API devolveu', async () => {
    stubFetchResolving([pendente, concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    const itens = screen.getAllByTestId('mission-item')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveAttribute('data-mission-id', '7')
    expect(itens[1]).toHaveAttribute('data-mission-id', '8')
  })

  it('exibe os campos da missao, com o prazo como instante no atributo dateTime', async () => {
    stubFetchResolving([pendente])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    expect(screen.getByTestId('mission-instructions')).toHaveTextContent(
      'Ler o capitulo 3 de algoritmos',
    )
    expect(screen.getByTestId('mission-completion-criterion')).toHaveTextContent(
      'Resumo de uma pagina entregue',
    )
    expect(screen.getByTestId('mission-difficulty')).toHaveTextContent('3')
    expect(screen.getByTestId('mission-estimated-minutes')).toHaveTextContent('45')
    expect(screen.getByTestId('mission-xp')).toHaveTextContent('100')

    const prazo = screen.getByTestId('mission-deadline')
    // O atributo carrega a string ORIGINAL da API, com fuso: e o contrato que
    // o E2E pode conferir sem depender do fuso da maquina que roda o teste.
    expect(prazo).toHaveAttribute('dateTime', '2026-09-20T13:00:00Z')
    // O texto visivel e formatado em pt-BR (dd/mm/aaaa), no fuso de quem le.
    expect(prazo).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('omite a duracao real quando a API a devolve nula', async () => {
    stubFetchResolving([pendente])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    expect(screen.queryByTestId('mission-actual-duration')).not.toBeInTheDocument()
  })

  it('exibe a duracao real quando a API a devolve', async () => {
    stubFetchResolving([concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    expect(screen.getByTestId('mission-actual-duration')).toHaveTextContent('70')
  })

  it('traduz cada valor de state para o rotulo em portugues, sem mostrar o dado cru', async () => {
    stubFetchResolving([pendente, emAndamento, concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    const rotulos = screen.getAllByTestId('mission-state').map((no) => no.textContent)
    expect(rotulos).toEqual(['Pendente', 'Em andamento', 'Concluída'])
  })

  it('nao deixa nenhum valor cru de state escapar para a tela', async () => {
    stubFetchResolving([pendente, emAndamento, concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    expect(screen.getByTestId('missions')).not.toHaveTextContent(/em_andamento/)
  })
})
