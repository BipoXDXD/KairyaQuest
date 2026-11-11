import { screen } from '@testing-library/react'
import { renderWithI18n } from '../../test/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import type { Mission } from '../../shared/types/mission'
import { MissionList } from './MissionList'

// O teto da dificuldade vira 7 SO neste arquivo. Se o cartao escrevesse o "de 5"
// a mao, o texto continuaria "de 5" e o teste reprovaria: a prova de que o
// numero vem de `MAX_DIFFICULTY` e o 7 aparecer na tela.
vi.mock('../../shared/types/mission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/types/mission')>()),
  MAX_DIFFICULTY: 7,
}))

const missao: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-20T13:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MissionCard -- o teto da dificuldade', () => {
  it('escreve o teto de MAX_DIFFICULTY, e nao um numero fixo', async () => {
    routeFetch({ 'GET /api/missions': () => Response.json([missao]) })
    renderWithI18n(<MissionList />)

    expect(await screen.findByTestId('mission-difficulty')).toHaveTextContent('3 de 7')
  })
})
