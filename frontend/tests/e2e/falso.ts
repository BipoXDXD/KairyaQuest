import { FALSO_URL } from './servers'

/**
 * O controle do servidor falso, para os cenarios da tutoria.
 *
 * Contrato em `tests/integration/falso_do_e2e.py` (e provado do lado Python
 * por `tests/integration/test_falso_do_e2e.py`). `fetch` do Node, e nao o
 * `request` do Playwright: o controle nao passa pelo navegador nem pelo proxy.
 */
export type Bloco =
  | { text: string[] }
  | { tool_input: Record<string, unknown> }
  | { tool_input: Record<string, unknown>; tool_name: string }

export interface RoteiroDoFalso {
  blocks: Bloco[]
  http_status?: number
  cut_after_events?: number
  hold_after_events?: number
}

async function exigir(resposta: Response, esperado: number): Promise<Response> {
  if (resposta.status !== esperado) {
    throw new Error(`controle do falso: ${String(resposta.status)} ${await resposta.text()}`)
  }
  return resposta
}

export async function definirRoteiro(roteiro: RoteiroDoFalso): Promise<void> {
  await exigir(
    await fetch(`${FALSO_URL}/_control/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roteiro),
    }),
    204,
  )
}

export async function liberar(): Promise<void> {
  await exigir(await fetch(`${FALSO_URL}/_control/release`, { method: 'POST' }), 204)
}

export async function reiniciar(): Promise<void> {
  await exigir(await fetch(`${FALSO_URL}/_control/reset`, { method: 'POST' }), 204)
}

export async function requisicoes(): Promise<{ api_key: string; body: unknown }[]> {
  const resposta = await exigir(await fetch(`${FALSO_URL}/_control/requests`), 200)
  return ((await resposta.json()) as { requests: { api_key: string; body: unknown }[] }).requests
}
