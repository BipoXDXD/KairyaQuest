import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../shared/i18n/messages/en'
import { formatDeadline } from '../../shared/lib/deadline'
import type { Mission } from '../../shared/types/mission'
import type { MissionCompletion } from '../../shared/types/reward'
import { routeFetch } from '../../test/fetchRoutes'
import { HTTP_FAILURE_TEXT, renderWithI18n } from '../../test/i18n'
import { MAX_EVIDENCE_LENGTH } from './evidenceLimit'
import { MissionList } from './MissionList'

/**
 * O quadro e o cartao em ingles. Os casos em pt-BR moram em
 * `MissionList.test.tsx`; aqui, um por texto que muda de idioma, lido do
 * catalogo `en` (ou escrito a mao quando junta chave e dado).
 */

const pendente: Mission = {
  id: 7,
  instructions: 'Read chapter 3',
  completion_criterion: 'One-page summary',
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

const iniciada: Mission = {
  ...pendente,
  state: 'em_andamento',
  started_at: '2026-09-19T14:30:00Z',
}

const concluida: MissionCompletion = {
  ...iniciada,
  state: 'concluida',
  availability: 'concluida',
  completed_at: '2026-09-19T15:00:00Z',
  actual_duration_minutes: 30,
  verification: 'autodeclarada',
  reward: {
    xp_awarded: 100,
    xp_total: 100,
    level_before: 1,
    level_after: 1,
    achievements_unlocked: [],
  },
}

const nome = (rotulo: string) => `${rotulo} (mission: ${pendente.instructions})`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MissionList em en -- os estados do quadro', () => {
  it('carregando: o titulo e o aviso de carga', () => {
    routeFetch({ 'GET /api/missions': () => new Promise<Response>(() => {}) })
    renderWithI18n(<MissionList />, { locale: 'en' })

    expect(screen.getByRole('heading', { name: en['missions.list.title'] })).toBeInTheDocument()
    expect(screen.getByTestId('missions-loading')).toHaveTextContent(en['missions.list.loading'])
  })

  it('vazio: o convite em ingles', async () => {
    routeFetch({ 'GET /api/missions': () => Response.json([]) })
    renderWithI18n(<MissionList />, { locale: 'en' })

    expect(await screen.findByTestId('missions-empty')).toHaveTextContent(en['missions.list.empty'])
  })

  it('falha de API: titulo, texto do catalogo e botao em ingles', async () => {
    routeFetch({ 'GET /api/missions': () => new Response(null, { status: 500 }) })
    renderWithI18n(<MissionList />, { locale: 'en' })

    const erro = await screen.findByTestId('missions-error')
    expect(erro).toHaveTextContent(en['missions.list.loadFailed'])
    expect(erro).toHaveTextContent(HTTP_FAILURE_TEXT.en)
    expect(within(erro).getByRole('button')).toHaveTextContent(en['missions.action.retryLoad'])
  })

  it('falha inesperada: o texto do catalogo ingles', async () => {
    routeFetch({ 'GET /api/missions': () => new Response('not json') })
    renderWithI18n(<MissionList />, { locale: 'en' })

    expect(await screen.findByTestId('missions-error')).toHaveTextContent(
      en['missions.list.unexpectedFailure'],
    )
  })
})

