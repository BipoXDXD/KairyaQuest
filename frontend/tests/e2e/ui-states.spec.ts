import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from './saudacaoJaVista'
import {
  ENGLISH_CASE_IDS,
  GALLERY_CASE_IDS,
  type GalleryCaseId,
} from '../../src/test/gallery/caseIds'
import {
  AVALIACAO_FALHOU,
  AVALIADA,
  CONCLUSAO_COM_RECOMPENSA,
  EM_ANDAMENTO,
  PENDENTE,
} from './missoesGaleria'

/**
 * axe sem violacoes e alvos de toque de 44px em cada estado dos componentes de
 * `shared/ui/`, montados um por pagina na galeria (`ui-gallery.html`). Roda no
 * projeto `ui-states`, com servidor proprio (ver `playwright.config.ts`).
 */

// Estados que so existem depois de uma interacao: o spec a faz e afirma o
// estado antes do axe (decisao N3: a API dos componentes nao ganha prop so
// para a galeria).
const SETUP: Partial<Record<GalleryCaseId, (page: Page) => Promise<void>>> = {
  'confirm-dialog-confirming': async (page) => {
    // O onConfirm do caso nunca resolve.
    const confirm = page.getByRole('dialog').locator('[data-variant="danger-confirm"]')
    await confirm.click()
    await expect(confirm).toHaveAttribute('aria-busy', 'true')
  },
  'language-switcher-save-failed': async (page) => {
    // O setLocale do caso rejeita; a falha aparece na StatusLine danger e o
    // idioma anterior continua marcado.
    await page.getByRole('button', { name: 'EN, English' }).click()
    const status = page.getByRole('status')
    await expect(status).toHaveAttribute('data-tone', 'danger')
    // O nome do idioma na falha é o endônimo, com o `lang` do próprio idioma.
    await expect(status).toContainText('English')
    await expect(status.locator('[lang="en"]')).toHaveText('English')
    await expect(status).toBeVisible()
    await expect(page.getByRole('button', { name: 'PT, Português (Brasil)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
  'week-plan-form-error': async (page) => {
    // Envio com tudo em branco: nada sai, o resumo diz quantos faltam e o
    // primeiro campo ruim recebe o foco.
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-status')).toHaveAttribute('data-tone', 'danger')
    await expect(page.getByTestId('week-plan-day-0-instructions')).toBeFocused()
    await expect(page.getByTestId('week-plan-day-0-instructions')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  },
  'week-plan-form-sending': async (page) => {
    // O POST nunca responde: o botao fica ocupado.
    await page.route('**/api/plans', () => new Promise<void>(() => undefined))
    await preencherPlano(page)
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-submit')).toHaveAttribute('aria-busy', 'true')
  },
  'week-plan-form-failure': async (page) => {
    // 503: o texto de falha aparece na StatusLine danger e o botao volta a servir.
    await page.route('**/api/plans', (route) => route.fulfill({ status: 503, body: '' }))
    await preencherPlano(page)
    await page.getByTestId('week-plan-submit').click()
    await expect(page.getByTestId('week-plan-status')).toHaveAttribute('data-tone', 'danger')
    await expect(page.getByTestId('week-plan-status')).toBeVisible()
    await expect(page.getByTestId('week-plan-submit')).not.toHaveAttribute('aria-busy', 'true')
  },
  'week-plan-copy-monday': async (page) => {
    // Copiar a segunda preenche os dias vazios e o aviso neutro confirma, no idioma da variante.
    await page.getByTestId('week-plan-day-0-instructions').fill('Resolver listas')
    await page.getByTestId('week-plan-copy-monday').click()
    await expect(page.getByTestId('week-plan-day-1-instructions')).toHaveValue('Resolver listas')
    const status = page.getByTestId('week-plan-status')
    await expect(status).toHaveAttribute('data-tone', 'neutral')
    const emIngles = new URL(page.url()).searchParams.get('lang') === 'en'
    await expect(status).toHaveText(
      emIngles ? 'Monday copied to the empty days.' : 'Segunda copiada para os dias vazios.',
    )
  },
  'reschedule-proposal-confirming': async (page) => {
    // O POST nunca responde: Confirmar e Recusar ficam travados no meio da decisao.
    // O fetch desiste sozinho no MUTATION_TIMEOUT_MS (20 s), bem depois do axe.
    await page.route('**/api/tutoring/actions/31/confirm', () => new Promise<void>(() => undefined))
    await page.getByTestId('proposal-confirm').click()
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled()
    await expect(page.getByTestId('proposal-confirm')).toHaveAccessibleName(
      nomeNaProposta('Confirmando…'),
    )
    await expect(page.getByTestId('proposal-reject')).toBeDisabled()
    await expect(page.getByTestId('proposal-reject')).toHaveAccessibleName(
      nomeNaProposta('Recusar'),
    )
  },
  'reschedule-proposal-confirm-failed': async (page) => {
    // 503: o aviso de falha aparece, o Confirmar vira "Tentar de novo" e a
    // segunda tentativa reusa a mesma chave de operacao.
    const ids: string[] = []
    await page.route('**/api/tutoring/actions/31/confirm', (route) => {
      ids.push((route.request().postDataJSON() as { operation_id: string }).operation_id)
      return route.fulfill({ status: 503, body: '' })
    })
    await page.getByTestId('proposal-confirm').click()
    await expect(page.getByTestId('proposal-failure')).toBeVisible()
    await expect(page.getByTestId('proposal-confirm')).toHaveAccessibleName(
      nomeNaProposta('Tentar de novo'),
    )
    await page.getByTestId('proposal-confirm').click()
    await expect.poll(() => ids.length).toBe(2)
    expect(ids[1]).toBe(ids[0])
    await expect(page.getByTestId('proposal-failure')).toBeVisible()
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled()
    await expect(page.getByTestId('proposal-reject')).toHaveAccessibleName(
      nomeNaProposta('Recusar'),
    )
  },
  'reschedule-proposal-rejecting': async (page) => {
    // O POST da recusa nunca responde: os dois botoes travam e o Recusar diz
    // "Recusando…". O fetch desiste no MUTATION_TIMEOUT_MS (20 s), depois do axe.
    await page.route('**/api/tutoring/actions/31/reject', () => new Promise<void>(() => undefined))
    await page.getByTestId('proposal-reject').click()
    await expect(page.getByTestId('proposal-reject')).toBeDisabled()
    await expect(page.getByTestId('proposal-reject')).toHaveAccessibleName(
      nomeNaProposta('Recusando…'),
    )
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled()
    await expect(page.getByTestId('proposal-confirm')).toHaveAccessibleName(
      nomeNaProposta('Confirmar'),
    )
  },
  'reschedule-proposal-reject-failed': async (page) => {
    // 503 com corpo vazio e falha que se repete: o aviso aparece, o Recusar
    // vira "Tentar de novo" e o Confirmar volta ao normal.
    await page.route('**/api/tutoring/actions/31/reject', (route) =>
      route.fulfill({ status: 503, body: '' }),
    )
    await page.getByTestId('proposal-reject').click()
    await expect(page.getByTestId('proposal-failure')).toContainText(
      'Não foi possível recusar a proposta',
    )
    await expect(page.getByTestId('proposal-reject')).toHaveAccessibleName(
      nomeNaProposta('Tentar de novo'),
    )
    await expect(page.getByTestId('proposal-reject')).toBeEnabled()
    await expect(page.getByTestId('proposal-confirm')).toHaveAccessibleName(
      nomeNaProposta('Confirmar'),
    )
  },
  'mission-board': async (page) => {
    // Um cartão por estado: pendente, em andamento, avaliada e avaliação que falhou.
    await expect(page.getByTestId('mission-item')).toHaveCount(QUADRO.length)
    const concluidas = QUADRO.filter((m) => m.state === 'concluida')
    await expect(page.getByTestId('evaluation-panel')).toHaveCount(concluidas.length)
    // A contagem sozinha passaria com a falha desenhada como aprovada.
    await expect(cartao(page, AVALIADA.instructions).getByTestId('evaluation-verdict')).toHaveText(
      'Critério atendido',
    )
    await expect(
      cartao(page, AVALIACAO_FALHOU.instructions).getByTestId('evaluation-error'),
    ).toContainText('A Kairya não conseguiu avaliar agora.')
    // Iniciar só na pendente; Concluir em todas as que não estão concluídas.
    await expect(page.getByTestId('mission-start')).toHaveCount(
      QUADRO.filter((m) => m.state === 'pendente').length,
    )
    await expect(page.getByTestId('mission-complete')).toHaveCount(
      QUADRO.length - concluidas.length,
    )
  },
  'mission-starting': async (page) => {
    // O POST nunca responde; o fetch desiste no MUTATION_TIMEOUT_MS (20 s), depois do axe.
    await page.route(
      `**/api/missions/${PENDENTE.id}/start`,
      () => new Promise<void>(() => undefined),
    )
    const iniciar = page.getByTestId('mission-start')
    await iniciar.click()
    await expect(iniciar).toBeDisabled()
    await expect(iniciar).toHaveAccessibleName(nomeNoCartao('Iniciando…', PENDENTE.instructions))
    await expect(
      cartao(page, PENDENTE.instructions).getByTestId('mission-start-status'),
    ).toHaveText('Iniciando a missão…')
  },
  'mission-start-failed': async (page) => {
    // 503 com corpo vazio: o aviso aparece e o Iniciar vira "Tentar de novo".
    await page.route(`**/api/missions/${PENDENTE.id}/start`, (route) =>
      route.fulfill({ status: 503, body: '' }),
    )
    const item = cartao(page, PENDENTE.instructions)
    await item.getByTestId('mission-start').click()
    await expect(item.getByTestId('mission-start-error')).toContainText(
      'Não foi possível confirmar o início.',
    )
    await expect(item.getByTestId('mission-start')).toHaveAccessibleName(
      nomeNoCartao('Tentar de novo', PENDENTE.instructions),
    )
    await expect(item.getByTestId('mission-start')).toBeEnabled()
  },
  'mission-completing': async (page) => {
    // O POST nunca responde; o fetch desiste no MUTATION_TIMEOUT_MS (20 s), depois do axe.
    await page.route(
      `**/api/missions/${EM_ANDAMENTO.id}/complete`,
      () => new Promise<void>(() => undefined),
    )
    const item = cartao(page, EM_ANDAMENTO.instructions)
    const concluir = item.getByTestId('mission-complete')
    await concluir.click()
    await expect(concluir).toBeDisabled()
    await expect(concluir).toHaveAccessibleName(
      nomeNoCartao('Concluindo…', EM_ANDAMENTO.instructions),
    )
    await expect(item.getByTestId('mission-completion-text')).toHaveText('Concluindo a missão…')
  },
  'mission-completion-failed': async (page) => {
    // 503 com corpo vazio: o aviso aparece e o Concluir vira "Tentar de novo".
    await page.route(`**/api/missions/${EM_ANDAMENTO.id}/complete`, (route) =>
      route.fulfill({ status: 503, body: '' }),
    )
    const item = cartao(page, EM_ANDAMENTO.instructions)
    await item.getByTestId('mission-complete').click()
    await expect(item.getByTestId('mission-completion-error')).toContainText(
      'Não foi possível confirmar a conclusão.',
    )
    await expect(item.getByTestId('mission-complete')).toHaveAccessibleName(
      nomeNoCartao('Tentar de novo', EM_ANDAMENTO.instructions),
    )
    await expect(item.getByTestId('mission-complete')).toBeEnabled()
  },
  'mission-completed-reward': async (page) => {
    // 200 com recompensa: o anúncio do XP aparece na região viva do cartão.
    await page.route(`**/api/missions/${EM_ANDAMENTO.id}/complete`, (route) =>
      route.fulfill({ json: CONCLUSAO_COM_RECOMPENSA }),
    )
    const item = cartao(page, EM_ANDAMENTO.instructions)
    await item.getByTestId('mission-complete').click()
    await expect(item.getByTestId('mission-completion-text')).toHaveText('Missão concluída.')
    await expect(item.getByTestId('reward-xp')).toHaveText('+80 XP')
    await expect(item.getByTestId('reward-level-up')).toHaveText('Subiu para o nível 2!')
    // A entrada anima a opacidade por 400 ms: no meio dela o axe lê o texto
    // misturado ao fundo. O contraste que importa é o do quadro final.
    await item
      .getByTestId('reward')
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  },
  'evidence-form-link-error': async (page) => {
    // O erro do link so aparece depois que o campo perde o foco.
    await page.getByTestId('evidence-link').focus()
    await page.getByTestId('evidence-text').focus()
    await expect(page.getByTestId('evidence-link-error')).toBeVisible()
  },
}

const QUADRO = [PENDENTE, EM_ANDAMENTO, AVALIADA, AVALIACAO_FALHOU]

/** O quadro busca as missoes na montagem: a rota precisa existir antes do goto. */
async function servirQuadro(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/missions',
    (route) => route.fulfill({ json: QUADRO }),
  )
}

// Rotas que precisam estar de pe antes de a pagina abrir.
const ROTAS: Partial<Record<GalleryCaseId, (page: Page) => Promise<void>>> = {
  'mission-board': servirQuadro,
  'mission-starting': servirQuadro,
  'mission-start-failed': servirQuadro,
  'mission-completing': servirQuadro,
  'mission-completion-failed': servirQuadro,
  'mission-completed-reward': servirQuadro,
}

/** O nome acessivel de Iniciar/Concluir num cartao do quadro. */
function nomeNoCartao(rotulo: string, instrucoes: string): string {
  return `${rotulo} a missão: ${instrucoes}`
}

/**
 * O nome acessivel de Confirmar/Recusar no cartao da galeria: o rotulo visivel
 * mais o alvo `sr-only`, separados pelo espaco que fica fora do `span`.
 */
function nomeNaProposta(rotulo: string): string {
  return `${rotulo} o reagendamento: Resumir o capítulo 3`
}

/** O cartao do quadro que traz estas instrucoes. */
function cartao(page: Page, instrucoes: string) {
  return page.getByTestId('mission-item').filter({ hasText: instrucoes })
}

/** Segunda e prova preenchidas, e a segunda copiada para o resto: o formulario fica valido. */
async function preencherPlano(page: Page): Promise<void> {
  await page.getByTestId('week-plan-day-0-instructions').fill('Resolver listas')
  await page.getByTestId('week-plan-day-0-criterion').fill('Cinco corrigidos')
  await page.getByTestId('week-plan-copy-monday').click()
  await page.getByTestId('week-plan-trial-instructions').fill('Prova simulada')
  await page.getByTestId('week-plan-trial-criterion').fill('Nota 7')
}

const ALVO_MINIMO_PX = 44

// Todo caso em portugues; os do formulario do plano tambem em ingles (`&lang=en`).
const VARIANTES = [
  ...GALLERY_CASE_IDS.map((id) => ({ id, query: `case=${id}`, nome: id })),
  ...ENGLISH_CASE_IDS.map((id) => ({ id, query: `case=${id}&lang=en`, nome: `${id} (en)` })),
]

for (const { id, query, nome } of VARIANTES) {
  test(`axe sem violações e alvos de 44px: ${nome}`, async ({ page }) => {
    await ROTAS[id]?.(page)
    await page.goto(`/ui-gallery.html?${query}`)
    const root = page.locator(`[data-gallery-case="${id}"]`)
    // Nao deixa o axe rodar sobre uma pagina vazia. A guarda olha o conteudo, e
    // nao a secao: um <dialog> modal vai para a top layer e deixa a secao com
    // tamanho zero, que o Playwright considera oculta.
    await expect(root.locator('*').filter({ visible: true }).first()).toBeVisible()
    await SETUP[id]?.(page)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    for (const b of await page.getByRole('button').all()) {
      const box = await b.boundingBox()
      expect(box !== null && box.width >= ALVO_MINIMO_PX && box.height >= ALVO_MINIMO_PX).toBe(true)
    }
  })
}
