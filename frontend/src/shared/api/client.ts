/**
 * Cliente HTTP unico da aplicacao.
 *
 * Todo acesso a rede passa por aqui: componente nenhum chama `fetch` direto
 * (`docs/ARCHITECTURE.md` §4 e §5, e o README §3, que manda centralizar
 * cliente HTTP e erros). Isto concentra em um lugar tres coisas que, espalhadas,
 * divergem: a URL base, o cabecalho `Accept` e a traducao de falha em erro.
 * Dentro dele, o unico `fetch` da aplicacao e `open`.
 */

// A URL base e resolvida no CARREGAMENTO do modulo e a ausencia da variavel
// derruba a aplicacao antes do primeiro render. A escolha e deliberada, e o
// contrario -- cair para '/api' em silencio -- foi recusado:
//
// 1. A spec proibe "falha ignorada" por nome. Um padrao silencioso e
//    exatamente isso: configuracao ausente que nao produz sintoma nenhum no
//    momento em que falta, e sim um 404 inexplicavel tres camadas adiante.
// 2. Ja custou uma reversao nesta base: o `extra="ignore"` do
//    pydantic-settings foi trocado por declarar o campo, pelo mesmo motivo --
//    engolir configuracao faz o erro aparecer no lugar errado.
// 3. Lancar AQUI, e nao dentro de `requestJson`, e o que faz a falha ser
//    alta de verdade. Se ela nascesse durante o pedido, o `catch` do hook a
//    transformaria no estado de erro da tela, e "esqueci de configurar" viria
//    vestido de "o servidor esta fora" -- dois problemas com acoes opostas.
//
// O preco e explicito: um clone novo precisa de `.env` com `VITE_API_URL=/api`
// (ver `frontend/.env.example`) antes de `npm run dev`. E uma vez, e com
// mensagem que diz o que fazer.
const configured: unknown = import.meta.env.VITE_API_URL

if (typeof configured !== 'string' || configured.length === 0) {
  throw new Error(
    'VITE_API_URL não está definida. Copie frontend/.env.example para ' +
      'frontend/.env (o valor esperado é o caminho relativo /api, encaminhado ' +
      'pelo proxy do Vite ao backend).',
  )
}

const BASE_URL = configured

/**
 * Falha de uma chamada a API, com o status e o `code` quando houve resposta.
 *
 * A `message` e escrita por ESTE cliente, em pt-BR, e nunca vem do `detail` do
 * backend. O `detail` e prosa para quem depura: nao tem acento, e o da transicao
 * ilegal expoe o valor cru do estado. Quem precisa decidir -- que mensagem
 * mostrar, se da para tentar de novo -- decide pelo `code` (spec do ciclo
 * diario, secao Erros). O `detail` nem e lido, e e isso que garante que ele nao
 * chega a tela por um caminho que alguem esqueceu.
 */
export class ApiError extends Error {
  /**
   * O status HTTP, ou `null` quando nao houve resposta nenhuma.
   *
   * A distincao e o que permite a tela nao dizer "o servidor respondeu 500"
   * quando, na verdade, o pedido nem chegou.
   */
  readonly status: number | null

  /**
   * O `code` legivel por maquina do corpo de erro, ou `null` quando ele nao
   * veio: falha de rede, 422 do FastAPI (que nao tem `code`), corpo que nao e
   * JSON, `code` que nao e texto.
   *
   * E `string`, e nao a uniao dos codigos conhecidos: o cliente nao sabe quais
   * codigos cada tela entende, e afirmar a uniao aqui seria uma conversao de
   * tipo sem verificacao. Quem consome estreita o valor.
   */
  readonly code: string | null

