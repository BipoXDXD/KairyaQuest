import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { MissionList, type MissionListHandle } from './MissionList'

const pendente: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-20T13:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
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
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-21T13:00:00-03:00',
  state: 'concluida',
  availability: 'concluida',
  started_at: '2026-09-19T12:00:00Z',
  completed_at: '2026-09-19T13:10:00Z',
  xp: 220,
  actual_duration_minutes: 70,
}

const emAndamento: Mission = { ...pendente, id: 9, state: 'em_andamento' }

/**
 * A recompensa que os testes de conclusao usam quando o CONTEUDO dela nao e o
 * que o teste prova -- isso e `RewardAnnouncement.test.tsx`. Aqui so importa
 * que o POST de conclusao devolve `reward` desde o incremento D.
 */
const recompensaPadrao: Reward = {
  xp_awarded: 220,
  xp_total: 1340,
  level_before: 4,
  level_after: 4,
  achievements_unlocked: [],
}

/** Embrulha a missao concluida no `MissionCompletion` que o POST devolve. */
function comRecompensa(mission: Mission, reward: Reward = recompensaPadrao): MissionCompletion {
  return { ...mission, reward }
}

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

  it('o cartao mostra o prazo pelo formatador de America/Sao_Paulo', async () => {
    // A regra do fuso e provada em `shared/lib/deadline.test.ts`, com o porque
    // do instante escolhido e do processo em `Asia/Tokyo`. Aqui fica a prova de
    // que o CARTAO usa aquele formatador: um formatador local sem `timeZone`
    // diria 20/09/2026 11:30 e reprovaria.
    stubFetchResolving([{ ...pendente, deadline: '2026-09-20T02:30:00Z' }])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
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
  // O corpo do POST de conclusao desde o incremento D: a missao com `reward`.
  const pendenteConcluidaResposta = comRecompensa(pendenteConcluida)

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
    // A regiao ja tem o `<p>` do texto (P4: ela precisa existir com o mesmo
    // elemento desde antes do clique, e nao nascer so na conclusao) -- so que
    // ele esta vazio, e sem `reward` nenhum.
    expect(within(status).getByTestId('mission-completion-text')).toBeEmptyDOMElement()
    expect(within(status).queryByTestId('reward')).not.toBeInTheDocument()
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

  it('depois do sucesso, mostra a missao concluida, anuncia o texto e o reward, e tira o botao', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json(pendenteConcluidaResposta)),
    )
    render(<MissionList />)
    // P4: a regiao viva e o MESMO elemento de antes do clique -- um `role`
    // novo que nasce ja com texto nao e anunciado por todo leitor de tela.
    const statusAntes = await screen.findByTestId('mission-completion-status')

    fireEvent.click(await screen.findByTestId('mission-complete'))

    // O rotulo sai da missao que a API DEVOLVEU, e nao de um palpite da tela.
    const statusDepois = await screen.findByTestId('mission-completion-status')
    expect(statusDepois).toBe(statusAntes)
    expect(statusDepois).toHaveAttribute('role', 'status')
    expect(within(statusDepois).getByTestId('mission-completion-text')).toHaveTextContent(
      'Missão concluída.',
    )
    expect(within(statusDepois).getByTestId('reward-xp')).toHaveTextContent('+220 XP')
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mission-completion-error')).not.toBeInTheDocument()
  })

  it('uma conclusao SEM reward (deploy defasado) mantem o quadro, anuncia o texto e nao mostra XP', async () => {
    // O `postJson` nao valida a resposta em tempo de execucao: um backend
    // anterior ao incremento D (ou um contrato violado) devolve a missao sem
    // `reward`. Sem guarda, o anuncio lia `reward.xp_awarded` de `undefined`
    // e, sem error boundary, o quadro inteiro saia do DOM.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json(pendenteConcluida)),
    )
    render(<MissionList />)
    const statusAntes = await screen.findByTestId('mission-completion-status')

    fireEvent.click(await screen.findByTestId('mission-complete'))

    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const statusDepois = screen.getByTestId('mission-completion-status')
    expect(statusDepois).toBe(statusAntes)
    expect(within(statusDepois).getByTestId('mission-completion-text')).toHaveTextContent(
      'Missão concluída.',
    )
    expect(screen.getByTestId('missions-list')).toBeInTheDocument()
    expect(screen.getByTestId('mission-item')).toBeInTheDocument()
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(screen.queryByTestId('reward')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reward-xp')).not.toBeInTheDocument()
  })

  it('uma conclusao com reward NULL explicito mantem o quadro, anuncia o texto e nao mostra XP', async () => {
    // `"reward": null` e o que o FastAPI/Pydantic serve por padrao para um
    // `Optional[Reward] = None` sem `response_model_exclude_none` -- e
    // `null !== undefined`, entao uma guarda so contra a chave ausente deixava
    // passar o mesmo TypeError.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json({ ...pendenteConcluida, reward: null })),
    )
    render(<MissionList />)
    const statusAntes = await screen.findByTestId('mission-completion-status')

    fireEvent.click(await screen.findByTestId('mission-complete'))

    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const statusDepois = screen.getByTestId('mission-completion-status')
    expect(statusDepois).toBe(statusAntes)
    expect(within(statusDepois).getByTestId('mission-completion-text')).toHaveTextContent(
      'Missão concluída.',
    )
    expect(screen.getByTestId('missions-list')).toBeInTheDocument()
    expect(screen.getByTestId('mission-item')).toBeInTheDocument()
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(screen.queryByTestId('reward')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reward-xp')).not.toBeInTheDocument()
  })

  it('avisa a página quando uma avulsa é concluída', async () => {
    // Task 8: a PAGINA usa este aviso para atualizar o painel de progresso
    // (`refreshProgress`, em `Headquarters.tsx`) -- o quadro de avulsas nao
    // tem `refresh` proprio (ao contrario de `CycleSection`), entao aqui so
    // importa que o callback e chamado depois do sucesso.
    const onMissionCompleted = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json(pendenteConcluidaResposta)),
    )
    render(<MissionList onMissionCompleted={onMissionCompleted} />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    await waitFor(() => {
      expect(onMissionCompleted).toHaveBeenCalledTimes(1)
    })
  })

  it('numa falha de rede, avisa e deixa tentar de novo com a MESMA chave', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(pendenteConcluidaResposta))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    const aviso = await screen.findByTestId('mission-completion-error')
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveTextContent(
      'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
    )
    // A regiao viva nao duplica o aviso: `statusText` so fala de submitting e
    // completed, nunca do texto da falha (que ja esta no alert). O `<p>` do
    // texto continua no DOM (P4), so que vazio.
    expect(
      within(screen.getByTestId('mission-completion-status')).getByTestId(
        'mission-completion-text',
      ),
    ).toBeEmptyDOMElement()
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
      .mockResolvedValueOnce(Response.json(pendenteConcluidaResposta))
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

