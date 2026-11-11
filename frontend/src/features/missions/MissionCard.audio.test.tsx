import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mission, MissionType } from '../../shared/types/mission'
import type { MissionCompletion, Reward } from '../../shared/types/reward'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { useKairya } from '../kairya'
import { MissionList } from './MissionList'

const SOUND_ON = {
  'kairyaquest.sound': '{"voice":true,"sfx":true}',
  'kairyaquest.soundInvite': '1',
}

const pendente: Mission = {
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

const SEM_BONUS: Reward = {
  xp_awarded: 220,
  xp_total: 1340,
  level_before: 4,
  level_after: 4,
  achievements_unlocked: [],
}
const NIVEL: Reward = { ...SEM_BONUS, level_after: 5 }
const CONQUISTA: Reward = {
  ...SEM_BONUS,
  achievements_unlocked: [{ code: 'first', title: 'Primeira', description: 'A primeira.' }],
}
const NIVEL_E_CONQUISTA: Reward = { ...CONQUISTA, level_after: 5 }

function rig() {
  const elements: FakeAudio[] = []
  return {
    elements,
    audio: {
      storage: memoryStorage(SOUND_ON),
      createElement: () => {
        const element = fakeAudio()
        elements.push(element)
        return element
      },
    },
    /** Os efeitos tocados, em ordem. */
    played: () =>
      elements.flatMap((element) =>
        element.play.mock.calls.map(() => /\/audio\/sfx\/(\w+)\.mp3$/.exec(element.src)?.[1]),
      ),
  }
}

function Thinker() {
  const { dispatch } = useKairya()
  return (
    <button
      type="button"
      data-testid="make-thinking"
      onClick={() => {
        dispatch({ type: 'questionSent' })
      }}
    />
  )
}

async function completeWith(
  type: MissionType,
  reward: Reward,
  options: { thinking?: boolean; audio?: ReturnType<typeof rig>['audio'] } = {},
) {
  const mission: Mission = { ...pendente, mission_type: type }
  const done: MissionCompletion = { ...mission, state: 'concluida', reward }
  routeFetch({
    'GET /api/missions': () => Response.json([mission]),
    'POST /api/missions/7/complete': () => Response.json(done),
  })
  const mounted = rig()
  renderWithI18n(
    <>
      <Thinker />
      <MissionList />
    </>,
    { audio: options.audio ?? mounted.audio },
  )
  if (options.thinking === true) fireEvent.click(screen.getByTestId('make-thinking'))
  fireEvent.click(await screen.findByTestId('mission-complete'))
  await screen.findByText('Missão concluída.')
  await act(async () => Promise.resolve())
  return mounted
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MissionCard -- o efeito da conclusao', () => {
  it.each([
    ['diaria', SEM_BONUS, 'lantern_lit'],
    ['avulsa', SEM_BONUS, 'mission_done'],
    ['avulsa', NIVEL, 'level_up'],
    ['avulsa', CONQUISTA, 'achievement'],
  ] as const)('%s concluida (%#) toca %s', async (type, reward, expected) => {
    const { played } = await completeWith(type, reward)
    expect(played()).toEqual([expected])
  })

  it('nivel e conquista juntos tocam um unico efeito', async () => {
    const { played } = await completeWith('avulsa', NIVEL_E_CONQUISTA)
    expect(played()).toEqual(['level_up'])
  })

  it('com a Kairya pensando (celebracao ignorada) o efeito toca igual', async () => {
    const { played } = await completeWith('avulsa', SEM_BONUS, { thinking: true })
    expect(played()).toEqual(['mission_done'])
  })

  it('com o som desligado nenhum elemento de audio nasce', async () => {
    const elements: FakeAudio[] = []
    await completeWith('avulsa', NIVEL, {
      audio: {
        storage: memoryStorage({ 'kairyaquest.soundInvite': '1' }),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    })
    expect(elements).toHaveLength(0)
  })
})
