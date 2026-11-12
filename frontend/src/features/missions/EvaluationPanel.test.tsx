import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithI18n } from '../../test/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeAudio, memoryStorage, type FakeAudio } from '../../test/audioDoubles'
import { flushPendingEffects } from '../../test/flushEffects'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import { en } from '../../shared/i18n/messages/en'
import type { EvaluationSummary, Mission } from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import { EvaluationPanel } from './EvaluationPanel'
import type { EvaluationResult } from './types'

const KEY = 'POST /api/missions/7/evaluation'
const ROTULO = 'Avaliação da Kairya — interpretação do modelo, não verificação automática'

const concluida: Mission = {
  id: 7,
  instructions: 'Resolver a lista 3',
  completion_criterion: 'Dez exercicios corrigidos',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-09-30T13:00:00Z',
  state: 'concluida',
  availability: 'concluida',
  started_at: null,
  completed_at: '2026-09-28T12:00:00Z',
  xp: 220,
  actual_duration_minutes: null,
  verification: 'autodeclarada',
  evidence: null,
  evaluation: null,
  reschedules: [],
}

const comEvidencia: Mission = {
  ...concluida,
  verification: 'com_evidencia',
  evidence: { text: 'Resolvi os 10 exercicios do capitulo 3.', link: 'https://github.com/x/y' },
}

const avaliacao = (ajustes: Partial<EvaluationSummary> = {}): EvaluationSummary => ({
  state: 'concluida',
  verdict: 'atende',
  feedback: 'Os dez exercicios cobrem o criterio.',
  error_code: null,
  model: 'modelo-x',
  finished_at: '2026-09-28T12:05:00Z',
  ...ajustes,
})

const bonus: Reward = {
  xp_awarded: 110,
  xp_total: 1450,
  level_before: 5,
  level_after: 5,
  achievements_unlocked: [],
}

function botaoPedir() {
  return screen.getByRole('button', { name: 'Pedir avaliação da Kairya' })
}

describe('EvaluationPanel -- o que a missao concluida mostra', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('autodeclarada: selo "Autodeclarada" e NENHUM botao de avaliacao', () => {
    const fetchMock = routeFetch({})

    renderWithI18n(<EvaluationPanel mission={concluida} />)

    const painel = screen.getByTestId('evaluation-panel')
    expect(within(painel).getByTestId('evaluation-verification')).toHaveTextContent('Autodeclarada')
    expect(within(painel).queryByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem verification (API anterior ao E) nao mostra painel nenhum', () => {
    routeFetch({})

    renderWithI18n(<EvaluationPanel mission={{ ...concluida, verification: null }} />)

    expect(screen.queryByTestId('evaluation-panel')).not.toBeInTheDocument()
  })

  it('com evidencia e sem avaliacao: selo, texto, link em aba nova e o botao', () => {
    routeFetch({})

    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    expect(screen.getByTestId('evaluation-verification')).toHaveTextContent('Com evidência')
    expect(screen.getByTestId('evaluation-evidence-text')).toHaveTextContent(
      'Resolvi os 10 exercicios do capitulo 3.',
    )
    const ancora = within(screen.getByTestId('evaluation-evidence-link')).getByRole('link')
    expect(ancora).toHaveAttribute('href', 'https://github.com/x/y')
    expect(ancora).toHaveAttribute('target', '_blank')
    expect(ancora).toHaveAttribute('rel', 'noopener noreferrer')
    expect(ancora).toHaveTextContent('https://github.com/x/y')
    expect(botaoPedir()).toBeEnabled()
    // A regiao viva existe desde o primeiro render, vazia (P4 do D).
    const status = screen.getByTestId('evaluation-status')
    expect(status).toHaveAttribute('role', 'status')
    expect(within(status).getByTestId('evaluation-status-text')).toBeEmptyDOMElement()
  })

  it('link em maiusculas (EM2) tambem vira ancora', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{ ...comEvidencia, evidence: { text: 'Fiz', link: 'HTTPS://x.dev/a' } }}
      />,
    )

    expect(screen.getByRole('link')).toHaveAttribute('href', 'HTTPS://x.dev/a')
  })

  it('link fora de http(s) (API defasada) aparece como texto, SEM ancora', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{ ...comEvidencia, evidence: { text: 'Fiz', link: 'javascript:alert(1)' } }}
      />,
    )

    expect(screen.getByTestId('evaluation-evidence-link')).toHaveTextContent('javascript:alert(1)')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it.each([
    ['data: com HTML', 'data:text/html,<script>alert(1)</script>'],
    ['DATA: em maiusculas', 'DATA:text/html;base64,PHNjcmlwdD4='],
    ['esquema-relativo //evil.com', '//evil.com/x'],
    ['JAVASCRIPT: em maiusculas', 'JAVASCRIPT:alert(1)'],
    ['https sem barras', 'https:evil.com'],
    ['http com espaco na frente', ' http://x.dev'],
  ])('link %s (API defasada) aparece como texto, SEM ancora', (_nome, link) => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel mission={{ ...comEvidencia, evidence: { text: 'Fiz', link } }} />,
    )

    expect(screen.getByTestId('evaluation-evidence-link')).toHaveTextContent(link.trim())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(document.querySelector('a[href]')).toBeNull()
  })

  it('evidencia sem link nao mostra linha de link', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel mission={{ ...comEvidencia, evidence: { text: 'Fiz', link: null } }} />,
    )

    expect(screen.queryByTestId('evaluation-evidence-link')).not.toBeInTheDocument()
  })
})

