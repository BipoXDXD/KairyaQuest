import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { API_URL } from './servers'

/**
 * O ciclo ponta a ponta: semear o plano da semana que a API diz ser a atual,
 * abrir o Quartel-General, concluir a missao de hoje e ver a sequencia.
 *
 * As datas vem do `today` da API, e nunca do relogio do navegador (que roda
 * em Asia/Tokyo, ver `playwright.config.ts`): a data civil que a tela mostra
 * tem de ser a da API, e a meia-noite de Sao Paulo nao e a de Toquio.
 *
 * **Limitacao conhecida (spec, Riscos):** se a semeadura e a conclusao
 * caírem em lados diferentes da meia-noite de Sao Paulo, o cenario reprova.
 * Semear a partir do `today` da API estreita a janela, mas nao a fecha. Sem
 * nova tentativa automatica e sem teste pulado.
 *
 * O esquema e limpo no inicio do `make check-e2e` (C17): esta execucao e a
 * unica dona do plano da semana.
 */
const EXECUCAO = randomUUID().slice(0, 8)

interface CicloDaApi {
  today: string
}

/** A segunda-feira da semana de uma data civil, em aritmetica UTC pura. */
function segundaDe(civil: string): string {
  const dia = new Date(`${civil}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}

/** "23/09", escrito por extenso: o E2E nao importa o formatador da aplicacao. */
function diaMes(civil: string): string {
  return `${civil.slice(8, 10)}/${civil.slice(5, 7)}`
}

const DIAS = Array.from({ length: 7 }, (_, indice) => ({
  instructions: `Diaria ${String(indice + 1)} do ciclo (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(indice + 1)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
}))

let hoje = ''
let missaoDeHoje = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API_URL })
  const ciclo = (await (await api.get('/api/cycle')).json()) as CicloDaApi
  hoje = ciclo.today
  const resposta = await api.post('/api/plans', {
    data: {
      week_start: segundaDe(hoje),
      days: DIAS,
      bonus: {
        instructions: `Especial (e2e ${EXECUCAO})`,
        completion_criterion: `Criterio da especial (e2e ${EXECUCAO})`,
        estimated_minutes: 120,
      },
    },
  })
  expect(resposta.status()).toBe(201)
  missaoDeHoje = DIAS[(new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7]!.instructions
  await api.dispose()
})

async function abrirCiclo(page: Page) {
  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  await expect(ciclo.getByTestId('mission-instructions')).toHaveText(missaoDeHoje)
  return ciclo
}

test('a missao de hoje do plano semeado aparece com a data civil da API, e passa no axe', async ({
  page,
}) => {
  const ciclo = await abrirCiclo(page)

  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaMes(hoje))
  // O plano foi criado hoje: os dias anteriores estao fora do plano, e a
  // sequencia comeca do zero.
  await expect(ciclo.getByTestId('cycle-progress')).toHaveText(/0 de 7/)

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})

test('concluir a missao de hoje leva a sequencia a 1, no servidor, e a tela concluida passa no axe', async ({
  page,
}) => {
  const ciclo = await abrirCiclo(page)

  await ciclo.getByRole('button', { name: `Concluir a missão: ${missaoDeHoje}` }).click()

  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')
  await expect(ciclo.getByTestId('cycle-progress')).toHaveText(/1 de 7/)

  // Recarregar le do servidor: a conclusao e a sequencia sao do banco.
  await page.reload()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})
