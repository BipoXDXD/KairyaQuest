// Import NOMEADO, nao o default: ver o comentario em headquarters.spec.ts.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { definirRoteiro, reiniciar, requisicoes } from './falso'

/**
 * O acompanhamento ponta a ponta (Incremento F): iniciar, reagendar pela tela
 * e a proposta de reagendamento da Tifa confirmada pela pessoa. Navegador
 * real, API real, banco real e o servidor falso da Anthropic como processo.
 *
 * O banco de teste e compartilhado e nao e limpo entre execucoes: cada missao
 * carrega o sufixo `EXECUCAO` e e localizada pelo `id` que a API devolveu,
 * nunca por posicao no quadro. O falso e reiniciado antes de cada cenario.
 *
 * Janela da meia-noite de SP (pendencia 54): nenhum cenario daqui depende do
 * dia civil -- as missoes sao avulsas, e o texto esperado de "Iniciada em"
 * sai do `started_at` que a propria API devolveu, nao do relogio do teste.
 * Nao ha semeadura "de hoje" que possa virar "de ontem" entre dois passos.
 *
 * Prazos: a API roda com o relogio real, e o reagendamento recusa um prazo
 * novo que ja passou (`prazo_expirado`). Por isso nenhum prazo daqui e uma
 * data escrita a mao: todos saem de `daquiADias`, a partir do relogio do
 * teste, e um prazo fixo viraria passado e derrubaria o gate sozinho.
 */
const EXECUCAO = randomUUID().slice(0, 8)

interface PedidoDeMissao {
  instructions: string
  completion_criterion: string
  difficulty: number
  estimated_minutes: number
  deadline: string
}

/**
 * O recorte do contrato de saida que estes cenarios leem. Declarado aqui, e
 * nao importado da aplicacao, pelo mesmo motivo de headquarters.spec.ts: o
 * E2E confere o que a API publica, e um tipo emprestado combinaria com ele
 * mesmo.
 */
interface Missao extends PedidoDeMissao {
  id: number
  state: string
  started_at: string | null
  completed_at: string | null
  actual_duration_minutes: number | null
  reschedules: {
    previous_deadline: string
    new_deadline: string
    reason: string
    origin: string
    rescheduled_at: string
  }[]
}

/** O recorte do corpo que a API mandou ao falso da Anthropic. */
interface PedidoAoFalso {
  tools?: { name: string }[]
}

/** Cria uma missao avulsa pela API dedicada e devolve o corpo do 201. */
async function criarMissao(api: APIRequestContext, rotulo: string, deadline: string) {
  const resposta = await api.post('/api/missions', {
    data: {
      instructions: `${rotulo} (e2e ${EXECUCAO})`,
      completion_criterion: `Feito e conferido (e2e ${EXECUCAO})`,
      difficulty: 2,
      estimated_minutes: 25,
      deadline,
    } satisfies PedidoDeMissao,
  })
  // O corpo entra na mensagem de falha: interessa QUAL campo a API recusou.
  expect(resposta.status(), await resposta.text()).toBe(201)
  return (await resposta.json()) as Missao
}

/** A missao como a API a guarda agora -- a fonte de verdade da persistencia. */
async function lerMissao(api: APIRequestContext, id: number): Promise<Missao> {
  const resposta = await api.get('/api/missions')
  expect(resposta.status()).toBe(200)
  const missao = ((await resposta.json()) as Missao[]).find((m) => m.id === id)
  expect(missao, `missao ${String(id)} ausente de GET /api/missions`).toBeDefined()
  return missao as Missao
}

const UMA_HORA_EM_MS = 60 * 60 * 1000
const UM_DIA_EM_MS = 24 * UMA_HORA_EM_MS

/**
 * O instante daqui a `dias` dias, arredondado para a hora cheia seguinte, em
 * ISO 8601 com `Z`. Hora cheia porque o deslocamento de Sao Paulo e de horas
 * inteiras: o minuto e o mesmo em UTC e no relogio de Brasilia, e a conversao
 * do `datetime-local` nao tem o que arredondar.
 */
function daquiADias(dias: number): string {
  const instante = Math.ceil((Date.now() + dias * UM_DIA_EM_MS) / UMA_HORA_EM_MS) * UMA_HORA_EM_MS
  return new Date(instante).toISOString()
}

