import { ApiError } from '../../shared/api/client'
import { leadFor } from '../../shared/api/transportFailure'
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
    message:
      'Esta missão não tem evidência para a Kairya avaliar. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
  avaliacao_em_andamento: {
    message: 'A Kairya já está avaliando esta entrega. Tente de novo em instantes.',
    recovery: 'retry',
  },
  provedor_nao_configurado: {
    message: 'A Kairya está fora do ar: falta configurar o provedor.',
    recovery: 'unavailable',
  },
  provedor_indisponivel: {
    message: 'A Kairya não conseguiu avaliar agora. Tente de novo.',
    recovery: 'retry',
  },
  tempo_esgotado: {
    message: 'A avaliação demorou demais. Tente de novo.',
    recovery: 'retry',
  },
  avaliacao_invalida: {
    message: 'A Kairya respondeu fora da rubrica. Tente de novo.',
    recovery: 'retry',
  },
  missao_nao_encontrada: {
    message: 'Esta missão não está mais disponível. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
}

const GENERIC_LEAD = 'Não foi possível pedir a avaliação.'
const RETRY_IS_SAFE = 'Tentar de novo é seguro: o bônus nunca é concedido duas vezes.'

/**
 * Rede fora, prazo, 5xx, `code` de um backend mais novo: repetir e seguro. A
 * abertura recebida diz a causa quando ela e conhecida.
 */
function generic(lead: string): EvaluationFailure {
  return { message: `${lead} ${RETRY_IS_SAFE}`, recovery: 'retry' }
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
  // O `code` gravado nao carrega falha de transporte: a abertura e a generica.
  return knownFailure(code) ?? generic(GENERIC_LEAD)
}

/** A traducao do `code`, ou `null` se ele e nulo ou desconhecido. */
function knownFailure(code: string | null): EvaluationFailure | null {
  return code !== null && isEvaluationErrorCode(code) ? FAILURE_BY_CODE[code] : null
}

/** A mensagem e a acao da tela para um pedido de avaliacao que falhou. */
export function describeEvaluationFailure(error: unknown): EvaluationFailure {
  if (!(error instanceof ApiError)) {
    return generic(GENERIC_LEAD)
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
    return FAILURE_BY_CODE.missao_nao_encontrada
  }
  return generic(leadFor(error, GENERIC_LEAD))
}
