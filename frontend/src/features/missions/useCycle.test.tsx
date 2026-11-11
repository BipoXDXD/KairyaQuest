import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READ_TIMEOUT_MS } from '../../shared/api/client'
import { pendingUntilAborted, routeFetch, type Route } from '../../test/fetchRoutes'
import type { Cycle } from './types'
import { useCycle } from './useCycle'

/** O 503 vira o texto do catalogo pelo `kind`; a `message` de depuracao nao sai do hook. */
const HTTP_FAILURE = {
  kind: 'api',
  text: { message: 'shared.apiError.http.message', recovery: 'shared.apiError.http.recovery' },
} as const

/** O prazo de leitura vira o texto de `timeout` do catalogo; a `message` de depuracao nao sai do hook. */
const TIMEOUT_FAILURE = {
  kind: 'api',
  text: {
    message: 'shared.apiError.timeout.message',
    recovery: 'shared.apiError.timeout.recovery',
  },
} as const

const semPlano: Cycle = {
  today: '2026-09-23',
  mission: null,
  streak: 0,
  days_to_milestone: 7,
  special: null,
  late_daily: null,
}
const comSequencia: Cycle = { ...semPlano, streak: 1, days_to_milestone: 6 }

describe('useCycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carrega o ciclo', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(semPlano) })
    const { result } = renderHook(() => useCycle())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })
    })
  })

  it('mostra o erro com o texto do catalogo pelo kind, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json(semPlano),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
    })
    act(() => {
      result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
  })

  it('uma falha que nao e ApiError vira falha inesperada, sem texto: a tela o traduz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json', { status: 200 })))
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        failure: { kind: 'unexpected' },
      })
    })
  })

  it('o refresh atualiza sem passar por carregando', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(call === 1 ? semPlano : comSequencia),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    expect(result.current.state.status).toBe('loaded')
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: comSequencia,
        refreshFailed: false,
      })
    })
  })

  it('o refresh que falha mantem o ciclo e marca que pode estar desatualizado', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? Response.json(semPlano) : new Response(null, { status: 500 }),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: true,
      })
    })
  })

  it('o refresh que falha durante um reload nao troca o carregando por nada', async () => {
    let falharRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            falharRefresh = resolve
          })
        return new Promise<Response>(() => undefined) // o reload fica em voo
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
      result.current.reload()
    })
    await act(async () => {
      falharRefresh(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('dois refresh concorrentes em que o primeiro responde por ultimo: fica o dado do segundo', async () => {
    // `visibilitychange` e `focus` podem chamar `refresh()` os dois quando a
    // aba volta -- duas chamadas ficam em voo ao mesmo tempo, sem garantia
    // de que a mais VELHA responde primeiro. Sem a guarda de sequencia, a
    // resposta do primeiro chegando por ultimo sobrescreveria o dado do
    // segundo com um dado desatualizado.
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O SEGUNDO (mais recente) responde primeiro, com sucesso.
    await act(async () => {
      resolverSegundo(Response.json(comSequencia))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })

    // O PRIMEIRO (mais velho) so responde DEPOIS, com um dado diferente --
    // e ignorado.
    const cycleDesatualizado: Cycle = { ...semPlano, streak: 99 }
    await act(async () => {
      resolverPrimeiro(Response.json(cycleDesatualizado))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })
  })

  it('o primeiro refresh tem sucesso e o segundo (mais recente) falha depois: o aviso reflete o pedido mais recente', async () => {
    // Decisao de desenho: a
    // resposta que conta e sempre a do pedido mais RECENTE -- sucesso ou
    // falha, a mesma regra dos dois lados, sem tratar erro como caso
    // especial. Por isso aqui, mesmo o PRIMEIRO tendo sucesso, o resultado
    // final e o do SEGUNDO (mais novo): como ele falha, o aviso liga. A
    // alternativa -- deixar uma falha tardia nunca ligar o aviso quando
    // algum pedido mais velho teve sucesso -- exigiria tratar sucesso e
    // falha de jeitos diferentes na mesma guarda, e o pedido mais recente
    // deixaria de ser, sempre, a ultima palavra.
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O PRIMEIRO (mais velho) responde com sucesso primeiro -- mas o
    // SEGUNDO ja esta em voo, entao esta resposta e descartada (o ciclo
    // continua o da carga inicial).
    await act(async () => {
      resolverPrimeiro(Response.json(comSequencia))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: semPlano,
      refreshFailed: false,
    })

    // O SEGUNDO (mais recente) falha depois: e o unico que conta.
    await act(async () => {
      resolverSegundo(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: semPlano,
      refreshFailed: true,
    })
  })

  it('o segundo refresh (mais recente) tem sucesso, e o primeiro (mais velho) falha por ultimo: sem aviso de desatualizado', async () => {
    let resolverPrimeiro: (resposta: Response) => void = () => undefined
    let resolverSegundo: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverPrimeiro = resolve
          })
        if (call === 3)
          return new Promise<Response>((resolve) => {
            resolverSegundo = resolve
          })
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh()
      result.current.refresh()
    })

    // O SEGUNDO (mais recente) tem sucesso primeiro.
    await act(async () => {
      resolverSegundo(Response.json(comSequencia))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })

    // O PRIMEIRO (mais velho) falha por ultimo -- e ignorado: nao liga o
    // aviso por cima de um dado que ja esta atualizado.
    await act(async () => {
      resolverPrimeiro(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })
  })

  it('um reload que comeca com um refresh em voo invalida a resposta atrasada do refresh', async () => {
    let resolverRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2)
          return new Promise<Response>((resolve) => {
            resolverRefresh = resolve
          })
        if (call === 3) return Response.json(comSequencia)
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })

    act(() => {
      result.current.refresh() // call 2, fica em voo
    })
    act(() => {
      result.current.reload() // call 3, ja completa
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: comSequencia,
        refreshFailed: false,
      })
    })

    // O refresh antigo (call 2) so responde AGORA, com um dado diferente do
    // reload -- e ignorado.
    const cycleAntigo: Cycle = { ...semPlano, streak: 42 }
    await act(async () => {
      resolverRefresh(Response.json(cycleAntigo))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })
  })

  it('o sucesso do pedido inicial que chega DEPOIS de um refresh mais novo ja ter assentado nao sobrescreve o dado mais novo', async () => {
    // A mesma guarda de sequencia vale para a carga do EFEITO (montagem),
    // nao so para `refresh`: aqui e o pedido inicial que fica velho.
    let resolverInicial: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1)
          return new Promise<Response>((resolve) => {
            resolverInicial = resolve
          })
        if (call === 2) return Response.json(comSequencia)
        return new Promise<Response>(() => undefined)
      },
    })
    const { result } = renderHook(() => useCycle())
    expect(result.current.state).toEqual({ status: 'loading' })

    act(() => {
      result.current.refresh() // call 2, mais novo -- responde com sucesso primeiro
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: comSequencia,
        refreshFailed: false,
      })
    })

    // O pedido inicial (mais velho) so responde AGORA, com um dado
    // diferente -- e ignorado.
    await act(async () => {
      resolverInicial(Response.json(semPlano))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: comSequencia,
      refreshFailed: false,
    })
  })

  // Pendencia 65: os testes acima provam a guarda de sequencia com DOIS
  // pedidos em voo. A regra ("o pedido mais recente e a ultima palavra") nao
  // guarda estado por pedido, entao nao deveria depender de quantos estao em
  // voo -- estes testes trocam esse argumento por prova, com tres ou quatro
  // pedidos respondendo em ordens adversas.
  describe('tres ou mais refresh concorrentes', () => {
    /**
     * Cada chamada a `/api/cycle` depois das `prontas` primeiras fica em voo
     * ate o teste responder pelo indice (0 = primeira em voo). Generaliza o
     * `resolverPrimeiro`/`resolverSegundo` dos testes de dois pedidos.
     *
     * `responder` cede um macrotask inteiro dentro do `act`: a resposta
     * percorre todo o `requestJson` (corpo, JSON, `then`/`catch`) antes da
     * assercao seguinte. So microtasks poderiam afirmar "ignorado" antes de a
     * resposta chegar, e o teste passaria vacuamente.
     */
    function emVoo(prontas: Response[]) {
      const pendentes: ((resposta: Response) => void)[] = []
      const route: Route = (_init, call) => {
        const pronta = prontas[call - 1]
        if (pronta !== undefined) return pronta
        return new Promise<Response>((resolve) => {
          pendentes.push(resolve)
        })
      }
      async function responder(indice: number, resposta: Response) {
        const resolve = pendentes[indice]
        if (resolve === undefined) throw new Error(`o pedido ${String(indice)} nao saiu`)
        await act(async () => {
          resolve(resposta)
          await new Promise((pronto) => setTimeout(pronto, 0))
        })
      }
      return { route, responder }
    }

    const ciclo = (streak: number): Cycle => ({ ...semPlano, streak })
    const carregado = (cycle: Cycle, refreshFailed: boolean) => ({
      status: 'loaded',
      cycle,
      refreshFailed,
    })

    /** Monta o hook com a carga inicial pronta (`semPlano`) e ja assentada. */
    async function carregarComRotas(route: Route) {
      routeFetch({ 'GET /api/cycle': route })
      const { result } = renderHook(() => useCycle())
      await waitFor(() => {
        expect(result.current.state).toEqual(carregado(semPlano, false))
      })
      return result
    }

    /** Dispara tres `refresh` no mesmo `act`, como a rajada da aba que volta. */
    function pedirTresRefresh(result: { current: { refresh: () => void } }) {
      act(() => {
        result.current.refresh()
        result.current.refresh()
        result.current.refresh()
      })
    }

    it('F1 tres refresh respondendo na ordem inversa: fica o dado do terceiro', async () => {
      const { route, responder } = emVoo([Response.json(semPlano)])
      const result = await carregarComRotas(route)

      pedirTresRefresh(result)
      await responder(2, Response.json(ciclo(3)))
      expect(result.current.state).toEqual(carregado(ciclo(3), false))
      await responder(1, Response.json(ciclo(2)))
      await responder(0, Response.json(ciclo(1)))

      expect(result.current.state).toEqual(carregado(ciclo(3), false))
    })

    it('F2 dois sucessos velhos e a falha do mais recente: mantem a carga e liga o aviso', async () => {
      const { route, responder } = emVoo([Response.json(semPlano)])
      const result = await carregarComRotas(route)

      pedirTresRefresh(result)
      await responder(0, Response.json(ciclo(1)))
      await responder(1, Response.json(ciclo(2)))
      expect(result.current.state).toEqual(carregado(semPlano, false))
      await responder(2, new Response(null, { status: 500 }))

      expect(result.current.state).toEqual(carregado(semPlano, true))
    })

    it('F3 o mais recente tem sucesso e os dois velhos falham depois: sem aviso', async () => {
      const { route, responder } = emVoo([Response.json(semPlano)])
      const result = await carregarComRotas(route)

      pedirTresRefresh(result)
      await responder(2, Response.json(ciclo(3)))
      await responder(0, new Response(null, { status: 500 }))
      await responder(1, new Response(null, { status: 500 }))

      expect(result.current.state).toEqual(carregado(ciclo(3), false))
    })

    it('F4 um reload no meio da rajada: so o refresh pedido depois dele conta', async () => {
      // Em voo, na ordem das chamadas: 0 = r1, 1 = r2, 2 = carga do reload
      // (o efeito roda dentro do `act` do reload), 3 = r3.
      const { route, responder } = emVoo([Response.json(semPlano)])
      const result = await carregarComRotas(route)

      act(() => {
        result.current.refresh()
        result.current.refresh()
      })
      act(() => {
        result.current.reload()
      })
      expect(result.current.state).toEqual({ status: 'loading' })
      act(() => {
        result.current.refresh()
      })

      await responder(3, Response.json(ciclo(4)))
      expect(result.current.state).toEqual(carregado(ciclo(4), false))
      await responder(2, Response.json(ciclo(9)))
      await responder(1, Response.json(ciclo(8)))
      await responder(0, Response.json(ciclo(7)))

      expect(result.current.state).toEqual(carregado(ciclo(4), false))
    })

    it('F5 rajada durante a carga inicial: o sucesso velho nao tira do carregando, e a falha do mais recente vira erro', async () => {
      // Em voo: 0 = carga inicial, 1 a 3 = os tres refresh. O sucesso de um
      // refresh velho e descartado mesmo com a tela em "carregando": a regra
      // e "o mais recente e a ultima palavra", e o mais recente falhou.
      const { route, responder } = emVoo([])
      routeFetch({ 'GET /api/cycle': route })
      const { result } = renderHook(() => useCycle())
      expect(result.current.state).toEqual({ status: 'loading' })

      pedirTresRefresh(result)
      await responder(2, Response.json(ciclo(2)))
      expect(result.current.state).toEqual({ status: 'loading' })
      await responder(3, new Response(null, { status: 503 }))
      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
      await responder(0, Response.json(ciclo(1)))
      await responder(1, Response.json(ciclo(1)))

      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
    })
  })

  // Falha do `refresh` com a tela ainda em "carregando". `refresh()` incrementa a
  // sequencia, entao a resposta da carga inicial do efeito passa a ser
  // descartada quando chegar -- quem decide o estado e o refresh. Se ele
  // falha com a tela ainda em "carregando", "carregando" vira ERRO (com o
  // "Tentar novamente"): antes, o `catch` so sabia marcar `refreshFailed`
  // num estado `loaded` e devolvia o `loading` intacto, e o QG ficava preso
  // em "Consultando o ciclo..." para sempre. A carga inicial ASSENTA depois,
  // de proposito: e isso que mostra que nada mais tiraria a tela de
  // "carregando" (o teste anterior deixava a carga inicial em voo para
  // sempre e afirmava o proprio `loading` -- passava vacuamente).
  it.each([
    ['com sucesso', () => Response.json(semPlano)],
    ['com falha', () => new Response(null, { status: 502 })],
  ])(
    'o refresh que falha antes da carga inicial assentar vira erro, e a carga inicial que assenta depois (%s) nao muda isso',
    async (_caso, respostaInicial) => {
      let resolverInicial: (resposta: Response) => void = () => undefined
      let resolverRefresh: (resposta: Response) => void = () => undefined
      routeFetch({
        'GET /api/cycle': (_init, call) => {
          if (call === 1)
            return new Promise<Response>((resolve) => {
              resolverInicial = resolve
            })
          if (call === 2)
            return new Promise<Response>((resolve) => {
              resolverRefresh = resolve
            })
          return new Promise<Response>(() => undefined)
        },
      })
      const { result } = renderHook(() => useCycle())
      expect(result.current.state).toEqual({ status: 'loading' })

      act(() => {
        result.current.refresh()
      })
      await act(async () => {
        resolverRefresh(new Response(null, { status: 503 }))
        await Promise.resolve()
      })
      await waitFor(() => {
        expect(result.current.state).toEqual({
          status: 'error',
          failure: HTTP_FAILURE,
        })
      })

      // Um macrotask inteiro: deixa a resposta inicial percorrer todo o
      // `requestJson` (corpo, JSON, `then`/`catch` do efeito) antes da
      // assercao -- so microtasks poderiam afirmar antes de ela chegar.
      await act(async () => {
        resolverInicial(respostaInicial())
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
    },
  )

  it('o refresh que falha com a tela ja no erro deixa o erro como esta, com a mensagem da carga', async () => {
    // O terceiro ramo do `catch` do refresh: nem `loaded` (marcaria
    // desatualizado) nem `loading` (viraria erro) -- o erro que ja esta na
    // tela, com o "Tentar novamente", continua sendo a saida.
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : new Response(null, { status: 500 }),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        failure: HTTP_FAILURE,
      })
    })
    await act(async () => {
      result.current.refresh()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(result.current.state).toEqual({ status: 'error', failure: HTTP_FAILURE })
  })

  it('a aba que volta a ficar visivel atualiza o ciclo em silencio (a virada do dia)', async () => {
    // O cenario da meia-noite: a aba ficou aberta de um dia para o outro, e
    // `today` precisa mudar sem passar por "carregando" -- e o motivo de
    // existir o `refresh` silencioso, agora ligado ao evento real.
    const ontem: Cycle = { ...semPlano, today: '2026-09-23' }
    const hoje: Cycle = { ...semPlano, today: '2026-09-24' }
    routeFetch({
      'GET /api/cycle': (_init, call) => Response.json(call === 1 ? ontem : hoje),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: ontem, refreshFailed: false })
    })

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Logo apos o evento, ainda na mesma volta de eventos: nao virou
    // "carregando". Se a fiacao usasse `reload` no lugar de `refresh`, este
    // `state.status` seria `loading` aqui.
    expect(result.current.state.status).toBe('loaded')

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: hoje, refreshFailed: false })
    })
  })

  it('um pedido cancelado que so rejeita DEPOIS do bom ja ter assentado nao vira erro', async () => {
    // A guarda `controller.signal.aborted` existe para o pedido cancelado que
    // demora a notificar: o StrictMode (ou uma troca de tela) aborta o
    // primeiro pedido e monta o segundo, mas a rejeicao do PRIMEIRO so chega
    // depois -- as vezes depois de o segundo ja ter assentado com sucesso. Sem
    // a guarda, essa rejeicao tardia sobrescreveria o `loaded` bom com erro.
    //
    // Um teste que so desmonta e verifica `result.current` NAO prova nada: o
    // `renderHook` para de re-renderizar apos a desmontagem, entao
    // `result.current` fica congelado no ultimo valor (`loading`) mesmo se a
    // guarda for removida e o `setState` do erro for chamado -- medido tirando
    // a guarda e vendo aquele teste continuar verde. E um teste que rejeita o
    // primeiro pedido NO PROPRIO evento de abort tambem nao prova nada aqui:
    // a rejeicao chegaria antes do segundo pedido assentar, e o `loaded`
    // que vem depois esconderia o defeito. Por isso a rejeicao do primeiro
    // pedido e deliberadamente ADIADA para depois do `loaded` ja estar na tela.
    let rejeitarPrimeiro: (error: unknown) => void = () => undefined
    let chamadas = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        chamadas += 1
        if (chamadas === 1) {
          return new Promise<Response>((_resolve, reject) => {
            rejeitarPrimeiro = reject
          })
        }
        return Promise.resolve(Response.json(semPlano))
      }),
    )

    const { result } = renderHook(() => useCycle(), { wrapper: StrictMode })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })
    })
    expect(chamadas).toBe(2)

    await act(async () => {
      rejeitarPrimeiro(new DOMException('Aborted', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.state).toEqual({
      status: 'loaded',
      cycle: semPlano,
      refreshFailed: false,
    })
  })

  // Pendencia 213: o `refresh` nao tinha prazo. Se o pedido mais recente
  // nunca respondia, a guarda de sequencia descartava as respostas velhas e
  // ninguem tirava a tela do estado anterior -- ou de "carregando", quando a
  // carga inicial tinha sido invalidada. O prazo do `requestJson` faz o
  // refresh pendurado falhar como qualquer refresh que falha.
  describe('refresh pendurado (prazo de leitura)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('com o ciclo na tela, o refresh mais recente que nunca responde liga o aviso no prazo', async () => {
      routeFetch({
        'GET /api/cycle': (init, call) =>
          call === 1 ? Response.json(semPlano) : pendingUntilAborted(init, call),
      })
      const { result } = renderHook(() => useCycle())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })

      act(() => {
        result.current.refresh()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1)
      })
      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: false,
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(result.current.state).toEqual({
        status: 'loaded',
        cycle: semPlano,
        refreshFailed: true,
      })
    })

    it('com a carga inicial invalidada, o refresh pendurado tira a tela de carregando no prazo', async () => {
      // A carga inicial nunca responde nem obedece ao abort: so o refresh
      // pode decidir, e ele tambem nao responde. Antes do prazo, "carregando"
      // para sempre.
      routeFetch({
        'GET /api/cycle': (init, call) =>
          call === 1 ? new Promise<Response>(() => undefined) : pendingUntilAborted(init, call),
      })
      const { result } = renderHook(() => useCycle())
      act(() => {
        result.current.refresh()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1)
      })
      expect(result.current.state).toEqual({ status: 'loading' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(result.current.state).toEqual({
        status: 'error',
        failure: TIMEOUT_FAILURE,
      })
    })
  })
})
