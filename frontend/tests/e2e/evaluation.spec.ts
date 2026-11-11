// Import NOMEADO, nao o default: ver o comentario em headquarters.spec.ts.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, type APIRequestContext } from '@playwright/test'
import { test } from './saudacaoJaVista'
import { randomUUID } from 'node:crypto'
import { definirRoteiro, reiniciar, requisicoes } from './falso'

/**
 * A entrega com evidencia e a avaliacao da Kairya ponta a ponta (Incremento E):
 * navegador real, API real, banco real e o servidor falso da Anthropic como
 * processo, roteirizado para responder com a ferramenta `record_evaluation`.
 *
 * O banco de teste e compartilhado e nao e limpo entre execucoes do E2E: a
 * missao deste cenario carrega o sufixo `EXECUCAO` e e localizada pelo `id`
 * que a API devolveu, nunca por posicao no quadro. O falso e reiniciado antes
 * de cada cenario, para roteiro e contagem de requisicoes nao vazarem.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** O que o cenario manda para `POST /api/missions`. */
interface PedidoDeMissao {
  instructions: string
  completion_criterion: string
  difficulty: number
  estimated_minutes: number
  deadline: string
}

/**
 * O recorte do contrato de saida que este cenario le. Declarado aqui, e nao
 * importado da aplicacao, pelo mesmo motivo de headquarters.spec.ts: o E2E
 * confere o que a API publica, e um tipo emprestado combinaria com ele mesmo.
 */
interface MissaoCriada extends PedidoDeMissao {
  id: number
  state: string
  xp: number
  completed_at: string | null
}

/** O recorte do corpo que a API mandou ao falso da Anthropic e que o cenario le. */
interface PedidoAoFalso {
  system?: string
  tools?: { name: string; strict?: boolean }[]
  tool_choice?: Record<string, unknown>
}

/** Cria uma missao pela API dedicada e devolve o corpo do 201. */
async function criarMissao(api: APIRequestContext, pedido: PedidoDeMissao): Promise<MissaoCriada> {
  const resposta = await api.post('/api/missions', { data: pedido })
  // O corpo entra na mensagem de falha: um 422 sem corpo diria apenas "nao
  // foi 201", e o que interessa e QUAL campo a API recusou.
  expect(resposta.status(), await resposta.text()).toBe(201)
  return (await resposta.json()) as MissaoCriada
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await reiniciar()
})

test('conclui com evidencia, pede a avaliacao e ve o bonus e o painel', async ({
  page,
  request,
}) => {
  const missao = await criarMissao(request, {
    instructions: `Resumir o capitulo 3 ${EXECUCAO}`,
    completion_criterion: 'Resumo de uma pagina',
    difficulty: 3,
    estimated_minutes: 30,
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const antes = (await (await request.get('/api/progress')).json()) as { xp_total: number }
  await definirRoteiro({
    blocks: [
      {
        tool_input: { verdict: 'atende', feedback: `Resumo completo ${EXECUCAO}` },
        tool_name: 'record_evaluation',
      },
    ],
  })

  await page.goto('/')
  const cartao = page.locator(`[data-mission-id="${String(missao.id)}"]`)
  await cartao.getByRole('button', { name: 'Entregar com evidência (opcional)' }).click()
  await cartao.getByLabel('O que você fez').fill(`Escrevi o resumo ${EXECUCAO}`)
  await cartao.getByLabel('Link (opcional)').fill('https://exemplo.com/resumo')
  await cartao.getByTestId('mission-complete').click()
  await expect(cartao.getByText('Com evidência')).toBeVisible()

  await cartao.getByRole('button', { name: 'Pedir avaliação da Kairya' }).click()
  // `exact`: a regiao viva tambem diz "Avaliação concluída: Critério atendido.",
  // e o que se afere aqui e o selo do veredito.
  await expect(cartao.getByText('Critério atendido', { exact: true })).toBeVisible()
  await expect(
    cartao.getByText('Avaliação da Kairya — interpretação do modelo, não verificação automática'),
  ).toBeVisible()
  const bonus = Math.floor(missao.xp / 2)
  // O anuncio do bonus diz "de bônus" junto do XP, para nao
  // parecer uma segunda conclusao; o `toHaveText` compara o texto inteiro.
  await expect(cartao.getByTestId('evaluation-panel').getByTestId('reward-xp')).toHaveText(
    `+${String(bonus)} XP de bônus`,
  )
  const totalEsperado = `${(antes.xp_total + missao.xp + bonus).toLocaleString('pt-BR')} XP no total`
  await expect(page.getByTestId('progress-total')).toHaveText(totalEsperado)

  // A requisicao que a API mandou ao falso oferece a ferramenta da rubrica, com
  // `strict`, e `tool_choice` automatico sem chamadas paralelas (EM3: o forcado
  // da 400 em alguns modelos; quem manda chamar a ferramenta e o sistema).
  const recebidas = await requisicoes()
  // O fluxo inteiro faz UMA chamada ao modelo (a da avaliacao). O filtro por
  // `tools` abaixo nao veria uma chamada extra sem a ferramenta; este total ve.
  expect(recebidas).toHaveLength(1)
  const pedidos = recebidas.map((r) => r.body as PedidoAoFalso)
  const daAvaliacao = pedidos.filter((b) =>
    (b.tools ?? []).some((f) => f.name === 'record_evaluation'),
  )
  expect(daAvaliacao).toHaveLength(1)
  expect(daAvaliacao[0]?.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true })
  expect(daAvaliacao[0]?.tools).toEqual([
    expect.objectContaining({ name: 'record_evaluation', strict: true }),
  ])
  expect(daAvaliacao[0]?.system).toContain('record_evaluation')

  // Espera o fade-in do anuncio assentar antes do axe (o axe no meio da animacao
  // acusaria contraste insuficiente).
  await expect
    .poll(() =>
      cartao
        .getByTestId('evaluation-panel')
        .getByTestId('reward')
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1')
  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])

  // Recarregar le do servidor: o veredito vem do MissionRead, sem numero (EM1).
  await page.reload()
  await expect(cartao.getByText('Critério atendido', { exact: true })).toBeVisible()
  await expect(cartao.getByText('Bônus de XP creditado ao seu saldo.')).toBeVisible()
  // O saldo com o bonus tambem volta da API, nao so o texto do painel.
  await expect(page.getByTestId('progress-total')).toHaveText(totalEsperado)
})
