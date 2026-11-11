import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from './saudacaoJaVista'
import { randomUUID } from 'node:crypto'
import { diaCivil, diaEMes, somarDias } from './datas'
import { CHAVE_DA_SAUDACAO } from './saudacaoJaVista'
import { API_URL } from './servers'

/**
 * A virada da meia-noite de Sao Paulo e a conclusao tardia (F25), ponta a
 * ponta, com o relogio da API e o do navegador movidos pelo cenario
 * (pendencia 116).
 *
 * O relogio da API do E2E e o de `tests/integration/relogio_do_e2e.py`: real
 * ate o cenario fixar um instante por `PUT /_e2e/clock`, e real de novo depois
 * do `DELETE`. A rota so existe na entrada do E2E (`integration.e2e_app`); o
 * app de producao nao a registra, e `test_relogio_sem_controle_em_producao.py`
 * prova isso. O navegador recebe o MESMO instante por `page.clock`, para a tela
 * e a API concordarem sobre "agora".
 *
 * A semana e a de 06/01/2025, no passado e longe da semana real: os outros
 * arquivos do E2E semeiam a semana atual pelo relogio real, e as duas nao
 * colidem na unicidade do plano por semana. Sao Paulo esta em UTC-3 o ano todo
 * desde 2019, por isso os instantes abaixo sao escritos em UTC com o
 * deslocamento a vista. Diferente das datas dos outros specs (pendencia 207),
 * estas sao literais de proposito e nao vencem: os dois relogios sao fixados
 * nelas antes de qualquer leitura.
 *
 * A semana no passado tambem nao mexe na sequencia dos outros specs: ela conta
 * de hoje para tras e para no primeiro dia planejado sem conclusao -- aqui, o
 * domingo 12/01, que ninguem conclui.
 */
const EXECUCAO = randomUUID().slice(0, 8)

const SEGUNDA = '2025-01-06'
/** Quarta 08/01, 23:50 em Sao Paulo: dez minutos antes da virada. */
const QUARTA_ANTES_DA_VIRADA = '2025-01-09T02:50:00Z'
/** Quinta 09/01, 00:10 em Sao Paulo: a diaria de quarta ja venceu. */
const QUINTA_DEPOIS_DA_VIRADA = '2025-01-09T03:10:00Z'
/** Sexta 10/01, 00:10 em Sao Paulo: a diaria de quinta ja venceu. */
const SEXTA_DEPOIS_DA_VIRADA = '2025-01-10T03:10:00Z'
/** Sabado 11/01, 00:10 em Sao Paulo: passou o limite da tardia de quinta. */
const SABADO_DEPOIS_DO_LIMITE = '2025-01-11T03:10:00Z'

