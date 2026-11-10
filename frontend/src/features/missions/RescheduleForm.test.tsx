import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isoToSaoPauloCivil } from '../../shared/lib/deadline'
import type { Mission } from '../../shared/types/mission'
import { renderWithI18n } from '../../test/i18n'
import type { RescheduleFailure } from './rescheduleFailure'
import { RescheduleForm } from './RescheduleForm'

const missao: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  mission_type: 'avulsa',
  day: null,
  deadline: '2026-10-02T21:00:00Z',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 100,
  actual_duration_minutes: null,
  verification: null,
  evidence: null,
  evaluation: null,
  reschedules: [],
}

const falhaEdit: RescheduleFailure = {
  message: 'missions.rescheduleFailure.deadlinePassed.message',
  recovery: 'missions.rescheduleFailure.deadlinePassed.recovery',
  action: 'edit',
}
const falhaRetry: RescheduleFailure = {
  message: 'missions.rescheduleFailure.unconfirmed.message',
  recovery: 'missions.rescheduleFailure.unconfirmed.recovery',
  action: 'retry',
}
const falhaNovaChave: RescheduleFailure = {
  message: 'missions.failure.reusedOperation',
  recovery: 'missions.failure.tryAgain',
  action: 'retry-with-new-operation',
}

type Props = Parameters<typeof RescheduleForm>[0]

function renderForm(props: Partial<Props> = {}) {
  const onSubmit = vi.fn()
  const all: Props = { mission: missao, disabled: false, failure: null, onSubmit, ...props }
  const view = renderWithI18n(<RescheduleForm {...all} />)
  const rerender = (next: Partial<Props>) => {
    view.rerender(<RescheduleForm {...all} {...next} />)
  }
  return { onSubmit, rerender }
}

const toggle = () => screen.getByRole('button', { name: 'Reagendar prazo' })
const campo = () => screen.getByLabelText('Novo prazo (horário de Brasília)')
const salvar = () => screen.getByTestId('reschedule-submit')

function abrir() {
  fireEvent.click(toggle())
}

