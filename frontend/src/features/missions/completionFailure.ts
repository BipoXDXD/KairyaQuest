import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import type { MissionErrorCode } from './types'

/**
 * O que a tela oferece depois de uma conclusao que falhou.
 *
 * - `retry`: tentar de novo com o MESMO `operation_id`. E o caso da falha de
 *   rede e do erro sem `code`: nao se sabe se o servidor concluiu, e o reenvio
 *   com a mesma chave e idempotente -- devolve a conclusao que ja existe, ou
 *   conclui agora, mas nunca conclui duas vezes (README §7).
 * - `retry-with-new-operation`: tentar de novo com um `operation_id` NOVO. Dois
 *   casos: o `operacao_reutilizada` (a chave pertence a outra operacao, e a
 *   mesma seria recusada para sempre) e o 422 (a evidencia foi recusada e nada
 *   foi gravado; a chave sai e o rascunho fica, para ser corrigido).
 * - `refresh`: nao ha o que repetir. A missao ja estava concluida ou nao existe
 *   mais, e a acao util e recarregar o quadro para ver o estado de verdade.
 */
export type CompletionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'

export interface CompletionFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: CompletionRecovery
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo.
 *
 * `Record<MissionErrorCode, ...>` e o que faz um code novo em
 * `MissionErrorCode` reprovar o `tsc` ate ganhar mensagem e acao aqui. A
 * alternativa -- `Partial` com fallback -- deixaria o code novo cair na
 * mensagem generica sem que ninguem decidisse se era isso mesmo.
 */
const FAILURE_BY_CODE: Record<MissionErrorCode, CompletionFailure> = {
  missao_nao_encontrada: {
    message: 'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
    recovery: 'refresh',
  },
  transicao_ilegal: {
    message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
    recovery: 'refresh',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
  // "prazo", e nao "dia" -- a janela da especial e de DOIS dias (README),
  // entao "o dia desta missão" seria falso para ela.
  missao_expirada: {
    message:
      'O prazo desta missão já terminou e ela não pode mais ser concluída. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
}

const UNCONFIRMED_LEAD: FailureLead = {
  action: 'concluir a missão',
  fallback: 'Não foi possível confirmar a conclusão.',
}
const RETRY_IS_SAFE = 'Tentar de novo é seguro: a missão não será concluída duas vezes.'

/**
 * A falha sem `code` conhecido: rede fora, prazo, 5xx, code de um backend mais
 * novo (o 404 sem `code` e o 422 tem mapeamento proprio, em
 * `describeCompletionFailure`). Nao se sabe se a conclusao aconteceu: a
 * abertura diz a causa quando ela e de transporte (`leadFor`), e o fim diz a
 * unica coisa certa -- que repetir nao duplica.
 */
function unconfirmed(error: unknown): CompletionFailure {
  return { message: `${leadFor(error, UNCONFIRMED_LEAD)} ${RETRY_IS_SAFE}`, recovery: 'retry' }
}

/**
 * O 422: o servidor leu o pedido e recusou a evidencia (texto vazio depois do
 * recorte, link fora do formato, acima do limite). Nada foi gravado, e repetir
 * o MESMO pedido daria o mesmo 422 para sempre: dizer "tente de novo e seguro"
 * prenderia a pessoa num laco. A chave sai (`retry-with-new-operation`
 * nao a retem) e o rascunho fica, editavel, para ser corrigido (E17).
 *
 * Todo 422 sem `code` conhecido vale como evidencia recusada: o `operation_id`
 * e gerado pelo cliente (um UUID), entao nunca e ele o campo invalido -- o que o
 * servidor pode recusar com 422 e a evidencia.
 */
const EVIDENCE_REJECTED: CompletionFailure = {
  message: 'A evidência não foi aceita. Revise o texto e o link.',
  recovery: 'retry-with-new-operation',
}

/**
 * Se `code` e um dos codes que este mapa traduz.
 *
 * `Object.hasOwn`, e nao `code in FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo, e diria sim para `toString` ou `constructor` -- a tela leria uma
 * funcao herdada como se fosse a traducao.
 */
function isMissionErrorCode(code: string): code is MissionErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao da tela para uma conclusao que falhou.
 *
 * Decide pelo `code`, e so por ele. A `message` do `ApiError` e tecnica ("O
 * servidor respondeu 409.") e nao entra aqui; o `detail` do backend nem chega
 * ao `ApiError`.
 */
export function describeCompletionFailure(error: unknown): CompletionFailure {
  if (error instanceof ApiError && error.code !== null && isMissionErrorCode(error.code)) {
    return FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code` nao e o da missao (esse traz `missao_nao_encontrada`):
  // e rota ausente ou deploy desencontrado. Repetir nao adianta e a mensagem de
  // "tentar de novo e seguro" seria promessa vazia; recarregar mostra a verdade.
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return FAILURE_BY_CODE.missao_nao_encontrada
  }
  if (error instanceof ApiError && error.status === 422) {
    return EVIDENCE_REJECTED
  }
  return unconfirmed(error)
}