describe('MissionList -- atualizar o quadro com uma conclusao em voo', () => {
  // A e B, as duas missoes do cenario medido pela revisao final (pendencia 35
  // do HANDOFF): A tem a conclusao em voo, B recebe `transicao_ilegal` e e dela
  // que sai o "Atualizar o quadro".
  const missaoA: Mission = pendente
  const missaoB: Mission = {
    ...pendente,
    id: 8,
    instructions: 'Revisar as anotacoes de grafos',
  }
  const missaoAConcluida: Mission = {
    ...missaoA,
    state: 'concluida',
    completed_at: '2026-09-18T15:00:00Z',
  }
  const missaoBConcluida: Mission = { ...missaoB, state: 'concluida' }

  // Chaves fixas, na ordem em que `crypto.randomUUID` as devolve: o teste diz
  // QUAL chave saiu em cada POST, e nao so "uma chave qualquer".
  const K1 = '00000000-0000-4000-8000-000000000001'
  const K2 = '00000000-0000-4000-8000-000000000002'
  const K3 = '00000000-0000-4000-8000-000000000003'

  const ESPERA_BOTAO = 'Aguardando a conclusão em andamento…'
  const ESPERA_ANUNCIO = 'Aguardando a conclusão em andamento para atualizar o quadro.'

  type Reply = () => Promise<Response>

  /** Uma resposta que o teste resolve ou rejeita quando quiser. */
  function deferred() {
    let resolve: (response: Response) => void = () => undefined
    let reject: (error: unknown) => void = () => undefined
    const promise = new Promise<Response>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject, reply: (() => promise) as Reply }
  }

  const ok =
    (body: unknown): Reply =>
    () =>
      Promise.resolve(Response.json(body))
  const conflict =
    (code: string, status = 409): Reply =>
    () =>
      Promise.resolve(Response.json({ detail: 'x', code }, { status }))
  const networkFailure: Reply = () => Promise.reject(new TypeError('Failed to fetch'))

  /**
   * Um `fetch` falso que responde POR ROTA, e nao pela ordem das chamadas.
   *
   * Com duas conclusoes e recargas entrelacadas, uma fila unica de respostas
   * (o `mockResolvedValueOnce` dos testes acima) entregaria a resposta de um
   * pedido a outro. Aqui cada rota tem a propria fila; um pedido sem resposta
   * na fila fica pendente para sempre, e a contagem de chamadas o acusa.
   */
  function routedFetch(routes: { lists: Reply[]; posts: Record<number, Reply[]> }): Mock {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const missionId = Number(/\/missions\/(\d+)\/complete$/.exec(url)?.[1])
        const reply = routes.posts[missionId]?.shift()
        return reply ? reply() : new Promise<Response>(() => {})
      }
      const reply = routes.lists.shift()
      return reply ? reply() : new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  /** Quantos GET da lista sairam. */
  function listGets(fetchMock: Mock): number {
    return fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method !== 'POST',
    ).length
  }

  /** Cada POST de conclusao, como `[id da missao, operation_id]`, na ordem. */
  function sentKeys(fetchMock: Mock): [number, string][] {
    return fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([url, init]) => [
        Number(/\/missions\/(\d+)\/complete$/.exec(url as string)?.[1]),
        (JSON.parse((init as RequestInit).body as string) as { operation_id: string }).operation_id,
      ])
  }

  /** O cartao da missao `id`, lido de novo a cada chamada (ele remonta). */
  function card(id: number): HTMLElement {
    const item = screen
      .getAllByTestId('mission-item')
      .find((no) => no.getAttribute('data-mission-id') === String(id))
    if (item === undefined) {
      throw new Error(`cartao da missao ${String(id)} nao esta na tela`)
    }
    return item
  }

  /** Clica em Concluir em B e espera o "Atualizar o quadro" do `transicao_ilegal`. */
  async function bPedeAtualizar(): Promise<HTMLElement> {
    fireEvent.click(within(card(8)).getByTestId('mission-complete'))
    return within(card(8)).findByTestId('mission-reload')
  }

  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(K1)
      .mockReturnValueOnce(K2)
      .mockReturnValueOnce(K3)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('T1: com o POST de A pendente, Atualizar o quadro espera, e recarrega UMA vez quando A termina', async () => {
    const postA = deferred()
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB]), ok([missaoAConcluida, missaoBConcluida])],
      posts: { 7: [postA.reply], 8: [conflict('transicao_ilegal')] },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    const atualizar = await bPedeAtualizar()

    fireEvent.click(atualizar)

    // O pedido fica pendente: nenhum GET novo enquanto A esta em voo.
    expect(listGets(fetchMock)).toBe(1)
    expect(atualizar).toHaveTextContent(ESPERA_BOTAO)
    expect(screen.getByTestId('missions-reload-status')).toHaveTextContent(ESPERA_ANUNCIO)

    await act(async () => {
      postA.resolve(Response.json(comRecompensa(missaoAConcluida)))
      await postA.promise
    })

    await waitFor(() => {
      expect(screen.getAllByTestId('mission-state').map((no) => no.textContent)).toEqual([
        'Concluída',
        'Concluída',
      ])
    })
    // Exatamente UM GET a mais: o pedido pendente, executado sozinho.
    expect(listGets(fetchMock)).toBe(2)
    expect(screen.getByTestId('missions-reload-status')).toBeEmptyDOMElement()
  })

  it('espera TODAS as conclusoes em voo, e recarrega uma vez so quando a ultima termina', async () => {
    const missaoC: Mission = { ...pendente, id: 9, instructions: 'Fazer o simulado de calculo' }
    const postA = deferred()
    const postC = deferred()
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB, missaoC]), ok([missaoA, missaoBConcluida, missaoC])],
      posts: { 7: [postA.reply], 8: [conflict('transicao_ilegal')], 9: [postC.reply] },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    fireEvent.click(within(card(9)).getByTestId('mission-complete'))
    fireEvent.click(await bPedeAtualizar())

    // A termina (com falha: qualquer resultado conta), C continua em voo.
    await act(async () => {
      postA.reject(new TypeError('Failed to fetch'))
      await postA.promise.catch(() => undefined)
    })
    expect(listGets(fetchMock)).toBe(1)
    expect(within(card(8)).getByTestId('mission-reload')).toHaveTextContent(ESPERA_BOTAO)

    await act(async () => {
      postC.resolve(Response.json(comRecompensa({ ...missaoC, state: 'concluida' })))
      await postC.promise
    })

    await waitFor(() => {
      expect(listGets(fetchMock)).toBe(2)
    })
    expect(await screen.findByTestId('missions-list')).toBeInTheDocument()
    expect(listGets(fetchMock)).toBe(2)
  })

  it('T2: depois de uma falha de rede em A, o reload remonta o cartao e o novo Concluir manda a MESMA chave', async () => {
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB]), ok([missaoA, missaoBConcluida])],
      posts: {
        7: [networkFailure, ok(comRecompensa(missaoAConcluida))],
        8: [conflict('transicao_ilegal')],
      },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    await within(card(7)).findByTestId('mission-completion-error')
    const atualizar = await bPedeAtualizar()

    fireEvent.click(atualizar)

    // Nada em voo: o reload e imediato.
    expect(listGets(fetchMock)).toBe(2)
    // O cartao de A REMONTOU: voltou a "Concluir", e nao ao "Tentar de novo".
    await waitFor(() => {
      expect(within(card(8)).getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
    const concluirA = within(card(7)).getByTestId('mission-complete')
    expect(concluirA).toHaveTextContent('Concluir')
    expect(within(card(7)).queryByTestId('mission-completion-error')).not.toBeInTheDocument()

    fireEvent.click(concluirA)

    expect(await within(card(7)).findByText('Missão concluída.')).toBeInTheDocument()
    expect(sentKeys(fetchMock)).toEqual([
      [7, K1],
      [8, K2],
      [7, K1],
    ])
  })

  it('T3: o cenario medido pela revisao final -- /7 em voo, /8 ilegal, Atualizar, e /7 de novo com a PRIMEIRA chave', async () => {
    const postA = deferred()
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB]), ok([missaoA, missaoBConcluida])],
      posts: {
        7: [postA.reply, ok(comRecompensa(missaoAConcluida))],
        8: [conflict('transicao_ilegal')],
      },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    fireEvent.click(await bPedeAtualizar())

    // O POST de /7 termina sem resposta: resultado desconhecido, chave mantida.
    await act(async () => {
      postA.reject(new TypeError('Failed to fetch'))
      await postA.promise.catch(() => undefined)
    })
    await waitFor(() => {
      expect(within(card(8)).getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))

    expect(await within(card(7)).findByText('Missão concluída.')).toBeInTheDocument()
    expect(sentKeys(fetchMock)).toEqual([
      [7, K1],
      [8, K2],
      [7, K1],
    ])
    expect(listGets(fetchMock)).toBe(2)
  })

  it('T4: sem conclusao em voo, Atualizar o quadro recarrega na hora, sem mostrar espera', async () => {
    const fetchMock = routedFetch({
      lists: [ok([missaoB]), ok([missaoBConcluida])],
      posts: { 8: [conflict('transicao_ilegal')] },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    const atualizar = await bPedeAtualizar()
    expect(atualizar).toBeEnabled()
    expect(atualizar).toHaveTextContent('Atualizar o quadro')

    fireEvent.click(atualizar)

    // Sincrono: o GET saiu no proprio clique, sem esperar nada.
    expect(listGets(fetchMock)).toBe(2)
    expect(screen.getByTestId('missions-reload-status')).toBeEmptyDOMElement()
    await waitFor(() => {
      expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
  })

  it('T5: depois de operacao_reutilizada, a chave NOVA e a que sobrevive ao reload', async () => {
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB]), ok([missaoA, missaoBConcluida])],
      posts: {
        7: [conflict('operacao_reutilizada'), networkFailure, ok(comRecompensa(missaoAConcluida))],
        8: [conflict('transicao_ilegal')],
      },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    // A: K1 recusada por pertencer a outra operacao; o "Tentar de novo" sai
    // com K2, que falha por rede -- resultado desconhecido, K2 fica.
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    await within(card(7)).findByText('Não foi possível registrar esta tentativa. Tente de novo.')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    await within(card(7)).findByText(/Não foi possível confirmar a conclusão/)
    fireEvent.click(await bPedeAtualizar())
    await waitFor(() => {
      expect(within(card(8)).getByTestId('mission-state')).toHaveTextContent('Concluída')
    })

    fireEvent.click(within(card(7)).getByTestId('mission-complete'))

    expect(await within(card(7)).findByText('Missão concluída.')).toBeInTheDocument()
    expect(sentKeys(fetchMock)).toEqual([
      [7, K1],
      [7, K2],
      [8, K3],
      [7, K2],
    ])
  })

  it('T6: a regiao viva da espera existe desde o primeiro render, antes mesmo da lista', () => {
    // Um leitor de tela so anuncia mudanca numa regiao viva que ja estava no
    // documento. Aqui a lista nem carregou.
    routedFetch({ lists: [], posts: {} })

    render(<MissionList />)

    const anuncio = screen.getByTestId('missions-reload-status')
    // A asseveracao do ATRIBUTO: o jsdom nao da role a um `<p>`, mas a guarda
    // tem de reprovar se alguem trocar a role explicita por outra.
    expect(anuncio).toHaveAttribute('role', 'status')
    expect(anuncio).toBeEmptyDOMElement()
  })

  it('T6: na espera, o botao fica desabilitado PELO ATRIBUTO, com o texto e o nome da espera', async () => {
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB])],
      posts: { 8: [conflict('transicao_ilegal')] },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')
    fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    const atualizar = await bPedeAtualizar()

    fireEvent.click(atualizar)
    fireEvent.click(atualizar)

    expect(atualizar).toHaveAttribute('disabled')
    expect(atualizar).toHaveTextContent(ESPERA_BOTAO)
    expect(within(card(8)).getByRole('button', { name: ESPERA_BOTAO })).toBe(atualizar)
    // O mesmo `data-testid` de sempre: o contrato do botao nao muda na espera.
    expect(atualizar).toHaveAttribute('data-testid', 'mission-reload')
    expect(screen.getByTestId('missions-reload-status')).toHaveTextContent(ESPERA_ANUNCIO)
    expect(listGets(fetchMock)).toBe(1)
  })

  it('T7: se operationIdFor lancar antes do POST, nada fica em voo e o cartao nao trava em "Concluindo..."', async () => {
    // Regressao da rodada de correcao 1: a ordem antiga era setState
    // 'submitting' -> registry.started() -> operationIdFor() (que chama
    // crypto.randomUUID()). Se randomUUID lancasse, o postJson nunca saia e o
    // `finally` que chama `settled()` tambem nao -- o contador do registro
    // ficava em 1 para sempre, e o cartao de A ficava preso em "Concluindo...".
    // Medido com um teste temporario, sobre a ordem antiga:
    // {gets: 1, reload: "Aguardando a conclusão em andamento…",
    //  A: "Concluindo… a missão: A"}.
    vi.spyOn(crypto, 'randomUUID')
      .mockReset()
      .mockImplementationOnce(() => {
        throw new DOMException('randomUUID requires a secure context', 'SecurityError')
      })
      .mockReturnValueOnce(K2)
    const fetchMock = routedFetch({
      lists: [ok([missaoA, missaoB]), ok([missaoA, missaoB])],
      posts: { 8: [conflict('transicao_ilegal')] },
    })
    render(<MissionList />)
    await screen.findByTestId('missions-list')

    // Sem error boundary, o React nao rejoga a excecao do manipulador de
    // evento para quem despachou o clique: ele a reporta como um `ErrorEvent`
    // em `window` (o mesmo caminho de um erro de producao sem error
    // boundary). Ouvimos e paramos a propagacao so aqui, na borda do teste,
    // para o erro esperado nao virar excecao nao tratada -- nada na producao
    // engole nada.
    const reportedErrors: ErrorEvent[] = []
    const onWindowError = (event: ErrorEvent) => {
      reportedErrors.push(event)
      event.preventDefault()
    }
    window.addEventListener('error', onWindowError)
    try {
      fireEvent.click(within(card(7)).getByTestId('mission-complete'))
    } finally {
      window.removeEventListener('error', onWindowError)
    }
    expect(reportedErrors).toHaveLength(1)
    expect((reportedErrors[0]?.error as Error).message).toMatch(/secure context/)

    // O cartao de A NAO ficou em "Concluindo...": a chave nunca nasceu, entao
    // nem `setState` nem `registry.started()` rodaram.
    const concluirA = within(card(7)).getByTestId('mission-complete')
    expect(concluirA).toHaveTextContent('Concluir')
    expect(concluirA).not.toBeDisabled()

    // Nada de A ficou em voo: o "Atualizar o quadro" pedido pelo transicao_
    // ilegal de B recarrega NA HORA, sem entrar em espera.
    const atualizar = await bPedeAtualizar()
    fireEvent.click(atualizar)

    expect(listGets(fetchMock)).toBe(2)
    expect(screen.getByTestId('missions-reload-status')).toBeEmptyDOMElement()
  })
})

