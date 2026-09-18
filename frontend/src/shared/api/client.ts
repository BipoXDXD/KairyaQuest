/**
 * Cliente HTTP unico da aplicacao.
 *
 * Todo acesso a rede passa por aqui: componente nenhum chama `fetch` direto
 * (`docs/ARCHITECTURE.md` §4 e §5, e o README §3, que manda centralizar
 * cliente HTTP e erros). Isto concentra em um lugar tres coisas que, espalhadas,
 * divergem: a URL base, o cabecalho `Accept` e a traducao de falha em erro.
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
 * Faz o pedido e traduz qualquer falha em `ApiError`. E o unico `fetch` da
 * aplicacao.
 *
 * O tipo `T` e uma afirmacao de quem chama, nao uma validacao: o cliente nao
 * valida o formato do corpo. Validar aqui exigiria um schema por endpoint, e o
 * contrato ja e verificado do outro lado, pelos testes do backend.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
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
 * Faz um POST em `path` com `body` serializado em JSON, e devolve a resposta.
 *
 * Nao recebe `AbortSignal`, de proposito: o unico POST da tela e a conclusao
 * de missao, e cancelar um pedido que muda estado no servidor nao desfaz a
 * mudanca -- so esconde da tela se ela aconteceu. Quem precisa saber repete o
 * pedido com o mesmo `operation_id`, que e idempotente.
 */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