  constructor(message: string, status: number | null, code: string | null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Le o `code` do corpo de erro da API, ou `null` quando ele nao existe.
 *
 * Nem todo corpo de erro tem `code`: o 422 do FastAPI manda so a lista de erros
 * de validacao em `detail`, e um proxy no caminho pode devolver HTML.
 */
async function readCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null)
  const code = (body as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/**
 * Faz o pedido e devolve a resposta JA conferida: rede fora e status de erro
 * viram `ApiError` aqui. E o unico `fetch` da aplicacao.
 *
 * Separado de `send` porque o stream da tutoria precisa da resposta ANTES de
 * ler o corpo: os erros antes do stream (503, 409, 422) tem de sair iguais aos
 * de qualquer outro pedido, e o corpo de um 200 e lido em pedacos.
 */
async function open(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor.', null, null, { cause })
  }

  if (!response.ok) {
    const code = await readCode(response)
    throw new ApiError(`O servidor respondeu ${String(response.status)}.`, response.status, code)
  }

  return response
}

/**
 * Faz o pedido e devolve o JSON do corpo, com as falhas ja traduzidas em
 * `ApiError` pelo `open`.
 *
 * O tipo `T` e uma afirmacao de quem chama, nao uma validacao: o cliente nao
 * valida o formato do corpo. Validar aqui exigiria um schema por endpoint, e o
 * contrato ja e verificado do outro lado, pelos testes do backend.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  const response = await open(path, init)
  return (await response.json()) as T
}

/**
 * Faz um GET em `path` e devolve o JSON desserializado.
 *
 * `path` comeca com barra e NAO termina com barra: `/api/missions/` responde
 * 307 e gasta um round-trip a cada chamada, em silencio.
 */
export async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return send<T>(path, { headers: { Accept: 'application/json' }, signal })
}

/**
 * O prazo, em milissegundos, que os POSTs que mudam estado da tela (Iniciar,
 * Reagendar, confirmar e recusar a proposta da Kairya) dao ao servidor.
 *
 * Sao operacoes de banco, sem modelo no caminho: 20 s e muito mais que o
 * normal, e ainda assim o botao nao fica preso para sempre num pedido que o
 * navegador manteve aberto. O Concluir e a avaliacao NAO usam (pendencia 37 e
 * 190): a avaliacao chama o modelo e pode demorar mais que isto.
 */
export const MUTATION_TIMEOUT_MS = 20_000

/** As opcoes do `postJson`. */
export interface PostOptions {
  /**
   * Aborta o pedido depois desse tempo, e a falha sai como a de rede fora --
   * `ApiError` sem status e sem `code`. Sem a opcao, o pedido nao tem prazo.
   */
  timeoutMs?: number
}

/**
 * Faz um POST em `path` com `body` serializado em JSON, e devolve a resposta.
 *
 * Nao recebe `AbortSignal` do chamador, de proposito: cancelar um pedido que
 * muda estado no servidor nao desfaz a mudanca -- so esconde da tela se ela
 * aconteceu. Quem precisa saber repete o pedido com o mesmo `operation_id`, que
 * e idempotente.
 *
 * O unico aborto que existe e o do PRAZO (`timeoutMs`), e ele segue o mesmo
 * raciocinio: ao fim do prazo o resultado e DESCONHECIDO -- o servidor pode ter
 * gravado --, e por isso a falha sai igual a de rede fora (`status` e `code`
 * nulos), que as telas ja tratam como "repita com a mesma chave". O prazo cobre
 * tambem a leitura do corpo: uma resposta que comecou e nao termina prende o
 * botao do mesmo jeito.
 *
 * `setTimeout` com `AbortController`, e nao `AbortSignal.timeout`: o timer do
 * segundo e interno ao navegador, e os testes com timers falsos nao o alcancam.
 */
export async function postJson<T>(
  path: string,
  body: unknown,
  options: PostOptions = {},
): Promise<T> {
  return sendWithBody<T>('POST', path, body, options)
}

/**
 * Faz um PATCH em `path` com `body` serializado em JSON, e devolve a resposta.
 *
 * Mesmo tratamento de erro e de prazo do `postJson`, e pelo mesmo motivo nao
 * recebe `AbortSignal` do chamador: cancelar nao desfaz a gravacao.
 */
export async function patchJson<T>(
  path: string,
  body: unknown,
  options: PostOptions = {},
): Promise<T> {
  return sendWithBody<T>('PATCH', path, body, options)
}