describe('EvaluationPanel -- pedir a avaliacao', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicar anuncia "A Kairya está avaliando…" e desabilita; atende com reward mostra tudo', async () => {
    let release: (r: Response) => void = () => undefined
    const fetchMock = routeFetch({
      [KEY]: () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    const onRewarded = vi.fn()
    renderWithI18n(<EvaluationPanel mission={comEvidencia} onRewarded={onRewarded} />)
    const status = screen.getByTestId('evaluation-status')

    fireEvent.click(botaoPedir())

    expect(within(status).getByTestId('evaluation-status-text')).toHaveTextContent(
      'A Kairya está avaliando…',
    )
    expect(botaoPedir()).toBeDisabled()
    fireEvent.click(botaoPedir())
    expect(requestsTo(fetchMock, KEY)).toHaveLength(1)

    const resultado: EvaluationResult = { evaluation: avaliacao(), reward: bonus }
    await act(async () => {
      release(Response.json(resultado))
      await Promise.resolve()
    })

    const veredito = await screen.findByTestId('evaluation-verdict')
    expect(veredito).toHaveTextContent('Critério atendido')
    expect(veredito.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('evaluation-feedback')).toHaveTextContent(
      'Os dez exercicios cobrem o criterio.',
    )
    expect(screen.getByTestId('evaluation-label')).toHaveTextContent(ROTULO)
    // O anuncio do bonus e o MESMO elemento de regiao viva de antes do clique.
    expect(screen.getByTestId('evaluation-status')).toBe(status)
    const painel = screen.getByTestId('evaluation-panel')
    expect(within(status).getByTestId('reward-xp')).toHaveTextContent('+110 XP de bônus')
    expect(painel).toContainElement(within(status).getByTestId('reward'))
    expect(within(status).getByTestId('evaluation-status-text')).toHaveTextContent(
      'Avaliação concluída: Critério atendido.',
    )
    expect(onRewarded).toHaveBeenCalledTimes(1)
    // Avaliacao concluida e para sempre (E8): nada a pedir de novo.
    expect(within(painel).queryByRole('button')).not.toBeInTheDocument()
    // O numero do bonus so vem na resposta; o texto do "ja creditado" e o da
    // leitura depois de recarregar.
    expect(screen.queryByTestId('evaluation-bonus-credited')).not.toBeInTheDocument()
  })

  it.each([
    ['parcial', 'Atendido em parte'],
    ['nao_atende', 'Critério não atendido'],
  ] as const)('%s mostra "%s", sem bonus', async (verdict, texto) => {
    routeFetch({
      [KEY]: () => Response.json({ evaluation: avaliacao({ verdict }), reward: null }),
    })
    const onRewarded = vi.fn()
    renderWithI18n(<EvaluationPanel mission={comEvidencia} onRewarded={onRewarded} />)

    fireEvent.click(botaoPedir())

    const veredito = await screen.findByTestId('evaluation-verdict')
    expect(veredito).toHaveTextContent(texto)
    expect(veredito.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('evaluation-verdict')).toHaveAttribute('data-verdict', verdict)
    expect(screen.getByTestId('evaluation-label')).toHaveTextContent(ROTULO)
    expect(screen.queryByTestId('reward')).not.toBeInTheDocument()
    expect(screen.queryByTestId('evaluation-bonus-credited')).not.toBeInTheDocument()
    expect(onRewarded).not.toHaveBeenCalled()
  })

  it('falha 503: a mensagem "fora do ar", e o botao continua HABILITADO (E18)', async () => {
    // E18: o botao fica sempre habilitado; o 503 vira mensagem. Desabilitar
    // mataria o botao ate remontar o cartao, mesmo com a chave configurada
    // depois.
    const fetchMock = routeFetch({
      [KEY]: (_init, call) =>
        call === 1
          ? Response.json({ detail: 'x', code: 'provedor_nao_configurado' }, { status: 503 })
          : Response.json({ evaluation: avaliacao(), reward: null }),
    })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    fireEvent.click(botaoPedir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Kairya está fora do ar: falta configurar o provedor.',
    )
    expect(botaoPedir()).toBeEnabled()
    expect(screen.getByTestId('evaluation-status-text')).toBeEmptyDOMElement()

    // O dono configurou a chave: o mesmo botao pede de novo e funciona.
    fireEvent.click(botaoPedir())

    expect(await screen.findByTestId('evaluation-verdict')).toHaveTextContent('Critério atendido')
    expect(requestsTo(fetchMock, KEY)).toHaveLength(2)
  })

  it.each([
    ['sem a chave reward', { evaluation: avaliacao() }],
    ['com reward null', { evaluation: avaliacao(), reward: null }],
  ])('resposta %s mostra o veredito e nao derruba o cartao', async (_nome, corpo) => {
    const onRewarded = vi.fn()
    routeFetch({ [KEY]: () => Response.json(corpo) })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} onRewarded={onRewarded} />)

    fireEvent.click(botaoPedir())

    expect(await screen.findByTestId('evaluation-verdict')).toHaveTextContent('Critério atendido')
    expect(screen.queryByTestId('reward')).not.toBeInTheDocument()
    expect(onRewarded).not.toHaveBeenCalled()
  })

  it('falha 422: o id fora da faixa e missao inexistente, entao manda atualizar, sem "tente de novo"', async () => {
    routeFetch({ [KEY]: () => Response.json({ detail: [{ msg: 'x' }] }, { status: 422 }) })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    fireEvent.click(botaoPedir())

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Esta missão não está mais disponível. Atualize para ver o estado atual.',
    )
    expect(alerta).not.toHaveTextContent(/tente de novo|tentar de novo/i)
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pedir avaliação da Kairya' }),
    ).not.toBeInTheDocument()
  })

  it('falha 502: a mensagem e "Tentar de novo", que pede de novo', async () => {
    const fetchMock = routeFetch({
      [KEY]: (_init, call) =>
        call === 1
          ? Response.json({ detail: 'x', code: 'provedor_indisponivel' }, { status: 502 })
          : Response.json({ evaluation: avaliacao(), reward: null }),
    })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    fireEvent.click(botaoPedir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Kairya não conseguiu avaliar agora. Tente de novo.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByTestId('evaluation-verdict')).toHaveTextContent('Critério atendido')
    expect(requestsTo(fetchMock, KEY)).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falha que pede atualizar (sem_evidencia): a mensagem, e nenhum botao para repetir', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: 'x', code: 'sem_evidencia' }, { status: 409 }),
    })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    fireEvent.click(botaoPedir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta missão não tem evidência para a Kairya avaliar.',
    )
    expect(
      within(screen.getByTestId('evaluation-panel')).queryByRole('button'),
    ).not.toBeInTheDocument()
  })
})

