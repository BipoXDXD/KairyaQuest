import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, pendingUntilAborted, requestsTo, routeFetch } from '../../test/fetchRoutes'
import { renderWithI18n } from '../../test/i18n'
import { WeekPlanForm } from './WeekPlanForm'

const POST = 'POST /api/plans'

/** Uma quarta-feira em Sao Paulo: a semana atual comeca em 2026-09-21, a seguinte em 2026-09-28. */
const NOW = new Date('2026-09-23T15:00:00Z')

const PLANO_CRIADO = { week_start: '2026-09-21', days: [], special: {} }

function conflito(code: string): Response {
  return Response.json({ detail: 'x', code }, { status: 409 })
}

function setup(locale: 'pt-BR' | 'en' = 'pt-BR') {
  const onCreated = vi.fn()
  const onExists = vi.fn()
  const onCancel = vi.fn()
  renderWithI18n(<WeekPlanForm onCreated={onCreated} onExists={onExists} onCancel={onCancel} />, {
    locale,
  })
  return { onCreated, onExists, onCancel }
}

function change(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

/** Preenche instrucoes e criterio dos sete treinos e da prova; os padroes de dificuldade e minutos ficam. */
function fillEverything() {
  for (let day = 0; day < 7; day += 1) {
    change(`week-plan-day-${day}-instructions`, `Estudar tema ${day}`)
    change(`week-plan-day-${day}-criterion`, `Resumo ${day}`)
  }
  change('week-plan-trial-instructions', 'Prova simulada')
  change('week-plan-trial-criterion', 'Nota 7')
}

function submit() {
  fireEvent.click(screen.getByTestId('week-plan-submit'))
}

function status() {
  return screen.getByTestId('week-plan-status')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('WeekPlanForm: abertura', () => {
  it('abre na semana atual, com o foco no primeiro campo e a segunda aberta', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Plano da semana' })).toBeInTheDocument()
    expect(
      screen.getByText('Monte sete treinos e uma prova. Dá para começar pequeno.'),
    ).toBeVisible()
    expect(screen.getByTestId('week-plan-week-current')).toBeChecked()
    expect(screen.getByTestId('week-plan-week-next')).not.toBeChecked()
    expect(screen.getByTestId('week-plan-week-current')).toHaveFocus()
    expect(screen.getByTestId('week-plan-day-0')).toHaveAttribute('open')
    for (let day = 1; day < 7; day += 1) {
      expect(screen.getByTestId(`week-plan-day-${day}`)).not.toHaveAttribute('open')
    }
  })

  it('cada treino traz os padroes e o selo "Falta preencher"', () => {
    setup()
    for (let day = 0; day < 7; day += 1) {
      expect(screen.getByTestId(`week-plan-day-${day}-badge`)).toHaveTextContent('Falta preencher')
      expect(screen.getByTestId(`week-plan-day-${day}-difficulty`)).toHaveValue('2')
      expect(screen.getByTestId(`week-plan-day-${day}-minutes`)).toHaveValue(25)
    }
    expect(screen.getByTestId('week-plan-trial-minutes')).toHaveValue(25)
    expect(screen.queryByTestId('week-plan-trial-difficulty')).not.toBeInTheDocument()
  })

  it('o resumo de cada dia traz a data da semana escolhida', () => {
    setup()
    expect(screen.getByTestId('week-plan-day-0-summary')).toHaveTextContent('segunda-feira, 21/09')
    expect(screen.getByTestId('week-plan-day-6-summary')).toHaveTextContent('domingo, 27/09')
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    expect(screen.getByTestId('week-plan-week-next')).toBeChecked()
    expect(screen.getByTestId('week-plan-day-0-summary')).toHaveTextContent('segunda-feira, 28/09')
  })

  it('a semana atual de domingo 23:59 em Sao Paulo ainda e a que termina hoje', () => {
    vi.setSystemTime(new Date('2026-09-28T02:59:00Z'))
    setup()
    expect(screen.getByTestId('week-plan-day-0-summary')).toHaveTextContent('segunda-feira, 21/09')
  })

  it('a linha de status existe desde o inicio, vazia e fora da vista', () => {
    setup()
    expect(status()).toHaveAttribute('role', 'status')
    expect(status()).toHaveTextContent('')
    expect(status().parentElement).toHaveClass('sr-only')
  })

  it('em ingles, rotulos e datas no idioma', () => {
    setup('en')
    expect(screen.getByRole('heading', { name: 'Weekly plan' })).toBeInTheDocument()
    expect(screen.getByText('Which week?')).toBeInTheDocument()
    expect(screen.getByLabelText('This week')).toBeChecked()
    expect(screen.getByText('Daily drills')).toBeInTheDocument()
    expect(screen.getByText('Weekly trial')).toBeInTheDocument()
    expect(screen.getByTestId('week-plan-day-0-summary')).toHaveTextContent('Monday, 09/21')
    expect(screen.getByTestId('week-plan-day-0-badge')).toHaveTextContent('Not filled in')
    expect(within(screen.getByTestId('week-plan-day-0')).getByText('Done when')).toBeInTheDocument()
    expect(screen.getByTestId('week-plan-day-0-difficulty')).toHaveDisplayValue('2 of 5')
    expect(screen.getByTestId('week-plan-submit')).toHaveTextContent('Create plan')
  })

  it('abrir e fechar um dia pelo teclado fica no estado', () => {
    setup()
    const day = screen.getByTestId('week-plan-day-2')
    day.setAttribute('open', '')
    fireEvent(day, new Event('toggle'))
    expect(day).toHaveAttribute('open')
    day.removeAttribute('open')
    fireEvent(day, new Event('toggle'))
    expect(day).not.toHaveAttribute('open')
  })
})

describe('WeekPlanForm: validacao', () => {
  it('nao mostra erro antes de a pessoa sair do campo', () => {
    setup()
    const field = screen.getByTestId('week-plan-day-0-instructions')
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Preencha este campo.')).not.toBeInTheDocument()
  })

  it('o blur mostra o erro do campo, ligado por aria-describedby, e digitar o tira', () => {
    setup()
    const field = screen.getByTestId('week-plan-day-0-instructions')
    fireEvent.blur(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/Preencha este campo\./)
    expect(screen.queryAllByText('Preencha este campo.')).toHaveLength(1)
    change('week-plan-day-0-instructions', 'Ler o capitulo')
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Preencha este campo.')).not.toBeInTheDocument()
  })

  it('so o campo tocado mostra o erro', () => {
    setup()
    fireEvent.blur(screen.getByTestId('week-plan-day-3-criterion'))
    expect(screen.getByTestId('week-plan-day-3-criterion')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('week-plan-day-3-instructions')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('week-plan-trial-criterion')).not.toHaveAttribute('aria-invalid')
  })

  it.each([
    ['0', 'Use de 1 a 1440 minutos.'],
    ['1441', 'Use de 1 a 1440 minutos.'],
    ['', 'Preencha este campo.'],
  ])('minutos %j mostra "%s"', (value, message) => {
    setup()
    change('week-plan-day-1-minutes', value)
    fireEvent.blur(screen.getByTestId('week-plan-day-1-minutes'))
    expect(screen.getByTestId('week-plan-day-1-minutes')).toHaveAccessibleDescription(message)
  })

  it('minutos 1 e 1440 sao aceitos', () => {
    setup()
    for (const value of ['1', '1440']) {
      change('week-plan-trial-minutes', value)
      fireEvent.blur(screen.getByTestId('week-plan-trial-minutes'))
      expect(screen.getByTestId('week-plan-trial-minutes')).not.toHaveAttribute('aria-invalid')
    }
  })

  it('o contador aparece a partir de 450 caracteres e o texto acima de 500 e recusado', () => {
    setup()
    const field = screen.getByTestId('week-plan-day-0-instructions')
    expect(field).toHaveAttribute('maxlength', '500')
    expect(field).not.toHaveAccessibleDescription(/caracteres/)
    change('week-plan-day-0-instructions', 'a'.repeat(449))
    expect(field).not.toHaveAccessibleDescription(/caracteres/)
    change('week-plan-day-0-instructions', 'a'.repeat(450))
    expect(field).toHaveAccessibleDescription(/450 de 500 caracteres\./)
    change('week-plan-day-0-instructions', 'a'.repeat(501))
    fireEvent.blur(field)
    expect(field).toHaveAccessibleDescription(/Use até 500 caracteres\./)
  })

  it('o contador e o teto contam unidades UTF-16, como o maxLength', () => {
    setup()
    const field = screen.getByTestId('week-plan-day-0-instructions')
    change('week-plan-day-0-instructions', '😀'.repeat(225))
    expect(field).toHaveAccessibleDescription(/450 de 500 caracteres\./)
    change('week-plan-day-0-instructions', '😀'.repeat(251))
    fireEvent.blur(field)
    expect(field).toHaveAccessibleDescription(/Use até 500 caracteres\./)
  })

  it('o caractere NUL e recusado com texto proprio', () => {
    setup()
    change('week-plan-trial-instructions', 'a\u0000b')
    fireEvent.blur(screen.getByTestId('week-plan-trial-instructions'))
    expect(screen.getByTestId('week-plan-trial-instructions')).toHaveAccessibleDescription(
      /caractere que não pode ser salvo/,
    )
  })

  it('o selo vira "Pronto" quando o treino fica completo', () => {
    setup()
    change('week-plan-day-4-instructions', 'Ler')
    expect(screen.getByTestId('week-plan-day-4-badge')).toHaveTextContent('Falta preencher')
    change('week-plan-day-4-criterion', 'Resumo')
    expect(screen.getByTestId('week-plan-day-4-badge')).toHaveTextContent('Pronto')
    expect(screen.getByTestId('week-plan-day-4-badge')).toHaveAttribute('data-tone', 'success')
    expect(screen.getByTestId('week-plan-day-3-badge')).toHaveAttribute('data-tone', 'neutral')
  })
})

describe('WeekPlanForm: envio invalido', () => {
  it('nao chama a API, resume, destaca todos e foca o primeiro campo ruim', () => {
    const fetchMock = routeFetch({ [POST]: () => Response.json(PLANO_CRIADO, { status: 201 }) })
    setup()
    submit()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(status()).toHaveTextContent('Faltam 16 campos. O primeiro está destacado.')
    expect(status()).toHaveAttribute('data-tone', 'danger')
    expect(status().parentElement).not.toHaveClass('sr-only')
    expect(screen.getByTestId('week-plan-day-0-instructions')).toHaveFocus()
    expect(screen.getByTestId('week-plan-day-6-criterion')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('week-plan-trial-instructions')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('abre o treino do primeiro campo ruim e leva o foco a ele', () => {
    routeFetch({})
    setup()
    change('week-plan-day-0-instructions', 'Ler')
    change('week-plan-day-0-criterion', 'Resumo')
    change('week-plan-day-1-instructions', 'Ler')
    submit()
    const second = screen.getByTestId('week-plan-day-1')
    expect(second).toHaveAttribute('open')
    expect(screen.getByTestId('week-plan-day-1-criterion')).toHaveFocus()
  })

  it('um erro so na prova foca o campo dela, sem abrir treino nenhum', () => {
    routeFetch({})
    setup()
    for (let day = 0; day < 7; day += 1) {
      change(`week-plan-day-${day}-instructions`, 'x')
      change(`week-plan-day-${day}-criterion`, 'y')
    }
    change('week-plan-trial-instructions', 'x')
    change('week-plan-trial-criterion', 'y')
    change('week-plan-trial-minutes', '5000')
    submit()
    expect(screen.getByTestId('week-plan-trial-minutes')).toHaveFocus()
    expect(status()).toHaveTextContent('Falta 1 campo. Ele está destacado.')
    expect(screen.getByTestId('week-plan-day-3')).not.toHaveAttribute('open')
  })

  it('o resumo acompanha a correcao e o plural vem do idioma', () => {
    routeFetch({})
    setup('en')
    submit()
    expect(status()).toHaveTextContent('16 fields need attention. The first one is highlighted.')
    fillEverything()
    expect(status()).toHaveTextContent('')
    for (let day = 0; day < 7; day += 1) {
      change(`week-plan-day-${day}-minutes`, '')
    }
    change('week-plan-day-0-minutes', '25')
    expect(status()).toHaveTextContent('6 fields need attention. The first one is highlighted.')
  })

  it('um envio invalido apaga a falha anterior', async () => {
    routeFetch({ [POST]: () => new Response(null, { status: 503 }) })
    setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(status()).toHaveAttribute('data-tone', 'danger')
    })
    change('week-plan-day-0-instructions', '')
    submit()
    expect(status()).toHaveTextContent('Falta 1 campo. Ele está destacado.')
  })
})

describe('WeekPlanForm: copiar a segunda', () => {
  it('copia a segunda so para os dias intocados e avisa', () => {
    setup()
    change('week-plan-day-0-instructions', 'Resolver listas')
    change('week-plan-day-0-criterion', 'Cinco corrigidos')
    change('week-plan-day-0-minutes', '40')
    fireEvent.change(screen.getByTestId('week-plan-day-0-difficulty'), { target: { value: '4' } })
    change('week-plan-day-2-instructions', 'Meu texto do dia 2')
    fireEvent.click(screen.getByTestId('week-plan-copy-monday'))
    expect(screen.getByTestId('week-plan-day-1-instructions')).toHaveValue('Resolver listas')
    expect(screen.getByTestId('week-plan-day-1-criterion')).toHaveValue('Cinco corrigidos')
    expect(screen.getByTestId('week-plan-day-1-minutes')).toHaveValue(40)
    expect(screen.getByTestId('week-plan-day-1-difficulty')).toHaveValue('4')
    expect(screen.getByTestId('week-plan-day-6-instructions')).toHaveValue('Resolver listas')
    expect(screen.getByTestId('week-plan-day-2-instructions')).toHaveValue('Meu texto do dia 2')
    expect(screen.getByTestId('week-plan-day-2-criterion')).toHaveValue('')
    expect(screen.getByTestId('week-plan-day-1-badge')).toHaveTextContent('Pronto')
    expect(status()).toHaveTextContent('Segunda copiada para os dias vazios.')
    expect(status()).toHaveAttribute('data-tone', 'neutral')
  })

  it('o aviso de copia nao esconde o resumo de erros', () => {
    routeFetch({})
    setup()
    fireEvent.click(screen.getByTestId('week-plan-copy-monday'))
    submit()
    expect(status()).toHaveTextContent('Faltam 16 campos')
  })
})

describe('WeekPlanForm: envio', () => {
  it('manda exatamente o corpo do plano da semana atual e avisa o dono da tela', async () => {
    const fetchMock = routeFetch({ [POST]: () => Response.json(PLANO_CRIADO, { status: 201 }) })
    const { onCreated, onExists } = setup()
    fillEverything()
    change('week-plan-day-3-minutes', '90')
    fireEvent.change(screen.getByTestId('week-plan-day-3-difficulty'), { target: { value: '5' } })
    change('week-plan-trial-minutes', '120')
    change('week-plan-day-6-instructions', '  Revisao geral  ')
    submit()
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(onCreated).toHaveBeenCalledWith('current', '2026-09-21')
    expect(onExists).not.toHaveBeenCalled()
    const [request] = requestsTo(fetchMock, POST)
    const body = jsonBody(request) as {
      week_start: string
      days: Record<string, unknown>[]
      bonus: Record<string, unknown>
    }
    expect(Object.keys(body).sort()).toEqual(['bonus', 'days', 'week_start'])
    expect(body.week_start).toBe('2026-09-21')
    expect(body.days).toHaveLength(7)
    expect(body.days[0]).toEqual({
      instructions: 'Estudar tema 0',
      completion_criterion: 'Resumo 0',
      difficulty: 2,
      estimated_minutes: 25,
    })
    expect(body.days[3]).toEqual({
      instructions: 'Estudar tema 3',
      completion_criterion: 'Resumo 3',
      difficulty: 5,
      estimated_minutes: 90,
    })
    expect(body.days[6].instructions).toBe('Revisao geral')
    expect(body.bonus).toEqual({
      instructions: 'Prova simulada',
      completion_criterion: 'Nota 7',
      estimated_minutes: 120,
    })
    expect(status()).toHaveTextContent('Plano criado. Bom treino.')
    expect(status()).toHaveAttribute('data-tone', 'success')
  })

  it('a semana seguinte manda a segunda seguinte', async () => {
    const fetchMock = routeFetch({ [POST]: () => Response.json(PLANO_CRIADO, { status: 201 }) })
    const { onCreated } = setup()
    fillEverything()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    submit()
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })
    expect(onCreated).toHaveBeenCalledWith('next', '2026-09-28')
    expect((jsonBody(requestsTo(fetchMock, POST)[0]) as { week_start: string }).week_start).toBe(
      '2026-09-28',
    )
  })

  it('enquanto envia, o botao fica ocupado, a copia desligada e um segundo envio nao sai', async () => {
    const fetchMock = routeFetch({ [POST]: pendingUntilAborted })
    setup()
    fillEverything()
    submit()
    const button = screen.getByTestId('week-plan-submit')
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'true')
    })
    expect(button).toHaveTextContent('Criando o plano…')
    expect(screen.getByTestId('week-plan-copy-monday')).toBeDisabled()
    expect(screen.getByTestId('week-plan-cancel')).toBeEnabled()
    fireEvent.submit(screen.getByTestId('week-plan-form'))
    submit()
    expect(requestsTo(fetchMock, POST)).toHaveLength(1)
  })

  it('depois do 201 o botao continua ocupado: reenviar daria plano_existente', async () => {
    const fetchMock = routeFetch({ [POST]: () => Response.json(PLANO_CRIADO, { status: 201 }) })
    const { onCreated } = setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })
    expect(screen.getByTestId('week-plan-submit')).toHaveAttribute('aria-busy', 'true')
    submit()
    expect(requestsTo(fetchMock, POST)).toHaveLength(1)
  })

  it('cancelar avisa quem chama', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByTestId('week-plan-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('WeekPlanForm: falhas', () => {
  it('plano_existente na semana atual avisa para recarregar e mostra o texto', async () => {
    routeFetch({ [POST]: () => conflito('plano_existente') })
    const { onExists, onCreated } = setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(onExists).toHaveBeenCalledTimes(1)
    })
    expect(onCreated).not.toHaveBeenCalled()
    expect(status()).toHaveTextContent(
      'O plano não foi criado. Esta semana já tem um plano. Veja o plano abaixo.',
    )
    expect(status()).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByTestId('week-plan-submit')).not.toHaveAttribute('aria-busy')
  })

  it('plano_existente na semana seguinte nao manda ver um plano que nao aparece', async () => {
    routeFetch({ [POST]: () => conflito('plano_existente') })
    const { onExists } = setup()
    fillEverything()
    fireEvent.click(screen.getByTestId('week-plan-week-next'))
    submit()
    await waitFor(() => {
      expect(status()).toHaveTextContent(
        'O plano não foi criado. A próxima semana já tem um plano.',
      )
    })
    expect(onExists).not.toHaveBeenCalled()
  })

  it('semana_encerrada sugere a seguinte, marcando-a, e guarda tudo o que foi escrito', async () => {
    routeFetch({ [POST]: () => conflito('semana_encerrada') })
    setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(screen.getByTestId('week-plan-week-next')).toBeChecked()
    })
    expect(status()).toHaveTextContent(
      'O plano não foi criado. Esta semana já acabou. Escolha a próxima semana.',
    )
    expect(screen.getByTestId('week-plan-day-5-instructions')).toHaveValue('Estudar tema 5')
    expect(screen.getByTestId('week-plan-trial-criterion')).toHaveValue('Nota 7')
  })

  it('semana_distante so diz o que da para planejar', async () => {
    routeFetch({ [POST]: () => conflito('semana_distante') })
    setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(status()).toHaveTextContent('Só dá para planejar esta semana ou a próxima.')
    })
    expect(screen.getByTestId('week-plan-week-current')).toBeChecked()
  })

  it('422 sem code mostra o texto de dado fora do esperado', async () => {
    routeFetch({ [POST]: () => Response.json({ detail: [] }, { status: 422 }) })
    setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(status()).toHaveTextContent('Algum dado ficou fora do esperado.')
    })
  })

  it('5xx preserva os dados, habilita o botao e a nova tentativa funciona', async () => {
    const fetchMock = routeFetch({
      [POST]: (_init, call) =>
        call === 1
          ? new Response(null, { status: 503 })
          : Response.json(PLANO_CRIADO, { status: 201 }),
    })
    const { onCreated } = setup()
    fillEverything()
    change('week-plan-day-2-instructions', 'Texto que nao pode sumir')
    submit()
    await waitFor(() => {
      expect(status()).toHaveTextContent(
        'O plano não foi criado: o servidor não conseguiu atender o pedido. Seus dados continuam aqui. Tente de novo.',
      )
    })
    expect(screen.getByTestId('week-plan-day-2-instructions')).toHaveValue(
      'Texto que nao pode sumir',
    )
    expect(screen.getByTestId('week-plan-submit')).not.toHaveAttribute('aria-busy')
    expect(screen.getByTestId('week-plan-submit')).toHaveTextContent('Criar plano')
    expect(onCreated).not.toHaveBeenCalled()
    submit()
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(requestsTo(fetchMock, POST)).toHaveLength(2)
  })

  it('sem conexao: texto de rede, em ingles tambem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    setup('en')
    fillEverything()
    submit()
    await waitFor(() => {
      expect(status()).toHaveTextContent(
        'Plan not created: no connection. Your entries are still here. Try again.',
      )
    })
    expect(screen.getByTestId('week-plan-trial-instructions')).toHaveValue('Prova simulada')
  })
})

