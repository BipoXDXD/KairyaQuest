import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audioSrc } from '../../shared/audio/audioSrc'
import { useAudio } from '../../shared/audio/useAudio'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { KairyaBubble } from '../kairya'
import { stubViewport } from '../../test/viewport'
import { PANEL_OPEN_KEY } from './panelPreference'
import { TutorPanel } from './TutorPanel'

const SOUND_ON = {
  'kairyaquest.sound': '{"voice":true,"sfx":true}',
  'kairyaquest.soundInvite': '1',
}

function VoiceStarter() {
  const { playVoice } = useAudio()
  return (
    <button
      type="button"
      data-testid="start-voice"
      onClick={() => {
        playVoice(audioSrc('/audio/voice/pt-BR/greet_morning_1.mp3'))
      }}
    />
  )
}

const PROPOSAL = {
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

const HISTORY_WITH_PROPOSAL = [
  {
    id: 1,
    role: 'user',
    content: 'Me dá uma missão',
    status: 'completa',
    client_message_id: 'c1',
    reply_to_id: null,
    error_code: null,
    fallback_model: null,
    created_at: '2026-09-22T12:00:00Z',
    actions: [],
  },
  {
    id: 2,
    role: 'tutor',
    content: 'Proponho esta missão.',
    status: 'completa',
    client_message_id: null,
    reply_to_id: 1,
    error_code: null,
    fallback_model: null,
    created_at: '2026-09-22T12:00:01Z',
    actions: [PROPOSAL],
  },
]

function mount(kind: 'desktop' | 'mobile', history: unknown[] = []) {
  routeFetch({
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json(history),
    'POST /api/tutoring/actions/5/confirm': () =>
      Response.json({
        action: { ...PROPOSAL, state: 'executada', mission_id: 40 },
        mission: { id: 40, instructions: 'x' },
      }),
  })
  stubViewport(kind)
  const elements: FakeAudio[] = []
  renderWithI18n(
    <>
      <VoiceStarter />
      <KairyaBubble />
      <TutorPanel onMissionCreated={vi.fn()} boardHref="#missions-heading" />
    </>,
    {
      audio: {
        storage: memoryStorage(SOUND_ON),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    },
  )
  const sfx = () => elements.find((element) => element.src.includes('/sfx/'))
  return {
    voice: () => elements.find((element) => !element.src.includes('/sfx/')),
    sfxSrc: () => sfx()?.src ?? null,
    sfxPlays: () => sfx()?.play.mock.calls.length ?? 0,
    startVoice: () => {
      fireEvent.click(screen.getByTestId('start-voice'))
    },
  }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('TutorPanel -- efeitos e voz', () => {
  it('no celular, abrir a folha toca panel_open e corta a voz; fechar nao a retoma', () => {
    const rig = mount('mobile')
    rig.startVoice()
    const voice = rig.voice()!
    expect(voice.play).toHaveBeenCalledTimes(1)
    const pausesBefore = voice.pause.mock.calls.length

    fireEvent.click(screen.getByTestId('tutor-sheet-open'))

    expect(rig.sfxSrc()).toMatch(/\/audio\/sfx\/panel_open\.mp3$/)
    expect(voice.pause.mock.calls.length).toBeGreaterThan(pausesBefore)

    fireEvent.click(screen.getByTestId('tutor-sheet-close'))

    expect(voice.play).toHaveBeenCalledTimes(1)
    expect(rig.sfxPlays()).toBe(1)
  })

  it('no desktop, expandir o painel recolhido toca panel_open sem cortar a voz', () => {
    localStorage.setItem(PANEL_OPEN_KEY, 'false')
    const rig = mount('desktop')
    rig.startVoice()
    const voice = rig.voice()!
    const pausesBefore = voice.pause.mock.calls.length

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))

    expect(rig.sfxSrc()).toMatch(/\/audio\/sfx\/panel_open\.mp3$/)
    expect(voice.pause.mock.calls.length).toBe(pausesBefore)
  })

  it('recolher, montar aberto e restaurar nao tocam nada', () => {
    const rig = mount('desktop')
    expect(rig.sfxPlays()).toBe(0)

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))

    expect(screen.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(rig.sfxSrc()).toBeNull()
  })

  it('no celular, aceitar a proposta com a folha aberta não pede voz, e a legenda segue no catálogo', async () => {
    const rig = mount('mobile', HISTORY_WITH_PROPOSAL)
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const card = await screen.findByTestId('tutor-proposal')

    fireEvent.click(within(card).getByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    expect(screen.getByTestId('kairya-bubble-anchor').closest('[inert]')).not.toBeNull()
    expect(screen.getByTestId('kairya-bubble-anchor')).toHaveTextContent(
      /Combinado\. Está na sua lista\.|Acordo feito\. Começa por ela quando quiser\./,
    )
    // Ausência não se espera: o efeito da bolha pode ainda estar pendente
    // aqui, e "nenhuma voz" passaria vazia. Fechar a folha re-renderiza, e
    // todo render começa descarregando os efeitos pendentes (com a legenda
    // ainda sob `inert`); só então a ausência vale, e fechar não retoma a fala.
    fireEvent.click(screen.getByTestId('tutor-sheet-close'))
    expect(rig.voice()).toBeUndefined()
  })

  it('no desktop, aceitar a proposta toca a voz da legenda visível', async () => {
    const rig = mount('desktop', HISTORY_WITH_PROPOSAL)
    const card = await screen.findByTestId('tutor-proposal')

    fireEvent.click(within(card).getByTestId('proposal-confirm'))

    await screen.findByTestId('proposal-created')
    // O `findBy` resolve quando o DOM muda; a voz toca no efeito passivo da
    // bolha, que o React descarrega depois desse commit. Esperar o efeito
    // observável (o `src`), não o DOM, evita a corrida.
    await waitFor(() => {
      expect(rig.voice()?.src).toMatch(/\/proposal_accepted_[12]\.mp3$/)
    })
    expect(rig.voice()?.play).toHaveBeenCalledTimes(1)
  })
})