describe('EvaluationPanel -- acessibilidade e recuperacao da falha', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falha refresh com onReload: oferece o botao de recarga, que chama onReload', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: 'x', code: 'missao_nao_encontrada' }, { status: 404 }),
    })
    const onReload = vi.fn()
    renderWithI18n(
      <EvaluationPanel
        mission={comEvidencia}
        onReload={onReload}
        reloadLabel="missions.reload.board"
      />,
    )

    fireEvent.click(botaoPedir())

    const atualizar = await screen.findByRole('button', {
      name: `Atualizar o quadro a missão: ${comEvidencia.instructions}`,
    })
    expect(
      screen.queryByRole('button', { name: 'Pedir avaliação da Kairya' }),
    ).not.toBeInTheDocument()
    fireEvent.click(atualizar)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('com uma conclusao em voo (reloadWaiting), o botao de recarga fica desabilitado e diz a espera', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: 'x', code: 'missao_nao_encontrada' }, { status: 404 }),
    })
    const onReload = vi.fn()
    renderWithI18n(
      <EvaluationPanel
        mission={comEvidencia}
        onReload={onReload}
        reloadLabel="missions.reload.board"
        reloadWaiting
      />,
    )

    fireEvent.click(botaoPedir())

    const espera = await screen.findByTestId('evaluation-reload')
    expect(espera).toBeDisabled()
    expect(espera).toHaveTextContent('Aguardando o pedido em andamento…')
    expect(espera).toHaveAccessibleName(
      `Aguardando o pedido em andamento… a missão: ${comEvidencia.instructions}`,
    )
    expect(espera).not.toHaveTextContent('Atualizar o quadro')
    fireEvent.click(espera)
    expect(onReload).not.toHaveBeenCalled()
  })

  it('o botao de recarga nao aparece fora da falha refresh', () => {
    routeFetch({})

    renderWithI18n(<EvaluationPanel mission={comEvidencia} onReload={() => undefined} />)

    expect(screen.queryByRole('button', { name: /^Atualizar o quadro/ })).not.toBeInTheDocument()
  })

  it('resposta fresca atende com reward null (idempotente): diz que o bonus ja foi creditado', async () => {
    routeFetch({ [KEY]: () => Response.json({ evaluation: avaliacao(), reward: null }) })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />)

    fireEvent.click(botaoPedir())

    expect(await screen.findByTestId('evaluation-bonus-credited')).toHaveTextContent(
      'Bônus de XP creditado ao seu saldo.',
    )
    expect(screen.queryByTestId('reward')).not.toBeInTheDocument()
  })

  it('o botao de pedir mantem o nome exato e ganha a missao como descricao', () => {
    routeFetch({})

    renderWithI18n(
      <>
        <h3 id="titulo-7">Resolver a lista 3</h3>
        <EvaluationPanel mission={comEvidencia} describedBy="titulo-7" />
      </>,
    )

    expect(botaoPedir()).toHaveAccessibleDescription('Resolver a lista 3')
  })
})

