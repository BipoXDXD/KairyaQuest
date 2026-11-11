import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderWithI18n } from '../../test/i18n'
import { ConfirmDialog } from './ConfirmDialog'

const base = {
  title: 'Apagar missão?',
  body: 'Isso não pode ser desfeito.',
  confirmLabel: 'Apagar',
}

test('fechado não renderiza o diálogo aberto', () => {
  renderWithI18n(<ConfirmDialog open={false} {...base} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('aberto: dialog modal com título como nome, corpo como descrição e foco em Cancelar', () => {
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  const d = screen.getByRole('dialog', { name: 'Apagar missão?' })
  expect(d).toHaveAttribute('open')
  expect(d).toHaveAccessibleDescription('Isso não pode ser desfeito.')
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
})

test('o botão de confirmação é o danger-confirm com o rótulo dado', () => {
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Apagar' })).toHaveAttribute(
    'data-variant',
    'danger-confirm',
  )
})

test('Esc chama onCancel e nunca onConfirm', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={onCancel} />)
  const d = screen.getByRole('dialog')
  const esc = new Event('cancel', { cancelable: true })
  fireEvent(d, esc)
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
  // O fechamento é do pai (prop `open`): o diálogo não se fecha sozinho.
  expect(esc.defaultPrevented).toBe(true)
})

test('fechado pelo navegador apesar do preventDefault, avisa o pai por onCancel', () => {
  const onCancel = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={onCancel} />)
  const d = screen.getByRole<HTMLDialogElement>('dialog')
  act(() => {
    d.close()
  })
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('um close que chega com o diálogo já reaberto não é cancelamento', () => {
  const onCancel = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={onCancel} />)
  fireEvent(screen.getByRole('dialog'), new Event('close'))
  expect(onCancel).not.toHaveBeenCalled()
})

test('Esc com cancel não cancelável seguido de close chama onCancel uma vez só', () => {
  const onCancel = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={onCancel} />)
  const d = screen.getByRole<HTMLDialogElement>('dialog')
  // O que o Chrome faz no Esc sem ativação do usuário: cancel não cancelável, depois close.
  fireEvent(d, new Event('cancel', { cancelable: false }))
  act(() => {
    d.close()
  })
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('Cancelar durante o confirmando chama onCancel; a decisão de fechar é do pai', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn(() => new Promise<void>(() => undefined))
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
  expect(screen.getByRole('button', { name: 'Apagar' })).toHaveAttribute('aria-busy', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
})

test('Cancelar chama onCancel', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
})

test('confirmar com onConfirm síncrono chama uma vez', async () => {
  const onConfirm = vi.fn()
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={vi.fn()} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
  })
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Apagar' })).not.toHaveAttribute('aria-busy')
})

test('cliques repetidos em confirmar com promessa pendente → onConfirm uma vez, botão em loading', async () => {
  let resolve: (() => void) | undefined
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r
      }),
  )
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={vi.fn()} />)
  const ok = screen.getByRole('button', { name: 'Apagar' })
  // Três cliques no mesmo act: o React só re-renderiza ao fim dele, então o
  // segundo e o terceiro chegam com o botão ainda fora de loading. Quem os barra
  // é a guarda da ref, não o estado (o fireEvent solto re-renderizaria entre um
  // clique e outro e esconderia a ausência da guarda).
  act(() => {
    ok.click()
    ok.click()
    ok.click()
  })
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(ok).toHaveAttribute('aria-busy', 'true')
  await act(async () => {
    resolve?.()
  })
  expect(ok).not.toHaveAttribute('aria-busy')
})

test('onConfirm que rejeita sai do loading e permite tentar de novo', async () => {
  const onConfirm = vi.fn(() => Promise.reject(new Error('falhou')))
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={vi.fn()} />)
  const ok = screen.getByRole('button', { name: 'Apagar' })
  await act(async () => {
    fireEvent.click(ok)
  })
  expect(ok).not.toHaveAttribute('aria-busy')
  await act(async () => {
    fireEvent.click(ok)
  })
  expect(onConfirm).toHaveBeenCalledTimes(2)
})

test('ao fechar, o foco volta para quem estava focado antes de abrir', () => {
  const props = { ...base, onConfirm: vi.fn(), onCancel: vi.fn() }
  const { rerender } = renderWithI18n(
    <>
      <button type="button">Abrir</button>
      <ConfirmDialog open={false} {...props} />
    </>,
  )
  const opener = screen.getByRole('button', { name: 'Abrir' })
  opener.focus()
  rerender(
    <>
      <button type="button">Abrir</button>
      <ConfirmDialog open {...props} />
    </>,
  )
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  rerender(
    <>
      <button type="button">Abrir</button>
      <ConfirmDialog open={false} {...props} />
    </>,
  )
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
  // Fechar pela prop é decisão do pai: não volta para ele como cancelamento.
  expect(props.onCancel).not.toHaveBeenCalled()
})

test('sem elemento focado antes de abrir, fechar não tenta devolver o foco', () => {
  vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
  const props = { ...base, onConfirm: vi.fn(), onCancel: vi.fn() }
  const { rerender } = renderWithI18n(<ConfirmDialog open {...props} />)
  vi.restoreAllMocks()
  expect(() => rerender(<ConfirmDialog open={false} {...props} />)).not.toThrow()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('o rótulo Cancelar vem do catálogo em en', () => {
  renderWithI18n(<ConfirmDialog open {...base} onConfirm={vi.fn()} onCancel={vi.fn()} />, {
    locale: 'en',
  })
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
})
