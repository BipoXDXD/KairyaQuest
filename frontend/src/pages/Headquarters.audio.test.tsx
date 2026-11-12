import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageRead } from '../features/tutoring'
import type { Mission } from '../shared/types/mission'
import type { MissionCompletion } from '../shared/types/reward'
import { fakeAudio, memoryStorage, type FakeAudio } from '../test/audioDoubles'
import { routeFetch } from '../test/fetchRoutes'
import { flushPendingEffects } from '../test/flushEffects'
import { renderWithI18n } from '../test/i18n'
import { sseFrame, streamResponse } from '../test/sse'
import { stubViewport } from '../test/viewport'
import { Headquarters } from './Headquarters'

const avulsa: Mission = {
  id: 21,
  instructions: 'Resolver 5 exercicios de recursao',
  completion_criterion: 'Cinco exercicios corrigidos',
  difficulty: 2,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-24T00:00:00-03:00',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 80,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

const completion: MissionCompletion = {
  ...avulsa,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-09-24T10:00:00Z',
  verification: 'autodeclarada',
  reward: {
    xp_awarded: 80,
    xp_total: 100,
    level_before: 1,
    level_after: 2,
    achievements_unlocked: [],
  },
}

const pergunta: MessageRead = {
  id: 10,
  role: 'user',
  content: 'Oi',
  status: 'completa',
  client_message_id: 'c1',
  reply_to_id: null,
  error_code: null,
  fallback_model: null,
  created_at: '2026-09-22T12:00:00Z',
  actions: [],
}
const resposta: MessageRead = {
  ...pergunta,
  id: 11,
  role: 'tutor',
  content: 'Oi!',
  client_message_id: null,
  reply_to_id: 10,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Headquarters -- a jornada com o som desligado', () => {
  it('concluir a missao e mandar uma pergunta nao cria nenhum elemento de audio', async () => {
    stubViewport('desktop')
    routeFetch({
      'GET /api/cycle': () =>
        Response.json({
          today: '2026-09-23',
          mission: null,
          streak: 0,
          days_to_milestone: 7,
          special: null,
          late_daily: null,
        }),
      'GET /api/missions': () => Response.json([avulsa]),
      'GET /api/tutoring/status': () => Response.json({ available: true }),
      'GET /api/tutoring/messages': () => Response.json([]),
      'GET /api/progress': () =>
        Response.json({
          xp_total: 20,
          level: 1,
          level_floor_xp: 0,
          next_level_xp: 100,
          achievements: [],
        }),
      'POST /api/missions/21/complete': () => Response.json(completion),
      'POST /api/tutoring/messages': () =>
        streamResponse([sseFrame('user_message', pergunta), sseFrame('done', resposta)]),
    })
    const elements: FakeAudio[] = []
    renderWithI18n(<Headquarters />, {
      audio: {
        storage: memoryStorage({ 'kairyaquest.soundInvite': '1' }),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    })
    await screen.findByTestId('missions-list')
    await screen.findByTestId('progress-level')

    fireEvent.click(
      await screen.findByRole('button', { name: `Concluir a missão: ${avulsa.instructions}` }),
    )
    await screen.findByText('Missão concluída.')

    const field = screen.getByLabelText('Sua mensagem para a Kairya')
    await waitFor(() => {
      expect(field).toBeEnabled()
    })
    fireEvent.change(field, { target: { value: 'Oi' } })
    fireEvent.click(screen.getByTestId('tutor-send'))
    await screen.findByText('Oi!')
    // Ausência não se espera: o efeito da última resposta pode estar pendente,
    // e "nenhum elemento" passaria vazio. Descarregue-os antes de afirmar.
    flushPendingEffects()

    expect(elements).toHaveLength(0)
  })
})
