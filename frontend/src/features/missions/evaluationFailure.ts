import { ApiError } from '../../shared/api/client'
import { type FailureLead, leadFor } from '../../shared/api/transportFailure'
import type { MessageKey } from '../../shared/i18n/catalog'
import type { FailureText } from '../../shared/i18n/failureText'
import type { EvaluationErrorCode } from './types'

/**
 * O que a tela oferece depois de um pedido de avaliacao que falhou.
 *
 * - `retry`: tentar de novo. Repetir e seguro -- o bonus nunca e concedido
 *   duas vezes.
 * - `refresh`: nao ha o que repetir; a missao mudou ou sumiu, e a acao util e
 *   recarregar para ver o estado de verdade.
 * - `unavailable`: repetir provavelmente nao adianta agora (provedor sem
 *   configuracao); a tela so informa, e o botao continua
 *   habilitado (E18): quem corrigiu a causa nao precisa recarregar.
 */
export type EvaluationAction = 'retry' | 'refresh' | 'unavailable'

/** O texto (chaves do catalogo) e a acao que decide o botao. */
export type EvaluationFailure = FailureText & { action: EvaluationAction }

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo: um code novo em
 * `EvaluationErrorCode` reprova o `tsc` ate ganhar texto e acao aqui. Exportada
 * so para o teste conferir as chaves no catalogo.
 */
export const EVALUATION_FAILURE_BY_CODE: Readonly<Record<EvaluationErrorCode, EvaluationFailure>> =
  {
    sem_evidencia: {
      message: 'missions.evaluationFailure.noEvidence.message',
      recovery: 'missions.failure.refresh',
      action: 'refresh',
    },
    avaliacao_em_andamento: {
      message: 'missions.evaluationFailure.inProgress.message',
      recovery: 'missions.evaluationFailure.inProgress.recovery',
      action: 'retry',
    },
    provedor_nao_configurado: {
      message: 'missions.evaluationFailure.providerNotConfigured.message',
      recovery: 'missions.evaluationFailure.providerNotConfigured.recovery',
      action: 'unavailable',
    },
    provedor_indisponivel: {
      message: 'missions.evaluationFailure.providerUnavailable.message',
      recovery: 'missions.failure.tryAgain',
      action: 'retry',
    },
    tempo_esgotado: {
      message: 'missions.evaluationFailure.timeout.message',
      recovery: 'missions.failure.tryAgain',
      action: 'retry',
    },
    avaliacao_invalida: {
      message: 'missions.evaluationFailure.invalidEvaluation.message',
      recovery: 'missions.failure.tryAgain',
      action: 'retry',
    },
    missao_nao_encontrada: {
      message: 'missions.failure.notAvailable',
      recovery: 'missions.failure.refresh',
      action: 'refresh',
    },
  }

const GENERIC_LEAD: FailureLead = {
  fallback: 'missions.evaluationFailure.generic.message',
  timeout: 'missions.evaluationFailure.generic.timeout',
  network: 'missions.evaluationFailure.generic.network',
}

/**
 * Rede fora, prazo, 5xx, `code` de um backend mais novo: repetir e seguro. A
 * abertura recebida diz a causa quando ela e conhecida.
 */
function generic(lead: MessageKey): EvaluationFailure {
  return {
    message: lead,
    recovery: 'missions.evaluationFailure.generic.recovery',
    action: 'retry',
  }
}

/**
 * `Object.hasOwn`, e nao `code in EVALUATION_FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo e diria sim para `toString` ou `constructor`.
 */
function isEvaluationErrorCode(code: string): code is EvaluationErrorCode {
  return Object.hasOwn(EVALUATION_FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao para um `code` cru: o de um erro HTTP ou o `error_code`
 * de uma avaliacao `falhou` que veio na leitura da missao (a pagina
 * recarregou). Um mapa so para os dois caminhos: a mensagem nao depende de a
 * pessoa ter visto a falha ao vivo ou depois.
 */
export function describeEvaluationErrorCode(code: string | null): EvaluationFailure {
  // O `code` gravado nao carrega falha de transporte: a abertura e a generica.
  return knownFailure(code) ?? generic(GENERIC_LEAD.fallback)
}

/** A traducao do `code`, ou `null` se ele e nulo ou desconhecido. */
function knownFailure(code: string | null): EvaluationFailure | null {
  return code !== null && isEvaluationErrorCode(code) ? EVALUATION_FAILURE_BY_CODE[code] : null
}

/** A mensagem e a acao da tela para um pedido de avaliacao que falhou. */
export function describeEvaluationFailure(error: unknown): EvaluationFailure {
  if (!(error instanceof ApiError)) {
    return generic(GENERIC_LEAD.fallback)
  }
  const known = knownFailure(error.code)
  if (known !== null) {
    return known
  }
  // Sem `code` conhecido, so dois status dizem que a missao nao esta la:
  // - 404 sem `code` (esse traz `missao_nao_encontrada`): rota ausente ou deploy
  //   desencontrado. Repetir nao adianta; recarregar mostra a verdade.
  // - 422: `POST /evaluation` nao tem corpo, entao o unico 422 possivel e o do
  //   id do caminho fora da faixa -- uma missao que nao existe. NAO e evidencia
  //   recusada (a conclusao e que tem corpo, e la o 422 e outra coisa).
  if ((error.status === 404 && error.code === null) || error.status === 422) {
    return EVALUATION_FAILURE_BY_CODE.missao_nao_encontrada
  }
  return generic(leadFor(error, GENERIC_LEAD))
}
