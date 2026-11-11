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
 * Como a chamada falhou, do ponto de vista do cliente. E o que a tela usa para
 * escolher o texto (`apiErrorText`); a `message` nao serve para isso.
 *
 * - `network`: nao houve resposta (rede fora, pedido abortado pelo chamador);
 * - `timeout`: o prazo do `postJson` acabou, e o resultado e desconhecido;
 * - `http`: o servidor respondeu com status de erro;
 * - `format`: a resposta chegou, mas num formato que o cliente nao le;
 * - `interrupted`: a leitura do corpo caiu no meio do stream.
 */
export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'format' | 'interrupted'

/**
 * Os detalhes opcionais do `ApiError`, junto das `ErrorOptions`.
 *
 * Os padroes existem para os testes, que constroem `new ApiError(msg, status,
 * code)` as dezenas e so precisam de um `kind` plausivel. Todo `throw` de
 * producao, neste arquivo, passa `kind` explicito: o padrao nao distingue
 * timeout, formato ou interrupcao, e um `throw` novo que o omitisse mostraria o
 * texto de `network`/`http` sem aviso do `tsc`.
 */
export interface ApiErrorOptions extends ErrorOptions {
  /** Padrao: `network` sem status, `http` com status. */
  kind?: ApiErrorKind
  /** Padrao: `null`. */
  retryAfterSeconds?: number | null
  /** Padrao: o instante da construcao. */
  receivedAt?: Date
}

/**
 * Falha de uma chamada a API, com o status e o `code` quando houve resposta.
 *
 * A `message` e escrita por ESTE cliente, em pt-BR, so para depuracao: nenhuma
 * tela a exibe (o texto da tela vem de `apiErrorText`, pelo `kind`). Ela nunca
 * vem do `detail` do backend. O `detail` e prosa para quem depura: nao tem acento, e o da transicao
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

  readonly kind: ApiErrorKind

  /**
   * Os segundos do cabecalho `Retry-After`, ou `null` quando ele faltou ou
   * nao era um inteiro decimal (`parseRetryAfterSeconds`).
   */
  readonly retryAfterSeconds: number | null

  /**
   * O instante em que o cliente recebeu a resposta de erro (ou viu a falha,
   * quando nao houve resposta). Quem precisa do instante de volta calcula
   * `receivedAt + retryAfterSeconds` a partir daqui, e nunca do momento do
   * render: um re-render minutos depois adiaria a volta.
   */
  readonly receivedAt: Date

  constructor(
    message: string,
    status: number | null,
    code: string | null,
    options: ApiErrorOptions = {},
  ) {
    const { kind, retryAfterSeconds, receivedAt, ...errorOptions } = options
    super(message, errorOptions)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.kind = kind ?? (status === null ? 'network' : 'http')
    this.retryAfterSeconds = retryAfterSeconds ?? null
    this.receivedAt = receivedAt ?? new Date()
  }
}

/** So digitos: sem sinal, sem ponto, sem espaco. */
const DECIMAL_SECONDS = /^\d+$/

/**
 * Os segundos de um cabecalho `Retry-After`, ou `null`.
 *
 * E a UNICA leitura do cabecalho na aplicacao. Aceita so o inteiro decimal
 * nao negativo, que e o que o backend escreve; a forma de data HTTP, o
 * negativo e o fracionario viram `null` -- nunca `NaN`.
 */
export function parseRetryAfterSeconds(header: string | null): number | null {
  return header !== null && DECIMAL_SECONDS.test(header) ? Number(header) : null
}

/**
 * O prazo do pedido acabou antes da resposta. No `postJson` o resultado e
 * DESCONHECIDO -- o servidor pode ter gravado; no `requestJson`, a leitura so
 * nao chegou. E o `ApiError` de `kind` `timeout`, que e o que a tela le para
 * dizer "demorou" sem ler a `message`; `status` e `code` seguem nulos, como na
 * rede fora, porque nenhuma resposta foi aproveitada.
 */
export class ApiTimeoutError extends ApiError {
  constructor(options?: ErrorOptions) {
    super('O servidor demorou demais para responder.', null, null, {
      ...options,
      kind: 'timeout',
    })
    this.name = 'ApiTimeoutError'
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
async function open(
  path: string,
  init: RequestInit,
  onErrorStatus?: () => void,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor.', null, null, {
      cause,
      kind: 'network',
    })
  }

  if (!response.ok) {
    // O instante e lido ANTES do corpo: e o da chegada da resposta.
    const receivedAt = new Date()
    onErrorStatus?.()
    const code = await readCode(response)
    throw new ApiError(`O servidor respondeu ${String(response.status)}.`, response.status, code, {
      kind: 'http',
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('Retry-After')),
      receivedAt,
    })
  }

  return response
}