describe('WeekPlanForm: foco na falha', () => {
  const statusBox = () => status().parentElement

  it.each([
    ['5xx', () => new Response(null, { status: 503 })],
    ['422', () => Response.json({ detail: [] }, { status: 422 })],
    ['semana_distante', () => conflito('semana_distante')],
    ['semana_encerrada', () => conflito('semana_encerrada')],
    ['plano_existente na seguinte', () => conflito('plano_existente')],
  ])('%s leva o foco para a linha de status', async (name, route) => {
    routeFetch({ [POST]: route })
    setup()
    fillEverything()
    if (name === 'plano_existente na seguinte') {
      fireEvent.click(screen.getByTestId('week-plan-week-next'))
    }
    submit()
    await waitFor(() => {
      expect(status()).toHaveAttribute('data-tone', 'danger')
    })
    expect(statusBox()).toHaveAttribute('tabindex', '-1')
    expect(statusBox()).toHaveFocus()
  })

  it('sem conexao tambem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    setup()
    fillEverything()
    submit()
    await waitFor(() => {
      expect(statusBox()).toHaveFocus()
    })
  })

  it('o envio invalido continua levando o foco ao campo, nao ao status', () => {
    routeFetch({})
    setup()
    submit()
    expect(screen.getByTestId('week-plan-day-0-instructions')).toHaveFocus()
  })
})