/** O corpo comum de `postJson` e `patchJson`: JSON, cabecalhos e prazo. */
async function sendWithBody<T>(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  options: PostOptions,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  const { timeoutMs } = options
  if (timeoutMs === undefined) {
    return send<T>(path, init)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    return await send<T>(path, { ...init, signal: controller.signal })
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ApiError('O servidor demorou demais para responder.', null, null, { cause })
    }
    throw cause
  } finally {
    clearTimeout(timer)
  }
}

/** Um evento do stream SSE, com o `data` ja desserializado. */
export interface StreamEvent {
  event: string
  data: unknown
}

/**
 * O separador de quadros do SSE que o backend escreve
 * (`src/focusquest/modules/tutoring/sse.py`).
 */
const FRAME_SEPARATOR = '\n\n'

/**
 * Le um quadro `event: X\ndata: <json numa linha>`.
 *
 * Estrito de proposito: o backend so escreve este formato, e um quadro que
 * foge dele e defeito de protocolo. Continuar lendo depois dele seria
 * adivinhar o que o servidor quis dizer.
 */
function parseFrame(frame: string): StreamEvent {
  let event: string | null = null
  let data: string | null = null
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice('event: '.length)
    } else if (line.startsWith('data: ')) {
      data = line.slice('data: '.length)
    }
  }
  if (event === null || data === null) {
    throw new SyntaxError('quadro SSE sem as linhas event e data')
  }
  return { event, data: JSON.parse(data) as unknown }
}

/**
 * Faz um POST em `path` e entrega, um a um, os eventos SSE da resposta.
 *
 * `fetch` e `ReadableStream`, e nao `EventSource`: o `EventSource` so faz GET,
 * e o stream da tutoria e a resposta de um POST (spec do 1b, "Reuso do
 * Incremento A").
 *
 * Tres jeitos de terminar, e o chamador distingue os tres:
 *
 * - **erro antes do stream** (rede, 503, 409, 422): `ApiError` identico ao do
 *   `postJson`, lancado no primeiro `next()`. Nada foi gravado no servidor.
 * - **o stream acaba**: o gerador termina. Se o ultimo evento nao foi `done`
 *   nem `error`, o resultado e DESCONHECIDO -- quem sabe disso e o hook, nao
 *   este cliente, que nao conhece os nomes dos eventos.
 * - **a leitura cai no meio**: `ApiError` com o `status` da resposta (houve
 *   resposta, entao nao e `null`) e `code` `null`. Tambem e resultado
 *   desconhecido para o hook.
 *
 * Recebe `AbortSignal`, ao contrario do `postJson`: abortar o stream e a
 * desconexao que o backend grava como `interrompida`, e o reenvio com o mesmo
 * `client_message_id` e seguro. Parar de consumir o gerador (um `break`)
 * cancela a leitura do corpo, pelo mesmo motivo.
 *
 * O `TextDecoder` decodifica com `{ stream: true }`: um caractere de varios
 * bytes partido entre dois pedacos da rede so e montado assim.
 */
export async function* postStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, undefined> {
  const response = await open(path, {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (response.body === null) {
    throw new ApiError('A resposta chegou num formato inesperado.', response.status, null)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (cause) {
        throw new ApiError('A resposta foi interrompida no caminho.', response.status, null, {
          cause,
        })
      }
      if (chunk.done) {
        // O que sobrou no buffer e um quadro que a rede cortou no meio: sem o
        // separador, nao ha evento para entregar.
        return
      }
      buffer += decoder.decode(chunk.value, { stream: true })
      let end = buffer.indexOf(FRAME_SEPARATOR)
      while (end !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + FRAME_SEPARATOR.length)
        let event: StreamEvent
        try {
          event = parseFrame(frame)
        } catch (cause) {
          throw new ApiError('A resposta chegou num formato inesperado.', response.status, null, {
            cause,
          })
        }
        yield event
        end = buffer.indexOf(FRAME_SEPARATOR)
      }
    }
  } finally {
    // Cancelar num stream ja terminado nao faz nada; num stream que caiu,
    // rejeita com o erro da queda -- que ja foi traduzido acima.
    await reader.cancel().catch(() => undefined)
  }
}
