import { ApiError } from '../../shared/api/client'
import type { EvaluationErrorCode } from './types'

/**
 * O que a tela oferece depois de um pedido de avaliacao que falhou.
 *
 * - `retry`: tentar de novo. Repetir e seguro -- o bonus nunca e concedido
 *   duas vezes.
 * - `refresh`: nao ha o que repetir; a missao mudou ou sumiu, e a acao util e
 *   recarregar para ver o estado de verdade.
 * - `unavailable`: repetir provavelmente nao adianta agora (provedor sem
 *   configuracao, evidencia recusada); a tela so informa, e o botao continua
 *   habilitado (E18): quem corrigiu a causa nao precisa recarregar.
 */
export type EvaluationRecovery = 'retry' | 'refresh' | 'unavailable'

export interface EvaluationFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: EvaluationRecovery
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo: um code novo em
 * `EvaluationErrorCode` reprova o `tsc` ate ganhar mensagem e acao aqui.
 */
const FAILURE_BY_CODE: Record<EvaluationErrorCode, EvaluationFailure> = {
  sem_evidencia: {
    message: 'Esta missão não tem evidência para a Tifa avaliar. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
  avaliacao_em_andamento: {
    message: 'A Tifa já está avaliando esta entrega. Tente de novo em instantes.',
    recovery: 'retry',
  },
  provedor_nao_configurado: {
    message: 'A Tifa está fora do ar: falta configurar o provedor.',
    recovery: 'unavailable',
  },
  provedor_indisponivel: {
    message: 'A Tifa não conseguiu avaliar agora. Tente de novo.',
    recovery: 'retry',
  },
  tempo_esgotado: {
    message: 'A avaliação demorou demais. Tente de novo.',
    recovery: 'retry',
  },
  avaliacao_invalida: {
    message: 'A Tifa respondeu fora da rubrica. Tente de novo.',
    recovery: 'retry',
  },
  missao_nao_encontrada: {
    message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
}

/** Rede fora, 5xx, `code` de um backend mais novo: repetir e seguro. */
const GENERIC: EvaluationFailure = {
  message:
    'Não foi possível pedir a avaliação. Tentar de novo é seguro: o bônus nunca é concedido duas vezes.',
  recovery: 'retry',
}

/**
 * O 422: o servidor recusou a evidencia gravada. Repetir o pedido nao a muda e
 * daria o mesmo 422, entao nao ha "tentar de novo" (`unavailable`: a tela so
 * informa), ao contrario da mensagem generica (achado S-I2).
 */
const EVIDENCE_REJECTED: EvaluationFailure = {
  message: 'A evidência não foi aceita. Revise o texto e o link.',
  recovery: 'unavailable',
}

/**
 * `Object.hasOwn`, e nao `code in FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo e diria sim para `toString` ou `constructor`.
 */
function isEvaluationErrorCode(code: string): code is EvaluationErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao para um `code` cru: o de um erro HTTP ou o `error_code`
 * de uma avaliacao `falhou` que veio na leitura da missao (a pagina
 * recarregou). Um mapa so para os dois caminhos: a mensagem nao depende de a
 * pessoa ter visto a falha ao vivo ou depois.
 */
export function describeEvaluationErrorCode(code: string | null): EvaluationFailure {
  return knownFailure(code) ?? GENERIC
}

/** A traducao do `code`, ou `null` se ele e nulo ou desconhecido. */
function knownFailure(code: string | null): EvaluationFailure | null {
  return code !== null && isEvaluationErrorCode(code) ? FAILURE_BY_CODE[code] : null
}

/** A mensagem e a acao da tela para um pedido de avaliacao que falhou. */
export function describeEvaluationFailure(error: unknown): EvaluationFailure {
  if (!(error instanceof ApiError)) {
    return GENERIC
  }
  const known = knownFailure(error.code)
  if (known !== null) {
    return known
  }
  return error.status === 422 ? EVIDENCE_REJECTED : GENERIC
}
