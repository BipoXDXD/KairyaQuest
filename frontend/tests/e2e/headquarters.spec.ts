// Import NOMEADO, nao o default: o pacote e publicado em CommonJS (sem
// `"type": "module"`), e nesse caso o `import AxeBuilder from ...` do README
// dele entrega o namespace do modulo -- que nao e construtivel. O `tsc`
// reprova com "This expression is not constructable"; o mesmo import nomeado
// funciona nas duas formas de modulo.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { API_URL } from './servers'

/**
 * O cenario ponta a ponta do Quartel-General: API real, banco real, navegador
 * real.
 *
 * Duas decisoes estruturais sustentam este arquivo, e nenhuma das duas e
 * estetica.
 *
 * **1. A semeadura e por HTTP, nunca por SQL.** O cenario cria as missoes com
 * `POST /api/missions`, pelo mesmo contrato que qualquer cliente usaria.
 * Escrever `INSERT` direto seria mais rapido e mais fragil de um jeito
 * especifico: o teste passaria a depender do ESQUEMA (nome de coluna, valor
 * cru de `state`, quais colunas tem default) em vez do contrato, e uma
 * migracao que renomeasse uma coluna quebraria o E2E sem que nada estivesse
 * errado na aplicacao. Semeando pela API, o preparo do cenario tambem
 * exercita o endpoint de criacao.
 *
 * **2. As asseveracoes falam das linhas que ESTA execucao criou.** O banco de
 * teste e compartilhado com a suite pytest e nao e limpo entre execucoes do
 * E2E, entao o quadro quase sempre tem missoes de rodadas anteriores. Um
 * `toHaveCount(2)` ou um "a primeira linha da lista" seriam aprovados ou
 * reprovados por dado remanescente -- ou seja, por acidente. Cada missao
 * criada aqui carrega o sufixo unico `EXECUCAO` no texto e devolve o proprio
 * `id`, e e por `id` que o cenario localiza a linha dela.
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
 * O recorte do contrato de saida que este cenario le.
 *
 * Declarado aqui, e nao importado de `src/features/missions/types.ts`, de
 * proposito: o E2E confere o que a API publica e o que a tela mostra. Se ele
 * tomasse os tipos e os rotulos emprestados da aplicacao, um rotulo errado --
 * `'Pendente'` virando `'pendente'`, por exemplo -- combinaria com ele mesmo e
 * passaria. O texto esperado esta escrito por extenso abaixo pela mesma razao.
 */
interface MissaoCriada extends PedidoDeMissao {
  id: number
  state: string
  xp: number
}

/**
 * As duas missoes do cenario, na ordem em que sao CRIADAS -- que e o inverso
 * da ordem de prazo.
 *
 * A inversao e o ponto: a API promete ordenar por prazo, e um cenario que
 * criasse em ordem crescente nao distinguiria "ordenado por prazo" de
 * "ordenado por id".
 */
const PEDIDOS: readonly PedidoDeMissao[] = [
  {
    instructions: `Resolver a lista de recorrencias (e2e ${EXECUCAO})`,
    completion_criterion: `Dez exercicios corrigidos (e2e ${EXECUCAO})`,
    difficulty: 5,
    estimated_minutes: 90,
    // Prazo com deslocamento -03:00, e nao `Z`: o 201 devolve o prazo como ele
    // chegou, com `-03:00`, e a listagem o le do banco, com `Z` (a API fixa a
    // sessao do PostgreSQL em UTC). Sao duas grafias do mesmo instante, e e a
    // igualdade de INSTANTES -- nao de strings -- que a conferencia do
    // `dateTime` abaixo comprova.
    deadline: '2027-02-15T21:00:00-03:00',
  },
  {
    instructions: `Ler o capitulo 3 de algoritmos (e2e ${EXECUCAO})`,
    completion_criterion: `Resumo de uma pagina entregue (e2e ${EXECUCAO})`,
    difficulty: 3,
    estimated_minutes: 45,
    deadline: '2027-01-10T13:00:00Z',
  },
]