/**
 * Faz o pedido e devolve o JSON do corpo, com as falhas ja traduzidas em
 * `ApiError` pelo `open`. `onErrorStatus` e repassado ao `open`.
 *
 * O tipo `T` e uma afirmacao de quem chama, nao uma validacao: o cliente nao
 * valida o formato do corpo. Validar aqui exigiria um schema por endpoint, e o
 * contrato ja e verificado do outro lado, pelos testes do backend.
 */
async function send<T>(path: string, init: RequestInit, onErrorStatus?: () => void): Promise<T> {
  const response = await open(path, init, onErrorStatus)
  return (await response.json()) as T
}

/**
 * O prazo, em milissegundos, que todo GET (`requestJson`) da ao servidor.
 *
 * Existe porque um `refresh` sem prazo cujo pedido nunca respondia prendia a
 * tela no estado anterior, ou em "carregando" (pendencia 213 do HANDOFF): a
 * guarda "o pedido mais recente decide" descarta as respostas velhas, entao
 * so a falha do mais recente tira a tela dali. Mesma ordem de grandeza do
 * `MUTATION_TIMEOUT_MS` -- uma leitura de banco, sem modelo no caminho --, e
 * tambem sem medida real de rede (pendencia 193).
 */
export const READ_TIMEOUT_MS = 20_000

/**
 * Faz um GET em `path` e devolve o JSON desserializado.
 *
 * `path` comeca com barra e NAO termina com barra: `/api/missions/` responde
 * 307 e gasta um round-trip a cada chamada, em silencio.
 *
 * Todo GET tem o prazo `READ_TIMEOUT_MS`, e estoura-lo sai como
 * `ApiTimeoutError`, com as mesmas regras do `postJson`. O `signal` de quem
 * chama continua abortando o pedido, e esse aborto NAO vira prazo: quem
 * cancelou sabe por que cancelou.
 */
export async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return sendWithin<T>(path, { headers: { Accept: 'application/json' } }, READ_TIMEOUT_MS, signal)
}

/**
 * O prazo, em milissegundos, que os POSTs que mudam estado da tela (Iniciar,
 * Concluir, Reagendar, confirmar e recusar a proposta da Kairya) dao ao
 * servidor.
 *
 * Sao operacoes de banco, sem modelo no caminho: 20 s e muito mais que o
 * normal, e ainda assim o botao nao fica preso para sempre num pedido que o
 * navegador manteve aberto. A avaliacao NAO usa: ela chama o modelo e tem o
 * prazo proprio, `EVALUATION_TIMEOUT_MS`.
 */
export const MUTATION_TIMEOUT_MS = 20_000

/**
 * O prazo, em milissegundos, que o pedido de avaliacao da ao servidor.
 *
 * O numero e ESPELHADO A MAO do backend e da infraestrutura, e muda junto com
 * eles:
 *
 * - `tutor_timeout_seconds` (60 s, `core/config.py`): o limite da resposta do
 *   modelo. Ele so e conferido quando um evento do provedor chega, entao uma
 *   resposta legitima -- inclusive o proprio `tempo_esgotado` -- pode sair
 *   depois dos 60 s;
 * - `FOLGA_DO_ORFAO` (30 s, `tutoring/service.py`): a avaliacao em curso so
 *   vira orfa, e o reenvio so e aceito como retomada, 60 + 30 = 90 s depois de
 *   pedida. Antes disso o reenvio recebe 409 `avaliacao_em_andamento`;
 * - `proxy_read_timeout` (90 s, `docker/nginx.conf`): em producao o nginx ja
 *   responde 504 a um backend mudo nesse ponto. O prazo daqui fica ACIMA dele
 *   para nao competir com uma resposta real; ele so age quando nenhuma camada
 *   responde (proxy de fora, conexao meio-aberta).
 *
 * 90 s + 15 s de margem para a gravacao final e a volta pela rede. A margem e
 * julgamento, sem medida real de latencia (HANDOFF, pendencias 192/37).
 */
export const EVALUATION_TIMEOUT_MS = 105_000

/**
 * O prazo, em milissegundos, que o CORPO de uma resposta de erro tem para
 * chegar, contado a partir dos cabecalhos (pendencia 193).
 *
 * Existe porque o prazo global (`READ_TIMEOUT_MS`, `MUTATION_TIMEOUT_MS`,
 * `EVALUATION_TIMEOUT_MS`) cobre cabecalhos E corpo: um erro cujos cabecalhos
 * chegavam perto do fim dele ficava sem tempo para o corpo, e o `code` -- unico
 * jeito de distinguir o 409 do 504 `tempo_esgotado` do resto -- se perdia, com
 * o texto generico no lugar. Chegados os cabecalhos de erro, o prazo global
 * sai de cena e este assume; ele e curto de proposito, o corpo de erro e um
 * JSON de poucos bytes. Sem medida real de rede, como os demais.
 */
export const ERROR_BODY_TIMEOUT_MS = 5_000

