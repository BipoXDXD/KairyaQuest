import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CATALOGS } from '../../src/shared/i18n/catalog'
import { LINE_GROUPS, LINE_IDS, lineKey, type LineId } from '../../src/features/kairya/lines'
import {
  AUTOPLAY_BLOCKED_WARNING,
  UNAVAILABLE_WARNING_PREFIX,
} from '../../src/shared/audio/audioPlayer'
import { SOUND_STORAGE_KEY } from '../../src/shared/audio/soundPrefs'
import { esperarAnimacoesFinitas } from './animacoes'
import { definirRoteiro, reiniciar } from './falso'
import { API_URL } from './servers'

/**
 * O audio ponta a ponta (Fase 8): o convite, a preferencia, a voz e os efeitos
 * nos eventos, e as falhas (404, arquivo corrompido, autoplay bloqueado).
 *
 * Importa `test` do Playwright, e NAO o de `saudacaoJaVista`: este spec testa a
 * saudacao falada. O `storageState` vazio desfaz o convite ja dispensado do
 * `playwright.config.ts`.
 *
 * O relogio da API e o do navegador andam juntos, numa semana de 2025 que nao
 * colide com a de `presenca.spec.ts` nem com a real dos outros specs. Cada
 * teste que conclui a diaria usa um DIA diferente da semana: a diaria concluida
 * nao volta a ficar disponivel.
 */
const EXECUCAO = randomUUID().slice(0, 8)

const SEGUNDA = '2025-03-03'
/** `CELEBRATION_MS` de `useKairyaMood`: quanto o rosto fica celebrando. */
const CELEBRACAO_MS = 3000
const PASTA_DAS_FALAS = '/audio/pt-BR/'
const EFEITO_DA_LANTERNA = '/audio/sfx/lantern_lit.mp3'

const DIA_PADRAO = 0
const DIA_CONVITE = 1
const DIA_404 = 2
const DIA_CORROMPIDO = 3
const DIA_MOVIMENTO_REDUZIDO = 4
const DIA_AUTOPLAY = 5

