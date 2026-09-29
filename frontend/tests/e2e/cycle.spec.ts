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
 * cairem em lados diferentes da meia-noite de Sao Paulo, o cenario reprova.
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

/** Uma data civil deslocada `deslocamento` dias, em aritmetica UTC pura. */
function diaCivil(civil: string, deslocamento: number): string {
  const dia = new Date(`${civil}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + deslocamento)
  return dia.toISOString().slice(0, 10)
}

/**
 * Se duas caixas de `boundingBox()` se sobrepoem. Uma caixa NULA reprova: e
 * o elemento sem caixa (oculto ou fora do layout), e tratar isso como "sem
 * sobreposicao" deixaria passar um botao escondido.
 */
function caixasSeSobrepoem(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  expect(a, 'boundingBox() nulo: o elemento nao tem caixa').not.toBeNull()
  expect(b, 'boundingBox() nulo: o elemento nao tem caixa').not.toBeNull()
  // Os `expect` acima ja reprovaram se alguma for nula; isto so estreita o
  // tipo (e, por seguranca, responde "sobrepoe", nunca "passa").
  if (a === null || b === null) return true
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Sem rolagem horizontal no documento inteiro (README §7: o celular nao ganha rolagem lateral). */
async function semRolagemHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
}

const DIAS = Array.from({ length: 7 }, (_, indice) => ({
  instructions: `Diaria ${String(indice + 1)} do ciclo (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(indice + 1)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
}))

let hoje = ''
let missaoDeHoje = ''

// A armadilha da data civil (converter um `Date` para o fuso do navegador e
// comparar o dia) so aparece a OESTE de UTC: Tokyo (fuso global, ver
// playwright.config.ts) esta a LESTE, entao a mesma meia-noite so empurra a
// data para a frente, nunca para tras, e o bug passaria batido. Sao Paulo e
// a oeste, e e so aqui, neste spec, que a suite prova a data civil de
// verdade -- o `timezoneId` global continua Tokyo para os demais specs.
test.use({ timezoneId: 'America/Sao_Paulo' })

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

  // D16: o axe roda com o painel de progresso ja carregado, e nao so
  // com o ciclo.
  await expect(page.getByTestId('progress-level')).toBeVisible()

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})

test('concluir a missao de hoje leva a sequencia a 1, no servidor, e a tela concluida passa no axe', async ({
  page,
}) => {
  const ciclo = await abrirCiclo(page)

  // P6: os numeros da recompensa vem da API, e nao de uma constante fixa --
  // outros arquivos do E2E tambem concluem missoes contra o mesmo usuario, e
  // um numero fixo quebraria com a ordem em que os arquivos rodam.
  const antes = (await (await page.request.get('/api/progress')).json()) as { xp_total: number }
  const xp = ((await (await page.request.get('/api/cycle')).json()) as { mission: { xp: number } })
    .mission.xp

  await ciclo.getByRole('button', { name: `Concluir a missão: ${missaoDeHoje}` }).click()

  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')
  await expect(ciclo.getByTestId('cycle-progress')).toHaveText(/1 de 7/)

  // O texto fixo pelo testid do filho, e o anuncio de verdade pelo `reward-xp`
  // -- o mesmo desenho de headquarters.spec.ts e tutoring.spec.ts.
  await expect(ciclo.getByTestId('mission-completion-text')).toHaveText('Missão concluída.')
  const rewardXp = ciclo.getByTestId('reward-xp')
  await expect(rewardXp).toHaveText(`+${String(xp)} XP`)
  await expect(page.getByTestId('progress-total')).toHaveText(
    `${(antes.xp_total + xp).toLocaleString('pt-BR')} XP no total`,
  )

  // Espera a animacao de entrada do anuncio assentar antes do axe. Sem
  // isto, o axe podia auditar o anuncio no meio do fade-in (opacidade
  // parcial) e acusar contraste insuficiente -- a cor final passa com folga.
  await expect
    .poll(() => ciclo.getByTestId('reward').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1')

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])

  // Recarregar le do servidor: a conclusao, a sequencia e o total do painel
  // sao do banco.
  await page.reload()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')
  await expect(page.getByTestId('progress-total')).toHaveText(
    `${(antes.xp_total + xp).toLocaleString('pt-BR')} XP no total`,
  )
})

/**
 * D16: o painel de progresso do Quartel-General, depois de o cenario
 * anterior ter concluido a primeira missao da vida deste usuario -- a
 * conquista `first_steps` ja esta destravada, e as outras seis continuam
 * bloqueadas, com o texto que diz isso.
 */
test('o painel mostra as conquistas com texto e passa no axe', async ({ page }) => {
  await page.goto('/')
  const painel = page.getByTestId('progress')
  await expect(painel.getByTestId('progress-level')).toBeVisible()

  const conquistas = painel.getByTestId('progress-achievement')
  const codigos = await conquistas.evaluateAll((itens) =>
    itens.map((item) => item.getAttribute('data-code')),
  )
  // A ordem do catalogo (Global Constraints), nao a ordem alfabetica nem a de
  // desbloqueio.
  expect(codigos).toEqual([
    'first_steps',
    'streak_7',
    'streak_30',
    'veteran_10',
    'veteran_50',
    'veteran_100',
    'tifa_partnership',
  ])

  const primeirosPassos = painel.locator(
    '[data-testid="progress-achievement"][data-code="first_steps"]',
  )
  await expect(primeirosPassos).toHaveAttribute('data-unlocked', 'true')

  const bloqueada = painel.locator('[data-testid="progress-achievement"][data-unlocked="false"]')
  await expect(bloqueada.first()).toContainText('Bloqueada:')

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})