/**
 * O TEXTO do prazo que a tela tem de mostrar para cada pedido, na mesma ordem
 * de `PEDIDOS` -- escrito por extenso, em `America/Sao_Paulo`, pela mesma razao
 * de nao importar os rotulos da aplicacao.
 *
 * Os dois fusos que importam aqui produzem textos diferentes: o navegador do
 * cenario roda em `Asia/Tokyo` (ver `playwright.config.ts`), onde o primeiro
 * prazo seria `16/02/2027 09:00`. Conferir so o atributo `dateTime` nao pegava
 * um defeito de APRESENTACAO -- o instante estava certo e o texto, no fuso
 * errado. Regex e nao texto exato: o separador entre data e hora muda entre
 * versoes do ICU.
 */
const PRAZO_NA_TELA: readonly RegExp[] = [/15\/02\/2027.*21:00/, /10\/01\/2027.*10:00/]

/** As missoes criadas, como a API as devolveu, na ordem de criacao. */
const criadas: MissaoCriada[] = []

/** Os ids em ordem de PRAZO: o segundo pedido vence antes do primeiro. */
function idsEmOrdemDePrazo(): string[] {
  return [...criadas]
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
    .map((missao) => String(missao.id))
}

async function semear(api: APIRequestContext): Promise<void> {
  for (const pedido of PEDIDOS) {
    const resposta = await api.post('/api/missions', { data: pedido })
    // O corpo entra na mensagem de falha: um 422 sem corpo diria apenas "nao
    // foi 201", e o que interessa e QUAL campo a API recusou.
    expect(resposta.status(), await resposta.text()).toBe(201)
    criadas.push((await resposta.json()) as MissaoCriada)
  }
}

/**
 * A lista, depois de carregada.
 *
 * Esperar pelo `missions-list` -- e nao por um `waitForTimeout` -- e o que faz
 * o cenario nao depender de quanto tempo a API leva: o `<ul>` so existe no
 * estado `loaded`.
 */
async function abrirQuadro(page: Page) {
  await page.goto('/')
  const lista = page.getByTestId('missions-list')
  await expect(lista).toBeVisible()
  return lista
}

test.beforeAll(async ({ playwright }) => {
  // Contexto proprio, apontado direto para a porta da API (8100) e NAO para o
  // proxy do frontend. A diferenca e o que torna este cenario uma prova de
  // isolamento: a semeadura entra pela API dedicada, a leitura sai pela tela
  // (que passa pelo proxy do Vite). Se o proxy apontasse para outra API -- a
  // de desenvolvimento na 8000, por exemplo --, as missoes semeadas
  // simplesmente nao apareceriam e o cenario reprovaria.
  const api = await playwright.request.newContext({ baseURL: API_URL })
  try {
    await semear(api)
  } finally {
    await api.dispose()
  }
})

test('o quadro mostra as missoes que esta execucao criou', async ({ page }) => {
  const lista = await abrirQuadro(page)

  for (const [indice, criada] of criadas.entries()) {
    const item = lista.locator(`[data-mission-id="${String(criada.id)}"]`)
    await expect(item).toHaveCount(1)

    await expect(item.getByTestId('mission-instructions')).toHaveText(criada.instructions)
    await expect(item.getByTestId('mission-completion-criterion')).toContainText(
      criada.completion_criterion,
    )
    // O rotulo em pt-BR, nao o valor cru `pendente` que a API grava.
    await expect(item.getByTestId('mission-state')).toHaveText('Pendente')
    expect(criada.state).toBe('pendente')

    await expect(item.getByTestId('mission-difficulty')).toHaveText(
      `${String(criada.difficulty)} de 5`,
    )
    await expect(item.getByTestId('mission-estimated-minutes')).toHaveText(
      `${String(criada.estimated_minutes)} min`,
    )
    // `xp` e computado pela API a partir da dificuldade e nao existe no banco:
    // o que se confere aqui e que o valor derivado atravessa a rede e chega
    // inteiro a tela.
    await expect(item.getByTestId('mission-xp')).toHaveText(`${String(criada.xp)} XP`)

    // Missao recem-criada nao tem inicio nem conclusao, entao a duracao real e
    // nula -- e nulo nao pode aparecer como "0 min".
    await expect(item.getByTestId('mission-actual-duration')).toHaveCount(0)

    // O prazo: o atributo `dateTime` carrega o instante, e a comparacao e
    // entre INSTANTES. Comparar as strings reprovaria por formatacao --
    // `2027-02-15T21:00:00-03:00` (o 201, que ecoa o pedido) e
    // `2027-02-16T00:00:00Z` (a listagem, lida do banco em UTC) sao o mesmo
    // momento escrito de dois jeitos.
    const prazo = await item.getByTestId('mission-deadline').getAttribute('dateTime')
    expect(prazo).not.toBeNull()
    expect(Date.parse(prazo ?? '')).toBe(Date.parse(criada.deadline))
    // E o texto visivel, no fuso do produto -- com o navegador em outro fuso.
    await expect(item.getByTestId('mission-deadline')).toHaveText(PRAZO_NA_TELA[indice])
  }
})

