import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import type { ActionRead, MessageRead } from '../../src/features/tutoring/types'
import { definirRoteiro, liberar, reiniciar, requisicoes } from './falso'
import { API_URL } from './servers'

/**
 * A tutoria ponta a ponta: navegador real, API real, banco real e o servidor
 * falso da Anthropic como processo (`tests/integration/falso_do_e2e.py`).
 *
 * O falso e roteirizado ANTES de cada acao pelo controle HTTP, e reiniciado
 * antes de cada cenario: roteiro e contagem de requisicoes nunca vazam de um
 * cenario para o outro. A API do E2E so fala com ele -- o `scripts/e2e-env.sh`
 * recusa subi-la com o provedor fora do loopback e impoe a chave ficticia, e
 * o cenario (a) confere a chave que o falso recebeu.
 *
 * O banco e compartilhado e a conversa e UMA so (spec do 1b, D3): cada
 * pergunta e proposta daqui carrega o sufixo `EXECUCAO`, e e por ele que o
 * cenario acha o que e seu.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** O texto literal do estado indisponivel (spec, tabela "Estados"). */
const INDISPONIVEL = 'A Tifa está fora do ar: falta configurar o provedor.'

interface Mensagem {
  id: number
  role: 'user' | 'tutor'
  content: string
  status: string
  client_message_id: string | null
  reply_to_id: number | null
  error_code: string | null
  fallback_model: string | null
  actions: { id: number; state: string; payload: { instructions: string } }[]
}