describe('EvaluationPanel -- a avaliacao que vem da API (a pagina recarregou)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('concluida com atende: veredito, comentario, rotulo e "Bônus de XP creditado" sem numero', () => {
    routeFetch({})

    renderWithI18n(<EvaluationPanel mission={{ ...comEvidencia, evaluation: avaliacao() }} />)

    expect(screen.getByTestId('evaluation-verdict')).toHaveTextContent('Critério atendido')
    expect(screen.getByTestId('evaluation-feedback')).toHaveTextContent(
      'Os dez exercicios cobrem o criterio.',
    )
    expect(screen.getByTestId('evaluation-label')).toHaveTextContent(ROTULO)
    const credito = screen.getByTestId('evaluation-bonus-credited')
    expect(credito).toHaveTextContent('Bônus de XP creditado ao seu saldo.')
    // EM1: o resumo nao traz o valor do bonus, e a tela nao inventa um.
    expect(screen.getByTestId('evaluation-panel')).not.toHaveTextContent(/\d+\s*XP/)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('evaluation-status-text')).toBeEmptyDOMElement()
  })

  it('concluida com parcial: sem o texto do bonus', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{ ...comEvidencia, evaluation: avaliacao({ verdict: 'parcial' }) }}
      />,
    )

    expect(screen.getByTestId('evaluation-verdict')).toHaveTextContent('Atendido em parte')
    expect(screen.getByTestId('evaluation-label')).toHaveTextContent(ROTULO)
    expect(screen.queryByTestId('evaluation-bonus-credited')).not.toBeInTheDocument()
  })

  it('concluida sem veredito (contrato violado) nao quebra e deixa pedir de novo', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel mission={{ ...comEvidencia, evaluation: avaliacao({ verdict: null }) }} />,
    )

    expect(screen.queryByTestId('evaluation-verdict')).not.toBeInTheDocument()
    expect(botaoPedir()).toBeEnabled()
  })

  it('avaliando: "Avaliação em andamento" e o botao de pedir de novo HABILITADO', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{
          ...comEvidencia,
          evaluation: avaliacao({ state: 'avaliando', verdict: null, feedback: null }),
        }}
      />,
    )

    expect(screen.getByTestId('evaluation-in-progress')).toHaveTextContent('Avaliação em andamento')
    expect(botaoPedir()).toBeEnabled()
    expect(screen.queryByTestId('evaluation-verdict')).not.toBeInTheDocument()
  })

  it('falhou: a mensagem do error_code pelo mesmo mapa, e o botao', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{
          ...comEvidencia,
          evaluation: avaliacao({
            state: 'falhou',
            verdict: null,
            feedback: null,
            error_code: 'tempo_esgotado',
          }),
        }}
      />,
    )

    expect(screen.getByTestId('evaluation-error')).toHaveTextContent(
      'A avaliação demorou demais. Tente de novo.',
    )
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled()
    expect(screen.queryByTestId('evaluation-verdict')).not.toBeInTheDocument()
  })

  it('falhou LIDA da API nao e um alert: cada cartao gritaria ao carregar a pagina', () => {
    routeFetch({})

    renderWithI18n(
      <EvaluationPanel
        mission={{
          ...comEvidencia,
          evaluation: avaliacao({
            state: 'falhou',
            verdict: null,
            feedback: null,
            error_code: 'tempo_esgotado',
          }),
        }}
      />,
    )

    expect(screen.getByTestId('evaluation-error')).toHaveTextContent(
      'A avaliação demorou demais. Tente de novo.',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a falha FRESCA do pedido continua sendo um alert', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: 'x', code: 'tempo_esgotado' }, { status: 504 }),
    })
    renderWithI18n(
      <EvaluationPanel
        mission={{
          ...comEvidencia,
          evaluation: avaliacao({ state: 'falhou', verdict: null, error_code: 'tempo_esgotado' }),
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A avaliação demorou demais. Tente de novo.',
    )
  })

  it('a resposta do pedido substitui a avaliacao falhada que veio da API', async () => {
    routeFetch({
      [KEY]: () =>
        Response.json({ evaluation: avaliacao({ verdict: 'nao_atende' }), reward: null }),
    })
    renderWithI18n(
      <EvaluationPanel
        mission={{
          ...comEvidencia,
          evaluation: avaliacao({ state: 'falhou', verdict: null, error_code: 'x' }),
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => {
      expect(screen.getByTestId('evaluation-verdict')).toHaveTextContent('Critério não atendido')
    })
    expect(screen.queryByTestId('evaluation-error')).not.toBeInTheDocument()
  })
})

describe('EvaluationPanel -- em en', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('autodeclarada: o selo sai do catalogo ingles', () => {
    routeFetch({})
    renderWithI18n(<EvaluationPanel mission={concluida} />, { locale: 'en' })

    expect(screen.getByTestId('evaluation-verification')).toHaveTextContent(
      en['missions.evaluation.verification.selfDeclared'],
    )
  })

  it('avaliacao gravada: selo, veredito, rotulo do modelo, link e bonus em ingles', () => {
    routeFetch({})
    renderWithI18n(<EvaluationPanel mission={{ ...comEvidencia, evaluation: avaliacao() }} />, {
      locale: 'en',
    })

    expect(screen.getByTestId('evaluation-verification')).toHaveTextContent(
      en['missions.evaluation.verification.withEvidence'],
    )
    expect(screen.getByTestId('evaluation-verdict')).toHaveTextContent(
      en['missions.evaluation.verdict.meets'],
    )
    expect(screen.getByTestId('evaluation-label')).toHaveTextContent(
      en['missions.evaluation.modelLabel'],
    )
    expect(screen.getByTestId('evaluation-evidence-link')).toHaveTextContent(
      `Link: ${comEvidencia.evidence?.link ?? ''} (opens in a new tab)`,
    )
    expect(screen.getByTestId('evaluation-bonus-credited')).toHaveTextContent(
      en['missions.evaluation.bonusCredited'],
    )
  })

  it.each([
    ['parcial', 'missions.evaluation.verdict.partial'],
    ['nao_atende', 'missions.evaluation.verdict.notMet'],
  ] as const)('o veredito %s sai em ingles', (verdict, chave) => {
    routeFetch({})
    renderWithI18n(
      <EvaluationPanel mission={{ ...comEvidencia, evaluation: avaliacao({ verdict }) }} />,
      { locale: 'en' },
    )

    expect(screen.getByTestId('evaluation-verdict')).toHaveTextContent(en[chave])
  })

  it('em andamento: o aviso e o botao de pedir em ingles', () => {
    routeFetch({})
    renderWithI18n(
      <EvaluationPanel
        mission={{ ...comEvidencia, evaluation: avaliacao({ state: 'avaliando' }) }}
      />,
      { locale: 'en' },
    )

    expect(screen.getByTestId('evaluation-in-progress')).toHaveTextContent(
      en['missions.evaluation.inProgress'],
    )
    expect(
      screen.getByRole('button', { name: en['missions.evaluation.request'] }),
    ).toBeInTheDocument()
  })

  it('pedir: o anuncio de espera, o "Try again" da falha e o anuncio do veredito em ingles', async () => {
    let release: (r: Response) => void = () => undefined
    routeFetch({
      [KEY]: (_init, call) =>
        call === 1
          ? Response.json({ detail: 'x', code: 'provedor_indisponivel' }, { status: 502 })
          : new Promise<Response>((resolve) => {
              release = resolve
            }),
    })
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />, { locale: 'en' })

    fireEvent.click(screen.getByRole('button', { name: en['missions.evaluation.request'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['missions.action.retry'] }))

    expect(screen.getByTestId('evaluation-status-text')).toHaveTextContent(
      en['missions.evaluation.requesting'],
    )
    await act(async () => {
      release(Response.json({ evaluation: avaliacao(), reward: null }))
      await Promise.resolve()
    })
    expect(await screen.findByTestId('evaluation-verdict')).toBeInTheDocument()
    expect(screen.getByTestId('evaluation-status-text')).toHaveTextContent(
      'Evaluation complete: Criterion met.',
    )
  })

  it('falha refresh: o botao de recarga diz o rotulo e a missao em ingles', async () => {
    routeFetch({
      [KEY]: () => Response.json({ detail: 'x', code: 'missao_nao_encontrada' }, { status: 404 }),
    })
    renderWithI18n(
      <EvaluationPanel
        mission={comEvidencia}
        onReload={vi.fn()}
        reloadLabel="missions.reload.board"
      />,
      { locale: 'en' },
    )

    fireEvent.click(screen.getByRole('button', { name: en['missions.evaluation.request'] }))

    expect(
      await screen.findByRole('button', {
        name: `Refresh the board (mission: ${comEvidencia.instructions})`,
      }),
    ).toBeInTheDocument()
  })
})

