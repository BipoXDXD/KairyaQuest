// Import NOMEADO, nao o default: ver o comentario em headquarters.spec.ts.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { instanteRelativo, isoUtc } from './datas'
import { definirRoteiro, reiniciar } from './falso'

/**
 * O axe sobre os estados TRANSITORIOS e de FALHA da interface (pendencia
 * 21/61): carregando, em voo, falhou e vazio.
 *
 * Os outros specs auditam o estado final (a lista cheia, a conclusao, a
 * resposta inteira) e alguns estados de falha pontuais. O que a pessoa ve
 * enquanto espera -- e quando a espera acaba mal -- e justamente onde moram
 * `role="status"`/`role="alert"`, botoes desabilitados e textos que mudam, e
 * nada disso era auditado de forma sistematica.
 *
 * **Determinismo, sem `sleep`.** Nenhum estado aqui depende de uma corrida de
 * tempo. Os tres mecanismos sao os que os outros specs ja usam:
 *
 * - **Pedido segurado** (`segurando`): o `page.route` segura o pedido numa
 *   promessa que o proprio cenario solta. O estado "em voo" dura exatamente
 *   ate o `soltar()`, e a asseveracao espera o texto do estado, nao um
 *   intervalo.
 * - **Falha no navegador** (`rota.abort()` e `rota.fulfill({ status: 503 })`):
 *   independe de derrubar servidor, igual ao cenario de erro do
 *   `headquarters.spec.ts`.
 * - **Servidor falso roteirizado** (`definirRoteiro`): para as falhas que
 *   nascem do provedor (resposta cortada, avaliacao que falha).
 *
 * Em cada cenario, o estado e CONFIRMADO na tela (o testid e o texto dele)
 * ANTES do axe: um axe sobre a tela errada passaria por acidente.
 *
 * O banco e compartilhado e nao e limpo entre execucoes: as missoes semeadas
 * carregam o sufixo `EXECUCAO` e sao achadas pelo `id`, nunca por posicao.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** O POST que confirma uma proposta; o id da acao so se conhece em tempo de execucao. */
const CONFIRMAR_ACAO = /^\/api\/tutoring\/actions\/\d+\/confirm$/

const RESPOSTA_503 = { status: 503, json: {} } as const

/** As cinco leituras do Quartel-General e da conversa que o boot dispara. */
const LEITURAS_DO_QG = [
  '/api/missions',
  '/api/cycle',
  '/api/progress',
  '/api/tutoring/messages',
  '/api/tutoring/status',
] as const

