import { vi, type Mock } from 'vitest'

/**
 * Um `fetch` falso roteado por metodo e URL.
 *
 * Existe porque, com o painel da Kairya, a pagina busca TRES recursos na
 * montagem (missoes, status, historico), e o padrao antigo --
 * `vi.fn().mockResolvedValue(Response.json([]))` -- devolve o MESMO `Response`
 * a todas as chamadas: o corpo e consumido na primeira leitura e a segunda
 * explode com "Body is unusable". Aqui cada chamada recebe um `Response`
 * NOVO, construido pela rota.
 *
 * Uma chamada sem rota REJEITA com a chave na mensagem: um recurso que o teste
 * esqueceu de declarar aparece como falha nomeada, e nao como `undefined`.
 */
export type Route = (init: RequestInit | undefined, call: number) => Response | Promise<Response>

export function routeFetch(routes: Record<string, Route>): Mock {
  const calls = new Map<string, number>()
  const mock = vi.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input}`
    const route = routes[key]
    if (route === undefined) {
      return Promise.reject(new Error(`fetch sem rota no teste: ${key}`))
    }
    const call = (calls.get(key) ?? 0) + 1
    calls.set(key, call)
    return Promise.resolve(route(init, call))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Os `init` das chamadas feitas a uma chave, na ordem. */
export function requestsTo(mock: Mock, key: string): RequestInit[] {
  return mock.mock.calls
    .filter(
      ([input, init]) =>
        `${(init as RequestInit | undefined)?.method ?? 'GET'} ${String(input)}` === key,
    )
    .map(([, init]) => init as RequestInit)
}

/** O corpo JSON de um `init`, para conferir o que foi enviado. */
export function jsonBody(init: RequestInit): unknown {
  return JSON.parse(String(init.body))
}

/**
 * Uma rota que nunca responde e obedece ao `signal` do pedido, como o `fetch` de
 * verdade: o abort rejeita com `AbortError`. So o prazo do cliente (`postJson` com
 * `timeoutMs`, ou o de todo `requestJson`) ou um abort de quem chamou a destrava.
 * Sem `signal` no pedido, ela fica pendurada para sempre.
 */
export const pendingUntilAborted: Route = (init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
  })
