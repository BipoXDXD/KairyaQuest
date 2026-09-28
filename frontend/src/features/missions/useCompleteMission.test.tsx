import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { useCompleteMission } from './useCompleteMission'
import { useCompletionRegistry } from './useCompletionRegistry'

const concluida: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-20T13:00:00Z',
  state: 'concluida',
  availability: 'concluida',
  started_at: null,
  completed_at: '2026-09-18T15:00:00Z',
  xp: 100,
  actual_duration_minutes: null,
  verification: 'autodeclarada',
  evidence: null,
  evaluation: null,
}

/** A recompensa desta conclusao, como a API a devolve junto da missao. */
const recompensa: Reward = {
  xp_awarded: 100,
  xp_total: 1340,
  level_before: 4,
  level_after: 4,
  achievements_unlocked: [],
}

// O corpo do POST de conclusao desde o incremento D: a missao com `reward` a
// mais (`MissionCompletion`). A missao guardada no estado NAO leva essa
// chave -- e o que o teste "chega em completed com a missao que a API
// devolveu" prova.
const concluidaResposta: MissionCompletion = { ...concluida, reward: recompensa }

// Dois identificadores fixos, na ordem em que `crypto.randomUUID` os devolve.
// Fixos para que o teste diga QUAL chave foi enviada em cada tentativa, e nao
// so "uma chave qualquer".
const PRIMEIRA_CHAVE = '00000000-0000-4000-8000-000000000001'
const SEGUNDA_CHAVE = '00000000-0000-4000-8000-000000000002'

/**
 * O hook como o quadro o usa: com o registro de verdade, e nao com um falso.
 *
 * Assim a sequencia de chaves que o teste le e a que a tela mandaria. O
 * `reload` e um espiao: aqui so interessa se a conclusao avisa o registro.
 */
function renderCompletion(onCompleted?: () => void) {
  const reload = vi.fn()
  const rendered = renderHook(() => {
    const { registry, reload: requestReload } = useCompletionRegistry(reload)
    return { ...useCompleteMission(7, registry, onCompleted), requestReload, registry }
  })
  return { ...rendered, reload }
}

/** O `operation_id` de cada POST que o hook fez, na ordem. */
function sentOperationIds(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([, init]) => {
    const body = JSON.parse((init as RequestInit).body as string) as { operation_id: string }
    return body.operation_id
  })
}

function pendingForever() {
  return new Promise<Response>(() => {
    // Nunca resolve: e assim que o estado de envio fica observavel.
  })
}