describe('MissionList -- a recarga pedida pela pagina', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('o reload pelo ref recarrega o quadro, e espera a conclusao em voo', async () => {
    // O ref e como a PAGINA pede a recarga depois de a Tifa criar uma missao.
    // Ele passa pelo mesmo `requestReload` do "Atualizar o quadro": com uma
    // conclusao em voo, espera (Incremento A, Task 6).
    let resolver!: (response: Response) => void
    const post = new Promise<Response>((resolve) => {
      resolver = resolve
    })
    const fetchMock = routeFetch({
      'GET /api/missions': (_init, call) =>
        Response.json(call === 1 ? [pendente] : [{ ...pendente, state: 'concluida' }]),
      'POST /api/missions/7/complete': () => post,
    })
    const ref = createRef<MissionListHandle>()
    render(<MissionList ref={ref} />)
    await screen.findByTestId('missions-list')
    fireEvent.click(screen.getByTestId('mission-complete'))

    act(() => {
      ref.current!.reload()
    })

    // Um GET so: a recarga pedida de fora esperou o POST em voo.
    expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
    expect(screen.getByTestId('missions-reload-status')).toHaveTextContent(
      'Aguardando a conclusão em andamento para atualizar o quadro.',
    )

    await act(async () => {
      resolver(Response.json(comRecompensa({ ...pendente, state: 'concluida' })))
      await post
    })

    await waitFor(() => {
      expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(2)
    })
    await waitFor(() => {
      expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
    expect(screen.getByTestId('missions-reload-status')).toBeEmptyDOMElement()
  })
})
