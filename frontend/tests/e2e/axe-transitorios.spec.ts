// Import NOMEADO, nao o default: ver o comentario em headquarters.spec.ts.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { esperarAnimacoesFinitas } from './animacoes'
import { test } from './saudacaoJaVista'
import { randomUUID } from 'node:crypto'
import type { Plan } from '../../src/features/campaigns/types'
import type { Mission } from '../../src/shared/types/mission'
import {
  campoDeHorario,
  diaRelativo,
  instanteRelativo,
  isoUtc,
  segundaDaSemana,
  somarDias,
} from './datas'
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
 * **Dois ambientes.** Cada cenario e registrado uma vez (`AMBIENTES`) e roda no
 * desktop e no celular de 390 px; no celular a Kairya mora numa folha que
 * cobre o quadro, entao os estados do quadro e os da Kairya sao auditados em
 * dois momentos (`abrirFolha`).
 *
 * **O que este spec NAO prova: contraste sobre gradiente.** `.rpg-progress` e
 * `.rpg-tutor` (src/index.css) tem fundo em `linear-gradient`, e sobre
 * gradiente o axe devolve `color-contrast` em `incomplete`, nunca em
 * `violations`. Os alertas que vivem nesses paineis passam neste spec SEM ter
 * o contraste decidido (medido, quando eram quatro paineis: trocar a cor de um
 * deles por quase preto nao reprovava nada). O cartao de missao e o ciclo
 * usam a superficie solida do `Panel` desde a migracao para o design system
 * (#173), e as cores de texto deles estao em `tokens/contrastPairs.ts`. Ver P-axe-transitorios-2-1 em
 * docs/handoff/2026-11-11-axe-transitorios-2.md.
 *
 * O banco e compartilhado e nao e limpo entre execucoes: as missoes semeadas
 * carregam o sufixo `EXECUCAO` e sao achadas pelo `id`, nunca por posicao.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** O POST que confirma uma proposta; o id da acao so se conhece em tempo de execucao. */
const CONFIRMAR_ACAO = /^\/api\/tutoring\/actions\/\d+\/confirm$/

/** O mesmo caminho como regex do `page.route`, sem as ancoras do pathname. */
const CONFIRMAR_ACAO_ROTA = /\/api\/tutoring\/actions\/\d+\/confirm$/

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
  await esperarAnimacoesFinitas(page)
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

/**
 * A semana de hoje como `GET /api/plans/current` a devolve: os dias ate hoje
 * revelados (alternando acesos e apagados, para a trilha ter as duas formas),
 * hoje disponivel, os futuros sem missao e a especial bloqueada.
 */
function planoDaSemana(): Plan {
  const hoje = diaRelativo(0)
  const inicio = segundaDaSemana(hoje)
  const missao = (id: number, dia: string, availability: Mission['availability']): Mission => ({
    id,
    day: dia,
    instructions: `Diária de ${dia}`,
    completion_criterion: 'Entregar resumo',
    difficulty: 2,
    estimated_minutes: 30,
    mission_type: 'diaria',
    deadline: `${dia}T23:59:59-03:00`,
    state: availability === 'concluida' ? 'concluida' : 'pendente',
    availability,
    started_at: null,
    completed_at: null,
    xp: 40,
    actual_duration_minutes: null,
    verification: null,
    evidence: null,
    evaluation: null,
    reschedules: [],
  })
  return {
    week_start: inicio,
    days: Array.from({ length: 7 }, (_, indice) => {
      const dia = somarDias(inicio, indice)
      if (dia > hoje) {
        return { day: dia, availability: 'fora_do_plano', mission: null }
      }
      const availability = dia === hoje ? 'disponivel' : indice % 2 === 0 ? 'concluida' : 'perdida'
      return { day: dia, availability, mission: missao(90000 + indice, dia, availability) }
    }),
    special: { availability: 'bloqueada', progress: 3, mission: null },
  }
}

function cartaoDa(page: Page, missao: MissaoCriada): Locator {
  return page.getByTestId('missions-list').locator(`[data-mission-id="${String(missao.id)}"]`)
}

test.beforeEach(async () => {
  await reiniciar()
})

/**
 * Os dois ambientes em que cada estado e auditado: o desktop (o padrao do
 * projeto) e o celular de 390 px, o mesmo de `tutoring.spec.ts` (e). No
 * celular a Kairya mora numa folha que se abre por um botao fixo; os demais
 * estados sao os mesmos da mesma tela, so que reorganizada.
 */
const AMBIENTES = [
  { nome: 'desktop', celular: false, uso: {} },
  {
    nome: 'celular (390 px)',
    celular: true,
    uso: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  },
] as const

for (const ambiente of AMBIENTES) {
  test.describe(ambiente.nome, () => {
    test.use(ambiente.uso)

    /**
     * No celular, a conversa da Kairya so existe com a folha aberta. A folha
     * cobre o quadro, entao os estados do quadro e os da Kairya sao auditados
     * em dois momentos (antes e depois de abri-la); no desktop os dois estao
     * na mesma tela e o `abrirFolha` nao faz nada.
     */
    async function abrirFolha(page: Page): Promise<void> {
      if (ambiente.celular) {
        await page.getByTestId('tutor-sheet-open').click()
        await expect(page.getByRole('dialog', { name: 'Kairya' })).toBeVisible()
      }
    }

    async function fecharFolha(page: Page): Promise<void> {
      if (ambiente.celular) {
        // O botao, e nao o Escape: depois de um "Tentar novamente" o foco foi
        // para o corpo da pagina, e o Escape so fecha a folha com o foco dentro.
        await page
          .getByRole('dialog', { name: 'Kairya' })
          .getByRole('button', { name: 'Fechar a conversa' })
          .click()
        await expect(page.getByRole('dialog', { name: 'Kairya' })).toHaveCount(0)
      }
    }

    test.describe('Quartel-General: leituras', () => {
      test('carregando: as quatro regioes de espera passam no axe e a tela se completa ao soltar', async ({
        page,
      }) => {
        await segurando(page, caminhosExatos(...LEITURAS_DO_QG), 'GET', async (soltar) => {
          await page.goto('/')

          await expect(page.getByTestId('missions-loading')).toBeVisible()
          await expect(page.getByTestId('cycle-loading')).toBeVisible()
          await expect(page.getByTestId('progress-loading')).toBeVisible()
          await semViolacoes(page)

          await abrirFolha(page)
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

          const errosDoQuadro = ['missions-error', 'cycle-error', 'progress-error']
          const errosDaKairya = ['tutor-history-error', 'tutor-status-error']
          for (const testid of errosDoQuadro) {
            await expect(page.getByTestId(testid)).toBeVisible()
          }
          await semViolacoes(page)

          await abrirFolha(page)
          for (const testid of errosDaKairya) {
            await expect(page.getByTestId(testid)).toBeVisible()
          }
          await semViolacoes(page)

          // A recuperacao: primeiro a Kairya (a folha esta aberta), depois o quadro.
          await page.unrouteAll({ behavior: 'wait' })
          await page.getByTestId('tutor-history-retry').click()
          await page.getByTestId('tutor-status-retry').click()
          for (const testid of errosDaKairya) {
            await expect(page.getByTestId(testid)).toHaveCount(0)
          }
          await fecharFolha(page)
          for (const testid of ['missions-retry', 'cycle-retry', 'progress-retry']) {
            await page.getByTestId(testid).click()
          }
          for (const testid of errosDoQuadro) {
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

      test('desatualizada: a recarga silenciosa que falha mantem a trilha, passa no axe e o Atualizar recupera', async ({
        page,
      }) => {
        let falhar = false
        await page.route('**/api/plans/current', (rota) =>
          falhar ? rota.fulfill(RESPOSTA_503) : rota.fulfill({ json: { plan: planoDaSemana() } }),
        )
        await abrirCampanhas(page)
        await expect(page.getByTestId('trail-week')).toBeVisible()
        await expect(page.getByTestId('trail-stale')).toHaveCount(0)

        // O retorno da aba (o `focus` da janela) dispara a recarga silenciosa,
        // que agora falha: a trilha continua e o aviso aparece.
        falhar = true
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await expect(page.getByTestId('trail-stale')).toBeVisible()
        await expect(page.getByTestId('trail-week')).toBeVisible()
        await semViolacoes(page)

        falhar = false
        await page.getByTestId('trail-refresh').click()
        await expect(page.getByTestId('trail-stale')).toHaveCount(0)
      })
    })

    test.describe('Kairya: tutoria', () => {
      const CAMPO = 'Sua mensagem para a Kairya'

      async function abrirPainel(page: Page): Promise<void> {
        await page.goto('/')
        if (ambiente.celular) {
          // A folha abre pelo botao fixo e anima a entrada; o campo habilitado
          // dentro dela e o sinal de que o painel esta pronto.
          await page.getByTestId('tutor-sheet-open').click()
        }
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
        // O ambiente entra no rotulo: o historico da Kairya e compartilhado, e a
        // proposta do desktop continuaria no quadro quando o celular filtra o
        // cartao pelo texto.
        const pedido = {
          instructions: `${rotulo} [${ambiente.nome}] (e2e ${EXECUCAO})`,
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

      test('limite diario: o aviso do 429 com o campo desabilitado passa no axe', async ({
        page,
      }) => {
        await page.route('**/api/tutoring/messages', (rota) =>
          rota.request().method() === 'POST'
            ? rota.fulfill({
                status: 429,
                headers: { 'Retry-After': '3600' },
                json: { code: 'limite_diario_da_tutoria', detail: 'Limite diario.' },
              })
            : rota.continue(),
        )
        await abrirPainel(page)

        await perguntar(page, `Pergunta acima do limite (e2e ${EXECUCAO})`)

        const falha = page.getByTestId('tutor-failure')
        await expect(falha).toContainText('Você chegou ao limite de conversas de hoje.')
        await expect(falha).toContainText('A Kairya volta à meia-noite.')
        await expect(page.getByLabel(CAMPO)).toBeDisabled()
        await semViolacoes(page)
      })

      test('resultado desconhecido: a conexao que cai sem resposta passa no axe', async ({
        page,
      }) => {
        // Sem corpo nem codigo, a interface nao sabe se a resposta chegou: o
        // texto de "resultado desconhecido", e nao o de um erro conhecido.
        await page.route('**/api/tutoring/messages', (rota) =>
          rota.request().method() === 'POST' ? rota.abort() : rota.continue(),
        )
        await abrirPainel(page)

        await perguntar(page, `Pergunta sem resposta (e2e ${EXECUCAO})`)

        await expect(page.getByTestId('tutor-failure')).toContainText(
          'Não deu para saber se a resposta chegou inteira.',
        )
        await expect(page.getByTestId('tutor-retry')).toBeVisible()
        await semViolacoes(page)
      })

      test('decisao recusada por ja decidida: o aviso com o Atualizar a conversa passa no axe', async ({
        page,
      }) => {
        const cartao = await propor(page, 'Proposta ja decidida')
        // A falha e simulada no NAVEGADOR (409 com o `code` que a API usa): a
        // proposta segue pendente no banco, e o cenario a recusa de verdade no
        // fim, para o historico compartilhado nao guardar um Confirmar aberto.
        await page.route(CONFIRMAR_ACAO_ROTA, (rota) =>
          rota.fulfill({
            status: 409,
            json: { code: 'transicao_ilegal', detail: 'Ja decidida.' },
          }),
        )

        await cartao.getByTestId('proposal-confirm').click()

        await expect(cartao.getByTestId('proposal-failure')).toContainText(
          'Esta proposta já foi decidida.',
        )
        await expect(cartao.getByTestId('proposal-refresh')).toBeVisible()
        await expect(cartao.getByTestId('proposal-confirm')).toHaveCount(0)
        await semViolacoes(page)

        await page.unrouteAll({ behavior: 'wait' })
        await cartao.getByTestId('proposal-refresh').click()
        await cartao.getByTestId('proposal-reject').click()
        await expect(cartao.getByTestId('proposal-rejected')).toHaveText('Proposta recusada')
      })

      for (const variante of ['rede', 'servidor'] as const) {
        test(`decisao que falha (${variante}): o aviso com o Tentar de novo passa no axe`, async ({
          page,
        }) => {
          const cartao = await propor(page, `Proposta com falha de ${variante}`)
          await page.route(CONFIRMAR_ACAO_ROTA, (rota) =>
            variante === 'rede' ? rota.abort() : rota.fulfill(RESPOSTA_503),
          )

          await cartao.getByTestId('proposal-confirm').click()

          await expect(cartao.getByTestId('proposal-failure')).toBeVisible()
          await expect(cartao.getByTestId('proposal-confirm')).toHaveText(/^Tentar de novo/)
          await expect(cartao.getByTestId('proposal-confirm')).toBeEnabled()
          await semViolacoes(page)

          await page.unrouteAll({ behavior: 'wait' })
          await cartao.getByTestId('proposal-reject').click()
          await expect(cartao.getByTestId('proposal-rejected')).toHaveText('Proposta recusada')
        })
      }
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
              .getByRole('button', {
                name: `Iniciar a missão: ${missao.instructions}`,
                exact: true,
              })
              .click()

            // O estado em voo foi CAPTURADO: o rotulo do botao e a regiao viva
            // dizem "Iniciando" e o botao esta desabilitado. Sem isso, o
            // `toBeDisabled` sozinho passaria tambem num botao desabilitado
            // por outro motivo.
            const botao = cartao.getByTestId('mission-start')
            const status = cartao.getByTestId('mission-start-status')
            await expect(botao).toHaveText(/^Iniciando…/)
            await expect(botao).toBeDisabled()
            await expect(status).toHaveText('Iniciando a missão…')
            await expect(status).toHaveAttribute('role', 'status')

            await semViolacoes(page)

            // E o estado ainda era o em voo DEPOIS do axe: a auditoria rodou
            // nele, e nao depois de ele ter passado.
            await expect(status).toHaveText('Iniciando a missão…')
            await expect(botao).toBeDisabled()

            soltar()
            await expect(status).toHaveText('Missão iniciada.')
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

            const texto = cartao.getByTestId('mission-completion-text')
            const botao = cartao.getByTestId('mission-complete')
            await expect(texto).toHaveText('Concluindo a missão…')
            await expect(botao).toBeDisabled()

            await semViolacoes(page)

            // O estado ainda era o em voo DEPOIS do axe (ver `iniciando`).
            await expect(texto).toHaveText('Concluindo a missão…')
            await expect(botao).toBeDisabled()

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

            const texto = cartao.getByTestId('evaluation-status-text')
            const botao = cartao.getByTestId('evaluation-request')
            await expect(texto).toHaveText('A Kairya está avaliando…')
            await expect(botao).toBeDisabled()

            await semViolacoes(page)

            // O estado ainda era o em voo DEPOIS do axe (ver `iniciando`).
            await expect(texto).toHaveText('A Kairya está avaliando…')
            await expect(botao).toBeDisabled()

            soltar()
            await expect(cartao.getByText('Critério atendido', { exact: true })).toBeVisible()
          },
        )
      })

      test('avaliacao falhou: o alerta do provedor fora do ar passa no axe', async ({
        page,
        request,
      }) => {
        const missao = await semearConcluidaComEvidencia(
          request,
          'Missao com avaliacao que falha',
          43,
        )
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

      /** Um cartao pendente, com o formulario de reagendar aberto e preenchido. */
      async function prepararReagendamento(
        page: Page,
        request: APIRequestContext,
        rotulo: string,
        diasAdiante: number,
      ): Promise<{ missao: MissaoCriada; cartao: Locator }> {
        const missao = await semear(request, rotulo, diasAdiante)
        await page.goto('/')
        const cartao = cartaoDa(page, missao)
        const abrir = cartao.getByTestId('reschedule-toggle')
        await abrir.click()
        await expect(abrir).toHaveAttribute('aria-expanded', 'true')
        // `datetime-local`: a hora civil de Brasilia, dez dias depois do prazo.
        await cartao
          .getByLabel('Novo prazo (horário de Brasília)')
          .fill(campoDeHorario(instanteRelativo(diasAdiante + 10, 12)))
        await cartao
          .getByRole('group', { name: 'Por que reagendar?' })
          .getByLabel('Falta de tempo')
          .check()
        return { missao, cartao }
      }

      test('reagendando: o pedido em voo no formulario passa no axe', async ({ page, request }) => {
        const { missao, cartao } = await prepararReagendamento(
          page,
          request,
          'Missao a reagendar',
          44,
        )

        await segurando(
          page,
          caminhosExatos(`/api/missions/${String(missao.id)}/reschedule`),
          'POST',
          async (soltar) => {
            const saiu = page.waitForRequest(
              (pedido) =>
                pedido.method() === 'POST' &&
                new URL(pedido.url()).pathname === `/api/missions/${String(missao.id)}/reschedule`,
            )
            await cartao.getByTestId('reschedule-submit').click()

            // O pedido saiu (e esta segurado na rota) e o formulario inteiro
            // esta travado: o botao, o campo do prazo e o grupo dos motivos. O
            // formulario nao troca o texto do botao, entao o travamento e o
            // marcador do estado em voo, e a guarda contra o envio duplo.
            await saiu
            await expect(cartao.getByTestId('reschedule-submit')).toBeDisabled()
            await expect(cartao.getByTestId('reschedule-deadline')).toBeDisabled()
            // `fieldset`: o `toBeDisabled` do Playwright nao o reconhece; o atributo
            // e o que trava os motivos dentro dele.
            await expect(cartao.getByRole('group', { name: 'Por que reagendar?' })).toHaveAttribute(
              'disabled',
              '',
            )
            await semViolacoes(page)

            soltar()
            await expect(cartao.getByTestId('mission-reschedule-status')).toHaveText(
              'Prazo reagendado.',
            )
          },
        )
      })

      test('reagendamento recusado: o alerta do prazo no passado passa no axe', async ({
        page,
        request,
      }) => {
        const { missao, cartao } = await prepararReagendamento(
          page,
          request,
          'Missao com reagendamento recusado',
          45,
        )
        // A recusa e simulada no NAVEGADOR (422 com o `code` da API): a missao
        // semeada nao muda no banco compartilhado.
        await page.route(`**/api/missions/${String(missao.id)}/reschedule`, (rota) =>
          rota.fulfill({
            status: 422,
            json: { code: 'prazo_expirado', detail: 'Prazo expirado.' },
          }),
        )

        await cartao.getByTestId('reschedule-submit').click()

        await expect(cartao.getByTestId('reschedule-error')).toHaveText(
          'O novo prazo precisa estar no futuro. Escolha uma data e um horário futuros.',
        )
        await expect(cartao.getByTestId('reschedule-error')).toHaveAttribute('role', 'alert')
        await semViolacoes(page)
      })

      test('avaliacao com missao fora do ar: o alerta com o Atualizar passa no axe', async ({
        page,
        request,
      }) => {
        const missao = await semearConcluidaComEvidencia(request, 'Missao a atualizar', 46)
        await definirRoteiro({
          blocks: [
            {
              tool_input: { verdict: 'atende', feedback: `Resumo completo (e2e ${EXECUCAO})` },
              tool_name: 'record_evaluation',
            },
          ],
        })
        await page.route(`**/api/missions/${String(missao.id)}/evaluation`, (rota) =>
          rota.fulfill({
            status: 404,
            json: { code: 'missao_nao_encontrada', detail: 'Missao nao encontrada.' },
          }),
        )
        await page.goto('/')
        const cartao = cartaoDa(page, missao)

        await cartao.getByTestId('evaluation-request').click()

        await expect(cartao.getByTestId('evaluation-error')).toHaveText(
          /Esta missão não está mais disponível\./,
        )
        await expect(cartao.getByTestId('evaluation-reload')).toBeVisible()
        await expect(cartao.getByTestId('evaluation-request')).toHaveCount(0)
        await semViolacoes(page)

        // Fecha o ciclo com uma avaliacao de verdade: sem isto, o cartao ficaria
        // com o pedido aberto no quadro compartilhado entre specs.
        await page.unrouteAll({ behavior: 'wait' })
        await page.reload()
        await cartao.getByTestId('evaluation-request').click()
        await expect(cartao.getByText('Critério atendido', { exact: true })).toBeVisible()
      })
    })
  })
}