/** As opcoes do `postJson`. */
export interface PostOptions {
  /**
   * Aborta o pedido depois desse tempo, e a falha sai como `ApiTimeoutError`
   * -- sem status e sem `code`, salvo quando o status ja tinha chegado (ver
   * `postJson`). Sem a opcao, o pedido nao tem prazo.
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
 * gravado --, e por isso a falha sai como `ApiTimeoutError` (`status` e `code`
 * nulos), que as telas tratam como "repita com a mesma chave". O prazo cobre
 * cabecalhos E corpo: uma resposta que comecou e nao termina prende o botao do
 * mesmo jeito, e um 200 cujo corpo nao chegou tambem e resultado desconhecido.
 * Um status de ERRO que ja chegou, porem, e fato e nao e apagado: a falha sai
 * como `ApiError` com esse status. Alem disso, ao chegarem os cabecalhos de
 * erro o prazo global e substituido por `ERROR_BODY_TIMEOUT_MS`, para que o
 * `code` nao se perca por o erro ter chegado no limite do prazo; o `code` sai
 * nulo so se o corpo de erro nao chegou nem nesse prazo curto.
 *
 * O prazo mora em `sendWithin`, o mesmo do `requestJson`.
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
  return sendWithin<T>(path, init, timeoutMs)
}

/**
 * O `send` com prazo: aborta o pedido ao fim de `timeoutMs` e traduz esse
 * aborto em `ApiTimeoutError`, salvo quando o status de erro ja tinha chegado
 * (ver `postJson`). Quando os cabecalhos de um erro chegam, o timer e rearmado
 * com `ERROR_BODY_TIMEOUT_MS` para o corpo de erro; o prazo total de um pedido
 * que falha com status e, no maximo, `timeoutMs + ERROR_BODY_TIMEOUT_MS`.
 *
 * `signal`, quando vem, e o cancelamento de quem chama, combinado com o do
 * prazo: qualquer um dos dois aborta o pedido, mas so o do prazo vira
 * `ApiTimeoutError`. `setTimeout` com `AbortController`, e nao
 * `AbortSignal.timeout`: o timer do segundo e interno ao navegador, e os
 * testes com timers falsos nao o alcancam.
 *
 * O sinal combinado nasce ANTES do timer: assim nada entre os dois pode lancar
 * e deixar o timer pendurado, e o `finally` limpa o timer e o vinculo em todo
 * caminho.
 */
async function sendWithin<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const deadline = new AbortController()
  const combined =
    signal === undefined ? unlinked(deadline.signal) : linkSignals(signal, deadline.signal)
  const abortAfter = (ms: number) =>
    setTimeout(() => {
      deadline.abort()
    }, ms)
  let timer = abortAfter(timeoutMs)
  const rearmForErrorBody = () => {
    clearTimeout(timer)
    timer = abortAfter(ERROR_BODY_TIMEOUT_MS)
  }
  try {
    return await send<T>(path, { ...init, signal: combined.signal }, rearmForErrorBody)
  } catch (cause) {
    if (deadline.signal.aborted && !hasResponseStatus(cause)) {
      throw new ApiTimeoutError({ cause })
    }
    throw cause
  } finally {
    clearTimeout(timer)
    combined.release()
  }
}

/** Um sinal que aborta quando qualquer das fontes aborta, e como desfazer o vinculo. */
interface LinkedSignal {
  signal: AbortSignal
  release: () => void
}

/** O sinal do prazo sozinho: nao ha vinculo a desfazer. */
function unlinked(signal: AbortSignal): LinkedSignal {
  return { signal, release: () => undefined }
}

/**
 * Combina o cancelamento do chamador com o prazo.
 *
 * `AbortSignal.any` quando existe. O Safari 17.0-17.3 nao a tem, e ali o
 * vinculo e feito a mao: um controller proprio que aborta quando qualquer das
 * fontes aborta, com os listeners removidos em `release` para o signal do
 * chamador -- que vive mais que o pedido -- nao segurar este pedido encerrado.
 * O sinal ligado aborta com o motivo da fonte que abortou primeiro, como o
 * `AbortSignal.any` nativo: quem le `signal.reason` ve o mesmo nos dois casos.
 * Um polyfill de pacote faria o mesmo com uma dependencia a mais.
 */
function linkSignals(caller: AbortSignal, deadline: AbortSignal): LinkedSignal {
  if (typeof AbortSignal.any === 'function') {
    return unlinked(AbortSignal.any([caller, deadline]))
  }
  const linked = new AbortController()
  const abort = () => {
    linked.abort(caller.aborted ? caller.reason : deadline.reason)
  }
  if (caller.aborted) {
    abort()
  }
  caller.addEventListener('abort', abort)
  deadline.addEventListener('abort', abort)
  return {
    signal: linked.signal,
    release: () => {
      caller.removeEventListener('abort', abort)
      deadline.removeEventListener('abort', abort)
    },
  }
}

/** Se a falha ja traz o status de uma resposta que chegou. */
function hasResponseStatus(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status !== null
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
    throw new ApiError('A resposta chegou num formato inesperado.', response.status, null, {
      kind: 'format',
    })
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
          kind: 'interrupted',
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
            kind: 'format',
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
