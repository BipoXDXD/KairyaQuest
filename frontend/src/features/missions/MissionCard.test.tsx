import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { routeFetch } from '../../test/fetchRoutes'
import type { Mission, MissionState, MissionType } from '../../shared/types/mission'
import type { MissionCompletion } from '../../shared/types/reward'
import { MissionList } from './MissionList'

// O cartão é exercitado pelo quadro, que é quem detém o registro das
// conclusões: montar o `MissionCard` sozinho exigiria refazer esse harness.
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

function concluida(mission: Mission): MissionCompletion {
  return {
    ...mission,
    state: 'concluida',
    availability: 'concluida',
    completed_at: '2026-09-19T13:10:00Z',
    reward: {
      xp_awarded: 100,
      xp_total: 100,
      level_before: 1,
      level_after: 1,
      achievements_unlocked: [],
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function concluirUma(missionType: MissionType): Promise<HTMLElement> {
  const listada = { ...missao, mission_type: missionType }
  routeFetch({
    'GET /api/missions': () => Response.json([listada]),
    'POST /api/missions/7/complete': () => Response.json(concluida(listada)),
  })
  renderWithI18n(<MissionList />)
  fireEvent.click(await screen.findByTestId('mission-complete'))
  return screen.findByTestId('reward')
}

describe('MissionCard -- a lanterna da diária', () => {
  it('concluir a diária acende a lanterna ao lado do anúncio', async () => {
    const reward = await concluirUma('diaria')

    expect(within(reward).getByTestId('reward-xp')).toHaveTextContent('+100 XP')
    expect(within(reward).getByTestId('reward-lantern')).toHaveAttribute('data-lit', 'true')
  })

  it.each<MissionType>(['avulsa', 'especial'])(
    'concluir uma missão %s anuncia sem lanterna',
    async (missionType) => {
      const reward = await concluirUma(missionType)

      expect(within(reward).getByTestId('reward-xp')).toHaveTextContent('+100 XP')
      expect(within(reward).queryByTestId('reward-lantern')).not.toBeInTheDocument()
    },
  )
})

describe('MissionCard -- o estado da missão', () => {
  it.each<[MissionState, string, string]>([
    ['pendente', 'neutral', 'Pendente'],
    ['em_andamento', 'action', 'Em andamento'],
    ['concluida', 'success', 'Concluída'],
  ])('o estado %s é um Badge %s com o texto do catálogo', async (state, tone, label) => {
    routeFetch({ 'GET /api/missions': () => Response.json([{ ...missao, state }]) })
    renderWithI18n(<MissionList />)

    const badge = await screen.findByTestId('mission-state')
    expect(badge).toHaveAttribute('data-tone', tone)
    expect(badge).toHaveTextContent(label)
  })

  it('o título longo quebra em qualquer ponto, sem empurrar a largura do cartão', async () => {
    routeFetch({
      'GET /api/missions': () => Response.json([{ ...missao, instructions: 'A'.repeat(120) }]),
    })
    renderWithI18n(<MissionList />)

    expect(await screen.findByTestId('mission-item')).toHaveClass('min-w-0', 'wrap-anywhere')
  })
})
