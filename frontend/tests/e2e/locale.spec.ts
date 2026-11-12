import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALE_STORAGE_KEY } from '../../src/shared/i18n/locale'
import { en } from '../../src/shared/i18n/messages/en'
import { ptBR } from '../../src/shared/i18n/messages/pt-BR'
import { definirRoteiro, liberar, reiniciar, requisicoes } from './falso'
import { diaCivil } from './datas'
import { CHAVE_DA_SAUDACAO, test } from './saudacaoJaVista'
import { API_URL, REPO_ROOT, WEB_URL } from './servers'
import { apagarTeto, semearTeto } from './teto'

/**
 * O idioma ponta a ponta (Fase 3, 3.4): navegador, API, banco e o falso da
 * Anthropic reais.
 *
 * Isolamento: o banco do E2E nao e zerado entre specs, e esta roda antes de
 * `tutor-focus` e `tutoring` (ordem alfabetica, um worker). Por isso o
 * `afterEach` devolve `users.locale` a `pt-BR` (o idioma dos specs seguintes,
 * pelo `use.locale` do config; o PATCH nao aceita `null`) e apaga o teto
 * semeado, que e idempotente.
 *
 * Os textos esperados saem do catalogo e das personas versionadas, nunca de
 * copia: um texto mudado la muda aqui.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** A linha inteira do `## 1.` da persona: as duas tem `## 1.`, so a linha distingue o idioma. */
function cabecalhoDaPersona(idioma: 'pt-BR' | 'en'): string {
  const caminho = join(REPO_ROOT, `src/focusquest/modules/tutoring/prompts/persona.${idioma}.md`)
  const linha = readFileSync(caminho, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('## 1.'))
  if (linha === undefined) {
    throw new Error(`persona.${idioma}.md sem o cabecalho "## 1."`)
  }
  return linha
}

/** O texto dos blocos de `system` de uma requisicao ao falso. */
function sistemaDe(corpo: unknown): string {
  const { system } = corpo as { system: string | { text: string }[] }
  return typeof system === 'string' ? system : system.map((bloco) => bloco.text).join('\n')
}

async function semViolacoes(page: Page): Promise<void> {
  // Conjunto PADRAO: sem `withTags` nem `disableRules`.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

/** O painel pronto no idioma `catalogo`: status disponivel e historico carregado. */
async function abrirPainel(page: Page, catalogo: typeof en | typeof ptBR): Promise<void> {
  await page.goto('/')
  await expect(page.getByLabel(catalogo['tutoring.input.label'])).toBeEnabled()
}

/** Clica em "English" e espera o servidor confirmar a gravacao do idioma. */
async function trocarParaIngles(page: Page): Promise<void> {
  // Filtra pelo corpo: num banco novo, o boot grava `pt-BR` em silencio
  // (`locale` nulo), e esse PATCH nao e o desta troca.
  const gravado = page.waitForResponse(
    (resposta) =>
      resposta.request().method() === 'PATCH' &&
      new URL(resposta.url()).pathname === '/api/me' &&
      (resposta.request().postDataJSON() as { locale?: string }).locale === 'en',
  )
  await page.getByRole('button', { name: 'EN, English' }).click()
  expect((await gravado).ok()).toBe(true)
}

async function perguntar(
  page: Page,
  catalogo: typeof en | typeof ptBR,
  texto: string,
): Promise<void> {
  await page.getByLabel(catalogo['tutoring.input.label']).fill(texto)
  await page.getByRole('button', { name: catalogo['tutoring.send.idle'], exact: true }).click()
}

test.beforeEach(async () => {
  await reiniciar()
})

test.afterEach(async ({ page }) => {
  const restaurado = await page.request.patch(`${API_URL}/api/me`, { data: { locale: 'pt-BR' } })
  expect(restaurado.ok()).toBe(true)
  // So na origem do app: em `about:blank` (cenario que falhou antes do
  // `goto`) o `localStorage` lanca.
  if (page.url().startsWith(WEB_URL)) {
    await page.evaluate(() => {
      localStorage.clear()
    })
  }
  await apagarTeto()
})

test('troca para EN, persiste no servidor e sobrevive à recarga', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: ptBR['shell.area.headquarters'] }),
  ).toBeVisible()

  await trocarParaIngles(page)

  await expect(
    page.getByRole('heading', { level: 1, name: en['shell.area.headquarters'] }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // Sem o cache local, o idioma so pode vir do servidor.
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: en['shell.area.headquarters'] }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await semViolacoes(page)
})

test('axe em pt-BR', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: ptBR['shell.area.headquarters'] }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await semViolacoes(page)
})

