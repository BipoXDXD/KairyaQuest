import type { Mission } from '../../src/shared/types/mission'
import type { MissionCompletion } from '../../src/shared/types/reward'

/**
 * As missões que o `GET /api/missions` interceptado devolve aos casos do
 * quadro na galeria (`ui-states.spec.ts`). Uma por estado visual do cartão;
 * os ids não se repetem, porque o quadro usa o id como `key`.
 */

const BASE: Mission = {
  id: 0,
  instructions: 'Ler o capítulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma página entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-11-20T13:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  // Dificuldade 3 vale 80 XP no back (`xp_para_dificuldade`).
  xp: 80,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

export const PENDENTE: Mission = { ...BASE, id: 41 }

export const EM_ANDAMENTO: Mission = {
  ...BASE,
  id: 42,
  instructions: 'Resolver a lista de recorrências',
  state: 'em_andamento',
  started_at: '2026-11-14T12:00:00Z',
}

const CONCLUIDA_COM_EVIDENCIA: Mission = {
  ...BASE,
  instructions: 'Revisar as anotações de grafos',
  state: 'concluida',
  availability: 'concluida',
  started_at: '2026-11-13T12:00:00Z',
  completed_at: '2026-11-13T13:00:00Z',
  actual_duration_minutes: 60,
  verification: 'com_evidencia',
  evidence: { text: 'Resumo das anotações, com os exemplos refeitos.', link: null },
}

export const AVALIADA: Mission = {
  ...CONCLUIDA_COM_EVIDENCIA,
  id: 43,
  evaluation: {
    state: 'concluida',
    verdict: 'atende',
    feedback: 'O resumo cobre o critério.',
    error_code: null,
    model: 'modelo-falso',
    finished_at: '2026-11-13T13:05:00Z',
  },
}

export const AVALIACAO_FALHOU: Mission = {
  ...CONCLUIDA_COM_EVIDENCIA,
  id: 44,
  instructions: 'Refazer os exercícios de árvores',
  evaluation: {
    state: 'falhou',
    verdict: null,
    feedback: null,
    error_code: 'provedor_indisponivel',
    model: 'modelo-falso',
    finished_at: '2026-11-13T13:05:00Z',
  },
}

/** A resposta do Concluir da `EM_ANDAMENTO`, com XP e subida de nível. */
export const CONCLUSAO_COM_RECOMPENSA: MissionCompletion = {
  ...EM_ANDAMENTO,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-11-14T13:00:00Z',
  actual_duration_minutes: 60,
  verification: 'autodeclarada',
  reward: {
    xp_awarded: 80,
    // 20 antes + 80: o saldo de 100 cruza o piso do nível 2 (`nivel_do_saldo`).
    xp_total: 100,
    level_before: 1,
    level_after: 2,
    achievements_unlocked: [],
  },
}
