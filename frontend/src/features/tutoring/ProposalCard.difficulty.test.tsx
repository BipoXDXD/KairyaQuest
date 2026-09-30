import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProposalCard } from './ProposalCard'
import type { ActionRead } from './types'
import type { ActionKeys } from './useActionKeys'

// O teto da dificuldade vira 7 SO neste arquivo. Se o cartao escrevesse o "de 5"
// a mao, o texto continuaria "de 5" e o teste reprovaria: a prova de que o
// numero vem de `MAX_DIFFICULTY` e o 7 aparecer na tela.
vi.mock('../../shared/types/mission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/types/mission')>()),
  MAX_DIFFICULTY: 7,
}))

const proposta: ActionRead = {
  id: 5,
  kind: 'create_mission',
  state: 'proposta',
  payload: {
    instructions: 'Estudar grafos por 40 minutos',
    completion_criterion: 'Resumo de uma pagina',
    difficulty: 2,
    estimated_minutes: 40,
    deadline: '2027-02-15T21:00:00-03:00',
  },
  mission_id: null,
  error_code: null,
}

const chaves: ActionKeys = {
  operationIdFor: () => 'chave-fixa',
  release: () => undefined,
}

describe('ProposalCard -- o teto da dificuldade', () => {
  it('escreve o teto de MAX_DIFFICULTY, e nao um numero fixo', () => {
    render(
      <ProposalCard
        action={proposta}
        keys={chaves}
        onChanged={() => undefined}
        onMissionCreated={() => undefined}
        onRefresh={() => undefined}
        boardHref="#missions-heading"
      />,
    )

    expect(screen.getByTestId('proposal-difficulty')).toHaveTextContent('2 de 7')
  })
})
