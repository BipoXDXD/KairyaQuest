import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Locale } from '../../shared/i18n/locale'
import { translate } from '../../shared/i18n/catalog'
import { en } from '../../shared/i18n/messages/en'
import { renderWithI18n } from '../../test/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch, type Route } from '../../test/fetchRoutes'
import { controlledStream, sseFrame, streamResponse } from '../../test/sse'
import { stubViewport } from '../../test/viewport'
import { KairyaBubble, useKairya } from '../kairya'
import { PANEL_OPEN_KEY } from './panelPreference'
import { describeQuestionLength } from './questionLimit'
import { TutorConversation } from './TutorConversation'
import { TutorPanel } from './TutorPanel'
import type { ActionRead, MessageRead } from './types'
import type { UseTutorConversationResult } from './useTutorConversation'

const STATUS = 'GET /api/tutoring/status'
const HISTORY = 'GET /api/tutoring/messages'
const SEND = 'POST /api/tutoring/messages'

const INPUT_LABEL = 'Sua mensagem para a Kairya'
const GREETING =
  'Aqui você conversa com a Kairya, sua tutora. Peça uma missão de estudo ou tire uma dúvida.'
const HISTORY_RETRY_NOTE =
  'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.'
const LONG_NOTE =
  'A última resposta ficou longa demais e foi cortada. Tente pedir por partes, um tópico de cada vez. Tentar de novo refaz a mesma pergunta e pode cortar outra vez.'
// Os `error_code` escritos a mao, como o backend os grava (pendencia 32).
const LONG = 'resposta_longa'
const REFUSED = 'resposta_recusada'

const question = (id: number, content: string, cmid: string): MessageRead => ({
  id,
  role: 'user',
  content,
  status: 'completa',
  client_message_id: cmid,
  reply_to_id: null,
  error_code: null,
  fallback_model: null,
  created_at: '2026-09-22T12:00:00Z',
  actions: [],
})

const answer = (
  id: number,
  replyTo: number,
  content: string,
  status: MessageRead['status'] = 'completa',
): MessageRead => ({
  id,
  role: 'tutor',
  content,
  status,
  client_message_id: null,
  reply_to_id: replyTo,
  error_code: status === 'falhou' ? 'provedor_indisponivel' : null,
  fallback_model: null,
  created_at: '2026-09-22T12:00:01Z',
  actions: [],
})

/** Uma rota que nunca responde: o recurso fica carregando. */
const PENDING: Route = () => new Promise<Response>(() => undefined)

const preStreamError =
  (status: number, body: unknown, headers: Record<string, string> = {}): Route =>
  () =>
    Response.json(body, { status, headers })

/** O 429 do teto diario como o backend manda: com os segundos ate a meia-noite. */
const DAILY_LIMIT = preStreamError(
  429,
  { code: 'limite_diario_da_tutoria' },
  { 'Retry-After': '3600' },
)

/** O endereco do quadro, que a pagina passa ao painel (a feature nao o conhece). */
const BOARD_HREF = '#missions-heading'

function mountPanel(
  routes: Record<string, Route>,
  kind: 'desktop' | 'mobile' = 'desktop',
  onMissionCreated: () => void = vi.fn(),
  locale: Locale = 'pt-BR',
) {
  const fetchMock = routeFetch({
    [STATUS]: () => Response.json({ available: true }),
    [HISTORY]: () => Response.json([]),
    ...routes,
  })
  const viewport = stubViewport(kind)
  return {
    fetchMock,
    viewport,
    ...renderWithI18n(<TutorPanel onMissionCreated={onMissionCreated} boardHref={BOARD_HREF} />, {
      locale,
    }),
  }
}

afterEach(() => {
  // P20 e P21 gravam o painel fechado: sem limpar, o proximo teste comecaria
  // com o painel recolhido e reprovaria por ordem de execucao.
  localStorage.clear()
  vi.unstubAllGlobals()
})

function input(): HTMLTextAreaElement {
  return screen.getByLabelText(INPUT_LABEL)
}

function sendButton(): HTMLButtonElement {
  return screen.getByTestId('tutor-send')
}

/** Espera o status e o historico carregarem (o campo habilita e o Enviar aceita texto). */
async function ready() {
  await waitFor(() => {
    expect(input()).toBeEnabled()
  })
  await waitFor(() => {
    expect(screen.queryByTestId('tutor-history-loading')).not.toBeInTheDocument()
  })
}

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } })
}

async function typeAndSend(text: string) {
  await ready()
  type(text)
  fireEvent.click(sendButton())
}

/** Os helpers acima, para o painel montado em `en`: o campo e achado pelo rotulo EN. */
function inputEn(): HTMLTextAreaElement {
  return screen.getByLabelText(en['tutoring.input.label'])
}

async function readyEn() {
  await waitFor(() => {
    expect(inputEn()).toBeEnabled()
  })
  await waitFor(() => {
    expect(screen.queryByTestId('tutor-history-loading')).not.toBeInTheDocument()
  })
}

function typeEn(text: string) {
  fireEvent.change(inputEn(), { target: { value: text } })
}

/** O corpo do n-esimo envio (1, 2, ...). */
function sent(fetchMock: ReturnType<typeof routeFetch>, n: number) {
  return jsonBody(requestsTo(fetchMock, SEND)[n - 1] as RequestInit) as {
    client_message_id: string
    content: string
  }
}

function messageWith(text: string): HTMLElement {
  const item = screen
    .getAllByTestId('tutor-message')
    .find((li) => within(li).queryByText(text) !== null)
  if (item === undefined) {
    throw new Error(`nenhuma mensagem com "${text}"`)
  }
  return item
}