/** Uma proposta valida para o `MissionCreate`, com prazo uma semana adiante. */
function proposta(rotulo: string) {
  return {
    instructions: `${rotulo} (e2e ${EXECUCAO})`,
    completion_criterion: `Resumo de uma página entregue (e2e ${EXECUCAO})`,
    difficulty: 2,
    estimated_minutes: 30,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/** O painel pronto: status disponivel e historico carregado (campo habilitado). */
async function abrirPainel(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeEnabled()
}

async function perguntar(page: Page, texto: string): Promise<void> {
  await page.getByLabel('Sua mensagem para a Tifa').fill(texto)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
}

// `exact: true` nos nomes curtos ("Enviar", "Tentar de novo"): o Playwright
// casa nome acessivel por SUBSTRING por padrao, e o quadro tem botoes como
// "Tentar de novo a missão: ..." que casariam por acidente.

async function semViolacoes(page: Page): Promise<void> {
  // Conjunto PADRAO: sem `withTags` nem `disableRules`.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

/** A conversa como a API a guarda -- a fonte de verdade para "nao duplicou". */
async function conversa(page: Page): Promise<Mensagem[]> {
  const resposta = await page.request.get(`${API_URL}/api/tutoring/messages`)
  expect(resposta.status()).toBe(200)
  return (await resposta.json()) as Mensagem[]
}

test.beforeEach(async () => {
  await reiniciar()
})

test('(a) perguntar, ver o texto chegar, confirmar e ver a missao no quadro', async ({ page }) => {
  const pedido = proposta('Revisar recursão')
  await definirRoteiro({
    blocks: [{ text: ['Bora ', 'estudar ', 'recursão!'] }, { tool_input: pedido }],
    // Presa depois do primeiro pedaco: message_start, os 4 eventos do bloco
    // de thinking que o falso emite por padrao, content_block_start e o
    // primeiro delta saem; o resto espera o `liberar()`. E o
    // `APOS_O_PRIMEIRO_PEDACO` de `tests/integration/provedor_falso.py`.
    hold_after_events: 7,
  })
  await abrirPainel(page)

  await perguntar(page, `Me dá uma missão de recursão (e2e ${EXECUCAO})`)

  // ESCREVENDO: o texto chegou pela metade, e a regiao viva anuncia o inicio.
  await expect(page.getByTestId('tutor-partial')).toContainText('Bora')
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa está escrevendo…')
  // O campo foi limpo pelo `user_message`: a pergunta esta gravada.
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toHaveValue('')
  await semViolacoes(page)

  await liberar()

  // PROPOSTA: o cartao, e o fim anunciado.
  const cartao = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
  await expect(cartao).toBeVisible()
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa terminou de responder.')
  await semViolacoes(page)

  // A API falou com o FALSO, uma vez, e com a chave FICTICIA.
  const recebidas = await requisicoes()
  expect(recebidas).toHaveLength(1)
  expect(recebidas[0]?.api_key).toBe('e2e-chave-ficticia')

  await cartao.getByRole('button', { name: `Confirmar a proposta: ${pedido.instructions}` }).click()
  await expect(cartao.getByTestId('proposal-created')).toHaveText('Missão criada')

  // O quadro recarregou sozinho, pela pagina, e mostra a missao nova.
  await expect(
    page
      .getByTestId('missions-list')
      .getByTestId('mission-item')
      .filter({ hasText: pedido.instructions }),
  ).toHaveCount(1)
})

test('(b) recusar uma proposta: o cartao fica marcado e nenhuma missao nasce', async ({ page }) => {
  const pedido = proposta('Ler o capítulo 5')
  await definirRoteiro({ blocks: [{ text: ['Que tal esta?'] }, { tool_input: pedido }] })
  await abrirPainel(page)

  await perguntar(page, `Me propõe uma leitura (e2e ${EXECUCAO})`)
  const cartao = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
  await cartao.getByRole('button', { name: `Recusar a proposta: ${pedido.instructions}` }).click()

  await expect(cartao.getByTestId('proposal-rejected')).toHaveText('Proposta recusada')
  await expect(cartao.getByRole('button')).toHaveCount(0)

  // O servidor gravou `recusada`, e nao criou missao.
  const acao = (await conversa(page))
    .flatMap((m) => m.actions)
    .find((a) => a.payload.instructions === pedido.instructions)
  expect(acao?.state).toBe('recusada')
  const missoes = (await (await page.request.get(`${API_URL}/api/missions`)).json()) as {
    instructions: string
  }[]
  expect(missoes.filter((m) => m.instructions === pedido.instructions)).toHaveLength(0)
})

test('(c) a resposta cortada no meio, e o Tentar de novo sem duplicar a pergunta', async ({
  page,
}) => {
  const pergunta = `Explica ponteiros pra mim (e2e ${EXECUCAO})`
  // Os textos da Tifa tambem carregam o sufixo: a conversa acumula as
  // respostas das execucoes anteriores (ate 50 na tela), e um "Começo" sem
  // sufixo casaria com a resposta cortada de ONTEM -- o cenario passaria
  // antes de o corte de hoje acontecer. Medido: na segunda execucao
  // seguida, o localizador sem sufixo resolveu para duas linhas.
  const comeco = `Começo (e2e ${EXECUCAO}) `
  const inteira = `Resposta inteira, agora sim (e2e ${EXECUCAO}).`
  // O falso fecha a conexao depois do primeiro pedaco, sem `message_stop`:
  // o SDK termina em silencio e o servico grava `falhou` com
  // `provedor_indisponivel` (medido no 1b-1).
  await definirRoteiro({
    blocks: [{ text: [comeco, 'do meio', ' e fim.'] }],
    // 7: o primeiro pedaco depois do thinking (`APOS_O_PRIMEIRO_PEDACO` de
    // `tests/integration/provedor_falso.py`).
    cut_after_events: 7,
  })
  await abrirPainel(page)

  await perguntar(page, pergunta)

  const cortada = page.getByTestId('tutor-message').filter({ hasText: comeco.trim() })
  await expect(cortada.getByTestId('tutor-message-mark')).toHaveText('Resposta com falha')
  await expect(page.getByRole('alert')).toContainText('A Tifa não conseguiu responder agora.')

  await definirRoteiro({ blocks: [{ text: [inteira] }] })
  await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click()

  await expect(page.getByTestId('tutor-message').filter({ hasText: inteira })).toHaveCount(1)
  // Na TELA, a pergunta aparece uma vez so.
  await expect(page.getByTestId('tutor-message').filter({ hasText: pergunta })).toHaveCount(1)
  // E o parcial da tentativa que falhou CONTINUA na tela, marcado (spec, l.345).
  await expect(cortada.getByTestId('tutor-message-mark')).toHaveText('Resposta com falha')

  // No SERVIDOR: uma pergunta, duas respostas (a que falhou e a completa).
  const mensagens = await conversa(page)
  const perguntas = mensagens.filter((m) => m.role === 'user' && m.content === pergunta)
  expect(perguntas).toHaveLength(1)
  const respostas = mensagens.filter((m) => m.reply_to_id === perguntas[0]?.id)
  expect(respostas.map((m) => m.status).sort()).toEqual(['completa', 'falhou'])
  // E o modelo foi chamado duas vezes -- uma por tentativa, nenhuma a mais.
  expect(await requisicoes()).toHaveLength(2)
})

for (const motivo of ['max_tokens', 'model_context_window_exceeded'] as const) {
  test(`(f) a resposta cortada por tamanho (${motivo}): anunciada como cortada, com a nota de pedir por partes`, async ({
    page,
  }) => {
    // Pendencias 120, 121 e 122, ponta a ponta: o SDK real le o `stop_reason`
    // do falso, o backend grava `interrompida` com `resposta_longa`, e a tela
    // nao diz "terminou".
    const pergunta = `Me explica tudo de Go (${motivo}, e2e ${EXECUCAO})`
    const comeco = `Go e uma linguagem (${motivo}, e2e ${EXECUCAO})`
    await definirRoteiro({ blocks: [{ text: [comeco] }], stop_reason: motivo })
    await abrirPainel(page)

    await perguntar(page, pergunta)

    const cortada = page.getByTestId('tutor-message').filter({ hasText: comeco })
    await expect(cortada.getByTestId('tutor-message-mark')).toHaveText('Resposta interrompida')
    await expect(page.getByTestId('tutor-live')).toHaveText(
      'A resposta da Tifa ficou longa demais e foi cortada. Tente pedir por partes.',
    )
    await expect(page.getByTestId('tutor-history-retry-note')).toContainText(
      'A última resposta ficou longa demais e foi cortada. Tente pedir por partes',
    )
    await semViolacoes(page)

    const mensagens = await conversa(page)
    const gravada = mensagens.find((m) => m.content === comeco)
    expect([gravada?.status, gravada?.error_code]).toEqual(['interrompida', 'resposta_longa'])
  })
}

test('(g) a resposta recusada: alerta proprio e o parcial fora da conversa', async ({ page }) => {
  const pergunta = `Pergunta que o modelo recusa (e2e ${EXECUCAO})`
  const parcial = `Texto antes da recusa (e2e ${EXECUCAO})`
  await definirRoteiro({ blocks: [{ text: [parcial] }], stop_reason: 'refusal' })
  await abrirPainel(page)

  await perguntar(page, pergunta)

  await expect(page.getByRole('alert')).toContainText('A Tifa não pôde responder a esta pergunta.')
  await expect(page.getByText(parcial)).toHaveCount(0)
  await semViolacoes(page)

  const mensagens = await conversa(page)
  const perguntas = mensagens.filter((m) => m.role === 'user' && m.content === pergunta)
  expect(perguntas).toHaveLength(1)
  const respostas = mensagens.filter((m) => m.reply_to_id === perguntas[0]?.id)
  expect(respostas.map((m) => [m.status, m.content, m.error_code])).toEqual([
    ['falhou', '', 'resposta_recusada'],
  ])
})

test('(h) a recusa no meio que o substituto continuou: o texto inteiro e a nota do substituto', async ({
  page,
}) => {
  // Pendencia 174, ponta a ponta: o SDK real le o bloco `fallback` do falso
  // pelo endpoint beta, o backend grava `fallback_model`, e a tela mostra o
  // parcial do modelo pedido e a continuacao do substituto, com a nota.
  const pergunta = `Pergunta que o substituto responde (e2e ${EXECUCAO})`
  const parcial = `Comeco do modelo pedido (e2e ${EXECUCAO}). `
  const continuacao = `Fim do substituto (e2e ${EXECUCAO}).`
  await definirRoteiro({
    blocks: [{ text: [parcial] }, { text: [continuacao] }],
    fallback: { model: 'claude-opus-4-8', after_blocks: 1 },
  })
  await abrirPainel(page)

  await perguntar(page, pergunta)

  const resposta = page.getByTestId('tutor-message').filter({ hasText: continuacao })
  await expect(resposta.getByTestId('tutor-message-content')).toHaveText(parcial + continuacao)
  await expect(resposta.getByTestId('tutor-message-fallback')).toHaveText(
    'Respondida por um modelo substituto (claude-opus-4-8), porque o modelo principal não pôde responder a esta pergunta.',
  )
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa terminou de responder.')
  await semViolacoes(page)

  const mensagens = await conversa(page)
  const gravada = mensagens.find((m) => m.content === parcial + continuacao)
  expect([gravada?.status, gravada?.fallback_model]).toEqual(['completa', 'claude-opus-4-8'])
  // A requisicao pediu o fallback padrao.
  const [enviada] = await requisicoes()
  expect((enviada?.body as { fallbacks?: string }).fallbacks).toBe('default')
})

test('(d) indisponivel: o texto da spec, o campo desabilitado e o quadro funcionando', async ({
  page,
  playwright,
}) => {
  // Sem uma segunda API sem chave: o contrato "sem chave -> available: false
  // e 503 antes de gravar" e provado no pytest (test_status_indisponivel_sem_chave,
  // test_sem_chave_responde_503_e_nao_grava). Aqui se prova a TELA.
  const api = await playwright.request.newContext({ baseURL: API_URL })
  const semeada = (await (
    await api.post('/api/missions', {
      data: {
        instructions: `Missão do quadro com a Tifa fora (e2e ${EXECUCAO})`,
        completion_criterion: `Conferida (e2e ${EXECUCAO})`,
        difficulty: 1,
        estimated_minutes: 15,
        deadline: '2027-04-01T12:00:00Z',
      },
    })
  ).json()) as { id: number }
  await api.dispose()

  await page.route('**/api/tutoring/status', (rota) => rota.fulfill({ json: { available: false } }))
  await page.goto('/')

  await expect(page.getByTestId('tutor-unavailable')).toHaveText(INDISPONIVEL)
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled()
  // O Quartel-General continua funcionando.
  await expect(
    page.getByTestId('missions-list').locator(`[data-mission-id="${String(semeada.id)}"]`),
  ).toHaveCount(1)
  await semViolacoes(page)
  expect(await requisicoes()).toHaveLength(0)
})

test.describe('(e) celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a folha abre pelo botao fixo, sem rolagem horizontal, com o Enviar visivel', async ({
    page,
  }) => {
    await page.goto('/')
    const semRolagemHorizontal = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )

    await expect(page.getByTestId('tutor-sheet-open')).toBeVisible()
    expect(await semRolagemHorizontal()).toBe(true)

    await page.getByTestId('tutor-sheet-open').click()
    const folha = page.getByRole('dialog', { name: 'Tifa' })
    await expect(folha).toBeVisible()
    await expect(folha.getByRole('button', { name: 'Enviar', exact: true })).toBeInViewport()
    expect(await semRolagemHorizontal()).toBe(true)
    await semViolacoes(page)

    await page.keyboard.press('Escape')
    await expect(folha).toHaveCount(0)
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  })
  test('indisponível: Tab e Shift+Tab alcançam a conversa e devolvem o foco ao fechar', async ({
    page,
  }) => {
    await page.route('**/api/tutoring/status', (route) =>
      route.fulfill({ json: { available: false } }),
    )
    await page.route('**/api/tutoring/messages', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    await page.getByTestId('tutor-sheet-open').click()
    const sheet = page.getByRole('dialog', { name: 'Tifa' })
    const close = sheet.getByRole('button', { name: 'Fechar a conversa' })
    const history = sheet.getByRole('region', { name: 'Conversa com a Tifa' })
    await expect(sheet.getByTestId('tutor-unavailable')).toHaveText(INDISPONIVEL)
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await semViolacoes(page)
    await page.keyboard.press('Enter')
    await expect(sheet).toHaveCount(0)
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    expect(await requisicoes()).toHaveLength(0)
  })

  test('o link da ação executada participa do Tab e fecha a folha pelo teclado', async ({
    page,
  }) => {
    const pedido = proposta('Missão para navegar pelo teclado')
    await definirRoteiro({ blocks: [{ text: ['Vamos praticar!'] }, { tool_input: pedido }] })
    await page.goto('/')
    await page.getByTestId('tutor-sheet-open').click()
    await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeEnabled()
    await perguntar(page, `Missão para testar foco (e2e ${EXECUCAO})`)
    const card = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
    await card.getByRole('button', { name: `Confirmar a proposta: ${pedido.instructions}` }).click()
    await expect(card.getByTestId('proposal-created')).toHaveText('Missão criada')
    // O turno vem do banco real. Isola somente o histórico exibido para que
    // ações dos outros cenários não alterem a ordem de teclado deste caso.
    const messages = await conversa(page)
    const response = messages.find((message) =>
      message.actions.some((action) => action.payload.instructions === pedido.instructions),
    )!
    const turn = messages.filter(
      (message) => message.id === response.id || message.id === response.reply_to_id,
    )
    await page.route('**/api/tutoring/status', (route) =>
      route.fulfill({ json: { available: false } }),
    )
    await page.route('**/api/tutoring/messages', (route) => route.fulfill({ json: turn }))
    await page.reload()
    await page.getByTestId('tutor-sheet-open').click()
    const sheet = page.getByRole('dialog', { name: 'Tifa' })
    const close = sheet.getByRole('button', { name: 'Fechar a conversa' })
    const history = sheet.getByRole('region', { name: 'Conversa com a Tifa' })
    const link = sheet.getByRole('link', { name: 'Ver no Quartel-General' })
    await expect(sheet.getByTestId('tutor-unavailable')).toHaveText(INDISPONIVEL)
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(link).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await semViolacoes(page)
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/#missions-heading$/)
    await expect(page.locator('#missions-heading')).toBeInViewport()
    expect(await requisicoes()).toHaveLength(1)
  })
})

// Regressão exclusivamente de frontend: POST/GET de tutoria interceptados,
// sem chamada ao provedor ou escrita no banco nesta sequência controlada.
for (const decision of ['executada', 'recusada', 'falhou'] as const) {
  test(`histórico anterior não reabre a ação ${decision}`, async ({ page }) => {
    const payload = proposta(`Decisão durante GET: ${decision}`)
    const action: ActionRead = {
      id: 4900,
      kind: 'create_mission',
      state: 'proposta',
      payload,
      mission_id: null,
      error_code: null,
    }
    const updated: ActionRead = {
      ...action,
      state: decision,
      mission_id: decision === 'executada' ? 4901 : null,
      error_code: decision === 'falhou' ? 'prazo_expirado' : null,
    }
    const message = (id: number, role: MessageRead['role'], content: string): MessageRead => ({
      id,
      role,
      content,
      status: 'completa',
      client_message_id: role === 'user' ? `e2e-${id}` : null,
      reply_to_id: role === 'tutor' ? id - 1 : null,
      error_code: null,
      fallback_model: null,
      created_at: '2026-10-04T12:00:00Z',
      actions: [],
    })
    const initial = [
      message(1, 'user', 'Quero uma missão'),
      { ...message(2, 'tutor', 'Proponho esta.'), actions: [action] },
    ]
    let captured!: () => void
    const started = new Promise<void>((resolve) => {
      captured = resolve
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let historyCalls = 0
    let sentQuestion: MessageRead | undefined
    await page.route('**/api/tutoring/messages', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          content: string
          client_message_id: string
        }
        sentQuestion = {
          ...message(3, 'user', body.content),
          client_message_id: body.client_message_id,
        }
        const events = [
          ['user_message', sentQuestion],
          ['delta', { text: 'Prefixo seguro' }],
          ['error', { code: 'provedor_indisponivel' }],
        ]
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: events
            .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            .join(''),
        })
        return
      }
      historyCalls += 1
      if (historyCalls === 1) {
        await route.fulfill({ json: initial })
        return
      }
      captured()
      await held
      // O texto distinto prova que a leitura foi de fato aplicada antes do
      // oráculo do cartão. Só esperar finished() poderia observar a UI antiga.
      await route.fulfill({
        json: [
          ...initial,
          sentQuestion,
          {
            ...message(4, 'tutor', 'Histórico atualizado pelo GET controlado'),
            status: 'falhou',
            error_code: 'provedor_indisponivel',
          },
        ],
      })
    })
    await page.route('**/api/tutoring/actions/4900/*', async (route) => {
      if (decision === 'falhou') {
        await route.fulfill({ status: 422, json: { code: 'prazo_expirado' } })
      } else {
        await route.fulfill({
          json:
            decision === 'executada'
              ? { action: updated, mission: { id: 4901, instructions: payload.instructions } }
              : { action: updated },
        })
      }
    })
    await abrirPainel(page)
    const card = page.getByTestId('tutor-proposal').filter({ hasText: payload.instructions })
    await expect(card).toHaveAttribute('data-state', 'proposta')
    await perguntar(page, `Falha controlada (e2e ${EXECUCAO})`)
    await started
    await card.getByTestId(decision === 'recusada' ? 'proposal-reject' : 'proposal-confirm').click()
    await expect(card).toHaveAttribute('data-state', decision)
    await page.getByLabel('Sua mensagem para a Tifa').fill('Rascunho após a decisão')
    release()
    await expect(
      page.getByText('Histórico atualizado pelo GET controlado', { exact: true }),
    ).toBeVisible()
    await expect(card).toHaveAttribute('data-state', decision)
    await expect(card.getByTestId('proposal-confirm')).toHaveCount(0)
    await expect(card.getByTestId('proposal-reject')).toHaveCount(0)
    await expect(page.getByLabel('Sua mensagem para a Tifa')).toHaveValue('Rascunho após a decisão')
    await expect(
      card.getByTestId(
        decision === 'executada'
          ? 'proposal-created'
          : decision === 'recusada'
            ? 'proposal-rejected'
            : 'proposal-expired',
      ),
    ).toBeVisible()
    if (decision === 'executada') {
      await expect(card.getByTestId('proposal-board-link')).toBeVisible()
    }
    expect(historyCalls).toBe(2)
  })
}