describe('RescheduleForm', () => {
  it('comeca recolhido: o disclosure diz aria-expanded=false e os campos nao estao no documento', () => {
    renderForm()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Novo prazo (horário de Brasília)')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reschedule-submit')).not.toBeInTheDocument()
  })

  it('aberto, o campo vem com o prazo atual na hora civil de Sao Paulo, e o disclosure controla a regiao', () => {
    renderForm({ describedBy: 'titulo-7' })
    abrir()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAttribute('aria-describedby', 'titulo-7')
    const regiao = document.getElementById(toggle().getAttribute('aria-controls') ?? '')
    expect(regiao).not.toBeNull()
    expect(regiao).toContainElement(campo())
    expect(campo()).toHaveAttribute('type', 'datetime-local')
    // 21:00Z e 18:00 em SP; o processo de teste esta em Asia/Tokyo.
    expect(campo()).toHaveValue(isoToSaoPauloCivil(missao.deadline))
    expect(campo()).toHaveValue('2026-10-02T18:00')
  })

  it('o grupo "Por que reagendar?" tem os tres motivos, nenhum marcado', () => {
    renderForm()
    abrir()
    const grupo = screen.getByRole('group', { name: 'Por que reagendar?' })
    expect(grupo.tagName).toBe('FIELDSET')
    const radios = within(grupo).getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'dificuldade',
      'falta_de_tempo',
      'mudanca_de_prioridade',
    ])
    for (const radio of radios) {
      expect(radio).not.toBeChecked()
    }
    expect(within(grupo).getByLabelText('Dificuldade')).toBeInTheDocument()
    expect(within(grupo).getByLabelText('Falta de tempo')).toBeInTheDocument()
    expect(within(grupo).getByLabelText('Mudança de prioridade')).toBeInTheDocument()
  })

  it('sem motivo, "Salvar novo prazo" fica desabilitado, com o porque em texto ligado ao botao', () => {
    renderForm()
    abrir()
    expect(salvar()).toHaveTextContent('Salvar novo prazo')
    expect(salvar()).toBeDisabled()
    const motivo = screen.getByTestId('reschedule-blocked')
    expect(motivo).toHaveTextContent('Escolha o motivo para salvar o novo prazo.')
    expect(salvar()).toHaveAttribute('aria-describedby', motivo.id)
  })

  it('sem data, fica desabilitado e diz que falta o prazo', () => {
    renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.change(campo(), { target: { value: '' } })
    expect(salvar()).toBeDisabled()
    expect(screen.getByTestId('reschedule-blocked')).toHaveTextContent(
      'Informe a data e a hora do novo prazo.',
    )
  })

  it('uma hora que nao existe em Sao Paulo (inicio do horario de verao) fica desabilitada', () => {
    renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Dificuldade'))
    fireEvent.change(campo(), { target: { value: '2018-11-04T00:30' } })
    expect(campo()).toHaveValue('2018-11-04T00:30')
    expect(salvar()).toBeDisabled()
    expect(screen.getByTestId('reschedule-blocked')).toHaveTextContent(
      'Esse horário não existe no horário de Brasília. Escolha outro.',
    )
  })

  it('com prazo e motivo, salva o rascunho: a hora civil e o motivo escolhido', () => {
    const { onSubmit } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-10-05T18:00' } })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    expect(screen.queryByTestId('reschedule-blocked')).not.toBeInTheDocument()
    expect(salvar()).toBeEnabled()
    expect(salvar()).not.toHaveAttribute('aria-describedby')

    fireEvent.click(salvar())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      civil: '2026-10-05T18:00',
      reason: 'falta_de_tempo',
      originalDeadline: '2026-10-02T21:00:00Z',
    })
  })

  it('disabled trava campos, motivos e o botao (um envio em voo)', () => {
    const { rerender } = renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    rerender({ disabled: true })
    expect(campo()).toBeDisabled()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled()
    }
    expect(salvar()).toBeDisabled()
  })

  it('falha "edit": a mensagem com role=alert, e o formulario fica aberto com o que foi digitado', () => {
    const { rerender, onSubmit } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-09-01T08:00' } })
    fireEvent.click(screen.getByLabelText('Dificuldade'))
    fireEvent.click(salvar())
    rerender({ disabled: true })

    rerender({ disabled: false, failure: falhaEdit })

    const erro = screen.getByTestId('reschedule-error')
    expect(erro).toHaveAttribute('role', 'alert')
    expect(erro).toHaveTextContent('O novo prazo precisa estar no futuro.')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(campo()).toHaveValue('2026-09-01T08:00')
    expect(screen.getByLabelText('Dificuldade')).toBeChecked()
    // Corrigir: os campos continuam editaveis, e o botao volta a ser o de salvar.
    expect(campo()).toBeEnabled()
    expect(salvar()).toHaveTextContent('Salvar novo prazo')
    fireEvent.change(campo(), { target: { value: '2026-10-09T08:00' } })
    fireEvent.click(salvar())
    expect(onSubmit).toHaveBeenLastCalledWith({
      civil: '2026-10-09T08:00',
      reason: 'dificuldade',
      originalDeadline: '2026-10-02T21:00:00Z',
    })
  })

  it('falha "retry": o aviso ligado ao botao, e "Tentar de novo" sem mudar nada reenvia o MESMO rascunho (F13)', () => {
    const { rerender, onSubmit } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-10-05T18:00' } })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())

    rerender({ failure: falhaRetry })

    expect(screen.getByTestId('reschedule-error')).toHaveTextContent(
      'Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes.',
    )
    const aviso = screen.getByTestId('reschedule-retry-notice')
    expect(aviso).toHaveTextContent(
      'O pedido anterior pode ter chegado. Sem mudar nada, “Tentar de novo” o reenvia com segurança.',
    )
    // Os campos continuam editaveis: mudar e uma decisao da pessoa, e quem
    // troca a chave nesse caso e o cartao.
    expect(campo()).toBeEnabled()
    expect(salvar()).toBeEnabled()
    expect(salvar()).toHaveTextContent('Tentar de novo')
    expect(salvar().getAttribute('aria-describedby')?.split(' ')).toContain(aviso.id)

    fireEvent.click(salvar())

    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(onSubmit.mock.calls[1]).toEqual(onSubmit.mock.calls[0])
  })

  it('falha "retry" e a pessoa muda o rascunho: o botao volta a "Salvar novo prazo" e o aviso sai', () => {
    const { rerender, onSubmit } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-10-05T18:00' } })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())
    rerender({ failure: falhaRetry })

    fireEvent.click(screen.getByLabelText('Dificuldade'))

    expect(salvar()).toHaveTextContent('Salvar novo prazo')
    expect(screen.queryByTestId('reschedule-retry-notice')).not.toBeInTheDocument()
    fireEvent.click(salvar())
    expect(onSubmit).toHaveBeenLastCalledWith({
      civil: '2026-10-05T18:00',
      reason: 'dificuldade',
      originalDeadline: '2026-10-02T21:00:00Z',
    })

    // O que conta e o ULTIMO envio: voltar ao motivo do primeiro ja e outro pedido.
    rerender({ failure: falhaRetry })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    expect(salvar()).toHaveTextContent('Salvar novo prazo')
  })

  it('falha "retry" e a pessoa muda SO a data: o botao volta a "Salvar novo prazo"', () => {
    const { rerender, onSubmit } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-10-05T18:00' } })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())
    rerender({ failure: falhaRetry })
    expect(salvar()).toHaveTextContent('Tentar de novo')

    fireEvent.change(campo(), { target: { value: '2026-10-06T18:00' } })

    expect(salvar()).toHaveTextContent('Salvar novo prazo')
    expect(screen.queryByTestId('reschedule-retry-notice')).not.toBeInTheDocument()
    fireEvent.click(salvar())
    expect(onSubmit).toHaveBeenLastCalledWith({
      originalDeadline: '2026-10-02T21:00:00Z',
      civil: '2026-10-06T18:00',
      reason: 'falta_de_tempo',
    })
  })

  it('falha "retry-with-new-operation": "Tentar de novo", mas os campos continuam editaveis', () => {
    const { rerender } = renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())

    rerender({ failure: falhaNovaChave })

    expect(salvar()).toHaveTextContent('Tentar de novo')
    expect(campo()).toBeEnabled()
    expect(screen.queryByTestId('reschedule-retry-notice')).not.toBeInTheDocument()
  })

  it('o sucesso (o prazo da missao mudou) fecha o disclosure e devolve o foco ao botao dele', () => {
    const { rerender } = renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-10-05T18:00' } })
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    salvar().focus()
    fireEvent.click(salvar())
    rerender({ disabled: true })

    rerender({ disabled: false, mission: { ...missao, deadline: '2026-10-05T21:00:00Z' } })

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('reschedule-submit')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(toggle())
  })

  it('o sucesso nao rouba o foco de quem ja foi para outro lugar', () => {
    const outro = document.createElement('button')
    document.body.appendChild(outro)
    const { rerender } = renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())
    outro.focus()

    rerender({ mission: { ...missao, deadline: '2026-10-05T21:00:00Z' } })

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(outro)
    outro.remove()
  })

  it('reaberto depois do sucesso, o campo traz o prazo NOVO e nenhum motivo marcado', () => {
    const { rerender } = renderForm()
    abrir()
    fireEvent.click(screen.getByLabelText('Falta de tempo'))
    fireEvent.click(salvar())
    rerender({ mission: { ...missao, deadline: '2026-10-05T21:00:00Z' } })

    abrir()

    expect(campo()).toHaveValue('2026-10-05T18:00')
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
  })

  it('fechar pelo botao recolhe; reabrir recomeca do prazo atual', () => {
    renderForm()
    abrir()
    fireEvent.change(campo(), { target: { value: '2026-12-01T09:00' } })
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Novo prazo (horário de Brasília)')).not.toBeInTheDocument()

    abrir()

    expect(campo()).toHaveValue('2026-10-02T18:00')
  })
})