/**
 * Campanhas pela navegacao lateral, com a trilha do plano semeado no
 * `beforeAll` (o cenario anterior ja concluiu a missao de hoje). Testids
 * REAIS de `CampaignTrail.tsx`: `trail-availability`, nao
 * `trail-day-availability`.
 */
test('Campanhas abre pela navegacao, com a trilha do plano semeado, e passa no axe', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('nav-campaigns').click()

  const campanhas = page.getByTestId('campaigns')
  const tituloCampanhas = campanhas.getByRole('heading', {
    level: 1,
    name: 'Campanhas — planos de estudo',
  })
  await expect(tituloCampanhas).toBeFocused()
  await expect(page.getByTestId('nav-campaigns')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('nav-headquarters')).not.toHaveAttribute('aria-current')

  await expect(campanhas.getByTestId('trail-day')).toHaveCount(7)

  // O dia de hoje: marcado como Hoje e concluido, porque o cenario anterior
  // concluiu a missao (o `beforeAll` semeia a semana inteira, e a API deriva
  // a disponibilidade a partir do `today`).
  const diaDeHoje = campanhas.locator(`[data-testid="trail-day"][data-day="${hoje}"]`)
  await expect(diaDeHoje.getByTestId('trail-today')).toHaveText('Hoje')
  await expect(diaDeHoje.getByTestId('trail-availability')).toContainText('Concluída')

  // Os dias depois de hoje, dentro da mesma semana: bau fechado, "revelada
  // no dia" -- nunca a missao (B3/C11 da spec do ciclo).
  const segunda = segundaDe(hoje)
  for (let deslocamento = 0; deslocamento < 7; deslocamento += 1) {
    const dia = diaCivil(segunda, deslocamento)
    if (dia > hoje) {
      const item = campanhas.locator(`[data-testid="trail-day"][data-day="${dia}"]`)
      await expect(item.getByTestId('trail-chest')).toContainText('revelada no dia')
    }
  }

  // A especial: bloqueada, com o progresso ate o proximo marco -- 1 dia
  // seguido (so hoje foi concluido) de 7.
  const especial = campanhas.getByTestId('trail-special')
  await expect(especial.getByTestId('trail-availability')).toContainText('Bloqueada')
  await expect(especial.getByTestId('trail-chest')).toBeVisible()
  await expect(especial.getByTestId('trail-special-progress')).toContainText('1 de 7')

  const resultadoCampanhas = await new AxeBuilder({ page }).analyze()
  expect(resultadoCampanhas.violations).toEqual([])

  // Voltar ao Quartel-General: o titulo dele focado, e o axe sem violacoes
  // de novo -- as duas areas (um so `main` visivel por
  // vez).
  await page.getByTestId('nav-headquarters').click()
  const quartelGeneral = page.getByTestId('headquarters')
  const tituloQuartel = quartelGeneral.getByRole('heading', {
    level: 1,
    name: 'Quartel-General — seu painel de estudos',
  })
  await expect(tituloQuartel).toBeFocused()
  await expect(page.getByTestId('nav-headquarters')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('nav-campaigns')).not.toHaveAttribute('aria-current')

  const resultadoQuartel = await new AxeBuilder({ page }).analyze()
  expect(resultadoQuartel.violations).toEqual([])
})

test('Campanhas abre pelo teclado: Tab ate a navegacao, Enter, e o foco vai para o titulo', async ({
  page,
}) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expect(page.getByTestId('nav-headquarters')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('nav-campaigns')).toBeFocused()
  await page.keyboard.press('Enter')

  const titulo = page
    .getByTestId('campaigns')
    .getByRole('heading', { level: 1, name: 'Campanhas — planos de estudo' })
  await expect(titulo).toBeFocused()
})

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a navegacao fica visivel no topo, sem rolagem horizontal, e nao cobre "Falar com a Tifa"', async ({
    page,
  }) => {
    await page.goto('/')
    const nav = page.getByTestId('side-nav')
    await expect(nav).toBeVisible()
    await expect.poll(async () => semRolagemHorizontal(page)).toBe(true)

    // "Falar com a Tifa" so existe no Quartel-General (Campanhas nao tem
    // painel da Tifa), e e ai que o pouso da pagina comeca.
    const tifa = page.getByTestId('tutor-sheet-open')
    await expect(tifa).toBeVisible()
    const caixaTifa = await tifa.boundingBox()
    const botoesNav = await nav.getByRole('button').all()
    expect(botoesNav.length).toBe(2)
    for (const botao of botoesNav) {
      const caixaBotao = await botao.boundingBox()
      expect(caixasSeSobrepoem(caixaTifa, caixaBotao)).toBe(false)
    }

    // A mesma checagem na area de Campanhas: sem rolagem horizontal la
    // tambem, e a navegacao continua visivel no topo.
    await page.getByTestId('nav-campaigns').click()
    await expect(page.getByTestId('campaigns')).toBeVisible()
    await expect(nav).toBeVisible()
    // A trilha precisa ter CARREGADO antes da medida: com "Consultando a
    // trilha..." na tela, a medida seria da pagina quase vazia, e uma trilha
    // que estourasse a largura passaria.
    await expect(page.getByTestId('trail-day')).toHaveCount(7)
    await expect.poll(async () => semRolagemHorizontal(page)).toBe(true)
  })
})