describe('TutorPanel: estados da conversa', () => {
  it('P1 a regiao viva existe desde o primeiro render, vazia', async () => {
    mountPanel({ [HISTORY]: PENDING })

    const live = screen.getByTestId('tutor-live')
    expect(live).toHaveAttribute('role', 'status')
    expect(live.textContent).toBe('')

    // Deixa o status assentar, para o teste nao terminar no meio de um setState.
    await waitFor(() => {
      expect(input()).toBeEnabled()
    })
  })

  it('P2 carregando: esqueleto e anuncio de carregamento', async () => {
    mountPanel({ [HISTORY]: PENDING })

    expect(screen.getByTestId('tutor-history-loading')).toBeVisible()
    expect(screen.getByText('Carregando a conversa…')).toBeInTheDocument()
    await waitFor(() => {
      expect(input()).toBeEnabled()
    })
  })

  it('P2 o esqueleto so pulsa sem pedido de movimento reduzido (README §7)', async () => {
    mountPanel({ [HISTORY]: PENDING })

    // A classe e a do Tailwind: `motion-safe:` so vale sob
    // `prefers-reduced-motion: no-preference`. Um `animate-pulse` solto
    // pulsaria para quem pediu menos movimento.
    const bars = Array.from(
      screen.getByTestId('tutor-history-loading').querySelectorAll('[aria-hidden="true"]'),
    )
    expect(bars).toHaveLength(3)
    for (const bar of bars) {
      const classes = bar.className.split(/\s+/)
      expect(classes).toContain('motion-safe:animate-pulse')
      expect(classes).not.toContain('animate-pulse')
    }
    await waitFor(() => {
      expect(input()).toBeEnabled()
    })
  })

  it('P3 vazio: a saudacao da interface, e nao uma fala da Kairya', async () => {
    mountPanel({})

    expect(await screen.findByTestId('tutor-greeting')).toHaveTextContent(GREETING)
    expect(screen.queryAllByTestId('tutor-message')).toHaveLength(0)
    expect(screen.queryByTestId('tutor-messages')).not.toBeInTheDocument()
  })

  it('P4 historico: perguntas e respostas com o autor, na ordem', async () => {
    const q1 = question(1, 'Oi, Kairya', 'c1')
    const a2 = answer(2, 1, 'Oi! Bora estudar?')
    mountPanel({ [HISTORY]: () => Response.json([q1, a2]) })

    const list = await screen.findByTestId('tutor-messages')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-message-id'))).toEqual(['1', '2'])
    expect(within(items[0] as HTMLElement).getByText('Você')).toBeInTheDocument()
    expect(within(items[0] as HTMLElement).getByText('Oi, Kairya')).toBeInTheDocument()
    expect(within(items[1] as HTMLElement).getByText('Kairya')).toBeInTheDocument()
    expect(within(items[1] as HTMLElement).getByText('Oi! Bora estudar?')).toBeInTheDocument()
    expect(screen.queryByTestId('tutor-greeting')).not.toBeInTheDocument()
  })

  it('P5 marcas de interrompida, com falha e em andamento no historico', async () => {
    mountPanel({
      [HISTORY]: () =>
        Response.json([
          question(1, 'p1', 'c1'),
          answer(2, 1, 'meio', 'interrompida'),
          question(3, 'p3', 'c3'),
          answer(4, 3, 'x', 'falhou'),
          question(5, 'p5', 'c5'),
          answer(6, 5, 'y', 'gerando'),
          question(7, 'p7', 'c7'),
          answer(8, 7, 'inteira'),
        ]),
    })

    await screen.findByTestId('tutor-messages')
    expect(within(messageWith('meio')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta interrompida',
    )
    expect(within(messageWith('x')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta com falha',
    )
    expect(within(messageWith('y')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta em andamento',
    )
    expect(within(messageWith('inteira')).queryByTestId('tutor-message-mark')).toBeNull()
    expect(within(messageWith('p1')).queryByTestId('tutor-message-mark')).toBeNull()
  })

  it('P6 indisponivel pelo status: texto da spec, campo e Enviar desabilitados', async () => {
    mountPanel({ [STATUS]: () => Response.json({ available: false }) })

    expect(await screen.findByTestId('tutor-unavailable')).toHaveTextContent(
      'A Kairya está fora do ar: falta configurar o provedor.',
    )
    expect(input()).toBeDisabled()
    expect(sendButton()).toBeDisabled()
    await screen.findByTestId('tutor-greeting')
  })

  it('P7 indisponivel pelo 503: o texto digitado continua no campo', async () => {
    mountPanel({ [SEND]: preStreamError(503, { code: 'provedor_nao_configurado' }) })

    await typeAndSend('Minha dúvida')

    expect(await screen.findByTestId('tutor-unavailable')).toHaveTextContent(
      'A Kairya está fora do ar: falta configurar o provedor.',
    )
    expect(input()).toHaveValue('Minha dúvida')
    expect(input()).toBeDisabled()
    expect(screen.queryByTestId('tutor-failure')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tutor-retry')).not.toBeInTheDocument()
  })

  it('P7b o teto diario desabilita o campo ate a meia-noite, sem tentar de novo', async () => {
    mountPanel({ [SEND]: DAILY_LIMIT })

    await typeAndSend('Mais uma')

    expect(await screen.findByTestId('tutor-failure')).toHaveTextContent(
      'Você chegou ao limite de conversas de hoje. A Kairya volta à meia-noite.',
    )
    expect(input()).toHaveValue('Mais uma')
    expect(input()).toBeDisabled()
    expect(sendButton()).toBeDisabled()
    expect(screen.queryByTestId('tutor-retry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tutor-unavailable')).not.toBeInTheDocument()
  })

  it('P7c o teto diario sem Retry-After pede para voltar amanha', async () => {
    mountPanel({ [SEND]: preStreamError(429, { code: 'limite_diario_da_tutoria' }) })

    await typeAndSend('Mais uma')

    expect(await screen.findByTestId('tutor-failure')).toHaveTextContent(
      'Você chegou ao limite de conversas de hoje. Tente de novo amanhã.',
    )
  })

  it('P7d o teto diario em ingles diz a hora de Brasilia', async () => {
    mountPanel({ [SEND]: DAILY_LIMIT }, 'desktop', vi.fn(), 'en')

    await readyEn()
    typeEn('One more')
    fireEvent.click(sendButton())

    expect(await screen.findByTestId('tutor-failure')).toHaveTextContent(
      "Kairya can't answer now. You've reached today's conversation limit. Kairya is back at midnight (Brasília time).",
    )
  })

  it('P8 o status que falha oferece tentar de novo', async () => {
    const { fetchMock } = mountPanel({
      [STATUS]: (_init, call) =>
        call === 1 ? Response.json({}, { status: 500 }) : Response.json({ available: true }),
    })

    expect(await screen.findByTestId('tutor-status-error')).toHaveTextContent(
      'Não foi possível verificar se a Kairya está disponível.',
    )
    expect(input()).toBeDisabled()

    fireEvent.click(screen.getByTestId('tutor-status-retry'))
    await waitFor(() => {
      expect(input()).toBeEnabled()
    })
    expect(requestsTo(fetchMock, STATUS)).toHaveLength(2)
    expect(screen.queryByTestId('tutor-status-error')).not.toBeInTheDocument()
  })

  it('P9 o historico que falha oferece tentar de novo', async () => {
    mountPanel({
      [HISTORY]: (_init, call) =>
        call === 1 ? Response.json({}, { status: 500 }) : Response.json([]),
    })

    expect(await screen.findByTestId('tutor-history-error')).toHaveTextContent(
      'Não foi possível carregar a conversa.',
    )
    fireEvent.click(screen.getByTestId('tutor-history-retry'))
    expect(await screen.findByTestId('tutor-greeting')).toBeInTheDocument()
    expect(screen.queryByTestId('tutor-history-error')).not.toBeInTheDocument()
  })

  it('P32 a conversa rolavel e alcancavel pelo teclado e tem nome, mesmo sem link nem botao', async () => {
    // Sem proposta nem Tentar de novo, a regiao que rola nao tem nada focavel
    // dentro: sem tabIndex, quem usa teclado nao consegue rolar o historico.
    mountPanel({
      [HISTORY]: () => Response.json([question(1, 'Oi, Kairya', 'c1'), answer(2, 1, 'Oi!')]),
    })

    const conversa = await screen.findByRole('region', { name: 'Conversa com a Kairya' })
    expect(conversa).toHaveAttribute('tabindex', '0')
    expect(within(conversa).getByTestId('tutor-messages')).toBeInTheDocument()
    expect(within(conversa).queryAllByRole('button')).toHaveLength(0)
    expect(within(conversa).queryAllByRole('link')).toHaveLength(0)
    conversa.focus()
    expect(document.activeElement).toBe(conversa)
  })
})

describe('TutorPanel: o envio', () => {
  it('P10 escrevendo: o texto chega pelos delta e a regiao viva anuncia o inicio', async () => {
    const stream = controlledStream()
    mountPanel({ [SEND]: () => stream.response })

    await typeAndSend('Me dá uma missão')
    stream.push(sseFrame('user_message', question(1, 'Me dá uma missão', 'c1')))
    stream.push(sseFrame('delta', { text: 'Bora' }))
    stream.push(sseFrame('delta', { text: ', vamos!' }))

    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Bora, vamos!')
    })
    expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya está escrevendo…')
    expect(sendButton()).toHaveTextContent('Enviando…')
    expect(sendButton()).toBeDisabled()
  })

  it('P11 a regiao viva anuncia o fim, e nao cada palavra', async () => {
    const stream = controlledStream()
    mountPanel({ [SEND]: () => stream.response })
    const live = screen.getByTestId('tutor-live')

    await typeAndSend('Me dá uma missão')
    expect(live).toHaveTextContent('Kairya está escrevendo…')
    stream.push(sseFrame('user_message', question(1, 'Me dá uma missão', 'c1')))
    stream.push(sseFrame('delta', { text: 'Bora' }))
    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Bora')
    })
    expect(live.textContent).toBe('Kairya está escrevendo…')
    stream.push(sseFrame('delta', { text: ', vamos!' }))
    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Bora, vamos!')
    })
    expect(live.textContent).toBe('Kairya está escrevendo…')

    stream.push(sseFrame('done', answer(2, 1, 'Bora, vamos!')))
    stream.close()
    await waitFor(() => {
      expect(live.textContent).toBe('Kairya terminou de responder.')
    })
    expect(screen.queryByTestId('tutor-partial')).not.toBeInTheDocument()
    expect(messageWith('Bora, vamos!')).toBeInTheDocument()
  })

  it('P12 o campo so e limpo quando o user_message chega', async () => {
    const stream = controlledStream()
    mountPanel({ [SEND]: () => stream.response })

    await typeAndSend('Pergunta gravada')
    expect(input()).toHaveValue('Pergunta gravada')

    stream.push(sseFrame('user_message', question(1, 'Pergunta gravada', 'c1')))
    await waitFor(() => {
      expect(input()).toHaveValue('')
    })
  })

  it('P13 falha no stream: parcial marcado, alerta e Tentar de novo com o mesmo id', async () => {
    const q10 = question(10, 'Me explica recursão', 'x')
    const { fetchMock } = mountPanel({
      [HISTORY]: (_init, call) =>
        Response.json(call === 1 ? [] : [q10, answer(11, 10, 'Meio', 'falhou')]),
      [SEND]: (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q10),
              sseFrame('delta', { text: 'Meio' }),
              sseFrame('error', { code: 'provedor_indisponivel' }),
            ])
          : streamResponse([
              sseFrame('user_message', q10),
              sseFrame('done', answer(12, 10, 'Inteira')),
            ]),
    })

    await typeAndSend('Me explica recursão')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'A Kairya não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.',
    )
    expect(within(messageWith('Meio')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta com falha',
    )

    fireEvent.click(screen.getByTestId('tutor-retry'))
    await waitFor(() => {
      expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    })
    expect(sent(fetchMock, 2).client_message_id).toBe(sent(fetchMock, 1).client_message_id)
    expect(sent(fetchMock, 2)).toEqual(sent(fetchMock, 1))
    // A tentativa que falhou continua visivel, marcada; a nova vem depois.
    expect(within(messageWith('Meio')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta com falha',
    )
    expect(messageWith('Inteira')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('P31 a linha gerando da resposta em voo nao vira uma segunda bolha', async () => {
    // A atualizacao silenciosa da falha anterior chega ATRASADA, com a
    // resposta nova ja sendo escrita: o servidor devolve a linha `gerando`
    // dela (vazia). Desenhada, seria uma bolha "em andamento" ao lado do
    // parcial -- a mesma resposta duas vezes.
    const q10 = question(10, 'Me explica recursão', 'x')
    let lateHistory!: (response: Response) => void
    const stream = controlledStream()
    mountPanel({
      [HISTORY]: (_init, call) =>
        call === 1
          ? Response.json([])
          : new Promise<Response>((resolve) => {
              lateHistory = resolve
            }),
      [SEND]: (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q10),
              sseFrame('delta', { text: 'Meio' }),
              sseFrame('error', { code: 'provedor_indisponivel' }),
            ])
          : stream.response,
    })

    await typeAndSend('Me explica recursão')
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('tutor-retry'))
    stream.push(sseFrame('user_message', q10))
    stream.push(sseFrame('delta', { text: 'Nova' }))
    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Nova')
    })

    await act(async () => {
      lateHistory(
        Response.json([
          q10,
          answer(11, 10, 'Meio', 'falhou'),
          answer(12, 10, '', 'gerando'),
          answer(9, 8, 'de outra pergunta', 'gerando'),
        ]),
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(screen.getAllByTestId('tutor-partial')).toHaveLength(1)
    expect(
      screen.getAllByTestId('tutor-message').map((li) => li.getAttribute('data-message-id')),
    ).toEqual(['10', '11', '9'])
    // So a linha da resposta EM VOO sai; um `gerando` de outra pergunta fica.
    expect(
      within(messageWith('de outra pergunta')).getByTestId('tutor-message-mark'),
    ).toHaveTextContent('Resposta em andamento')

    stream.push(sseFrame('done', answer(12, 10, 'Nova resposta')))
    stream.close()
    await waitFor(() => {
      expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    })
    expect(
      screen.getAllByTestId('tutor-message').map((li) => li.getAttribute('data-message-id')),
    ).toEqual(['10', '11', '12', '9'])
    expect(within(messageWith('Nova resposta')).queryByTestId('tutor-message-mark')).toBeNull()
  })

  it('P14 resultado desconhecido: parcial marcado como interrompida', async () => {
    const q10 = question(10, 'Oi', 'x')
    const { fetchMock } = mountPanel({
      [HISTORY]: (_init, call) =>
        call === 1 ? Response.json([]) : Response.json({}, { status: 500 }),
      [SEND]: () =>
        streamResponse([sseFrame('user_message', q10), sseFrame('delta', { text: 'x' })]),
    })

    await typeAndSend('Oi')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não deu para saber se a resposta chegou inteira. Ela foi interrompida no caminho. Tentar de novo é seguro: a pergunta não será duplicada.',
    )
    await waitFor(() => {
      expect(requestsTo(fetchMock, HISTORY)).toHaveLength(2)
    })
    expect(within(messageWith('x')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta interrompida',
    )
    expect(screen.getByTestId('tutor-retry')).toBeInTheDocument()
  })

  it('P15 409 antes do stream: alerta, texto mantido', async () => {
    mountPanel({ [SEND]: preStreamError(409, { code: 'mensagem_em_andamento' }) })

    await typeAndSend('Outra pergunta')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Kairya ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.',
    )
    expect(input()).toHaveValue('Outra pergunta')
    expect(screen.getByTestId('tutor-retry')).toBeInTheDocument()
  })

  it('P16 422: alerta sem Tentar de novo, texto mantido', async () => {
    mountPanel({
      [SEND]: preStreamError(422, { detail: [{ msg: 'String should have at most 4000' }] }),
    })

    await typeAndSend('Texto recusado')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A pergunta não foi aceita. Confira o texto e envie de novo.',
    )
    expect(screen.queryByTestId('tutor-retry')).not.toBeInTheDocument()
    expect(input()).toHaveValue('Texto recusado')
  })

  it('P17 depois de recarregar, a ultima pergunta interrompida pode ser reenviada', async () => {
    const q10 = question(10, 'Pergunta antiga', 'id-da-pergunta-antiga')
    const { fetchMock } = mountPanel({
      [HISTORY]: () => Response.json([q10, answer(11, 10, 'meio', 'interrompida')]),
      [SEND]: () =>
        streamResponse([sseFrame('user_message', q10), sseFrame('done', answer(12, 10, 'Agora'))]),
    })
    await ready()

    const note = await screen.findByTestId('tutor-history-retry-note')
    expect(note).toHaveTextContent(HISTORY_RETRY_NOTE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('tutor-retry'))
    await waitFor(() => {
      expect(requestsTo(fetchMock, SEND)).toHaveLength(1)
    })
    expect(sent(fetchMock, 1)).toEqual({
      client_message_id: 'id-da-pergunta-antiga',
      content: 'Pergunta antiga',
    })
    await waitFor(() => {
      expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    })
  })

  it('P33 resposta cortada por tamanho: marcada, anunciada como cortada, com a nota de pedir por partes', async () => {
    // Pendencias 45, 121 e 122: o backend grava a resposta cortada pelo teto
    // de tokens (ou pela janela de contexto) como `interrompida`, com
    // `error_code` `resposta_longa`, e a entrega no `done`. A regiao viva nao
    // diz "terminou", e a nota orienta a pedir por partes. Antes o `done`
    // deste teste vinha sem `error_code` e a nota era a geral; a expectativa
    // mudou porque o contrato passou a trazer o motivo do corte.
    const q1 = question(1, 'Me explica recursao', 'c1')
    const cortada = { ...answer(2, 1, 'Recursao e quando', 'interrompida'), error_code: LONG }
    const { fetchMock } = mountPanel({
      [SEND]: (_init, call) =>
        call === 1
          ? streamResponse([
              sseFrame('user_message', q1),
              sseFrame('delta', { text: 'Recursao e quando' }),
              sseFrame('done', cortada),
            ])
          : streamResponse([
              sseFrame('user_message', q1),
              sseFrame('done', answer(3, 1, 'Resposta inteira')),
            ]),
    })

    await typeAndSend('Me explica recursao')

    const bolha = await waitFor(() => messageWith('Recursao e quando'))
    expect(within(bolha).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta interrompida',
    )
    expect(screen.getByTestId('tutor-live')).toHaveTextContent(
      'A resposta da Kairya ficou longa demais e foi cortada. Tente pedir por partes.',
    )
    expect(screen.getByTestId('tutor-history-retry-note')).toHaveTextContent(LONG_NOTE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('tutor-retry'))
    await waitFor(() => {
      expect(messageWith('Resposta inteira')).toBeInTheDocument()
    })
    expect(sent(fetchMock, 2)).toEqual({ client_message_id: 'c1', content: 'Me explica recursao' })
    expect(screen.queryByTestId('tutor-history-retry-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
  })

  it('P34 depois de recarregar, a cortada por tamanho mostra a nota de pedir por partes', async () => {
    const q10 = question(10, 'Pergunta longa', 'c10')
    mountPanel({
      [HISTORY]: () =>
        Response.json([q10, { ...answer(11, 10, 'meio', 'interrompida'), error_code: LONG }]),
    })
    await ready()

    expect(await screen.findByTestId('tutor-history-retry-note')).toHaveTextContent(LONG_NOTE)
    expect(screen.getByTestId('tutor-retry')).toBeInTheDocument()
  })

  it('P35 recusa no stream: alerta proprio, sem o parcial, e Tentar de novo', async () => {
    // Pendencia 120: o texto que veio antes da recusa nao fica na conversa.
    const q1 = question(1, 'Pergunta recusada', 'c1')
    const recusada = { ...answer(2, 1, '', 'falhou'), error_code: REFUSED }
    mountPanel({
      [HISTORY]: (_init, call) => Response.json(call === 1 ? [] : [q1, recusada]),
      [SEND]: () =>
        streamResponse([
          sseFrame('user_message', q1),
          sseFrame('delta', { text: 'Comeco recusado' }),
          sseFrame('error', { code: REFUSED }),
        ]),
    })

    await typeAndSend('Pergunta recusada')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Kairya não pôde responder a esta pergunta. O conteúdo foi recusado. Pergunte de outro jeito.',
    )
    expect(screen.queryByText('Comeco recusado')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutor-retry')).toBeInTheDocument()
  })

  it('P37 a resposta servida pelo modelo substituto traz a nota com o modelo; a do pedido, nao', async () => {
    // Pendencia 174: o fallback do servidor refez a resposta noutro modelo.
    const history = [
      question(10, 'Pergunta', 'c10'),
      { ...answer(11, 10, 'Resposta do substituto'), fallback_model: 'claude-opus-4-8' },
      question(12, 'Outra', 'c12'),
      answer(13, 12, 'Resposta normal'),
    ]
    mountPanel({ [HISTORY]: () => Response.json(history) })
    await ready()

    const bolha = (id: string) =>
      screen.getAllByTestId('tutor-message').find((li) => li.dataset.messageId === id)!
    expect(within(bolha('11')).getByTestId('tutor-message-fallback')).toHaveTextContent(
      'Respondida por um modelo substituto (claude-opus-4-8), porque o modelo principal não pôde responder a esta pergunta.',
    )
    expect(within(bolha('13')).queryByTestId('tutor-message-fallback')).not.toBeInTheDocument()
    expect(within(bolha('10')).queryByTestId('tutor-message-fallback')).not.toBeInTheDocument()
  })

  it('P36 depois de recarregar, a recusada mostra a nota de perguntar de outro jeito', async () => {
    const q10 = question(10, 'Pergunta recusada', 'c10')
    mountPanel({
      [HISTORY]: () =>
        Response.json([q10, { ...answer(11, 10, '', 'falhou'), error_code: REFUSED }]),
    })
    await ready()

    expect(await screen.findByTestId('tutor-history-retry-note')).toHaveTextContent(
      'A Kairya não pôde responder à última pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
    )
    // A recusada e gravada sem texto: a bolha mostra o autor e a marca, sem
    // um paragrafo vazio no meio.
    const recusada = screen
      .getAllByTestId('tutor-message')
      .find((li) => li.dataset.messageId === '11')!
    expect(within(recusada).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta com falha',
    )
    expect(within(recusada).queryByTestId('tutor-message-content')).not.toBeInTheDocument()
    expect(
      within(messageWith('Pergunta recusada')).getByTestId('tutor-message-content'),
    ).toHaveTextContent('Pergunta recusada')
  })

  it('P18 contador: aparece perto do limite, some longe dele, e liga ao campo', async () => {
    mountPanel({})
    await ready()

    type('a'.repeat(3599))
    expect(screen.queryByText(/Restam/)).not.toBeInTheDocument()
    expect(input()).not.toHaveAttribute('aria-describedby')

    type('a'.repeat(3600))
    const counter = screen.getByTestId('tutor-counter')
    expect(counter).toHaveTextContent('Restam 400 caracteres.')
    expect(input()).toHaveAttribute('aria-describedby', counter.id)
    expect(counter.id).not.toBe('')
  })

  it('P19 acima do limite: Enviar desabilitado e o texto mantido', async () => {
    const { fetchMock, container } = mountPanel({})
    await ready()

    type('a'.repeat(4001))
    expect(screen.getByTestId('tutor-counter')).toHaveTextContent(
      'Passou 1 caractere do limite de 4000.',
    )
    expect(sendButton()).toBeDisabled()
    expect(input().value).toHaveLength(4001)

    fireEvent.click(sendButton())
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(requestsTo(fetchMock, SEND)).toHaveLength(0)
    expect(input().value).toHaveLength(4001)
  })

  it.each([
    [3600, 'Restam 400 caracteres.'],
    [3999, 'Resta 1 caractere.'],
    // O CLDR `pt` poe o 0 em `one`: sem a forma `zero`, sairia "Resta 0 caractere."
    [4000, 'Restam 0 caracteres.'],
    [4001, 'Passou 1 caractere do limite de 4000.'],
    [4012, 'Passou 12 caracteres do limite de 4000.'],
  ])('P18b contador com %i caracteres: %s', async (size, text) => {
    mountPanel({})
    await ready()

    type('a'.repeat(size))
    expect(screen.getByTestId('tutor-counter')).toHaveTextContent(text)
  })

  it('P30 indisponivel: nenhum Tentar de novo, nem o do historico', async () => {
    mountPanel({
      [STATUS]: () => Response.json({ available: false }),
      [HISTORY]: () =>
        Response.json([
          question(10, 'Pergunta antiga', 'c10'),
          answer(11, 10, 'meio', 'interrompida'),
        ]),
    })

    await screen.findByTestId('tutor-unavailable')
    await screen.findByTestId('tutor-messages')
    expect(screen.queryByTestId('tutor-retry')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tutor-history-retry-note')).not.toBeInTheDocument()
    expect(within(messageWith('meio')).getByTestId('tutor-message-mark')).toHaveTextContent(
      'Resposta interrompida',
    )
  })

  it.each([
    [
      'failed',
      {
        status: 'failed',
        pending: { clientMessageId: 'c10', content: 'Pergunta' },
        question: null,
        partial: '',
        failure: {
          message: 'tutoring.messageFailure.providerUnavailable.message',
          recovery: 'tutoring.messageFailure.safeRetry',
          action: 'retry',
        },
      },
    ],
    [
      'unknown',
      {
        status: 'unknown',
        pending: { clientMessageId: 'c10', content: 'Pergunta' },
        question: null,
        partial: '',
      },
    ],
  ] as const)(
    'P30b fora do ar, uma falha %s mostra o aviso e nao oferece Tentar de novo',
    (_name, send) => {
      // Pelo painel, este estado ainda nao e alcancavel (so se envia com a Kairya
      // disponivel, e o status so recarrega a partir do erro); a conversa
      // desenhada nao tem estado proprio e e montada direto com ele. Sem a
      // guarda, o botao ofereceria um reenvio que so daria 503.
      const retry = vi.fn()
      const conversation: UseTutorConversationResult = {
        history: { status: 'loaded', messages: [] },
        messages: [],
        send,
        draft: 'Pergunta',
        setDraft: vi.fn(),
        length: describeQuestionLength('Pergunta'),
        canSubmit: true,
        submit: vi.fn(),
        retryTarget: send.pending,
        retry,
        reloadHistory: vi.fn(),
        updateAction: vi.fn(),
      }
      renderWithI18n(
        <TutorConversation
          conversation={conversation}
          status={{ status: 'unavailable' }}
          onReloadStatus={vi.fn()}
          renderAction={() => <></>}
        />,
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByTestId('tutor-retry')).not.toBeInTheDocument()
      expect(screen.getByTestId('tutor-unavailable')).toBeInTheDocument()
    },
  )
})

describe('TutorPanel: desktop', () => {
  it('P20 desktop: recolher e abrir o painel, lembrado no localStorage', async () => {
    const { unmount } = mountPanel({})
    await ready()

    const toggle = screen.getByTestId('tutor-panel-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'tutor-panel-body')
    expect(toggle).toHaveAccessibleName('Recolher o painel da Kairya')
    expect(document.getElementById('tutor-panel-body')).not.toBeNull()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Abrir o painel da Kairya')
    expect(document.getElementById('tutor-panel-body')).toBeNull()
    expect(localStorage.getItem(PANEL_OPEN_KEY)).toBe('false')

    unmount()
    renderWithI18n(<TutorPanel onMissionCreated={vi.fn()} boardHref={BOARD_HREF} />)
    expect(screen.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('tutor-panel-body')).toBeNull()

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    expect(localStorage.getItem(PANEL_OPEN_KEY)).toBe('true')
    await ready()
  })

  it('P21 desktop fechado: o stream continua e a regiao viva segue anunciando', async () => {
    const stream = controlledStream()
    mountPanel({ [SEND]: () => stream.response })

    await typeAndSend('Me dá uma missão')
    stream.push(sseFrame('user_message', question(1, 'Me dá uma missão', 'c1')))
    await waitFor(() => {
      expect(input()).toHaveValue('')
    })

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    expect(document.getElementById('tutor-panel-body')).toBeNull()
    stream.push(sseFrame('done', answer(2, 1, 'Resposta pronta')))
    stream.close()

    await waitFor(() => {
      expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    })

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    expect(messageWith('Resposta pronta')).toBeInTheDocument()
  })

  it('P26 o retrato aberto tem nome acessivel e reserva as dimensoes reais do arquivo', async () => {
    mountPanel({})

    const portrait = screen.getByTestId('tutor-portrait')
    expect(portrait).toHaveAttribute('data-size', 'scene')
    expect(portrait).not.toHaveAttribute('aria-hidden')
    const image = screen.getByRole('img', {
      name: translate('pt-BR', 'kairya.face.neutral'),
    })
    expect(portrait).toContainElement(image)
    expect(image).toHaveAttribute('src', '/art/kairya/neutral.webp')
    expect(image).toHaveAttribute('width', '864')
    expect(image).toHaveAttribute('height', '1184')
    await ready()
  })

  it('P26a o retrato aberto segue o humor da presenca, na hora', async () => {
    function Typist() {
      const { dispatch } = useKairya()
      return (
        <button type="button" onClick={() => dispatch({ type: 'userTyped' })}>
          digitar
        </button>
      )
    }
    routeFetch({
      [STATUS]: () => Response.json({ available: true }),
      [HISTORY]: () => Response.json([]),
    })
    stubViewport('desktop')
    renderWithI18n(
      <>
        <TutorPanel onMissionCreated={vi.fn()} boardHref={BOARD_HREF} />
        <Typist />
      </>,
    )
    const portrait = screen.getByTestId('tutor-portrait')
    expect(portrait.querySelector('img')).toHaveAttribute('src', '/art/kairya/neutral.webp')

    fireEvent.click(screen.getByRole('button', { name: 'digitar' }))

    const image = within(portrait).getByRole('img', {
      name: translate('pt-BR', 'kairya.face.listening'),
    })
    expect(image).toHaveAttribute('src', '/art/kairya/listening.webp')
    await ready()
  })

  it('P26b o avatar compacto e decorativo e reserva as dimensoes reais do arquivo', async () => {
    mountPanel({})

    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    const portrait = screen.getByTestId('tutor-portrait')
    expect(portrait).toHaveAttribute('data-size', 'compact')
    expect(portrait).toHaveAttribute('aria-hidden', 'true')
    const image = portrait.querySelector('img')
    expect(image).toHaveAttribute('src', '/art/kairya/avatar.webp')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('width', '128')
    expect(image).toHaveAttribute('height', '160')
    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    expect(screen.getByTestId('tutor-portrait')).toHaveAttribute('data-size', 'scene')
    expect(screen.getByRole('complementary', { name: 'Kairya' })).toBeInTheDocument()
    await ready()
  })
})

describe('TutorPanel: celular', () => {
  async function openSheet() {
    const open = screen.getByTestId('tutor-sheet-open')
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    await ready()
    return dialog
  }

  it('P22 celular: botao fixo abre a folha como dialogo, com o foco no campo', async () => {
    const { fetchMock } = mountPanel({}, 'mobile')

    const open = screen.getByTestId('tutor-sheet-open')
    expect(open).toBeVisible()
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveAttribute('aria-controls', 'tutor-sheet')
    expect(open).toHaveAccessibleName('Falar com a Kairya')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Abre depois de o status responder: com a Kairya disponivel, o campo
    // esta habilitado e pode receber o foco.
    await waitFor(() => {
      expect(requestsTo(fetchMock, STATUS)).toHaveLength(1)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('id', 'tutor-sheet')
    await waitFor(() => {
      expect(document.activeElement).toBe(input())
    })
    await ready()
  })

  it('P22b celular: com o campo desabilitado, o foco vai para o Fechar a conversa', async () => {
    mountPanel({ [STATUS]: () => Response.json({ available: false }) }, 'mobile')
    await waitFor(() => {
      expect(screen.getByTestId('tutor-sheet-open')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    await within(dialog).findByTestId('tutor-unavailable')
    expect(input()).toBeDisabled()
    await waitFor(() => {
      expect(document.activeElement).toBe(within(dialog).getByTestId('tutor-sheet-close'))
    })
  })

  it('P23 celular: Esc e Fechar a conversa fecham a folha e devolvem o foco ao botao', async () => {
    mountPanel({}, 'mobile')

    let dialog = await openSheet()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('tutor-sheet-open'))
    })

    dialog = await openSheet()
    fireEvent.click(within(dialog).getByTestId('tutor-sheet-close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('tutor-sheet-open'))
    })
  })

  it('P24 celular: o Tab fica dentro da folha', async () => {
    mountPanel({}, 'mobile')

    const dialog = await openSheet()
    type('Algo para enviar')
    const close = within(dialog).getByTestId('tutor-sheet-close')
    const send = sendButton()
    expect(send).toBeEnabled()

    send.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(send)
  })

  it('P24b celular: Tab e Shift+Tab no meio da folha seguem o fluxo normal', async () => {
    mountPanel({}, 'mobile')

    const dialog = await openSheet()
    // Com texto, o Enviar habilita e o campo fica no MEIO da ordem de foco.
    type('Algo para enviar')
    expect(sendButton()).toBeEnabled()
    input().focus()
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(input())
    expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })).toBe(true)
    expect(document.activeElement).toBe(input())
  })

  it('P33 indisponível: Tab alcança o histórico e Shift+Tab dá a volta', async () => {
    mountPanel({ [STATUS]: () => Response.json({ available: false }) }, 'mobile')
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    await screen.findByTestId('tutor-unavailable')
    const close = within(dialog).getByTestId('tutor-sheet-close')
    const history = within(dialog).getByRole('region', { name: 'Conversa com a Kairya' })
    close.focus()
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(history).toHaveFocus()
    expect(fireEvent.keyDown(history, { key: 'Tab' })).toBe(false)
    expect(close).toHaveFocus()
  })

  it('P27 outras teclas na folha nao fazem nada', async () => {
    mountPanel({}, 'mobile')

    const dialog = await openSheet()
    expect(fireEvent.keyDown(dialog, { key: 'a' })).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Kairya' })).toBeInTheDocument()
  })

  it('P25 trocar de layout nao perde o rascunho nem o stream', async () => {
    const { viewport } = mountPanel({})
    await ready()
    type('Rascunho')

    act(() => {
      viewport.setDesktop(false)
    })
    expect(screen.queryByTestId('tutor-panel-toggle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))

    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    expect(within(dialog).getByLabelText(INPUT_LABEL)).toHaveValue('Rascunho')
  })
})

describe('TutorPanel: a proposta de missao', () => {
  const CONFIRM = 'POST /api/tutoring/actions/5/confirm'
  const proposal: ActionRead = {
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
  const executed: ActionRead = { ...proposal, state: 'executada', mission_id: 40 }

  /** O historico de uma pergunta e da resposta que carrega a acao. */
  const historyWith = (action: ActionRead) => () =>
    Response.json([
      question(1, 'Me dá uma missão', 'c1'),
      { ...answer(2, 1, 'Proponho esta missão.'), actions: [action] },
    ])

  it('P28 uma resposta com proposta mostra o cartao, e confirmar avisa a pagina', async () => {
    const onMissionCreated = vi.fn()
    mountPanel(
      {
        [HISTORY]: historyWith(proposal),
        [CONFIRM]: () =>
          Response.json({ action: executed, mission: { id: 40, instructions: 'x' } }),
      },
      'desktop',
      onMissionCreated,
    )

    const card = await screen.findByTestId('tutor-proposal')
    // O cartao mora dentro da mensagem da Kairya que o propos.
    expect(within(messageWith('Proponho esta missão.')).getByTestId('tutor-proposal')).toBe(card)
    fireEvent.click(within(card).getByTestId('proposal-confirm'))

    expect(await screen.findByTestId('proposal-created')).toHaveTextContent('Missão criada')
    expect(onMissionCreated).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('proposal-board-link')).toHaveAttribute('href', BOARD_HREF)
    // No desktop o painel nao cobre o quadro: o link nao fecha nada.
    fireEvent.click(screen.getByTestId('proposal-board-link'))
    expect(screen.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'true')
  })

  it('P38 a proposta que cai ao confirmar e anunciada dentro do painel', async () => {
    // O cartao continua montado quando a acao vira `falhou` (a chave da lista e
    // o id da acao): e isso que deixa o alerta nascer no lugar certo.
    mountPanel({
      [HISTORY]: historyWith(proposal),
      [CONFIRM]: () => Response.json({ detail: 'x', code: 'prazo_expirado' }, { status: 422 }),
    })

    const card = await screen.findByTestId('tutor-proposal')
    fireEvent.click(within(card).getByTestId('proposal-confirm'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('O prazo desta proposta já passou.')
    expect(within(messageWith('Proponho esta missão.')).getByRole('alert')).toBe(alert)
  })

  it('P34 o link executado entra no ciclo na ordem do documento', async () => {
    mountPanel(
      { [HISTORY]: historyWith(executed), [STATUS]: () => Response.json({ available: false }) },
      'mobile',
    )
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    const link = await within(dialog).findByRole('link', { name: 'Ver no Quartel-General' })
    await within(dialog).findByTestId('tutor-unavailable')
    const close = within(dialog).getByTestId('tutor-sheet-close')
    const history = within(dialog).getByRole('region', { name: 'Conversa com a Kairya' })
    history.focus()
    expect(fireEvent.keyDown(history, { key: 'Tab' })).toBe(true)
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(link).toHaveFocus()
    fireEvent.keyDown(link, { key: 'Tab' })
    expect(close).toHaveFocus()
  })

  it('P35 controles com tabIndex negativo não viram limites do ciclo', async () => {
    mountPanel({ [HISTORY]: historyWith(executed) }, 'mobile')
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    await ready()
    const close = within(dialog).getByTestId('tutor-sheet-close')
    const history = within(dialog).getByRole('region', { name: 'Conversa com a Kairya' })
    const link = await within(dialog).findByRole('link', { name: 'Ver no Quartel-General' })
    input().tabIndex = -1
    type('Mensagem')
    sendButton().tabIndex = -1
    link.tabIndex = -1
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(history).toHaveFocus()
  })

  it('P29 Ver no Quartel-General fecha a folha no celular', async () => {
    mountPanel({ [HISTORY]: historyWith(executed) }, 'mobile')

    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    const dialog = screen.getByRole('dialog', { name: 'Kairya' })
    await ready()
    const link = await within(dialog).findByRole('link', { name: 'Ver no Quartel-General' })

    fireEvent.click(link)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutor-sheet-open')).toBeInTheDocument()
  })
})

describe('TutorPanel: o cartao escolhido pelo kind', () => {
  const creation: ActionRead = {
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
  const reschedule: ActionRead = {
    id: 6,
    kind: 'reschedule_mission',
    state: 'proposta',
    payload: {
      mission_id: 12,
      new_deadline: '2026-10-05T21:00:00Z',
      reason: 'falta_de_tempo',
      instructions: 'Resumir o capítulo 3',
      previous_deadline: '2026-10-02T21:00:00Z',
    },
    mission_id: null,
    error_code: null,
  }

  const historyWith = (actions: unknown[]) => () =>
    Response.json([
      question(1, 'Me ajuda com o prazo', 'c1'),
      { ...answer(2, 1, 'Duas propostas.'), actions },
    ])

  it('P30 uma mensagem com as duas acoes mostra um cartao de cada tipo', async () => {
    mountPanel({ [HISTORY]: historyWith([creation, reschedule]) })

    const message = await waitFor(() => messageWith('Duas propostas.'))
    const creationCard = within(message).getByTestId('tutor-proposal')
    const rescheduleCard = within(message).getByTestId('tutor-reschedule-proposal')
    expect(creationCard).toHaveAttribute('data-action-id', '5')
    expect(rescheduleCard).toHaveAttribute('data-action-id', '6')
    expect(
      within(creationCard).getByRole('heading', { name: 'Proposta de missão' }),
    ).toBeInTheDocument()
    expect(
      within(rescheduleCard).getByRole('heading', { name: 'Proposta de reagendamento' }),
    ).toBeInTheDocument()
    // Cada cartao so tem o que e dele.
    expect(within(rescheduleCard).queryByText(/Critério de conclusão/)).not.toBeInTheDocument()
    expect(within(creationCard).queryByText(/Prazo proposto/)).not.toBeInTheDocument()
  })

  it('P31 um kind que esta versao nao conhece nao quebra a conversa', async () => {
    // Uma API mais nova pode mandar um tipo de acao que este cliente nao sabe
    // desenhar. O valor esta FORA do tipo: por isso o `unknown`.
    const future = { ...creation, id: 7, kind: 'split_mission', payload: { steps: 3 } }
    mountPanel({ [HISTORY]: historyWith([future, reschedule]) })

    const message = await waitFor(() => messageWith('Duas propostas.'))
    const unknown = within(message).getByTestId('tutor-proposal-unknown')
    expect(unknown).toHaveTextContent('Proposta que esta versão não sabe mostrar.')
    expect(unknown).toHaveAttribute('data-action-id', '7')
    // O `kind` cru nao vai para a tela, e nada ali pode ser decidido.
    expect(unknown).not.toHaveTextContent('split_mission')
    expect(within(unknown).queryByRole('button')).not.toBeInTheDocument()
    // O resto da conversa continua: a outra acao tem o seu cartao, e o campo funciona.
    expect(within(message).getByTestId('tutor-reschedule-proposal')).toBeInTheDocument()
    await ready()
    expect(input()).toBeEnabled()
  })
})

describe('TutorPanel: coordenação do foco responsivo', () => {
  it('transfere o foco removido entre layouts sem abrir uma folha fechada', async () => {
    const { viewport } = mountPanel({})
    await ready()
    input().focus()
    act(() => viewport.setDesktop(false))
    expect(screen.getByTestId('tutor-sheet-open')).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => viewport.setDesktop(true))
    expect(input()).toHaveFocus()
  })

  it('restaura foco interno quando a folha aberta reaparece', async () => {
    const { viewport } = mountPanel({}, 'mobile')
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    await ready()
    screen.getByTestId('tutor-sheet-close').focus()
    act(() => viewport.setDesktop(true))
    expect(input()).toHaveFocus()
    act(() => viewport.setDesktop(false))
    expect(input()).toHaveFocus()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })
})

describe('TutorPanel: isolamento e limpeza da folha', () => {
  function mountedBackground(strict = false) {
    routeFetch({
      [STATUS]: () => Response.json({ available: true }),
      [HISTORY]: () => Response.json([]),
    })
    const viewport = stubViewport('mobile')
    const tree = (
      <div>
        <button data-testid="external">Fundo</button>
        <section inert>
          <button>Já inerte</button>
        </section>
        <div>
          <TutorPanel onMissionCreated={vi.fn()} boardHref={BOARD_HREF} />
        </div>
      </div>
    )
    const mounted = renderWithI18n(tree, { strict })
    // O atributo booleano também pode ter um valor anterior não vazio.
    const previous = screen.getByText('Já inerte').parentElement!
    previous.setAttribute('inert', 'anterior')
    return { ...mounted, viewport, previous, external: screen.getByTestId('external') }
  }

  for (const strict of [false, true]) {
    it(`isola ancestrais sem tornar região viva inerte e restaura valores (${strict ? 'StrictMode' : 'normal'})`, async () => {
      const { external, previous } = mountedBackground(strict)
      external.focus()
      fireEvent.click(screen.getByTestId('tutor-sheet-open'))
      await ready()
      expect(external).toHaveAttribute('inert', '')
      expect(previous).toHaveAttribute('inert', '')
      expect(screen.getByTestId('tutor-live').closest('[inert]')).toBeNull()
      expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
      input().focus()
      expect(input()).toHaveFocus()
      // jsdom não implementa inert; este foco real exercita a guarda focusin.
      external.focus()
      expect(input()).toHaveFocus()
      fireEvent.keyDown(input(), { key: 'Escape' })
      await waitFor(() => expect(screen.getByTestId('tutor-sheet-open')).toHaveFocus())
      expect(external).not.toHaveAttribute('inert')
      expect(previous).toHaveAttribute('inert', 'anterior')
      external.focus()
      expect(external).toHaveFocus()
    })
  }

  it('restaura interatividade ao fechar pelo backdrop', async () => {
    const { external, container } = mountedBackground()
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    await ready()
    fireEvent.click(container.querySelector('div[aria-hidden="true"]')!)
    await waitFor(() => expect(screen.getByTestId('tutor-sheet-open')).toHaveFocus())
    expect(external).not.toHaveAttribute('inert')
    external.focus()
    expect(external).toHaveFocus()
  })

  it('limpa isolamento e guarda de foco na desmontagem sem restaurar controles removidos', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'Outro app'
    document.body.append(outside)
    const { unmount, previous } = mountedBackground(true)
    try {
      fireEvent.click(screen.getByTestId('tutor-sheet-open'))
      await ready()
      expect(outside).toHaveAttribute('inert', '')
      unmount()
      expect(outside).not.toHaveAttribute('inert')
      expect(previous).toHaveAttribute('inert', 'anterior')
      outside.focus()
      expect(outside).toHaveFocus()
    } finally {
      outside.remove()
    }
  })

  it('restaura fundo no desktop e não rouba foco externo ao retornar para folha fechada', async () => {
    const { external, viewport } = mountedBackground()
    fireEvent.click(screen.getByTestId('tutor-sheet-open'))
    await ready()
    act(() => viewport.setDesktop(true))
    expect(external).not.toHaveAttribute('inert')
    external.focus()
    act(() => viewport.setDesktop(false))
    // Uma folha ativa tem prioridade mesmo se o foco era externo no desktop.
    expect(input()).toHaveFocus()
    fireEvent.keyDown(input(), { key: 'Escape' })
    external.focus()
    act(() => viewport.setDesktop(true))
    expect(external).toHaveFocus()
    act(() => viewport.setDesktop(false))
    expect(external).toHaveFocus()
  })

  it('o controle recolhido e o campo indisponível usam destinos focáveis', async () => {
    const { viewport } = mountPanel({ [STATUS]: () => Response.json({ available: false }) })
    await screen.findByTestId('tutor-unavailable')
    const toggle = screen.getByTestId('tutor-panel-toggle')
    toggle.focus()
    act(() => viewport.setDesktop(false))
    expect(screen.getByTestId('tutor-sheet-open')).toHaveFocus()
    act(() => viewport.setDesktop(true))
    expect(screen.getByTestId('tutor-panel-toggle')).toHaveFocus()
    fireEvent.click(screen.getByTestId('tutor-panel-toggle'))
    screen.getByTestId('tutor-panel-toggle').focus()
    act(() => viewport.setDesktop(false))
    act(() => viewport.setDesktop(true))
    expect(screen.getByTestId('tutor-panel-toggle')).toHaveFocus()
    expect(screen.getByTestId('tutor-panel-toggle')).toHaveAttribute('aria-expanded', 'false')
  })
})

it('QG oculto libera o fundo, conserva conversa e só contém foco quando volta visível', async () => {
  routeFetch({
    [STATUS]: () => Response.json({ available: true }),
    [HISTORY]: () => Response.json([]),
  })
  const viewport = stubViewport('mobile')
  const tree = (hidden: boolean) => (
    <div>
      <button data-testid="other-area">Campanhas</button>
      <div hidden={hidden}>
        <TutorPanel hidden={hidden} onMissionCreated={vi.fn()} boardHref={BOARD_HREF} />
      </div>
    </div>
  )
  const { rerender } = renderWithI18n(tree(false))
  fireEvent.click(screen.getByTestId('tutor-sheet-open'))
  await ready()
  type('Rascunho entre áreas')
  const external = screen.getByTestId('other-area')
  expect(external).toHaveAttribute('inert', '')
  rerender(tree(true))
  expect(external).not.toHaveAttribute('inert')
  external.focus()
  expect(external).toHaveFocus()
  act(() => viewport.setDesktop(true))
  expect(external).toHaveFocus()
  act(() => viewport.setDesktop(false))
  expect(external).toHaveFocus()
  rerender(tree(false))
  expect(input()).toHaveValue('Rascunho entre áreas')
  expect(input()).toHaveFocus()
  expect(external).toHaveAttribute('inert', '')
  fireEvent.keyDown(input(), { key: 'Escape' })
  expect(external).not.toHaveAttribute('inert')
})

/**
 * Os mesmos textos em ingles. O esperado sai do catalogo `en` (pelo
 * `translate`, quando a chave interpola), e nao e reescrito a mao: os casos
 * PT acima fixam o literal de cada chave; estes provam que a tela troca de
 * catalogo.
 */
describe('TutorPanel: em ingles', () => {
  it.each([
    [3998, translate('en', 'tutoring.counter.remaining.other', { count: 2 })],
    [4000, translate('en', 'tutoring.counter.remaining.zero', { count: 0 })],
    [4001, translate('en', 'tutoring.counter.over.one', { count: 1, max: 4000 })],
  ])('E1 contador com %i caracteres', async (size, text) => {
    mountPanel({}, 'desktop', vi.fn(), 'en')
    await readyEn()

    typeEn('a'.repeat(size))
    expect(screen.getByTestId('tutor-counter')).toHaveTextContent(text)
  })

  it('E2 painel vazio: saudacao, nomes, campo e Enviar', async () => {
    mountPanel({}, 'desktop', vi.fn(), 'en')

    expect(await screen.findByTestId('tutor-greeting')).toHaveTextContent(
      en['tutoring.conversation.greeting'],
    )
    await readyEn()
    expect(screen.getByRole('complementary', { name: en['tutoring.name'] })).toBeInTheDocument()
    expect(screen.getByText(en['tutoring.panel.subtitle'])).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: en['tutoring.conversation.region'] }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('tutor-send')).toHaveTextContent(en['tutoring.send.idle'])

    const toggle = screen.getByTestId('tutor-panel-toggle')
    expect(toggle).toHaveAccessibleName(en['tutoring.panel.collapse'])
    fireEvent.click(toggle)
    expect(toggle).toHaveAccessibleName(en['tutoring.panel.expand'])
  })

  it('E3 carregando: o anuncio em ingles', async () => {
    mountPanel({ [HISTORY]: PENDING }, 'desktop', vi.fn(), 'en')

    expect(screen.getByText(en['tutoring.history.loading'])).toBeInTheDocument()
    await waitFor(() => {
      expect(inputEn()).toBeEnabled()
    })
  })

  it('E4 historico e status que falham', async () => {
    mountPanel(
      {
        [STATUS]: () => Response.json({}, { status: 500 }),
        [HISTORY]: () => Response.json({}, { status: 500 }),
      },
      'desktop',
      vi.fn(),
      'en',
    )

    expect(await screen.findByTestId('tutor-history-error')).toHaveTextContent(
      "Couldn't load your conversation with Kairya. The request failed. Use the button to try again.",
    )
    expect(screen.getByTestId('tutor-history-retry')).toHaveTextContent(en['tutoring.retryLoad'])
    expect(await screen.findByTestId('tutor-status-error')).toHaveTextContent(
      "Couldn't check whether Kairya is available. The request failed. Use the button to try again.",
    )
    expect(screen.getByTestId('tutor-status-retry')).toHaveTextContent(en['tutoring.retryLoad'])
  })

  it('E5 autores e marcas do historico', async () => {
    mountPanel(
      {
        [HISTORY]: () =>
          Response.json([
            question(1, 'p1', 'c1'),
            answer(2, 1, 'meio', 'interrompida'),
            question(3, 'p3', 'c3'),
            answer(4, 3, 'x', 'falhou'),
            question(5, 'p5', 'c5'),
            answer(6, 5, 'y', 'gerando'),
          ]),
      },
      'desktop',
      vi.fn(),
      'en',
    )

    await screen.findByTestId('tutor-messages')
    expect(within(messageWith('p1')).getByText(en['tutoring.message.author.user'])).toBeVisible()
    expect(within(messageWith('meio')).getByText(en['tutoring.name'])).toBeVisible()
    expect(within(messageWith('meio')).getByTestId('tutor-message-mark')).toHaveTextContent(
      en['tutoring.message.mark.interrupted'],
    )
    expect(within(messageWith('x')).getByTestId('tutor-message-mark')).toHaveTextContent(
      en['tutoring.message.mark.failed'],
    )
    expect(within(messageWith('y')).getByTestId('tutor-message-mark')).toHaveTextContent(
      en['tutoring.message.mark.generating'],
    )
  })

  it('E6 indisponivel pelo status', async () => {
    mountPanel({ [STATUS]: () => Response.json({ available: false }) }, 'desktop', vi.fn(), 'en')

    expect(await screen.findByTestId('tutor-unavailable')).toHaveTextContent(
      en['tutoring.messageFailure.providerNotConfigured.message'],
    )
  })

  it('E7 escrevendo e terminando: regiao viva, parcial e Enviando', async () => {
    const stream = controlledStream()
    mountPanel({ [SEND]: () => stream.response }, 'desktop', vi.fn(), 'en')
    await readyEn()

    typeEn('Give me a mission')
    fireEvent.click(screen.getByTestId('tutor-send'))
    stream.push(sseFrame('user_message', question(1, 'Give me a mission', 'c1')))
    stream.push(sseFrame('delta', { text: 'Sure' }))

    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent(en['tutoring.writing'])
    })
    expect(screen.getByTestId('tutor-live')).toHaveTextContent(en['tutoring.writing'])
    expect(screen.getByTestId('tutor-send')).toHaveTextContent(en['tutoring.send.busy'])

    stream.push(sseFrame('done', answer(2, 1, 'Sure')))
    stream.close()
    await waitFor(() => {
      expect(screen.getByTestId('tutor-live').textContent).toBe(
        en['tutoring.answer.announce.complete'],
      )
    })
  })

  it('E8 a pergunta sem resposta completa: nota e Tentar de novo', async () => {
    mountPanel(
      {
        [HISTORY]: () =>
          Response.json([question(10, 'Old', 'c10'), answer(11, 10, 'meio', 'interrompida')]),
      },
      'desktop',
      vi.fn(),
      'en',
    )
    await readyEn()

    expect(await screen.findByTestId('tutor-history-retry-note')).toHaveTextContent(
      en['tutoring.answer.note.general'],
    )
    expect(screen.getByTestId('tutor-retry')).toHaveTextContent(en['tutoring.retry'])
  })

  it('E9 a nota do modelo substituto', async () => {
    mountPanel(
      {
        [HISTORY]: () =>
          Response.json([
            question(10, 'Question', 'c10'),
            { ...answer(11, 10, 'Answer'), fallback_model: 'claude-opus-4-8' },
          ]),
      },
      'desktop',
      vi.fn(),
      'en',
    )
    await readyEn()

    expect(screen.getByTestId('tutor-message-fallback')).toHaveTextContent(
      translate('en', 'tutoring.message.fallback', { model: 'claude-opus-4-8' }),
    )
  })

  it('E10 celular: abrir e fechar a folha', async () => {
    mountPanel({}, 'mobile', vi.fn(), 'en')

    const open = screen.getByTestId('tutor-sheet-open')
    expect(open).toHaveAccessibleName(en['tutoring.panel.openSheet'])
    fireEvent.click(open)
    expect(screen.getByRole('dialog', { name: en['tutoring.name'] })).toBeInTheDocument()
    expect(screen.getByTestId('tutor-sheet-close')).toHaveTextContent(
      en['tutoring.panel.closeSheet'],
    )
    await readyEn()
  })
})

