import { ApiError } from '../../shared/api/client'
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
 */
export type MessageRecovery = 'retry' | 'retry-with-new-id' | 'edit' | 'unavailable'

export interface MessageFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: MessageRecovery
  /**
   * O parcial que chegou antes da falha NAO fica na conversa. So a recusa
   * (pendencia 120): a orientacao da API e descartar o texto que veio antes
   * dela, e o backend o grava vazio.
   */
  discardsPartial?: true
}

/**
 * O resultado desconhecido: o stream acabou sem `done` nem `error`, a conexao
 * caiu no meio, ou a falha nao tem `code` conhecido. Nao se sabe se a resposta
 * chegou; o que se sabe e que repetir nao duplica.
 */
export const UNKNOWN_RESULT: MessageFailure = {
  message:
    'Não deu para saber se a resposta chegou inteira. Tentar de novo é seguro: a pergunta não será duplicada.',
  recovery: 'retry',
}

/** Exaustivo sobre o tipo: um code novo reprova o `tsc` ate ganhar texto e acao. */
const PRE_STREAM: Record<PreStreamErrorCode, MessageFailure> = {
  provedor_nao_configurado: {
    message: 'A Kairya está fora do ar: falta configurar o provedor.',
    recovery: 'unavailable',
  },
  mensagem_em_andamento: {
    message:
      'A Kairya ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.',
    recovery: 'retry',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta pergunta. Tente de novo.',
    recovery: 'retry-with-new-id',
  },
}

const IN_STREAM: Record<StreamErrorCode, MessageFailure> = {
  provedor_indisponivel: {
    message:
      'A Kairya não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.',
    recovery: 'retry',
  },
  tempo_esgotado: {
    message:
      'A resposta da Kairya demorou demais. Tentar de novo é seguro: a pergunta não será duplicada.',
    recovery: 'retry',
  },
  proposta_invalida: {
    message:
      'A Kairya tentou propor uma missão que não passou na validação. Tente de novo ou peça de outro jeito.',
    recovery: 'retry',
  },
  // Repetir e permitido (o classificador pode ter errado), mas o texto nao
  // promete que vai dar certo: o caminho provavel e perguntar de outro jeito.
  resposta_recusada: {
    message:
      'A Kairya não pôde responder a esta pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
    recovery: 'retry',
    discardsPartial: true,
  },
}

const REJECTED_BODY: MessageFailure = {
  message: 'A pergunta não foi aceita. Confira o texto e envie de novo.',
  recovery: 'edit',
}

/**
 * `Object.hasOwn`, e nao `in`: o `in` percorre o prototipo e diria sim para
 * `toString` (mesma razao de `completionFailure.ts`).
 */
function isPreStreamCode(code: string): code is PreStreamErrorCode {
  return Object.hasOwn(PRE_STREAM, code)
}

function isStreamCode(code: string): code is StreamErrorCode {
  return Object.hasOwn(IN_STREAM, code)
}

/** A falha de um envio que nem abriu o stream: nada foi gravado. */
export function describePreStreamFailure(error: unknown): MessageFailure {
  if (!(error instanceof ApiError)) {
    return UNKNOWN_RESULT
  }
  if (error.code !== null && isPreStreamCode(error.code)) {
    return PRE_STREAM[error.code]
  }
  return error.status === 422 && error.code === null ? REJECTED_BODY : UNKNOWN_RESULT
}

/**
 * A falha que chegou no evento `error`, JA encerrada pelo backend (`falhou`,
 * ou `interrompida` se recolhida como orfa, que emite `tempo_esgotado`).
 */
export function describeStreamFailure(code: string): MessageFailure {
  return isStreamCode(code) ? IN_STREAM[code] : UNKNOWN_RESULT
}