test('troca no meio do stream termina no idioma antigo e o próximo turno sai no novo', async ({
  page,
}) => {
  const comeco = `Começo em português (e2e ${EXECUCAO}) `
  const inteira = `${comeco}e o fim do mesmo turno.`
  const segunda = `Second answer, in English (e2e ${EXECUCAO}).`
  await definirRoteiro({
    blocks: [{ text: [comeco, 'e o fim do mesmo turno.'] }],
    // Presa depois do primeiro pedaco (o `APOS_O_PRIMEIRO_PEDACO` de
    // `tests/integration/provedor_falso.py`: message_start, os 4 eventos do
    // thinking, content_block_start e o primeiro delta).
    hold_after_events: 7,
  })
  await abrirPainel(page, ptBR)

  await perguntar(page, ptBR, `Primeira pergunta (e2e ${EXECUCAO})`)
  await expect(page.getByTestId('tutor-partial')).toContainText(comeco.trim())

  await trocarParaIngles(page)
  await liberar()

  await expect(page.getByTestId('tutor-message').filter({ hasText: inteira })).toHaveCount(1)
  await expect(page.getByTestId('tutor-failure')).toHaveCount(0)

  await definirRoteiro({ blocks: [{ text: [segunda] }] })
  await perguntar(page, en, `Second question (e2e ${EXECUCAO})`)
  await expect(page.getByTestId('tutor-message').filter({ hasText: segunda })).toHaveCount(1)
  // De novo depois do 2º turno: um refetch do histórico (pela troca de idioma
  // ou pelo `done`) que duplicasse a 1ª bolha só apareceria agora.
  await expect(page.getByTestId('tutor-message').filter({ hasText: inteira })).toHaveCount(1)

  const recebidas = await requisicoes()
  expect(recebidas).toHaveLength(2)
  const [primeira, seguinte] = recebidas.map((r) => sistemaDe(r.body))
  expect(primeira).toContain(cabecalhoDaPersona('pt-BR'))
  expect(primeira).not.toContain(cabecalhoDaPersona('en'))
  expect(seguinte).toContain(cabecalhoDaPersona('en'))
})

test('teto diário em EN mostra quando volta e preserva o histórico', async ({ page }) => {
  const pergunta = `A real question before the limit (e2e ${EXECUCAO})`
  const resposta = `The answer that stays on screen (e2e ${EXECUCAO}).`
  await abrirPainel(page, ptBR)
  await trocarParaIngles(page)
  await definirRoteiro({ blocks: [{ text: [resposta] }] })

  await perguntar(page, en, pergunta)
  await expect(page.getByTestId('tutor-message').filter({ hasText: resposta })).toHaveCount(1)

  await semearTeto()
  await perguntar(page, en, `One question too many (e2e ${EXECUCAO})`)

  const falha = page.getByTestId('tutor-failure')
  await expect(falha).toContainText(en['tutoring.messageFailure.dailyLimit.message'])
  await expect(falha).toContainText(en['tutoring.messageFailure.dailyLimit.backAtMidnight'])
  await expect(falha).toContainText('(Brasília time)')
  await expect(page.getByLabel(en['tutoring.input.label'])).toBeDisabled()
  // O texto da pergunta real, e nao a contagem de bolhas: as semeadas nao
  // estao na tela, e uma recarga do historico (so as ultimas 50) poderia
  // empurrar a real para fora -- o defeito que este assert denuncia.
  await expect(page.getByText(pergunta, { exact: true })).toBeVisible()
  await semViolacoes(page)
  // O teto barrou antes do provedor: so a pergunta real chegou ao falso.
  expect(await requisicoes()).toHaveLength(1)
})

test('sem cache local, um navegador novo abre em EN vindo do servidor', async ({
  page,
  browser,
}) => {
  await abrirPainel(page, ptBR)
  await trocarParaIngles(page)

  // Contexto novo: pt-BR no navegador e nenhum `LOCALE_STORAGE_KEY`. A saudacao
  // e o convite de som ja dispensados, como nos demais specs, para o layout
  // nao mudar. O idioma so pode vir do `GET /api/me`.
  const limpo = await browser.newContext({
    baseURL: WEB_URL,
    locale: 'pt-BR',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(WEB_URL).origin,
          localStorage: [
            { name: CHAVE_DA_SAUDACAO, value: diaCivil(new Date()) },
            { name: 'kairyaquest.soundInvite', value: '1' },
          ],
        },
      ],
    },
  })
  try {
    const nova = await limpo.newPage()
    await nova.goto('/')
    await expect(nova.locator('html')).toHaveAttribute('lang', 'en')
    await expect(nova.getByLabel(en['tutoring.input.label'])).toBeVisible()
    expect(await nova.evaluate((k) => localStorage.getItem(k), LOCALE_STORAGE_KEY)).toBe('en')
  } finally {
    await limpo.close()
  }
})