describe('RescheduleForm: a janela do prazo (pendencia 26)', () => {
  // So o `Date` e falso: os timers do React seguem reais. 15:00Z e 12:00 em SP.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function escolher(civil: string) {
    abrir()
    fireEvent.change(campo(), { target: { value: civil } })
    fireEvent.click(screen.getByTestId('reschedule-reason-dificuldade'))
  }

  it('o campo vai de agora a agora+365 dias, na hora civil de Sao Paulo', () => {
    renderForm()
    abrir()
    expect(campo()).toHaveAttribute('min', '2026-11-10T12:00')
    expect(campo()).toHaveAttribute('max', '2027-11-10T12:00')
  })

  it('o ultimo minuto da janela (agora+365 dias) sai', () => {
    const { onSubmit } = renderForm()
    escolher('2027-11-10T12:00')
    expect(salvar()).toBeEnabled()
    expect(screen.queryByTestId('reschedule-blocked')).not.toBeInTheDocument()
    fireEvent.click(salvar())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ civil: '2027-11-10T12:00', reason: 'dificuldade' }),
    )
  })

  it('um minuto depois da janela fica desabilitado, com o porque em texto', () => {
    const { onSubmit } = renderForm()
    escolher('2027-11-10T12:01')
    expect(salvar()).toBeDisabled()
    expect(screen.getByTestId('reschedule-blocked')).toHaveTextContent(
      'O novo prazo pode ser no máximo 365 dias a partir de agora.',
    )
    fireEvent.click(salvar())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a janela parte de quando o disclosure abriu: reabrir um dia depois a desloca', () => {
    renderForm()
    abrir()
    fireEvent.click(toggle())
    vi.setSystemTime(new Date('2026-11-11T15:00:00Z'))
    abrir()
    expect(campo()).toHaveAttribute('min', '2026-11-11T12:00')
    expect(campo()).toHaveAttribute('max', '2027-11-11T12:00')
  })
})
