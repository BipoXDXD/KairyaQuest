import { describe, expect, it } from 'vitest'
import {
  COMPLETION_FAILURE_BY_CODE,
  EVALUATION_FAILURE_BY_CODE,
  RESCHEDULE_FAILURE_BY_CODE,
  START_FAILURE_BY_CODE,
  describeCompletionFailure,
  describeEvaluationFailure,
  describeRescheduleFailure,
  describeStartFailure,
} from '../../features/missions'
import {
  ACTION_FAILURE_BY_CODE,
  PRE_STREAM_FAILURE_BY_CODE,
  STREAM_FAILURE_BY_CODE,
  UNKNOWN_RESULT,
  describeActionFailure,
  describePreStreamFailure,
  describeStreamFailure,
  failedActionText,
} from '../../features/tutoring'
import { ApiError, ApiTimeoutError, type ApiErrorKind } from '../api/client'
import { translate } from './catalog'
import { apiErrorText, dailyLimitText, type FailureText } from './failureText'

/**
 * Toda mensagem de erro em ingles segue "[o que falhou]. [causa]. [o que
 * fazer]." em 12 a 18 palavras, contando a `message` e o `recovery` juntos,
 * como o `FailureMessage` os exibe.
 *
 * Os textos saem das funcoes publicas, alimentadas com cada `code` conhecido e
 * com as falhas sem `code` (rede, 404, 422, 500, erro que nao e `ApiError`):
 * assim entram tambem os textos de fallback que os modulos nao exportam.
 */
const MIN_WORDS = 12
const MAX_WORDS = 18

const KINDS: readonly ApiErrorKind[] = ['network', 'timeout', 'http', 'format', 'interrupted']

const UNCODED: readonly unknown[] = [
  new ApiError('x', null, null, { kind: 'network' }),
  new ApiTimeoutError(),
  new ApiError('x', 404, null),
  new ApiError('x', 422, null),
  new ApiError('x', 500, null),
  new Error('defeito'),
]

function withCodes(codes: readonly string[]): unknown[] {
  return [...codes.map((code) => new ApiError('x', 409, code)), ...UNCODED]
}

function allFailures(): FailureText[] {
  return [
    ...KINDS.map((kind) => apiErrorText(new ApiError('x', 500, null, { kind }))),
    dailyLimitText(new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: 60 })),
    dailyLimitText(new ApiError('x', 429, 'limite_diario_da_tutoria', { retryAfterSeconds: null })),
    ...withCodes(Object.keys(COMPLETION_FAILURE_BY_CODE)).map(describeCompletionFailure),
    ...withCodes(Object.keys(START_FAILURE_BY_CODE)).map(describeStartFailure),
    ...withCodes(Object.keys(RESCHEDULE_FAILURE_BY_CODE)).map(describeRescheduleFailure),
    ...withCodes(Object.keys(EVALUATION_FAILURE_BY_CODE)).map(describeEvaluationFailure),
    ...withCodes([...Object.keys(PRE_STREAM_FAILURE_BY_CODE), 'limite_diario_da_tutoria']).map(
      describePreStreamFailure,
    ),
    ...[...Object.keys(STREAM_FAILURE_BY_CODE), 'desconhecido'].map(describeStreamFailure),
    UNKNOWN_RESULT,
    ...withCodes(Object.keys(ACTION_FAILURE_BY_CODE)).flatMap((error) => [
      describeActionFailure(error, 'confirm', 'create_mission'),
      describeActionFailure(error, 'confirm', 'reschedule_mission'),
      describeActionFailure(error, 'reject', 'create_mission'),
    ]),
    ...[null, ...Object.keys(ACTION_FAILURE_BY_CODE)].map(failedActionText),
  ]
}

function englishText({ message, recovery, vars }: FailureText): string {
  return `${translate('en', message, vars)} ${translate('en', recovery)}`
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length
}

const TEXTS = [...new Set(allFailures().map(englishText))]

describe('mensagens de erro em ingles', () => {
  it.each(TEXTS)('%s', (text) => {
    expect(wordCount(text)).toBeGreaterThanOrEqual(MIN_WORDS)
    expect(wordCount(text)).toBeLessThanOrEqual(MAX_WORDS)
  })

  it('o aviso de idioma nao salvo tambem, com o nome mais curto', () => {
    const text = translate('en', 'shell.locale.saveFailed', { language: 'English' })
    expect(wordCount(text)).toBeGreaterThanOrEqual(MIN_WORDS)
    expect(wordCount(text)).toBeLessThanOrEqual(MAX_WORDS)
  })
})

describe('mensagens de erro em ingles com a frase de causa', () => {
  it.each([
    [
      describeCompletionFailure(new ApiError('x', 404, 'missao_nao_encontrada')),
      "This mission isn't on the board anymore. It may have been removed. Refresh to see the current missions.",
    ],
    [
      UNKNOWN_RESULT,
      "Couldn't tell whether Kairya's answer arrived. The reply was cut off. Retrying is safe: your question won't repeat.",
    ],
    [
      describeStreamFailure('desconhecido'),
      "Kairya couldn't answer this question. The reply wasn't completed. Retrying is safe: your question won't repeat.",
    ],
    [
      describeStreamFailure('resposta_recusada'),
      "Kairya couldn't answer this question. Its content was declined. Ask it a different way.",
    ],
  ])('%#', (failure, expected) => {
    expect(englishText(failure)).toBe(expected)
  })
})

/**
 * Em portugues, o contrato de 12 a 18 palavras vale para os textos de falha de
 * transporte (rede fora, prazo esgotado), que o ingles ja cumpria: "[a acao que
 * falhou]: [a causa]. [o que fazer]." Os demais textos em portugues ainda nao
 * sao medidos.
 */
const TRANSPORT_FAILURES: readonly unknown[] = [
  new ApiError('x', null, null, { kind: 'network' }),
  new ApiTimeoutError(),
]

function transportTexts(): FailureText[] {
  return TRANSPORT_FAILURES.flatMap((error) => [
    describeCompletionFailure(error),
    describeStartFailure(error),
    describeRescheduleFailure(error),
    describeEvaluationFailure(error),
    describeActionFailure(error, 'confirm', 'create_mission'),
    describeActionFailure(error, 'confirm', 'reschedule_mission'),
    describeActionFailure(error, 'reject', 'create_mission'),
  ])
}

function portugueseText({ message, recovery }: FailureText): string {
  return `${translate('pt-BR', message)} ${translate('pt-BR', recovery)}`
}

const TRANSPORT_TEXTS_PT = [...new Set(transportTexts().map(portugueseText))]

describe('mensagens de falha de transporte em portugues', () => {
  it('cobre as sete acoes nas duas causas', () => {
    expect(TRANSPORT_TEXTS_PT).toHaveLength(14)
  })

  it.each(TRANSPORT_TEXTS_PT)('%s', (text) => {
    expect(wordCount(text)).toBeGreaterThanOrEqual(MIN_WORDS)
    expect(wordCount(text)).toBeLessThanOrEqual(MAX_WORDS)
  })

  it.each(TRANSPORT_TEXTS_PT)(
    'abre com a acao e fecha com "Tentar de novo é seguro": %s',
    (text) => {
      expect(text).toMatch(/^Não foi possível .+: .+\. Tentar de novo é seguro/)
    },
  )
})