async function semViolacoes(page: Page): Promise<void> {
  // Conjunto PADRAO: sem `withTags` nem `disableRules`.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

/** O predicado de `segurando` para caminhos exatos. */
function caminhosExatos(...caminhos: string[]): (caminho: string) => boolean {
  return (caminho) => caminhos.includes(caminho)
}

/**
 * Segura os pedidos (do metodo dado) cujo caminho `casa`, ate o `soltar()`.
 *
 * Quando o cenario chama `durante`, o pedido ainda pode nem ter saido -- por
 * isso a espera e SEMPRE pela interface (o texto do estado em voo), e nunca
 * por tempo. Ao soltar, o pedido segue para o servidor de verdade.
 *
 * O `finally` solta e espera as rotas terminarem: um cenario que reprovasse
 * no meio nao deixa pedido pendurado no navegador.
 */
async function segurando(
  page: Page,
  casa: (caminho: string) => boolean,
  metodo: string,
  durante: (soltar: () => void) => Promise<void>,
): Promise<void> {
  let soltar!: () => void
  const solto = new Promise<void>((resolve) => {
    soltar = resolve
  })
  await page.route('**/api/**', async (rota) => {
    const pedido = rota.request()
    if (pedido.method() === metodo && casa(new URL(pedido.url()).pathname)) {
      await solto
    }
    await rota.continue()
  })
  try {
    await durante(soltar)
  } finally {
    soltar()
    await page.unrouteAll({ behavior: 'wait' })
  }
}

/**
 * Faz os GETs dos caminhos dados falharem, de dois jeitos: `rede` (o `fetch`
 * rejeita, sem resposta) e `servidor` (503 sem corpo util). Sao dois textos de
 * falha diferentes na interface, e o axe audita os dois.
 */
async function falharLeituras(
  page: Page,
  caminhos: readonly string[],
  variante: 'rede' | 'servidor',
): Promise<void> {
  await page.route('**/api/**', async (rota) => {
    const pedido = rota.request()
    if (pedido.method() !== 'GET' || !caminhos.includes(new URL(pedido.url()).pathname)) {
      await rota.continue()
    } else if (variante === 'rede') {
      await rota.abort()
    } else {
      await rota.fulfill(RESPOSTA_503)
    }
  })
}

/** O boot terminou: nenhuma das leituras do QG esta mais carregando. */
async function esperarFimDoCarregamento(page: Page): Promise<void> {
  for (const testid of [
    'missions-loading',
    'cycle-loading',
    'progress-loading',
    'tutor-history-loading',
  ]) {
    await expect(page.getByTestId(testid)).toHaveCount(0)
  }
}

interface Pedido {
  instructions: string
  completion_criterion: string
  difficulty: number
  estimated_minutes: number
  deadline: string
}

interface MissaoCriada {
  id: number
  instructions: string
  xp: number
}

/** Semeia pela API, como os outros specs: contrato, e nao SQL. */
async function semear(
  api: APIRequestContext,
  rotulo: string,
  diasAdiante: number,
): Promise<MissaoCriada> {
  const pedido: Pedido = {
    instructions: `${rotulo} (e2e ${EXECUCAO})`,
    completion_criterion: `Conferido (e2e ${EXECUCAO})`,
    difficulty: 2,
    estimated_minutes: 30,
    deadline: isoUtc(instanteRelativo(diasAdiante, 10)),
  }
  const resposta = await api.post('/api/missions', { data: pedido })
  expect(resposta.status(), await resposta.text()).toBe(201)
  return (await resposta.json()) as MissaoCriada
}

/** Semeia e CONCLUI com evidencia: o cartao nasce com o pedido de avaliacao. */
async function semearConcluidaComEvidencia(
  api: APIRequestContext,
  rotulo: string,
  diasAdiante: number,
): Promise<MissaoCriada> {
  const missao = await semear(api, rotulo, diasAdiante)
  const conclusao = await api.post(`/api/missions/${String(missao.id)}/complete`, {
    data: {
      operation_id: randomUUID(),
      evidence: { text: `Resumo escrito (e2e ${EXECUCAO})`, link: null },
    },
  })
  expect(conclusao.status(), await conclusao.text()).toBe(200)
  return missao
}

function cartaoDa(page: Page, missao: MissaoCriada): Locator {
  return page.getByTestId('missions-list').locator(`[data-mission-id="${String(missao.id)}"]`)
}

test.beforeEach(async () => {
  await reiniciar()
})

test.describe('Quartel-General: leituras', () => {
  test('carregando: as quatro regioes de espera passam no axe e a tela se completa ao soltar', async ({
    page,
  }) => {
    await segurando(page, caminhosExatos(...LEITURAS_DO_QG), 'GET', async (soltar) => {
      await page.goto('/')

      await expect(page.getByTestId('missions-loading')).toBeVisible()
      await expect(page.getByTestId('cycle-loading')).toBeVisible()
      await expect(page.getByTestId('progress-loading')).toBeVisible()
      await expect(page.getByTestId('tutor-history-loading')).toBeVisible()
      await semViolacoes(page)

      soltar()
      await esperarFimDoCarregamento(page)
      await expect(page.getByTestId('progress-total')).toBeVisible()
    })
  })

  for (const variante of ['rede', 'servidor'] as const) {
    test(`erro (${variante}): as cinco leituras falham, passam no axe e o Tentar novamente recupera`, async ({
      page,
    }) => {
      await falharLeituras(page, LEITURAS_DO_QG, variante)
      await page.goto('/')

      const erros = [
        'missions-error',
        'cycle-error',
        'progress-error',
        'tutor-history-error',
        'tutor-status-error',
      ]
      for (const testid of erros) {
        await expect(page.getByTestId(testid)).toBeVisible()
      }
      await semViolacoes(page)

      await page.unrouteAll({ behavior: 'wait' })
      for (const testid of [
        'missions-retry',
        'cycle-retry',
        'progress-retry',
        'tutor-history-retry',
        'tutor-status-retry',
      ]) {
        await page.getByTestId(testid).click()
      }
      for (const testid of erros) {
        await expect(page.getByTestId(testid)).toHaveCount(0)
      }
      await expect(page.getByTestId('progress-total')).toBeVisible()
    })
  }

  test('vazio: o quadro sem missoes passa no axe', async ({ page }) => {
    await page.route('**/api/missions', async (rota) => {
      if (rota.request().method() === 'GET') {
        await rota.fulfill({ json: [] })
      } else {
        await rota.continue()
      }
    })
    await page.goto('/')

    await expect(page.getByTestId('missions-empty')).toBeVisible()
    await esperarFimDoCarregamento(page)
    await semViolacoes(page)
  })
})

test.describe('Campanhas: a trilha', () => {
  async function abrirCampanhas(page: Page): Promise<void> {
    await page.goto('/')
    await page.getByTestId('nav-campaigns').click()
  }

  test('carregando: a espera da trilha passa no axe e a trilha aparece ao soltar', async ({
    page,
  }) => {
    await segurando(page, caminhosExatos('/api/plans/current'), 'GET', async (soltar) => {
      await abrirCampanhas(page)

      await expect(page.getByTestId('trail-loading')).toBeVisible()
      await semViolacoes(page)

      soltar()
      await expect(page.getByTestId('trail-loading')).toHaveCount(0)
    })
  })

  for (const variante of ['rede', 'servidor'] as const) {
    test(`erro (${variante}): a falha da trilha passa no axe e o Tentar novamente recupera`, async ({
      page,
    }) => {
      await falharLeituras(page, ['/api/plans/current'], variante)
      await abrirCampanhas(page)

      await expect(page.getByTestId('trail-error')).toBeVisible()
      await semViolacoes(page)

      await page.unrouteAll({ behavior: 'wait' })
      await page.getByTestId('trail-retry').click()
      await expect(page.getByTestId('trail-error')).toHaveCount(0)
      await expect(page.getByTestId('trail-loading')).toHaveCount(0)
    })
  }

  test('vazio: sem plano na semana, a trilha passa no axe', async ({ page }) => {
    await page.route('**/api/plans/current', (rota) => rota.fulfill({ json: { plan: null } }))
    await abrirCampanhas(page)

    await expect(page.getByTestId('trail-no-plan')).toBeVisible()
    await semViolacoes(page)
  })
})

test.describe('Kairya: tutoria', () => {
  const CAMPO = 'Sua mensagem para a Kairya'

  async function abrirPainel(page: Page): Promise<void> {
    await page.goto('/')
    await expect(page.getByLabel(CAMPO)).toBeEnabled()
  }

  async function perguntar(page: Page, texto: string): Promise<void> {
    await page.getByLabel(CAMPO).fill(texto)
    await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  }

  test('enviando: o pedido em voo, antes de a pergunta ser gravada, passa no axe', async ({
    page,
  }) => {
    await definirRoteiro({ blocks: [{ text: [`Resposta calma (e2e ${EXECUCAO}).`] }] })
    await abrirPainel(page)

    await segurando(page, caminhosExatos('/api/tutoring/messages'), 'POST', async (soltar) => {
      await perguntar(page, `Pergunta em voo (e2e ${EXECUCAO})`)

      // O botao diz que esta ocupado e nao aceita um segundo envio.
      const ocupado = page.getByTestId('tutor-send')
      await expect(ocupado).toHaveText('Enviando…')
      await expect(ocupado).toBeDisabled()
      await semViolacoes(page)

      soltar()
      await expect(page.getByTestId('tutor-live')).toHaveText('Kairya terminou de responder.')
    })
  })

  test('falha: a resposta cortada no meio, com o alerta e o Tentar de novo, passa no axe', async ({
    page,
  }) => {
    const comeco = `Começo cortado (e2e ${EXECUCAO}) `
    // O falso fecha a conexao depois do primeiro pedaco, sem `message_stop`
    // (mesmo roteiro do cenario (c) de tutoring.spec.ts).
    await definirRoteiro({ blocks: [{ text: [comeco, 'resto'] }], cut_after_events: 7 })
    await abrirPainel(page)

    await perguntar(page, `Pergunta que falha (e2e ${EXECUCAO})`)

    await expect(page.getByTestId('tutor-failure')).toContainText(
      'A Kairya não conseguiu responder agora.',
    )
    await expect(page.getByTestId('tutor-retry')).toBeVisible()
    await semViolacoes(page)
  })

  /** Uma proposta de missao no painel, pronta para decidir. */
  async function propor(page: Page, rotulo: string): Promise<Locator> {
    const pedido = {
      instructions: `${rotulo} (e2e ${EXECUCAO})`,
      completion_criterion: `Resumo entregue (e2e ${EXECUCAO})`,
      difficulty: 2,
      estimated_minutes: 30,
      deadline: isoUtc(instanteRelativo(20, 10)),
    }
    await definirRoteiro({ blocks: [{ text: ['Que tal esta?'] }, { tool_input: pedido }] })
    await abrirPainel(page)
    await perguntar(page, `Me propõe uma missão (e2e ${EXECUCAO})`)
    const cartao = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
    await expect(cartao).toBeVisible()
    return cartao
  }

  test('decidindo: a confirmacao em voo desabilita os dois botoes e passa no axe', async ({
    page,
  }) => {
    const cartao = await propor(page, 'Proposta a confirmar')

    await segurando(
      page,
      (caminho) => CONFIRMAR_ACAO.test(caminho),
      'POST',
      async (soltar) => {
        await cartao.getByTestId('proposal-confirm').click()

        // Os DOIS botoes ficam desabilitados: e a guarda contra o clique duplo.
        await expect(cartao.getByTestId('proposal-confirm')).toHaveText(/^Confirmando…/)
        await expect(cartao.getByTestId('proposal-confirm')).toBeDisabled()
        await expect(cartao.getByTestId('proposal-reject')).toBeDisabled()
        await semViolacoes(page)

        soltar()
        await expect(cartao.getByTestId('proposal-created')).toHaveText('Missão criada')
      },
    )
  })
})

test.describe('Missoes: a conclusao e a avaliacao', () => {
  test('iniciando: o pedido em voo no cartao passa no axe', async ({ page, request }) => {
    const missao = await semear(request, 'Missao a iniciar', 40)
    await page.goto('/')
    const cartao = cartaoDa(page, missao)

    await segurando(
      page,
      caminhosExatos(`/api/missions/${String(missao.id)}/start`),
      'POST',
      async (soltar) => {
        await cartao
          .getByRole('button', { name: `Iniciar a missão: ${missao.instructions}`, exact: true })
          .click()

        await expect(cartao.getByTestId('mission-start')).toBeDisabled()
        await semViolacoes(page)

        soltar()
        await expect(cartao.getByTestId('mission-start-status')).toHaveText('Missão iniciada.')
      },
    )
  })

  test('concluindo: o pedido em voo no cartao passa no axe', async ({ page, request }) => {
    const missao = await semear(request, 'Missao a concluir', 41)
    await page.goto('/')
    const cartao = cartaoDa(page, missao)

    await segurando(
      page,
      caminhosExatos(`/api/missions/${String(missao.id)}/complete`),
      'POST',
      async (soltar) => {
        await cartao
          .getByRole('button', { name: `Concluir a missão: ${missao.instructions}` })
          .click()

        await expect(cartao.getByTestId('mission-completion-text')).toHaveText(
          'Concluindo a missão…',
        )
        await expect(cartao.getByTestId('mission-complete')).toBeDisabled()
        await semViolacoes(page)

        soltar()
        await expect(cartao.getByTestId('mission-state')).toHaveText('Concluída')
      },
    )
  })

  test('avaliando: o pedido de avaliacao em voo passa no axe', async ({ page, request }) => {
    const missao = await semearConcluidaComEvidencia(request, 'Missao a avaliar', 42)
    await definirRoteiro({
      blocks: [
        {
          tool_input: { verdict: 'atende', feedback: `Resumo completo (e2e ${EXECUCAO})` },
          tool_name: 'record_evaluation',
        },
      ],
    })
    await page.goto('/')
    const cartao = cartaoDa(page, missao)

    await segurando(
      page,
      caminhosExatos(`/api/missions/${String(missao.id)}/evaluation`),
      'POST',
      async (soltar) => {
        await cartao.getByTestId('evaluation-request').click()

        await expect(cartao.getByTestId('evaluation-status-text')).toHaveText(
          'A Kairya está avaliando…',
        )
        await expect(cartao.getByTestId('evaluation-request')).toBeDisabled()
        await semViolacoes(page)

        soltar()
        await expect(cartao.getByText('Critério atendido', { exact: true })).toBeVisible()
      },
    )
  })

  test('avaliacao falhou: o alerta do provedor fora do ar passa no axe', async ({
    page,
    request,
  }) => {
    const missao = await semearConcluidaComEvidencia(request, 'Missao com avaliacao que falha', 43)
    // A falha e simulada no NAVEGADOR (502 com o `code` que a API usa), e nao
    // pelo falso: uma falha de verdade grava a avaliacao `falhou` no banco
    // compartilhado, e o cartao dela passaria a exibir, no quadro de todos os
    // specs seguintes, um botao "Tentar de novo" que colidiria com o do
    // `tutoring.spec.ts` (medido: o cenario (c) reprovou por isso no gate).
    await page.route(`**/api/missions/${String(missao.id)}/evaluation`, (rota) =>
      rota.fulfill({
        status: 502,
        json: { code: 'provedor_indisponivel', detail: 'Provedor indisponivel.' },
      }),
    )
    await page.goto('/')
    const cartao = cartaoDa(page, missao)

    await cartao.getByTestId('evaluation-request').click()

    await expect(cartao.getByTestId('evaluation-error')).toHaveText(
      /A Kairya não conseguiu avaliar agora\./,
    )
    await expect(cartao.getByRole('alert')).toBeVisible()
    await semViolacoes(page)
  })
})