test('a tela preserva a ordem de prazo que a API devolveu', async ({ page }) => {
  const lista = await abrirQuadro(page)

  const naTela = await lista
    .getByTestId('mission-item')
    .evaluateAll((itens) => itens.map((item) => item.getAttribute('data-mission-id')))

  // Somente as linhas desta execucao. As de execucoes anteriores continuam no
  // quadro e podem cair em qualquer posicao entre estas duas -- o que importa
  // e a ordem RELATIVA das duas, nao a posicao absoluta delas.
  const esperados = idsEmOrdemDePrazo()
  expect(naTela.filter((id) => id !== null && esperados.includes(id))).toEqual(esperados)
})

test('a tela nao tem violacao de acessibilidade detectada pelo axe', async ({ page }) => {
  await abrirQuadro(page)

  // Sem `withTags`: o conjunto padrao do axe-core e mais amplo que WCAG 2 A/AA,
  // e reduzi-lo seria baixar o limiar para caber no resultado.
  const resultado = await new AxeBuilder({ page }).analyze()

  // `toEqual([])` e nao `toHaveLength(0)`: quando reprova, a mensagem traz a
  // violacao inteira -- regra, impacto e no do DOM -- em vez de "esperava 0,
  // recebeu 3".
  expect(resultado.violations).toEqual([])
})

/**
 * O estado de ERRO, auditado pelo axe -- e nao apenas o estado carregado.
 *
 * Por que vale um cenario proprio. Os outros tres cenarios rodam depois de a
 * lista aparecer, entao a auditoria de acessibilidade nunca via o estado que a
 * pessoa encontra quando esta sem rede: uma `role="alert"` (regiao viva, que
 * anuncia sozinha) e um botao que precisa de nome acessivel e de foco visivel.
 * E justamente ali que moram os defeitos, e era justamente ali que o axe nao
 * chegava.
 *
 * O mecanismo e `page.route(...).abort()`, e nao derrubar a API: abortar no
 * NAVEGADOR independe do proxy do Vite e do processo do uvicorn, entao o
 * cenario nao precisa mexer em servidor nenhum para reproduzir "sem rede". O
 * `fetch` rejeita com `TypeError`, que nao e `ApiError`, e o
 * `controller.signal.aborted` do hook segue falso (quem abortou foi a rede,
 * nao nos) -- entao o estado de erro e alcancado pelo caminho de verdade.
 *
 * De quebra, o cenario prova ponta a ponta o que nenhum teste de unidade cobre:
 * que o "Tentar novamente" realmente refaz o pedido e a tela se recupera.
 */
test('o estado de erro e acessivel e o "Tentar novamente" recupera a tela', async ({ page }) => {
  // Interceptado ANTES do goto: o pedido da montagem inicial ja tem de cair.
  await page.route('**/api/missions', (rota) => rota.abort())

  await page.goto('/')

  const erro = page.getByTestId('missions-error')
  await expect(erro).toBeVisible()
  // A regiao viva pelo papel, nao pelo `data-testid`: e o `role="alert"` que
  // faz o leitor de tela anunciar a falha sem a pessoa ir procurar.
  await expect(page.getByRole('alert')).toContainText('Falha ao carregar as missões.')

  // O botao pelo NOME ACESSIVEL. Um botao sem nome e a violacao classica deste
  // estado, e `getByRole('button', { name })` reprova se o nome desaparecer.
  const tentarNovamente = page.getByRole('button', { name: 'Tentar novamente' })
  await expect(tentarNovamente).toBeVisible()

  // Conjunto de regras PADRAO: sem `withTags` e sem `disableRules`. Reduzir o
  // conjunto para caber no resultado seria baixar o limiar.
  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])

  // A recuperacao: solta a interceptacao e clica. Se o botao nao refizesse o
  // pedido, a lista nunca apareceria e esta espera estouraria.
  await page.unroute('**/api/missions')
  await tentarNovamente.click()

  await expect(page.getByTestId('missions-list')).toBeVisible()
  await expect(erro).toHaveCount(0)
})