describe('MissionCard em en', () => {
  it('os campos, o prazo e os botoes saem em ingles', async () => {
    routeFetch({ 'GET /api/missions': () => Response.json([pendente]) })
    renderWithI18n(<MissionList />, { locale: 'en' })
    await screen.findByTestId('missions-list')

    expect(screen.getByTestId('mission-completion-criterion')).toHaveTextContent(
      'Completion criterion: One-page summary',
    )
    expect(screen.getByText(en['missions.card.deadline'])).toBeInTheDocument()
    // O literal, e nao `formatDeadline(..., 'en')`: o valor esperado nao sai da
    // funcao testada. 13:00Z sao 10:00 em Sao Paulo, no relogio de 12 h do en.
    expect(screen.getByTestId('mission-deadline')).toHaveTextContent(/09\/20\/2026.*10:00\sAM/)
    expect(screen.getByText(en['missions.card.difficulty'])).toBeInTheDocument()
    expect(screen.getByTestId('mission-difficulty')).toHaveTextContent('3 of 5')
    expect(screen.getByText(en['missions.card.estimate'])).toBeInTheDocument()
    expect(screen.getByTestId('mission-estimated-minutes')).toHaveTextContent('45 min')
    expect(screen.getByText(en['missions.card.reward'])).toBeInTheDocument()
    expect(screen.getByTestId('mission-xp')).toHaveTextContent('100 XP')
    expect(screen.getByRole('button', { name: nome('Start') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: nome('Complete') })).toBeInTheDocument()
  })

  it('iniciar e concluir: os anuncios, o "Started on" e a duracao real em ingles', async () => {
    routeFetch({
      'GET /api/missions': () => Response.json([pendente]),
      'POST /api/missions/7/start': () => Response.json(iniciada),
      'POST /api/missions/7/complete': () => Response.json(concluida),
    })
    renderWithI18n(<MissionList />, { locale: 'en' })

    fireEvent.click(await screen.findByRole('button', { name: nome('Start') }))

    expect(await screen.findByText(en['missions.card.startedStatus'])).toBeInTheDocument()
    expect(screen.getByTestId('mission-started-at')).toHaveTextContent(
      `Started on ${formatDeadline(iniciada.started_at ?? '', 'en')}`,
    )

    fireEvent.click(screen.getByRole('button', { name: nome('Complete') }))

    expect(await screen.findByText(en['missions.card.completedStatus'])).toBeInTheDocument()
    expect(screen.getByText(en['missions.card.actualDuration'])).toBeInTheDocument()
    expect(screen.getByTestId('mission-actual-duration')).toHaveTextContent('30 min')
  })

  it('o motivo do Concluir bloqueado, em cada caso, em ingles', async () => {
    routeFetch({ 'GET /api/missions': () => Response.json([pendente]) })
    renderWithI18n(<MissionList />, { locale: 'en' })
    fireEvent.click(await screen.findByRole('button', { name: en['missions.evidence.toggle'] }))
    const link = screen.getByLabelText(en['missions.evidence.linkLabel'])
    const texto = screen.getByLabelText(en['missions.evidence.textLabel'])
    const motivo = () => screen.getByTestId('mission-complete-blocked')

    fireEvent.change(link, { target: { value: 'x' } })
    expect(motivo()).toHaveTextContent(
      `Fix the evidence link to complete. ${en['missions.evidence.linkError.format']}`,
    )

    fireEvent.change(link, { target: { value: 'https://x.dev' } })
    expect(motivo()).toHaveTextContent(en['missions.card.blocked.textMissing'])

    fireEvent.change(texto, { target: { value: 'a'.repeat(MAX_EVIDENCE_LENGTH + 1) } })
    expect(motivo()).toHaveTextContent(
      'Shorten the evidence text to complete: the limit is 4000 characters.',
    )
  })

  it('reagendar: o anuncio do novo prazo em ingles', async () => {
    routeFetch({
      'GET /api/missions': () => Response.json([pendente]),
      'POST /api/missions/7/reschedule': () =>
        Response.json({ ...pendente, deadline: '2026-09-22T13:00:00Z' }),
    })
    renderWithI18n(<MissionList />, { locale: 'en' })
    fireEvent.click(await screen.findByRole('button', { name: en['missions.reschedule.toggle'] }))
    fireEvent.change(screen.getByLabelText(en['missions.reschedule.deadlineLabel']), {
      target: { value: '2026-09-22T10:00' },
    })
    fireEvent.click(screen.getByTestId('reschedule-reason-dificuldade'))

    fireEvent.click(screen.getByRole('button', { name: en['missions.reschedule.submit'] }))

    expect(await screen.findByText(en['missions.card.rescheduledStatus'])).toBeInTheDocument()
  })
})
