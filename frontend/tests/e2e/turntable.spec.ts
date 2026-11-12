import { AxeBuilder } from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CATALOGS, translate } from '../../src/shared/i18n/catalog'
import { esperarAnimacoesFinitas } from './animacoes'
import { instanteRelativo, isoUtc } from './datas'
import { test } from './saudacaoJaVista'
import { API_URL } from './servers'

/**
 * O turntable na recompensa de nivel novo (Fase 9). Sem asset publicado
 * (`TURNTABLE` e `null`), a recompensa mostra o placeholder, tambem sob
 * movimento reduzido, e nenhum `video` e montado.
 *
 * Usa uma missao AVULSA: a diaria concluida quebraria o `cycle.spec`, que
 * compartilha a API e o relogio. A resposta de `complete` e interceptada para
 * forcar a subida do nivel 1 para o 2.
 */
const EXECUCAO = randomUUID().slice(0, 8)
const PRAZO_DIAS = 30

let api: APIRequestContext

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: API_URL })
})

test.afterAll(async () => {
  await api.dispose()
})

async function semearAvulsa(rotulo: string): Promise<string> {
  const instrucao = `${rotulo} (e2e ${EXECUCAO})`
  const resposta = await api.post('/api/missions', {
    data: {
      instructions: instrucao,
      completion_criterion: `Conferido (e2e ${EXECUCAO})`,
      difficulty: 2,
      estimated_minutes: 30,
      deadline: isoUtc(instanteRelativo(PRAZO_DIAS, 12)),
    },
  })
  expect(resposta.status(), await resposta.text()).toBe(201)
  return instrucao
}

async function forcarNivelNovo(page: Page): Promise<void> {
  await page.route('**/api/missions/*/complete', async (rota) => {
    const resposta = await rota.fetch()
    const corpo = (await resposta.json()) as { reward: Record<string, unknown> | null }
    expect(corpo.reward, 'complete sem reward').not.toBeNull()
    await rota.fulfill({
      response: resposta,
      json: { ...corpo, reward: { ...corpo.reward, level_before: 1, level_after: 2 } },
    })
  })
}

async function concluir(page: Page, instrucao: string): Promise<void> {
  const item = page.getByTestId('missions-list').getByTestId('mission-item').filter({
    hasText: instrucao,
  })
  // O nome acessivel do botao e "Concluir" + o trecho so para leitor de tela.
  const nome = `${translate('pt-BR', 'missions.card.complete')} ${translate(
    'pt-BR',
    'missions.card.whichMission',
    { instructions: instrucao },
  )}`
  await item.getByRole('button', { name: nome }).click()
  await expect(item.getByTestId('mission-state')).toHaveText(
    CATALOGS['pt-BR']['missions.state.completed'],
  )
}

test('nivel novo: o placeholder da Kairya aparece na recompensa, com o alt em pt-BR, e passa no axe', async ({
  page,
}) => {
  const instrucao = await semearAvulsa('Avulsa do turntable')
  await forcarNivelNovo(page)
  await page.goto('/')
  await concluir(page, instrucao)

  // O turntable fica fora da regiao viva da recompensa (role=status), para o
  // leitor de tela nao reler o anuncio quando o botao de pausa troca o rotulo.
  const placeholder = page.getByTestId('kairya-turntable-placeholder')
  await expect(placeholder).toBeVisible()
  await expect(page.getByTestId('reward').getByTestId('kairya-turntable-placeholder')).toHaveCount(
    0,
  )
  await expect(placeholder).toHaveAttribute(
    'alt',
    CATALOGS['pt-BR']['kairya.turntable.placeholderAlt'],
  )
  await expect(page.getByTestId('kairya-turntable')).toHaveCount(0)
  await esperarAnimacoesFinitas(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('movimento reduzido: nenhum video e montado e o placeholder aparece', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const instrucao = await semearAvulsa('Avulsa do turntable reduzido')
  await forcarNivelNovo(page)
  await page.goto('/')
  await concluir(page, instrucao)

  await expect(page.getByTestId('kairya-turntable-placeholder')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
  await esperarAnimacoesFinitas(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
