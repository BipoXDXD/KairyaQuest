import { ApiError } from '../../shared/api/client'
import { dailyLimitText, type FailureText } from '../../shared/i18n/failureText'
import type { PreStreamErrorCode, StreamErrorCode } from './types'

/**
 * O que a tela oferece depois de um envio que falhou.
 *
 * - `retry`: reenviar com o MESMO `client_message_id`. O backend resolve os
 *   tres casos (ja respondida, ultima resposta falhou, em andamento), e nunca
 *   duplica a pergunta (spec, "Reenvio").
 * - `retry-with-new-id`: reenviar com um id NOVO. So o `operacao_reutilizada`:
 *   o id pertence a outro conteudo, e seria recusado para sempre.
 * - `edit`: nao ha o que repetir -- o corpo foi recusado (422). O texto fica no
 *   campo para a pessoa mudar.
 * - `unavailable`: a Kairya esta fora do ar (sem chave). O painel mostra o estado
 *   indisponivel e desabilita o campo, com o texto preservado.
 * - `daily-limit`: o teto diario de conversas (chamadas a Kairya) acabou
 *   (429). O campo fica desabilitado, com o texto preservado, ate o teto
 *   voltar; repetir antes disso daria o mesmo 429.
 */
export type MessageAction = 'retry' | 'retry-with-new-id' | 'edit' | 'unavailable' | 'daily-limit'

/** O texto (chaves do catalogo) e a acao que decide o que a tela oferece. */
export type MessageFailure = FailureText & {
  action: MessageAction
  /**
   * O parcial que chegou antes da falha NAO fica na conversa. So a recusa
   * (pendencia 120): a orientacao da API e descartar o texto que veio antes
   * dela, e o backend o grava vazio.
   */
  discardsPartial?: true
}

/**
 * O resultado desconhecido: o stream acabou sem `done` nem `error`, ou a
 * conexao caiu no meio. Nao se sabe se a resposta chegou; o que se sabe e que
 * repetir nao duplica.
 */
export const UNKNOWN_RESULT: MessageFailure = {
  message: 'tutoring.messageFailure.unknownResult.message',
  recovery: 'tutoring.messageFailure.safeRetry',
  action: 'retry',
}

/**
 * O evento `error` com um `code` que a tela nao conhece (pendencia 49). O
 * servidor so o emite com a falha JA gravada, entao nao e resultado
 * desconhecido: a pergunta nao foi respondida. O texto nao inventa causa, e
 * repetir com o mesmo id segue permitido.
 */
export const UNRECOGNIZED_FAILURE: MessageFailure = {
  message: 'tutoring.messageFailure.unrecognizedFailure.message',
  recovery: 'tutoring.messageFailure.safeRetry',
  action: 'retry',
}

/**
 * Exaustivo sobre o tipo: um code novo reprova o `tsc` ate ganhar texto e acao.
 * O teto diario fica fora do mapa porque o texto depende do `Retry-After`
 * (`dailyLimitText`). Exportado so para o teste conferir as chaves no catalogo.
 */
export const PRE_STREAM_FAILURE_BY_CODE: Readonly<
  Record<Exclude<PreStreamErrorCode, 'limite_diario_da_tutoria'>, MessageFailure>
> = {
  provedor_nao_configurado: {
    message: 'tutoring.messageFailure.providerNotConfigured.message',
    recovery: 'tutoring.messageFailure.providerNotConfigured.recovery',
    action: 'unavailable',
  },
  mensagem_em_andamento: {
    message: 'tutoring.messageFailure.inProgress.message',
    recovery: 'tutoring.messageFailure.inProgress.recovery',
    action: 'retry',
  },
  operacao_reutilizada: {
    message: 'tutoring.messageFailure.reusedOperation.message',
    recovery: 'tutoring.messageFailure.tryAgain',
    action: 'retry-with-new-id',
  },
}

/** Exportado so para o teste conferir as chaves no catalogo. */
export const STREAM_FAILURE_BY_CODE: Readonly<Record<StreamErrorCode, MessageFailure>> = {
  provedor_indisponivel: {
    message: 'tutoring.messageFailure.providerUnavailable.message',
    recovery: 'tutoring.messageFailure.safeRetry',
    action: 'retry',
  },
  tempo_esgotado: {
    message: 'tutoring.messageFailure.timeout.message',
    recovery: 'tutoring.messageFailure.safeRetry',
    action: 'retry',
  },
  proposta_invalida: {
    message: 'tutoring.messageFailure.invalidProposal.message',
    recovery: 'tutoring.messageFailure.invalidProposal.recovery',
    action: 'retry',
  },
  // Repetir e permitido (o classificador pode ter errado), mas o texto nao
  // promete que vai dar certo: o caminho provavel e perguntar de outro jeito.
  resposta_recusada: {
    message: 'tutoring.messageFailure.refused.message',
    recovery: 'tutoring.messageFailure.refused.recovery',
    action: 'retry',
    discardsPartial: true,
  },
}

const REJECTED_BODY: MessageFailure = {
  message: 'tutoring.messageFailure.rejectedBody.message',
  recovery: 'tutoring.messageFailure.rejectedBody.recovery',
  action: 'edit',
}

/**
 * `Object.hasOwn`, e nao `in`: o `in` percorre o prototipo e diria sim para
 * `toString` (mesma razao de `completionFailure.ts`).
 */
function isMappedPreStreamCode(code: string): code is keyof typeof PRE_STREAM_FAILURE_BY_CODE {
  return Object.hasOwn(PRE_STREAM_FAILURE_BY_CODE, code)
}

function isStreamCode(code: string): code is StreamErrorCode {
  return Object.hasOwn(STREAM_FAILURE_BY_CODE, code)
}

/** A falha de um envio que nem abriu o stream: nada foi gravado. */
export function describePreStreamFailure(error: unknown): MessageFailure {
  if (!(error instanceof ApiError)) {
    return UNKNOWN_RESULT
  }
  if (error.code === 'limite_diario_da_tutoria') {
    return { ...dailyLimitText(error), action: 'daily-limit' }
  }
  if (error.code !== null && isMappedPreStreamCode(error.code)) {
    return PRE_STREAM_FAILURE_BY_CODE[error.code]
  }
  return error.status === 422 && error.code === null ? REJECTED_BODY : UNKNOWN_RESULT
}

/**
 * A falha que chegou no evento `error`, JA encerrada pelo backend (`falhou`,
 * ou `interrompida` se recolhida como orfa, que emite `tempo_esgotado`). Um
 * `code` desconhecido e falha generica, nunca resultado desconhecido.
 */
export function describeStreamFailure(code: string): MessageFailure {
  return isStreamCode(code) ? STREAM_FAILURE_BY_CODE[code] : UNRECOGNIZED_FAILURE
}

/**
 * O corpo do evento `error`, como veio. O backend sempre manda `code`, mas o
 * cliente nao confia nisso: sem `code` em texto (corpo nulo, objeto vazio,
 * `code` de outro tipo) vale o mesmo que um `code` desconhecido, e nunca
 * derruba o stream numa excecao que viraria resultado desconhecido.
 */
export function describeStreamErrorEvent(data: unknown): MessageFailure {
  const code = typeof data === 'object' && data !== null && 'code' in data ? data.code : null
  return typeof code === 'string' ? describeStreamFailure(code) : UNRECOGNIZED_FAILURE
}
