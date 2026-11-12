import { API_URL, FALSO_URL } from './servers'

/**
 * O controle do servidor falso, para os cenarios da tutoria e da avaliacao.
 *
 * Contrato em `tests/integration/falso_do_e2e.py` (e provado do lado Python
 * por `tests/integration/test_falso_do_e2e.py`). `fetch` do Node, e nao o
 * `request` do Playwright: o controle nao passa pelo navegador nem pelo proxy.
 */
export type Bloco = { text: string[] } | { tool_input: Record<string, unknown>; tool_name?: string }

export interface RoteiroDoFalso {
  blocks: Bloco[]
  http_status?: number
  cut_after_events?: number
  hold_after_events?: number
  /** O motivo de parada; sem ele, o falso deriva do roteiro (pendencia 120). */
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'model_context_window_exceeded' | 'refusal'
  /**
   * A troca de modelo depois de uma recusa (fallback do servidor, pendencia
   * 174): `after_blocks` blocos do modelo pedido antes da troca (0 = antes de
   * qualquer saida); `sticky` e o roteamento fixo, sem bloco `fallback`.
   */
  fallback?: { model?: string; after_blocks?: number; sticky?: boolean }
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

/**
 * Reinicia o E2E para o proximo cenario: o falso volta ao roteiro vazio, sem
 * pedidos recebidos, e nenhum pedido do cenario anterior sobrevive ao reset.
 *
 * O reset passa pela API (`integration/reset_do_e2e.py`), e nao pelo falso
 * sozinho: um pedido que o cenario anterior deixou a meio caminho (ja na API,
 * ainda nao no falso) chegaria ao falso DEPOIS do reset, acharia o roteiro
 * vazio e gravaria `falhou` no banco compartilhado -- a cascata do cenario
 * (c) da tutoria (P-e2e-flaky-1). A API libera o que o falso segura, espera
 * os pedidos em andamento terminarem contra o roteiro de quem os originou e
 * so entao reinicia o falso.
 */
export async function reiniciar(): Promise<void> {
  await exigir(await fetch(`${API_URL}/_e2e/reset`, { method: 'POST' }), 204)
}

export async function requisicoes(): Promise<{ api_key: string; body: unknown }[]> {
  const resposta = await exigir(await fetch(`${FALSO_URL}/_control/requests`), 200)
  return ((await resposta.json()) as { requests: { api_key: string; body: unknown }[] }).requests
}