/** As partes do instante no relogio de Sao Paulo. `h23`: meia-noite e 00. */
const PARTES_EM_SP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * O texto esperado de um instante na tela, como regex: `dd/mm/aaaa ... HH:MM`
 * em `America/Sao_Paulo`. Regex e nao texto exato porque o separador entre
 * data e hora muda entre versoes do ICU (headquarters.spec.ts); e montado
 * aqui, e nao com o `formatDeadline` da aplicacao, para nao conferir o
 * formatador com ele mesmo.
 */
function naTela(iso: string): RegExp {
  return new RegExp(trechoDaTela(iso))
}

/** O trecho `dd/mm/aaaa.*HH:MM` de `naTela`, para compor regex maiores. */
function trechoDaTela(iso: string): string {
  const p = partesEmSp(iso)
  return `${p.day}/${p.month}/${p.year}.*${p.hour}:${p.minute}`
}

/**
 * O valor de um `datetime-local` (`aaaa-mm-ddTHH:mm`) para o instante: a hora
 * civil de Brasilia, que e o que a tela pergunta e converte de volta.
 */
function paraDatetimeLocal(iso: string): string {
  const p = partesEmSp(iso)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

function partesEmSp(iso: string): Record<string, string> {
  return Object.fromEntries(
    PARTES_EM_SP.formatToParts(new Date(iso)).map((parte) => [parte.type, parte.value]),
  )
}

async function semViolacoes(page: Page): Promise<void> {
  // Conjunto PADRAO: sem `withTags` nem `disableRules`.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

function cartaoDa(page: Page, missao: Missao): Locator {
  return page.getByTestId('missions-list').locator(`[data-mission-id="${String(missao.id)}"]`)
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await reiniciar()
})

test('(1) iniciar pela tela persiste o inicio, e concluir mostra a duracao real da API', async ({
  page,
  request,
}) => {
  const criada = await criarMissao(request, 'Ler o capítulo 7', daquiADias(45))
  expect(criada.state).toBe('pendente')
  expect(criada.started_at).toBeNull()

  await page.goto('/')
  const cartao = cartaoDa(page, criada)
  await cartao
    .getByRole('button', { name: `Iniciar a missão: ${criada.instructions}`, exact: true })
    .click()
  await expect(cartao.getByTestId('mission-start-status')).toHaveText('Missão iniciada.')
  await expect(cartao.getByTestId('mission-state')).toHaveText('Em andamento')

  // A API gravou o inicio: estado e instante vem do servidor, nao da tela.
  const iniciada = await lerMissao(request, criada.id)
  expect(iniciada.state).toBe('em_andamento')
  expect(iniciada.started_at).not.toBeNull()
  const inicio = iniciada.started_at as string
  const linhaDoInicio = cartao.getByTestId('mission-started-at')
  await expect(linhaDoInicio).toHaveText(/^Iniciada em /)
  await expect(linhaDoInicio).toHaveText(naTela(inicio))
  await expect(linhaDoInicio.locator('time')).toHaveAttribute('dateTime', inicio)
  await expect(cartao.getByTestId('mission-start')).toHaveCount(0)
  await semViolacoes(page)

  // Recarregar le do servidor: o estado e a linha do inicio continuam.
  await page.reload()
  await expect(cartao.getByTestId('mission-state')).toHaveText('Em andamento')
  await expect(cartao.getByTestId('mission-started-at')).toHaveText(naTela(inicio))
  await expect(cartao.getByTestId('mission-start')).toHaveCount(0)

  // Concluir: a duracao real do cartao e o numero que a API calculou.
  await cartao.getByTestId('mission-complete').click()
  await expect(cartao.getByTestId('mission-state')).toHaveText('Concluída')
  const concluida = await lerMissao(request, criada.id)
  expect(concluida.state).toBe('concluida')
  expect(concluida.started_at).toBe(inicio)
  expect(concluida.actual_duration_minutes).not.toBeNull()
  await expect(cartao.getByTestId('mission-actual-duration')).toHaveText(
    `${String(concluida.actual_duration_minutes)} min`,
  )
  // Concluida, "Iniciada em" sai: o que conta e a duracao real.
  await expect(cartao.getByTestId('mission-started-at')).toHaveCount(0)
})

test('(2) reagendar pela tela com motivo: prazo novo, contagem e historico apos recarga', async ({
  page,
  request,
}) => {
  const criada = await criarMissao(request, 'Revisar ponteiros', daquiADias(10))
  // O prazo novo e depois do atual: o cenario prova o reagendamento, e nao a
  // antecipacao.
  const novoPrazo = daquiADias(30)

  await page.goto('/')
  const cartao = cartaoDa(page, criada)
  const abrir = cartao.getByTestId('reschedule-toggle')
  await expect(abrir).toHaveText('Reagendar prazo')
  await abrir.click()
  await expect(abrir).toHaveAttribute('aria-expanded', 'true')
  // `datetime-local`: a hora civil de Brasilia, que a tela converte para o
  // instante `novoPrazo`; a conferencia do instante gravado vem logo abaixo.
  await cartao.getByLabel('Novo prazo (horário de Brasília)').fill(paraDatetimeLocal(novoPrazo))
  await cartao
    .getByRole('group', { name: 'Por que reagendar?' })
    .getByLabel('Falta de tempo')
    .check()
  await semViolacoes(page)

  await cartao.getByTestId('reschedule-submit').click()
  await expect(cartao.getByTestId('mission-reschedule-status')).toHaveText('Prazo reagendado.')
  await expect(cartao.getByTestId('mission-deadline')).toHaveText(naTela(novoPrazo))
  await expect(cartao.getByTestId('mission-reschedule-count')).toHaveText('Reagendada 1 vez')

  // O servidor gravou o elo do historico com o instante certo e a origem.
  const reagendada = await lerMissao(request, criada.id)
  expect(Date.parse(reagendada.deadline)).toBe(Date.parse(novoPrazo))
  expect(reagendada.reschedules).toHaveLength(1)
  const elo = reagendada.reschedules[0]
  expect(elo?.reason).toBe('falta_de_tempo')
  expect(elo?.origin).toBe('usuario')
  expect(Date.parse(elo?.new_deadline ?? '')).toBe(Date.parse(novoPrazo))
  expect(Date.parse(elo?.previous_deadline ?? '')).toBe(Date.parse(criada.deadline))

  // Recarregar: o prazo novo, a contagem e o historico vem da API.
  await page.reload()
  await expect(cartao.getByTestId('mission-deadline')).toHaveText(naTela(novoPrazo))
  await expect(cartao.getByTestId('mission-deadline')).toHaveAttribute(
    'dateTime',
    reagendada.deadline,
  )
  await expect(cartao.getByTestId('mission-reschedule-count')).toHaveText('Reagendada 1 vez')
  const historico = cartao.getByTestId('mission-reschedule-history')
  await historico.getByText('Histórico de prazos').click()
  const linhas = historico.getByTestId('mission-reschedule-entry')
  await expect(linhas).toHaveCount(1)
  await expect(linhas.first()).toHaveText(
    new RegExp(
      `^${trechoDaTela(criada.deadline)} → ${trechoDaTela(novoPrazo)} · Falta de tempo · por você$`,
    ),
  )
  await semViolacoes(page)
})

test('(3) a Tifa propoe reagendar, a pessoa confirma e o quadro mostra o prazo novo', async ({
  page,
  request,
}) => {
  const criada = await criarMissao(request, 'Estudar interfaces', daquiADias(20))
  const novoPrazo = daquiADias(40)
  await definirRoteiro({
    blocks: [
      { text: [`Vamos mover (e2e ${EXECUCAO}).`] },
      {
        tool_name: 'reschedule_mission',
        tool_input: {
          mission_id: criada.id,
          new_deadline: novoPrazo,
          reason: 'mudanca_de_prioridade',
        },
      },
    ],
  })

  await page.goto('/')
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeEnabled()
  await page
    .getByLabel('Sua mensagem para a Tifa')
    .fill(`Não vou conseguir a tempo, dá para mover? (e2e ${EXECUCAO})`)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()

  // O cartao da proposta: a missao e os dois prazos, em Sao Paulo.
  const proposta = page
    .getByTestId('tutor-reschedule-proposal')
    .filter({ hasText: criada.instructions })
  await expect(proposta).toBeVisible()
  await expect(proposta).toContainText('Proposta de reagendamento')
  await expect(proposta.getByTestId('reschedule-instructions')).toHaveText(criada.instructions)
  await expect(proposta.getByTestId('reschedule-previous-deadline')).toHaveText(
    naTela(criada.deadline),
  )
  await expect(proposta.getByTestId('reschedule-new-deadline')).toHaveText(naTela(novoPrazo))
  await expect(proposta.getByTestId('reschedule-reason')).toContainText('Mudança de prioridade')
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa terminou de responder.')
  await semViolacoes(page)

  // A API chamou o falso uma vez, oferecendo as DUAS ferramentas.
  const recebidas = await requisicoes()
  expect(recebidas).toHaveLength(1)
  const nomes = ((recebidas[0]?.body as PedidoAoFalso).tools ?? []).map((f) => f.name).sort()
  expect(nomes).toEqual(['create_mission', 'reschedule_mission'])

  // Antes da confirmacao, nada mudou no servidor: proposta nao e acao.
  expect((await lerMissao(request, criada.id)).reschedules).toHaveLength(0)

  await proposta
    .getByRole('button', { name: `Confirmar o reagendamento: ${criada.instructions}` })
    .click()
  await expect(proposta.getByTestId('proposal-rescheduled')).toHaveText('Prazo reagendado')

  // O quadro recarregou sozinho: o cartao da missao tem o prazo novo e o elo.
  const cartao = cartaoDa(page, criada)
  await expect(cartao.getByTestId('mission-deadline')).toHaveText(naTela(novoPrazo))
  await expect(cartao.getByTestId('mission-reschedule-count')).toHaveText('Reagendada 1 vez')
  await cartao.getByTestId('mission-reschedule-history').getByText('Histórico de prazos').click()
  await expect(cartao.getByTestId('mission-reschedule-entry')).toHaveText([
    new RegExp(
      `^${trechoDaTela(criada.deadline)} → ${trechoDaTela(novoPrazo)} · Mudança de prioridade · proposto pela Tifa$`,
    ),
  ])

  // A confirmacao reagendou a missao existente, e nao criou outra.
  const depois = await lerMissao(request, criada.id)
  expect(Date.parse(depois.deadline)).toBe(Date.parse(novoPrazo))
  expect(depois.reschedules).toHaveLength(1)
  expect(depois.reschedules[0]?.origin).toBe('tifa')
  expect(depois.reschedules[0]?.reason).toBe('mudanca_de_prioridade')
  const todas = (await (await request.get('/api/missions')).json()) as Missao[]
  expect(todas.filter((m) => m.instructions === criada.instructions)).toHaveLength(1)
  await semViolacoes(page)

  // Recarregar: o prazo novo e o historico "proposto pela Tifa" persistem.
  await page.reload()
  await expect(cartao.getByTestId('mission-deadline')).toHaveText(naTela(novoPrazo))
  await cartao.getByTestId('mission-reschedule-history').getByText('Histórico de prazos').click()
  await expect(cartao.getByTestId('mission-reschedule-entry')).toHaveText([
    /· Mudança de prioridade · proposto pela Tifa$/,
  ])
})

test('prazo com segundos sem editar e recusado sem criar historico', async ({ page, request }) => {
  const instante = new Date(daquiADias(10))
  instante.setUTCSeconds(59, 123)
  const criada = await criarMissao(request, 'Prazo original sem edicao', instante.toISOString())
  await page.goto('/')
  const cartao = cartaoDa(page, criada)
  await cartao.getByTestId('reschedule-toggle').click()
  await cartao
    .getByRole('group', { name: 'Por que reagendar?' })
    .getByLabel('Falta de tempo')
    .check()
  const respostaPendente = page.waitForResponse(
    (resposta) =>
      resposta.request().method() === 'POST' &&
      new URL(resposta.url()).pathname === `/api/missions/${String(criada.id)}/reschedule`,
  )
  await cartao.getByTestId('reschedule-submit').click()
  const resposta = await respostaPendente
  const relida = await lerMissao(request, criada.id)
  expect({
    status: resposta.status(),
    deadline: relida.deadline,
    reschedules: relida.reschedules,
  }).toEqual({
    status: 409,
    deadline: criada.deadline,
    reschedules: [],
  })
  expect(await resposta.json()).toMatchObject({ code: 'prazo_inalterado' })
  await expect(cartao.getByTestId('reschedule-error')).toHaveText(
    'O novo prazo é igual ao atual. Escolha outro horário.',
  )
  await expect(cartao.getByTestId('reschedule-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(cartao.getByTestId('reschedule-deadline')).toBeEnabled()
  expect(relida.state).toBe(criada.state)
})