const DIAS = Array.from({ length: 7 }, (_, indice) => ({
  instructions: `Diaria ${String(indice + 1)} da virada (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(indice + 1)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
}))
const DIARIA_DE_QUARTA = DIAS[2]!.instructions
const DIARIA_DE_QUINTA = DIAS[3]!.instructions
const DIARIA_DE_SEXTA = DIAS[4]!.instructions

let api: APIRequestContext

/** Move os DOIS relogios para o mesmo instante: o da API e o do navegador. */
async function fixarRelogio(page: Page, instante: string): Promise<void> {
  const resposta = await api.put('/_e2e/clock', { data: { now: instante } })
  expect(resposta.status(), await resposta.text()).toBe(200)
  await page.clock.setFixedTime(new Date(instante))
  // O fixture `saudacaoJaVista` semeia o dia do relogio REAL, que aqui nao e o
  // do app (fixado em 2025-01): sem regravar, a saudacao apareceria. O script
  // roda a cada carga, e o ultimo registrado (o instante mais novo) vence.
  await page.addInitScript(
    ({ chave, dia }) => {
      try {
        window.localStorage.setItem(chave, dia)
      } catch {
        // Sem localStorage nao ha o que gravar; a saudacao sai e o spec que se vire.
      }
    },
    { chave: CHAVE_DA_SAUDACAO, dia: diaCivil(new Date(instante)) },
  )
}

// O cenario e uma historia contada em ordem: o segundo teste parte do estado
// que o primeiro deixou (a diaria de quinta ainda nao iniciada).
test.describe.configure({ mode: 'serial' })
test.use({ timezoneId: 'America/Sao_Paulo' })

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: API_URL })
})

// O relogio volta a ser o real mesmo se um teste reprovar no meio: os
// arquivos seguintes do E2E rodam contra a mesma API e semeiam a semana real.
test.afterAll(async () => {
  const resposta = await api.delete('/_e2e/clock')
  expect(resposta.status()).toBe(204)
  await api.dispose()
})

test('a diaria iniciada antes da meia-noite e concluida depois dela, e conta para a sequencia', async ({
  page,
}) => {
  await fixarRelogio(page, QUARTA_ANTES_DA_VIRADA)
  const plano = await api.post('/api/plans', {
    data: {
      week_start: SEGUNDA,
      days: DIAS,
      bonus: {
        instructions: `Especial da virada (e2e ${EXECUCAO})`,
        completion_criterion: `Criterio da especial (e2e ${EXECUCAO})`,
        estimated_minutes: 120,
      },
    },
  })
  expect(plano.status(), await plano.text()).toBe(201)

  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaEMes(somarDias(SEGUNDA, 2)))
  await expect(ciclo.getByTestId('mission-instructions')).toHaveText(DIARIA_DE_QUARTA)
  await ciclo.getByRole('button', { name: `Iniciar a missão: ${DIARIA_DE_QUARTA}` }).click()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Em andamento')
  await expect(ciclo.getByTestId('cycle-late-daily')).toHaveCount(0)

  await fixarRelogio(page, QUINTA_DEPOIS_DA_VIRADA)
  await page.reload()

  // Depois da virada: hoje e quinta, com a diaria de quinta, e a de quarta
  // continua a vista na secao da conclusao tardia.
  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaEMes(somarDias(SEGUNDA, 3)))
  const tardia = ciclo.getByTestId('cycle-late-daily')
  await expect(tardia.getByTestId('mission-instructions')).toHaveText(DIARIA_DE_QUARTA)
  await expect(tardia.getByTestId('cycle-late-daily-reason')).toContainText(
    'ainda pode ser concluída até o fim de hoje',
  )
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 0 dias seguidos')

  await tardia.getByRole('button', { name: `Concluir a missão: ${DIARIA_DE_QUARTA}` }).click()

  await expect(tardia.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(tardia.getByTestId('cycle-late-daily-reason')).toContainText('Concluída com atraso')
  // F25: a sequencia conta o dia DA MISSAO (quarta), e nao o dia da conclusao.
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')

  // Recarregar le do servidor: a conclusao tardia e a sequencia sao do banco.
  await page.reload()
  await expect(tardia.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')
})

test('a diaria iniciada a tempo some no fim do dia seguinte ao prazo, e a API recusa concluir', async ({
  page,
}) => {
  await fixarRelogio(page, QUINTA_DEPOIS_DA_VIRADA)
  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  const hoje = ciclo.getByTestId('mission-instructions').first()
  await expect(hoje).toHaveText(DIARIA_DE_QUINTA)
  await ciclo.getByRole('button', { name: `Iniciar a missão: ${DIARIA_DE_QUINTA}` }).click()
  await expect(ciclo.getByTestId('mission-state').first()).toHaveText('Em andamento')

  // Sexta: a diaria de quinta, iniciada no dia dela, ainda pode ser concluida.
  await fixarRelogio(page, SEXTA_DEPOIS_DA_VIRADA)
  await page.reload()
  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaEMes(somarDias(SEGUNDA, 4)))
  await expect(ciclo.getByTestId('mission-instructions').first()).toHaveText(DIARIA_DE_SEXTA)
  const tardia = ciclo.getByTestId('cycle-late-daily')
  await expect(tardia.getByTestId('mission-instructions')).toHaveText(DIARIA_DE_QUINTA)
  const cicloDeSexta = (await (await api.get('/api/cycle')).json()) as {
    late_daily: { id: number } | null
  }
  const idDaDeQuinta = cicloDeSexta.late_daily?.id
  expect(idDaDeQuinta).toBeDefined()

  // Sabado: passou a meia-noite que fecha sexta, o limite da tardia de quinta.
  await fixarRelogio(page, SABADO_DEPOIS_DO_LIMITE)
  await page.reload()
  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaEMes(somarDias(SEGUNDA, 5)))
  await expect(ciclo.getByTestId('cycle-late-daily')).toHaveCount(0)

  const recusa = await api.post(`/api/missions/${String(idDaDeQuinta)}/complete`, {
    data: { operation_id: `e2e-virada-${EXECUCAO}` },
  })
  expect(recusa.status()).toBe(409)
  expect(((await recusa.json()) as { code: string }).code).toBe('missao_expirada')
})
