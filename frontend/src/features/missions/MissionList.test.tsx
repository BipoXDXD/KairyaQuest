import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
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
    expect(erro).toHaveTextContent('O servidor respondeu 503.')
    expect(erro).toHaveTextContent(/falha ao carregar/i)
    // A prosa do backend nao chega a tela (spec do ciclo diario, secao Erros).
    expect(erro).not.toHaveTextContent('Banco indisponível.')
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

  it('marca a lista com role="list" EXPLICITA, que o list-style do Tailwind removeria', async () => {
    stubFetchResolving([pendente, concluida])

    render(<MissionList />)

    const lista = await screen.findByTestId('missions-list')
    // A asseveracao que de fato reprova e a do ATRIBUTO. Medido: com apenas
    // `getByRole('list')`, apagar o `role="list"` do componente NAO reprova --
    // o jsdom computa a role implicita do `<ul>` e nao reproduz o
    // comportamento do Safari/VoiceOver, que remove a role de lista quando o
    // `list-style` e none (o preflight do Tailwind o zera). Uma guarda que nao
    // consegue dizer "nao" nao e guarda.
    expect(lista).toHaveAttribute('role', 'list')
    // E a arvore de acessibilidade continua expondo lista e itens -- o que a
    // role explicita existe para preservar.
    expect(screen.getByRole('list')).toBe(lista)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
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
    // O texto visivel e formatado em pt-BR (dd/mm/aaaa) e no fuso de
    // America/Sao_Paulo, o que o README §8 e a decisao A3 da spec mandam -- nao
    // no fuso de quem le. O fuso em si e provado no teste seguinte; aqui so o
    // formato.
    expect(prazo).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('apresenta o prazo em America/Sao_Paulo, mesmo com o processo em outro fuso', async () => {
    // Um instante em que SP e UTC caem em DIAS diferentes: 02:30 de 20/09 em
    // UTC sao 23:30 de 19/09 em SP. Com qualquer instante "de meio de dia" o
    // teste nao distinguiria os fusos pela data, so pela hora.
    //
    // O que da dente a este teste e o `TZ` do processo fixado em `Asia/Tokyo`
    // no `vite.config.ts`. Sem ele, na maquina do dono -- que esta em SP --, o
    // formatador SEM `timeZone` produziria o mesmo texto esperado, e o teste
    // passaria sem o conserto (medido). Em Tokyo o formatador sem `timeZone`
    // diz 20/09/2026 11:30, e o teste reprova.
    stubFetchResolving([{ ...pendente, deadline: '2026-09-20T02:30:00Z' }])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    // Regex e nao texto exato: o separador entre data e hora (virgula,
    // espaco) muda entre versoes do ICU, e o que importa aqui e dia e hora.
    expect(screen.getByTestId('mission-deadline')).toHaveTextContent(/19\/09\/2026.*23:30/)
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

describe('MissionList -- concluir', () => {
  // A missao pendente depois de concluida, como a API a devolve no 200.
  const pendenteConcluida: Mission = {
    ...pendente,
    state: 'concluida',
    completed_at: '2026-09-18T15:00:00Z',
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** O corpo de cada POST de conclusao, na ordem em que saiu. */
  function completionBodies(fetchMock: Mock): unknown[] {
    return fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as unknown)
  }

  it('oferece Concluir so para a missao que ainda nao foi concluida', async () => {
    stubFetchResolving([pendente, emAndamento, concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    const [itemPendente, itemEmAndamento, itemConcluida] = screen.getAllByTestId('mission-item')
    expect(within(itemPendente).getByTestId('mission-complete')).toBeInTheDocument()
    expect(within(itemEmAndamento).getByTestId('mission-complete')).toBeInTheDocument()
    // `concluida` e terminal (decisao A5): nao ha o que oferecer.
    expect(within(itemConcluida).queryByTestId('mission-complete')).not.toBeInTheDocument()
  })

  it('a regiao viva ja existe, vazia, ANTES de qualquer clique', async () => {
    // Um leitor de tela so anuncia mudancas numa regiao viva que ja estava no
    // documento -- por isso ela precisa existir desde o primeiro render, e
    // nao nascer so quando ha algo para anunciar.
    stubFetchResolving([pendente])

    render(<MissionList />)

    const status = await screen.findByTestId('mission-completion-status')
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toBeEmptyDOMElement()
  })

  it('a missao que ja vem concluida nao tem regiao viva nenhuma', async () => {
    // `CompletionControls` devolve null de proposito para essa missao (o
    // `return null` do inicio da funcao): nao ha nada a anunciar, e a regiao
    // nao deveria existir no cartao dela.
    stubFetchResolving([concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    expect(screen.queryByTestId('mission-completion-status')).not.toBeInTheDocument()
  })

  it('da ao botao um nome acessivel que diz QUAL missao ele conclui', async () => {
    // Com varias missoes no quadro, "Concluir" sozinho seria o mesmo nome em
    // todos os botoes, e o leitor de tela nao teria como distingui-los.
    stubFetchResolving([pendente])

    render(<MissionList />)

    expect(
      await screen.findByRole('button', {
        name: 'Concluir a missão: Ler o capitulo 3 de algoritmos',
      }),
    ).toBeVisible()
  })

  it('durante o envio, desabilita o botao e anuncia; um segundo clique nao reenvia', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)
    const botao = await screen.findByTestId('mission-complete')

    fireEvent.click(botao)
    fireEvent.click(botao)

    expect(botao).toBeDisabled()
    expect(botao).toHaveTextContent('Concluindo…')
    expect(screen.getByTestId('mission-completion-status')).toHaveTextContent(
      'Concluindo a missão…',
    )
    // Um GET da lista e UM POST: o segundo clique caiu no botao desabilitado.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('depois do sucesso, mostra a missao concluida, anuncia e tira o botao', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json(pendenteConcluida)),
    )
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    // O rotulo sai da missao que a API DEVOLVEU, e nao de um palpite da tela.
    expect(await screen.findByText('Missão concluída.')).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mission-completion-error')).not.toBeInTheDocument()
  })

  it('numa falha de rede, avisa e deixa tentar de novo com a MESMA chave', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(pendenteConcluida))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    const aviso = await screen.findByTestId('mission-completion-error')
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveTextContent(
      'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
    )
    // A regiao viva nao duplica o aviso: `statusText` so fala de submitting e
    // completed, nunca do texto da falha (que ja esta no alert).
    expect(screen.getByTestId('mission-completion-status')).toBeEmptyDOMElement()
    const tentarDeNovo = screen.getByRole('button', {
      name: 'Tentar de novo a missão: Ler o capitulo 3 de algoritmos',
    })

    fireEvent.click(tentarDeNovo)

    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const [primeiro, segundo] = completionBodies(fetchMock)
    expect(segundo).toEqual(primeiro)
  })

  it('em operacao_reutilizada, avisa e deixa tentar de novo com uma chave NOVA', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockResolvedValueOnce(
        Response.json({ detail: 'x', code: 'operacao_reutilizada' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(pendenteConcluida))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    const aviso = await screen.findByTestId('mission-completion-error')
    expect(aviso).toHaveTextContent('Não foi possível registrar esta tentativa. Tente de novo.')
    // O botao continua oferecido: e M12 que faz o "Tentar de novo" sumir aqui.
    const tentarDeNovo = screen.getByRole('button', {
      name: 'Tentar de novo a missão: Ler o capitulo 3 de algoritmos',
    })

    fireEvent.click(tentarDeNovo)

    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const [primeiro, segundo] = completionBodies(fetchMock)
    expect(segundo).not.toEqual(primeiro)
  })

  it('em missao_nao_encontrada, tira o Concluir e oferece Atualizar o quadro', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockResolvedValueOnce(
        Response.json(
          { detail: 'PROSA-CRUA-DO-BACKEND', code: 'missao_nao_encontrada' },
          { status: 404 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    expect(await screen.findByTestId('mission-completion-error')).toHaveTextContent(
      'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
    )
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar o quadro' })).toBeInTheDocument()
    // Nem a prosa do backend nem o code cru chegam a tela.
    expect(screen.getByTestId('missions')).not.toHaveTextContent('PROSA-CRUA-DO-BACKEND')
    expect(screen.getByTestId('missions')).not.toHaveTextContent('missao_nao_encontrada')
  })

  it('na transicao ilegal, tira o Concluir e oferece Atualizar o quadro, que recarrega', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockResolvedValueOnce(
        Response.json(
          { detail: 'PROSA-CRUA-DO-BACKEND', code: 'transicao_ilegal' },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json([pendenteConcluida]))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    expect(await screen.findByTestId('mission-completion-error')).toHaveTextContent(
      'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
    )
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    // Nem a prosa do backend nem o code cru chegam a tela.
    expect(screen.getByTestId('missions')).not.toHaveTextContent('PROSA-CRUA-DO-BACKEND')
    expect(screen.getByTestId('missions')).not.toHaveTextContent('transicao_ilegal')

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar o quadro' }))

    await waitFor(() => {
      expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
    expect(screen.queryByTestId('mission-completion-error')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