describe('TutorPanel: a expressao da Kairya durante o chat', () => {
  /** Dispara eventos da presenca, como a pagina faria ao celebrar uma missao. */
  function Probe() {
    const { dispatch } = useKairya()
    return (
      <>
        <button
          type="button"
          onClick={() => dispatch({ type: 'celebrate', reason: 'missionDone', detail: null })}
        >
          celebrar
        </button>
        <button type="button" onClick={() => dispatch({ type: 'celebrationEnded' })}>
          fim da celebracao
        </button>
      </>
    )
  }

  function mountWithPresence(routes: Record<string, Route>, onMissionCreated = vi.fn()) {
    routeFetch({
      [STATUS]: () => Response.json({ available: true }),
      [HISTORY]: () => Response.json([]),
      ...routes,
    })
    stubViewport('desktop')
    renderWithI18n(
      <>
        <TutorPanel onMissionCreated={onMissionCreated} boardHref={BOARD_HREF} />
        <KairyaBubble />
        <Probe />
      </>,
    )
  }

  type FaceMood = 'neutral' | 'listening' | 'thinking' | 'celebrating' | 'concerned'

  /** O rosto de cena que o painel mostra agora, pelo `alt` do catalogo. */
  function expectFace(mood: FaceMood) {
    const image = screen.getByTestId('tutor-portrait').querySelector('img')
    expect(image).toHaveAttribute('alt', translate('pt-BR', `kairya.face.${mood}`))
  }

  const OFFLINE_LINE = 'Perdi a conexão. Vamos tentar de novo daqui a pouco?'

  it('digitar, enviar, primeiro delta e done: ouvindo, pensando, serena e serena', async () => {
    const stream = controlledStream()
    mountWithPresence({ [SEND]: () => stream.response })
    await ready()
    expectFace('neutral')

    type('Me dá uma missão')
    expectFace('listening')

    fireEvent.click(sendButton())
    await waitFor(() => {
      expectFace('thinking')
    })

    stream.push(sseFrame('user_message', question(1, 'Me dá uma missão', 'c1')))
    stream.push(sseFrame('delta', { text: 'Bora' }))
    await waitFor(() => {
      expect(screen.getByTestId('tutor-partial')).toHaveTextContent('Bora')
    })
    // `speaking` usa a mesma imagem de `neutral` (R2); o efeito da presenca roda depois do render.
    await waitFor(() => {
      expectFace('neutral')
    })

    stream.push(sseFrame('done', answer(2, 1, 'Bora')))
    stream.close()
    await waitFor(() => {
      expect(screen.getByTestId('tutor-live')).toHaveTextContent('Kairya terminou de responder.')
    })
    expectFace('neutral')
  })

  it('falha provedor_indisponivel: preocupada e a bolha traz a falha de conexao', async () => {
    mountWithPresence({
      [SEND]: () =>
        streamResponse([
          sseFrame('user_message', question(1, 'Oi', 'c1')),
          sseFrame('error', { code: 'provedor_indisponivel' }),
        ]),
    })
    await typeAndSend('Oi')

    await waitFor(() => {
      expectFace('concerned')
    })
    expect(screen.getByText(OFFLINE_LINE)).toBeInTheDocument()
  })

  it('confirmar uma proposta faz a bolha dizer proposal_accepted_1', async () => {
    const proposal: ActionRead = {
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
    const onMissionCreated = vi.fn()
    mountWithPresence(
      {
        [HISTORY]: () =>
          Response.json([
            question(1, 'Me dá uma missão', 'c1'),
            { ...answer(2, 1, 'Proponho esta missão.'), actions: [proposal] },
          ]),
        'POST /api/tutoring/actions/5/confirm': () =>
          Response.json({
            action: { ...proposal, state: 'executada', mission_id: 40 },
            mission: { id: 40, instructions: 'x' },
          }),
      },
      onMissionCreated,
    )

    const card = await screen.findByTestId('tutor-proposal')
    expect(screen.queryByText('Combinado. Está na sua lista.')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByTestId('proposal-confirm'))

    expect(await screen.findByText('Combinado. Está na sua lista.')).toBeInTheDocument()
    expect(onMissionCreated).toHaveBeenCalledTimes(1)
  })

  it('Review Focus 5: digitar durante a celebracao nao troca o rosto', async () => {
    mountWithPresence({})
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'celebrar' }))
    expectFace('celebrating')

    type('Outra duvida')
    expectFace('celebrating')
    type('')
    expectFace('celebrating')

    fireEvent.click(screen.getByRole('button', { name: 'fim da celebracao' }))
    expectFace('neutral')
  })

  it('R8: a tutora indisponivel ao abrir nao deixa a Kairya preocupada', async () => {
    mountWithPresence({ [STATUS]: () => Response.json({ available: false }) })

    expect(await screen.findByTestId('tutor-unavailable')).toBeInTheDocument()
    expectFace('neutral')
    expect(screen.queryByText(OFFLINE_LINE)).not.toBeInTheDocument()
  })
})