describe('EvaluationPanel -- o efeito da avaliacao', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Pede a avaliacao com o som ligado e devolve os efeitos tocados. */
  async function evaluateWith(result: EvaluationResult): Promise<(string | undefined)[]> {
    routeFetch({ [KEY]: () => Response.json(result) })
    const elements: FakeAudio[] = []
    renderWithI18n(<EvaluationPanel mission={comEvidencia} />, {
      audio: {
        storage: memoryStorage({
          'kairyaquest.sound': '{"voice":true,"sfx":true}',
          'kairyaquest.soundInvite': '1',
        }),
        createElement: () => {
          const element = fakeAudio()
          elements.push(element)
          return element
        },
      },
    })
    fireEvent.click(botaoPedir())
    await screen.findByTestId('evaluation-verdict')
    // "Não cria elemento" é ausência: descarregue os efeitos pendentes antes de ler.
    flushPendingEffects()
    return elements.flatMap((element) =>
      element.play.mock.calls.map(() => /\/audio\/sfx\/(\w+)\.mp3$/.exec(element.src)?.[1]),
    )
  }

  it('atende com reward toca xp_tick', async () => {
    expect(await evaluateWith({ evaluation: avaliacao(), reward: bonus })).toEqual(['xp_tick'])
  })

  it('atende com nivel novo toca level_up', async () => {
    const reward = { ...bonus, level_after: 6 }
    expect(await evaluateWith({ evaluation: avaliacao(), reward })).toEqual(['level_up'])
  })

  it('o turntable do bonus com nivel novo fica fora da regiao viva; o texto, dentro', async () => {
    await evaluateWith({ evaluation: avaliacao(), reward: { ...bonus, level_after: 6 } })

    const status = screen.getByTestId('evaluation-status')
    expect(within(status).getByTestId('reward-level-up')).toBeInTheDocument()
    const turntable = screen.getByTestId('kairya-turntable-placeholder')
    expect(status).not.toContainElement(turntable)
  })

  it.each(['parcial', 'nao_atende'] as const)('%s nao cria elemento de efeito', async (verdict) => {
    expect(await evaluateWith({ evaluation: avaliacao({ verdict }), reward: null })).toEqual([])
  })
})
