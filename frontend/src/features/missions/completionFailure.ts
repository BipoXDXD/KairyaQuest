import { ApiError } from '../../shared/api/client'
import { leadFor } from '../../shared/api/transportFailure'
import type { FailureText } from '../../shared/i18n/failureText'
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
export type CompletionAction = 'retry' | 'retry-with-new-operation' | 'refresh'

/**
 * O texto (chaves do catalogo; nunca o `detail` do backend) e a acao: o texto
 * diz o que fazer, a `action` decide o botao.
 */
export type CompletionFailure = FailureText & { action: CompletionAction }

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo. Exportada so
 * para o teste conferir as chaves de todos os codes no catalogo.
 *
 * `Record<MissionErrorCode, ...>` e o que faz um code novo em
 * `MissionErrorCode` reprovar o `tsc` ate ganhar mensagem e acao aqui. A
 * alternativa -- `Partial` com fallback -- deixaria o code novo cair na
 * mensagem generica sem que ninguem decidisse se era isso mesmo.
 */
export const COMPLETION_FAILURE_BY_CODE: Readonly<Record<MissionErrorCode, CompletionFailure>> = {
  missao_nao_encontrada: {
    message: 'missions.completionFailure.notFound.message',
    recovery: 'missions.completionFailure.notFound.recovery',
    action: 'refresh',
  },
  transicao_ilegal: {
    message: 'missions.completionFailure.alreadyCompleted.message',
    recovery: 'missions.completionFailure.alreadyCompleted.recovery',
    action: 'refresh',
  },
  operacao_reutilizada: {
    message: 'missions.failure.reusedOperation',
    recovery: 'missions.failure.tryAgain',
    action: 'retry-with-new-operation',
  },
  // "prazo", e nao "dia" -- a janela da especial e de DOIS dias (README),
  // entao "o dia desta missão" seria falso para ela.
  missao_expirada: {
    message: 'missions.completionFailure.expired.message',
    recovery: 'missions.failure.refresh',
    action: 'refresh',
  },
}

/**
 * A falha sem `code` conhecido: rede fora, prazo, 5xx, code de um backend mais
 * novo (o 404 sem `code` e o 422 tem mapeamento proprio, em
 * `describeCompletionFailure`). Nao se sabe se a conclusao aconteceu: a
 * abertura diz a causa quando ela e de transporte (`leadFor`), e o fim diz a
 * unica coisa certa -- que repetir nao duplica.
 */
function unconfirmed(error: unknown): CompletionFailure {
  return {
    message: leadFor(error, 'missions.completionFailure.unconfirmed.message'),
    recovery: 'missions.completionFailure.unconfirmed.recovery',
    action: 'retry',
  }
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
  message: 'missions.completionFailure.evidenceRejected.message',
  recovery: 'missions.completionFailure.evidenceRejected.recovery',
  action: 'retry-with-new-operation',
}

/**
 * Se `code` e um dos codes que este mapa traduz.
 *
 * `Object.hasOwn`, e nao `code in COMPLETION_FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo, e diria sim para `toString` ou `constructor` -- a tela leria uma
 * funcao herdada como se fosse a traducao.
 */
function isMissionErrorCode(code: string): code is MissionErrorCode {
  return Object.hasOwn(COMPLETION_FAILURE_BY_CODE, code)
}

/**
 * O texto e a acao da tela para uma conclusao que falhou.
 *
 * Decide pelo `code`, e so por ele. A `message` do `ApiError` e tecnica ("O
 * servidor respondeu 409.") e nao entra aqui; o `detail` do backend nem chega
 * ao `ApiError`.
 */
export function describeCompletionFailure(error: unknown): CompletionFailure {
  if (error instanceof ApiError && error.code !== null && isMissionErrorCode(error.code)) {
    return COMPLETION_FAILURE_BY_CODE[error.code]
  }
  // Um 404 SEM `code` nao e o da missao (esse traz `missao_nao_encontrada`):
  // e rota ausente ou deploy desencontrado. Repetir nao adianta e a mensagem de
  // "tentar de novo e seguro" seria promessa vazia; recarregar mostra a verdade.
  if (error instanceof ApiError && error.status === 404 && error.code === null) {
    return COMPLETION_FAILURE_BY_CODE.missao_nao_encontrada
  }
  if (error instanceof ApiError && error.status === 422) {
    return EVIDENCE_REJECTED
  }
  return unconfirmed(error)
}
