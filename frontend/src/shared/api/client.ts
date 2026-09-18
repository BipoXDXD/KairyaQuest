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

/** Falha de uma chamada a API, com o status quando houve resposta. */
export class ApiError extends Error {
  /**
   * O status HTTP, ou `null` quando nao houve resposta nenhuma.
   *
   * A distincao e o que permite a tela nao dizer "o servidor respondeu 500"
   * quando, na verdade, o pedido nem chegou.
   */
  readonly status: number | null

  constructor(message: string, status: number | null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Le o `detail` do corpo de erro da API, ou `null` quando ele nao existe.
 *
 * A chave e `detail` em ingles porque e contrato de payload; a prosa dentro
 * dela vem em pt-BR do backend e pode ir direto para a tela. Nem todo corpo de
 * erro tem `detail` de texto: o 422 do FastAPI manda uma LISTA de erros de
 * validacao, e um proxy no caminho pode devolver HTML. Nos dois casos a funcao
 * responde `null` e quem chamou usa a mensagem com o status.
 */
async function readDetail(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null)
  const detail = (body as { detail?: unknown } | null)?.detail
  return typeof detail === 'string' ? detail : null
}

/**
 * Faz um GET em `path` e devolve o JSON desserializado.
 *
 * `path` comeca com barra e NAO termina com barra: `/api/missions/` responde
 * 307 e gasta um round-trip a cada chamada, em silencio.
 *
 * O tipo `T` e uma afirmacao de quem chama, nao uma validacao: o cliente nao
 * valida o formato do corpo. Validar aqui exigiria um schema por endpoint, e o
 * contrato ja e verificado do outro lado, pelos testes do backend.
 */
export async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor.', null, { cause })
  }

  if (!response.ok) {
    const detail = await readDetail(response)
    throw new ApiError(
      detail ?? `O servidor respondeu ${String(response.status)}.`,
      response.status,
    )
  }

  return (await response.json()) as T
}