describe('useCompleteMission', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(PRIMEIRA_CHAVE)
      .mockReturnValueOnce(SEGUNDA_CHAVE)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('comeca parado, sem ir a rede e sem gerar chave', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderCompletion()

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    // A chave nasce no primeiro clique, e nao na montagem: um quadro com vinte
    // missoes nao precisa de vinte chaves que ninguem vai usar.
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('fica em submitting enquanto a resposta nao chega', () => {
    vi.stubGlobal('fetch', vi.fn(pendingForever))
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })

    expect(result.current.state).toEqual({ status: 'submitting' })
  })

  it('conclui pelo POST da missao e chega em completed com a missao que a API devolveu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(concluidaResposta))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'completed',
        mission: concluida,
        reward: recompensa,
      })
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions/7/complete')
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE])
  })

  it('depois de uma falha de rede, a nova tentativa reenvia a MESMA chave', async () => {
    // E o README §7: uma falha de rede nao diz se o servidor concluiu. Com a
    // mesma chave, o reenvio devolve a conclusao que ja existe ou conclui
    // agora -- nunca duas vezes.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(concluidaResposta))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'completed',
        mission: concluida,
        reward: recompensa,
      })
    })
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, PRIMEIRA_CHAVE])
  })

  it('depois de operacao_reutilizada, a nova tentativa usa uma chave NOVA', async () => {
    // A chave pertence a outra operacao: com ela, toda tentativa seria
    // recusada. Trocar e seguro -- a missao nao foi concluida por ela.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ detail: 'x', code: 'operacao_reutilizada' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(concluidaResposta))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'Não foi possível registrar esta tentativa. Tente de novo.',
          recovery: 'retry-with-new-operation',
        },
      })
    })
    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'completed',
        mission: concluida,
        reward: recompensa,
      })
    })
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, SEGUNDA_CHAVE])
  })

  it.each<[string, () => Response]>([
    ['500 sem code', () => Response.json({ detail: 'Erro interno.' }, { status: 500 })],
    [
      '422 com detail em lista, no formato do FastAPI',
      () =>
        Response.json(
          {
            detail: [{ loc: ['body', 'operation_id'], msg: 'campo obrigatório', type: 'missing' }],
          },
          { status: 422 },
        ),
    ],
    [
      "409 com code: 'codigo_futuro' (desconhecido deste frontend)",
      () => Response.json({ detail: 'x', code: 'codigo_futuro' }, { status: 409 }),
    ],
  ])(
    'mantem a MESMA chave depois de %s, seguido de sucesso',
    async (_descricao, respostaDeFalha) => {
      // README §7: nenhuma dessas respostas diz se o servidor concluiu. So a
      // falha de rede reenviava a mesma chave antes desta rodada -- aqui a
      // mesma garantia vale para qualquer resposta HTTP sem `code` conhecido.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(respostaDeFalha())
        .mockResolvedValueOnce(Response.json(concluidaResposta))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderCompletion()

      act(() => {
        result.current.complete()
      })
      await waitFor(() => {
        expect(result.current.state.status).toBe('failed')
      })
      act(() => {
        result.current.complete()
      })

      await waitFor(() => {
        expect(result.current.state).toEqual({
          status: 'completed',
          mission: concluida,
          reward: recompensa,
        })
      })
      expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, PRIMEIRA_CHAVE])
    },
  )

  it('transicao_ilegal chega em failed pedindo para atualizar o quadro', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
        ),
    )
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
          recovery: 'refresh',
        },
      })
    })
  })

  it.each<[string, () => Response]>([
    ['o sucesso', () => Response.json(concluidaResposta)],
    [
      'transicao_ilegal',
      () => Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
    ],
    [
      'missao_nao_encontrada',
      () => Response.json({ detail: 'x', code: 'missao_nao_encontrada' }, { status: 404 }),
    ],
  ])('depois de %s, a chave sai do registro: um novo envio gera outra', async (_caso, resposta) => {
    // T5. Essa chave nao tem mais uso -- a missao foi concluida, ou nao ha o
    // que concluir --, e manter a entrada faria o registro crescer sem limite.
    // A tela nao oferece Concluir de novo nesses casos; o segundo `complete()`
    // aqui e so o jeito de ver, por fora, que a entrada saiu.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta())
      .mockImplementationOnce(pendingForever)
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderCompletion()

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state.status).not.toBe('submitting')
    })
    act(() => {
      result.current.complete()
    })

    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, SEGUNDA_CHAVE])
  })

  it('avisa o registro do voo: com o POST pendente, a recarga espera; quando ele termina, sai', async () => {
    let responder: (response: Response) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            responder = resolve
          }),
      ),
    )
    const { result, reload } = renderCompletion()

    act(() => {
      result.current.complete()
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await act(async () => {
      responder(Response.json(concluidaResposta))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })

  it('chama onCompleted depois do sucesso, e não na falha', async () => {
    const onCompleted = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(concluidaResposta)))
    const { result } = renderCompletion(onCompleted)

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'completed',
        mission: concluida,
        reward: recompensa,
      })
    })
    expect(onCompleted).toHaveBeenCalledTimes(1)

    onCompleted.mockClear()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
        ),
    )
    const { result: resultFalha } = renderCompletion(onCompleted)

    act(() => {
      resultFalha.current.complete()
    })
    await waitFor(() => {
      expect(resultFalha.current.state.status).toBe('failed')
    })
    expect(onCompleted).not.toHaveBeenCalled()
  })

  it('um onCompleted que lanca nao vira falha: a conclusao ja aconteceu no servidor', async () => {
    const erro = new Error('secao quebrou')
    const onCompleted = vi.fn(() => {
      throw erro
    })
    const registrar = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(concluidaResposta)))
    const { result } = renderCompletion(onCompleted)

    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'completed',
        mission: concluida,
        reward: recompensa,
      })
    })
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(registrar).toHaveBeenCalledWith(expect.any(String), erro)
  })

  it('avisa o fim do voo tambem quando o POST falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result, reload } = renderCompletion()

    act(() => {
      result.current.complete()
      result.current.requestReload()
    })
    expect(reload).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1)
    })
  })

  it('avisa o fim do voo UMA vez por envio: a conclusao seguinte em voo ainda segura a recarga', async () => {
    // Um `settled` a mais deixaria o contador do registro negativo, e a
    // proxima conclusao em voo nao seguraria mais a recarga -- a remontagem no
    // meio do pedido voltaria, sem nenhum outro teste reprovar (medido).
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(concluidaResposta))
        .mockImplementationOnce(pendingForever),
    )
    const { result, reload } = renderCompletion()
    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('completed')
    })

    act(() => {
      result.current.complete()
      result.current.requestReload()
    })

    expect(reload).not.toHaveBeenCalled()
  })

  describe('com evidencia', () => {
    it('complete com evidencia manda o operation_id e a evidencia sem link vazio', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(concluidaResposta))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderCompletion()

      act(() => {
        result.current.complete({ text: 'Feito', link: '' })
      })

      await waitFor(() => {
        expect(result.current.state.status).toBe('completed')
      })
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({
        operation_id: PRIMEIRA_CHAVE,
        evidence: { text: 'Feito' },
      })
    })

    it('leva o link quando ele existe', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(concluidaResposta))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderCompletion()

      act(() => {
        result.current.complete({ text: 'Feito', link: ' https://x.com/a ' })
      })

      await waitFor(() => {
        expect(result.current.state.status).toBe('completed')
      })
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({
        operation_id: PRIMEIRA_CHAVE,
        evidence: { text: 'Feito', link: 'https://x.com/a' },
      })
    })

    it('complete() sem argumento manda so o operation_id, byte a byte como antes', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(concluidaResposta))
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderCompletion()

      act(() => {
        result.current.complete()
      })

      await waitFor(() => {
        expect(result.current.state.status).toBe('completed')
      })
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init.body).toBe(JSON.stringify({ operation_id: PRIMEIRA_CHAVE }))
    })

    it('um rascunho que nao pode ser enviado nao faz POST nem gasta chave', () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { result } = renderCompletion()

      act(() => {
        result.current.complete({ text: '   ', link: '' })
      })

      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.state).toEqual({ status: 'idle' })
      expect(crypto.randomUUID).not.toHaveBeenCalled()
    })

    it('numa falha retry o rascunho continua no registro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'x' }, { status: 500 })),
      )
      const { result } = renderCompletion()
      result.current.registry.saveDraft(7, { text: 'Feito', link: '' })

      act(() => {
        result.current.complete({ text: 'Feito', link: '' })
      })

      await waitFor(() => {
        expect(result.current.state.status).toBe('failed')
      })
      expect(result.current.registry.draftFor(7)).toEqual({ text: 'Feito', link: '' })
    })

    it('no sucesso o registro esquece a chave e o rascunho', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(concluidaResposta)))
      const { result } = renderCompletion()
      result.current.registry.saveDraft(7, { text: 'Feito', link: '' })

      act(() => {
        result.current.complete({ text: 'Feito', link: '' })
      })

      await waitFor(() => {
        expect(result.current.state.status).toBe('completed')
      })
      expect(result.current.registry.draftFor(7)).toEqual({ text: '', link: '' })
    })
  })
})