const diaria = (numero: number) => ({
  instructions: `Diaria ${String(numero)} do audio (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(numero)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
})
const DIAS = [1, 2, 3, 4, 5, 6, 7].map(diaria)

/** O instante (UTC) do dia `indice` da semana semeada, as 09:00 em Sao Paulo. */
function manhaDoDia(indice: number): string {
  return new Date(Date.UTC(2025, 2, 3 + indice, 12)).toISOString().replace('.000Z', 'Z')
}

/** As falas da legenda pelo texto pt-BR: a bolha nao carrega o id da fala. */
const FALA_PELO_TEXTO = new Map<string, LineId>(
  LINE_IDS.map((id) => [CATALOGS['pt-BR'][lineKey(id)], id]),
)

declare global {
  interface Window {
    /** Os `play`/`pause` dos elementos de audio (`<acao> <caminho>`), gravados pelos espioes. */
    __audioLog: string[]
  }
}

/**
 * Espia `play` e `pause` de todo elemento de audio (roda no navegador, por
 * `addInitScript`: nao pode usar nada deste modulo). Com `bloquear`, o `play`
 * rejeita como o autoplay bloqueado do navegador. O caminho vem de `src` (o
 * que o app atribuiu: o `currentSrc` so se atualiza depois da selecao do
 * recurso e fica velho num `play` rejeitado); sem nenhum dos dois fica vazio.
 */
function espiarAudio(bloquear: boolean): void {
  const registro: string[] = []
  window.__audioLog = registro
  const caminho = (elemento: HTMLMediaElement): string => {
    const origem = elemento.src || elemento.currentSrc
    return origem === '' ? '' : new URL(origem).pathname
  }
  const proto = HTMLMediaElement.prototype
  const tocar = proto.play
  proto.play = function (this: HTMLMediaElement) {
    registro.push(`play ${caminho(this)}`)
    return bloquear
      ? Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      : tocar.call(this)
  }
  const pausar = proto.pause
  proto.pause = function (this: HTMLMediaElement) {
    registro.push(`pause ${caminho(this)}`)
    pausar.call(this)
  }
}

test('o catalogo pt-BR nao repete texto de fala (a legenda identifica a fala pelo texto)', () => {
  const textos = LINE_IDS.map((id) => CATALOGS['pt-BR'][lineKey(id)])
  expect(new Set(textos).size).toBe(textos.length)
})

let api: APIRequestContext

test.use({
  storageState: { cookies: [], origins: [] },
  timezoneId: 'America/Sao_Paulo',
})
// Serial: os testes compartilham o banco (o plano semeado e as diarias concluidas, uma por dia) e o relogio da API.
test.describe.configure({ mode: 'serial' })

async function fixarRelogioDaApi(instante: string): Promise<void> {
  const resposta = await api.put('/_e2e/clock', { data: { now: instante } })
  expect(resposta.status(), await resposta.text()).toBe(200)
}

async function instalarRelogio(page: Page, instante: string): Promise<void> {
  await fixarRelogioDaApi(instante)
  await page.clock.install({ time: new Date(instante) })
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: API_URL })
  await fixarRelogioDaApi(manhaDoDia(DIA_PADRAO))
  const plano = await api.post('/api/plans', {
    data: {
      week_start: SEGUNDA,
      days: DIAS,
      bonus: {
        instructions: `Especial do audio (e2e ${EXECUCAO})`,
        completion_criterion: `Criterio da especial (e2e ${EXECUCAO})`,
        estimated_minutes: 120,
      },
    },
  })
  expect(plano.status(), await plano.text()).toBe(201)
})

test.beforeEach(async () => {
  await reiniciar()
})

// O relogio volta a ser o real depois de cada teste: os outros arquivos do E2E
// rodam contra a mesma API, e o teste seguinte fixa o seu.
test.afterEach(async () => {
  const resposta = await api.delete('/_e2e/clock')
  expect(resposta.status()).toBe(204)
})

test.afterAll(async () => {
  await api.dispose()
})

interface Observacao {
  /** Os caminhos pedidos sob `/audio/`, na ordem. */
  audio: string[]
  erros: Error[]
  /** O texto de cada `console.warn`. */
  avisos: string[]
}

/** Coleta os pedidos de audio, os erros nao tratados e os avisos da pagina. */
function observar(page: Page): Observacao {
  const observacao: Observacao = { audio: [], erros: [], avisos: [] }
  page.on('request', (pedido) => {
    const caminho = new URL(pedido.url()).pathname
    if (caminho.startsWith('/audio/')) observacao.audio.push(caminho)
  })
  page.on('pageerror', (erro) => observacao.erros.push(erro))
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'warning') observacao.avisos.push(mensagem.text())
  })
  return observacao
}

async function ligarSom(page: Page): Promise<void> {
  await page.addInitScript(
    ({ chave }) => {
      window.localStorage.setItem(chave, JSON.stringify({ voice: true, sfx: true }))
    },
    { chave: SOUND_STORAGE_KEY },
  )
}

const bolha = (page: Page) => page.getByTestId('kairya-bubble-anchor').getByRole('figure')
const legenda = (page: Page) => bolha(page).getByRole('paragraph').first()

/** A fala que a legenda mostra agora, achada pelo texto no catalogo pt-BR. */
async function falaDaLegenda(page: Page): Promise<LineId | null> {
  const texto = (await legenda(page).textContent()) ?? ''
  return FALA_PELO_TEXTO.get(texto) ?? null
}

async function concluirADiaria(page: Page, indice: number): Promise<void> {
  const ciclo = page.getByTestId('cycle')
  const { instructions } = diaria(indice + 1)
  await expect(ciclo.getByTestId('mission-instructions')).toHaveText(instructions)
  await ciclo.getByRole('button', { name: `Concluir a missão: ${instructions}` }).click()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
}

async function semearAvulsa(rotulo: string): Promise<string> {
  const instrucao = `${rotulo} (e2e ${EXECUCAO})`
  const resposta = await api.post('/api/missions', {
    data: {
      instructions: instrucao,
      completion_criterion: `Conferido (e2e ${EXECUCAO})`,
      difficulty: 2,
      estimated_minutes: 30,
      deadline: '2025-03-10T12:00:00Z',
    },
  })
  expect(resposta.status(), await resposta.text()).toBe(201)
  return instrucao
}

async function concluirAvulsa(page: Page, instrucao: string): Promise<void> {
  const item = page.getByTestId('missions-list').getByTestId('mission-item').filter({
    hasText: instrucao,
  })
  await item.getByRole('button', { name: `Concluir a missão: ${instrucao}` }).click()
  await expect(item.getByTestId('mission-state')).toHaveText('Concluída')
}

const pedidosDe = (observacao: Observacao, caminho: string) =>
  observacao.audio.filter((pedido) => pedido === caminho).length

const avisosDe = (observacao: Observacao, caminho: string) =>
  observacao.avisos.filter((aviso) => aviso === `${UNAVAILABLE_WARNING_PREFIX} ${caminho}`).length

test('padrao: o convite aparece, passa no axe, a jornada toda roda e nenhum audio e pedido', async ({
  page,
}) => {
  const observacao = observar(page)
  await definirRoteiro({ blocks: [{ text: ['Resposta ', 'da Kairya.'] }] })
  await instalarRelogio(page, manhaDoDia(DIA_PADRAO))
  await page.goto('/')

  await expect(page.getByTestId('sound-invite')).toBeVisible()
  await expect(bolha(page)).toBeVisible()
  await esperarAnimacoesFinitas(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await concluirADiaria(page, DIA_PADRAO)
  await page.getByLabel('Sua mensagem para a Kairya').fill('Como estudo recursão?')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(
    page.getByTestId('tutor-message').filter({ hasText: 'Resposta da Kairya.' }),
  ).toBeVisible()

  expect(observacao.audio).toEqual([])
  expect(observacao.erros).toEqual([])
})

test('"Agora não" e recarregar: o convite nao volta', async ({ page }) => {
  const observacao = observar(page)
  await page.goto('/')
  await expect(page.getByTestId('sound-invite')).toBeVisible()

  await page.getByTestId('sound-invite-decline').click()
  await expect(page.getByTestId('sound-invite')).toHaveCount(0)

  await page.reload()
  await expect(page.getByLabel('Sua mensagem para a Kairya')).toBeVisible()
  await expect(page.getByTestId('sound-invite')).toHaveCount(0)
  expect(observacao.audio).toEqual([])
})

test('ligar pelo convite: concluir a diaria toca o efeito da lanterna e a fala da legenda', async ({
  page,
}) => {
  const observacao = observar(page)
  await instalarRelogio(page, manhaDoDia(DIA_CONVITE))
  await page.goto('/')
  await page.getByTestId('sound-invite-accept').click()
  await expect(page.getByTestId('sound-invite')).toHaveCount(0)

  await concluirADiaria(page, DIA_CONVITE)

  // `>= 1`: o Chromium pode pedir o mesmo arquivo de midia mais de uma vez (Range).
  await expect.poll(() => pedidosDe(observacao, EFEITO_DA_LANTERNA)).toBeGreaterThanOrEqual(1)
  await expect
    .poll(() => observacao.audio.filter((caminho) => caminho.startsWith(PASTA_DAS_FALAS)).length)
    .toBeGreaterThanOrEqual(1)
  await expect(legenda(page)).toBeVisible()
  expect(observacao.erros).toEqual([])
})

const FALHAS = [
  {
    nome: '404 em toda fala',
    dia: DIA_404,
    resposta: { status: 404, body: '' },
  },
  {
    nome: 'arquivo corrompido',
    dia: DIA_CORROMPIDO,
    resposta: { status: 200, contentType: 'audio/mpeg', body: 'lixo' },
  },
] as const

for (const falha of FALHAS) {
  test(`${falha.nome}: a legenda segue, nada quebra, o aviso sai uma vez e a fala nao e pedida de novo`, async ({
    page,
  }) => {
    const observacao = observar(page)
    await ligarSom(page)
    // O sorteio alterna as sementes 0 e 1 (`pickLine` usa `seed % n`): as
    // avulsas em sequencia saem A, B, A. E a substituicao deterministica de
    // `Math.random` (como o `vi.spyOn` que o `noMathRandom.test.ts` permite):
    // o sorteio deixa de variar entre execucoes, que e o que a regra protege.
    await page.addInitScript(() => {
      // Chamadas: 0 saudacao, 1 diaria, 2 a 4 avulsas A, B, A, 5 avulsa D com
      // uma fala nova (semente 2), o ponto de sincronia depois da repeticao.
      let chamadas = 0
      Object.defineProperty(Math, 'random', {
        value: () => {
          const indice = chamadas++
          return (indice === 5 ? 2 : indice % 2) * 2 ** -31
        },
      })
    })
    // Nivel novo e conquista tomam a fala por prioridade e somam eventos (cada
    // um gasta um sorteio): sem a recompensa, cada conclusao e um evento so e a
    // alternancia A, B, A vale. A prova aqui e a regra de nao repetir pedido,
    // nao a recompensa (coberta nos outros testes).
    await page.route('**/api/missions/*/complete', async (rota) => {
      const resposta = await rota.fetch()
      const corpo = (await resposta.json()) as Record<string, unknown>
      await rota.fulfill({ response: resposta, json: { ...corpo, reward: null } })
    })
    await page.route(`**${PASTA_DAS_FALAS}**`, (rota) => rota.fulfill(falha.resposta))
    await instalarRelogio(page, manhaDoDia(falha.dia))
    const avulsas = [
      await semearAvulsa(`Avulsa A de ${falha.nome}`),
      await semearAvulsa(`Avulsa B de ${falha.nome}`),
      await semearAvulsa(`Avulsa C de ${falha.nome}`),
      await semearAvulsa(`Avulsa D de ${falha.nome}`),
    ] as const
    await page.goto('/')

    // A saudacao: a legenda aparece mesmo com a voz falhando.
    await expect(legenda(page)).toBeVisible()
    const saudacao = await falaDaLegenda(page)
    if (saudacao === null) throw new Error('a legenda da saudacao nao e uma fala do catalogo')
    await expect.poll(() => avisosDe(observacao, `${PASTA_DAS_FALAS}${saudacao}.mp3`)).toBe(1)

    await concluirADiaria(page, falha.dia)
    await expect(legenda(page)).toBeVisible()
    // Uma celebracao em curso segura a fala de prioridade menor: o relogio
    // anda os 3 s do rosto antes de cada conclusao, sem espera real.
    await page.clock.runFor(CELEBRACAO_MS)

    // Evento repetido, sem recarregar: A, B, A e depois uma fala nova (D).
    const falas: LineId[] = []
    for (const [indice, instrucao] of avulsas.entries()) {
      await concluirAvulsa(page, instrucao)
      const anterior = falas.at(-1)
      const esperada = indice === 2 ? falas[0] : undefined
      await expect
        .poll(
          async () => {
            const id = await falaDaLegenda(page)
            return (
              id !== null &&
              (LINE_GROUPS.missionDone as readonly LineId[]).includes(id) &&
              id !== anterior &&
              (esperada === undefined || id === esperada)
            )
          },
          {
            message:
              'a fala da conclusao nao seguiu a alternancia A, B, A: o sorteio fixado quebrou',
          },
        )
        .toBe(true)
      const fala = await falaDaLegenda(page)
      if (fala === null) throw new Error('a legenda da conclusao saiu do catalogo')
      falas.push(fala)
      await page.clock.runFor(CELEBRACAO_MS)
      if (indice !== 2) {
        await expect.poll(() => avisosDe(observacao, `${PASTA_DAS_FALAS}${fala}.mp3`)).toBe(1)
      }
    }
    const [primeira, segunda, terceira, quarta] = falas
    expect(terceira, 'a 3a conclusao devia repetir a fala da 1a').toBe(primeira)
    expect(segunda).not.toBe(primeira)
    expect([primeira, segunda]).not.toContain(quarta)
    assertSameLineIsNotRetried(
      observacao,
      `${PASTA_DAS_FALAS}${primeira ?? ''}.mp3`,
      `${PASTA_DAS_FALAS}${segunda ?? ''}.mp3`,
      `${PASTA_DAS_FALAS}${quarta ?? ''}.mp3`,
    )

    // Cada fala que falhou avisou uma unica vez na sessao.
    const falasPedidas = new Set(
      observacao.audio.filter((caminho) => caminho.startsWith(PASTA_DAS_FALAS)),
    )
    for (const caminho of falasPedidas) expect(avisosDe(observacao, caminho), caminho).toBe(1)
    expect(observacao.erros).toEqual([])
  })
}

/**
 * A repeticao da fala (`primeiro`) nao gera pedido novo. So vale como prova se
 * um pedido de OUTRO caminho de voz (`outro`) veio depois do primeiro (o canal
 * trocou de arquivo) e se a contagem foi lida DEPOIS de um evento posterior
 * observado (a fala `posterior`, ja pedida e avisada): um retry assincrono da
 * primeira teria chegado antes dela.
 */
function assertSameLineIsNotRetried(
  observacao: Observacao,
  primeiro: string,
  outro: string,
  posterior: string,
): void {
  expect(
    pedidosDe(observacao, posterior),
    'a fala posterior nao foi pedida',
  ).toBeGreaterThanOrEqual(1)
  expect(observacao.audio.lastIndexOf(posterior)).toBeGreaterThan(
    observacao.audio.lastIndexOf(primeiro),
  )
  const ultimoDoPrimeiro = observacao.audio.lastIndexOf(primeiro)
  const primeiroDoOutro = observacao.audio.indexOf(outro)
  expect(ultimoDoPrimeiro, 'a primeira fala nao foi pedida').toBeGreaterThanOrEqual(0)
  expect(
    primeiroDoOutro,
    'nenhuma outra fala foi pedida entre as repeticoes',
  ).toBeGreaterThanOrEqual(ultimoDoPrimeiro)
  // Um unico pedido da primeira fala (sem Range, ela falha na primeira resposta).
  expect(pedidosDe(observacao, primeiro)).toBe(1)
}

test('autoplay bloqueado: um unico aviso, uma tentativa por fala e nenhum erro', async ({
  page,
}) => {
  const observacao = observar(page)
  await ligarSom(page)
  await page.addInitScript(espiarAudio, true)
  await instalarRelogio(page, manhaDoDia(DIA_AUTOPLAY))
  await page.goto('/')

  await expect(bolha(page)).toBeVisible()
  const saudacao = await falaDaLegenda(page)
  if (saudacao === null) throw new Error('a legenda da saudacao nao e uma fala do catalogo')
  const jogadasDe = async (caminho: string) =>
    (await page.evaluate(() => window.__audioLog)).filter(
      (entrada) => entrada === `play ${caminho}`,
    ).length
  const caminhoDaSaudacao = `${PASTA_DAS_FALAS}${saudacao}.mp3`
  await expect.poll(() => observacao.avisos).toEqual([AUTOPLAY_BLOCKED_WARNING])
  await expect.poll(() => jogadasDe(caminhoDaSaudacao)).toBe(1)

  // Um evento posterior: a conclusao da diaria fala outra fala, tambem bloqueada.
  await concluirADiaria(page, DIA_AUTOPLAY)
  await expect
    .poll(async () => {
      const atual = await falaDaLegenda(page)
      return atual !== null && atual !== saudacao
    })
    .toBe(true)
  const posterior = `${PASTA_DAS_FALAS}${(await falaDaLegenda(page)) ?? ''}.mp3`
  await expect.poll(() => jogadasDe(posterior)).toBe(1)

  // Sem laco: cada fala tentou uma vez e o aviso continua um so.
  expect(await jogadasDe(caminhoDaSaudacao)).toBe(1)
  expect(observacao.avisos).toEqual([AUTOPLAY_BLOCKED_WARNING])
  expect(observacao.erros).toEqual([])
})

test.describe('com movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' })

  test('prefers-reduced-motion nao desliga o som', async ({ page }) => {
    const observacao = observar(page)
    await ligarSom(page)
    await instalarRelogio(page, manhaDoDia(DIA_MOVIMENTO_REDUZIDO))
    await page.goto('/')

    await concluirADiaria(page, DIA_MOVIMENTO_REDUZIDO)

    await expect.poll(() => pedidosDe(observacao, EFEITO_DA_LANTERNA)).toBeGreaterThanOrEqual(1)
    expect(observacao.erros).toEqual([])
  })
})

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a folha da tutora corta a voz e fechar nao a retoma', async ({ page }) => {
    const observacao = observar(page)
    await ligarSom(page)
    await page.addInitScript(espiarAudio, false)
    // So o canal da voz: o efeito `panel_open` toca no canal dele, ao abrir a folha.
    const registroDaVoz = async () =>
      (await page.evaluate(() => window.__audioLog)).filter((entrada) =>
        entrada.includes(PASTA_DAS_FALAS),
      )
    const jogadas = async () =>
      (await registroDaVoz()).filter((entrada) => entrada.startsWith('play ')).length
    await page.goto('/')
    await expect(bolha(page)).toBeVisible()
    await expect.poll(jogadas).toBeGreaterThanOrEqual(1)
    const antes = await jogadas()

    await page.getByTestId('tutor-sheet-open').click()
    const folha = page.getByRole('dialog', { name: 'Kairya' })
    await expect(folha).toBeVisible()
    // A voz foi cortada: a ultima chamada ao canal da voz e um `pause`.
    await expect.poll(async () => (await registroDaVoz()).at(-1)).toMatch(/^pause /)

    await page.keyboard.press('Escape')
    await expect(folha).toHaveCount(0)
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
    expect(await jogadas()).toBe(antes)
    expect(observacao.erros).toEqual([])
  })
})
