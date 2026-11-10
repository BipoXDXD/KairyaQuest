import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'
import { useT } from '../i18n/useT'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  /**
   * A ação confirmada. Enquanto a promessa estiver pendente, o botão fica em
   * `loading` e novos cliques são ignorados. **Uma rejeição é engolida**: o
   * diálogo só sai do "confirmando". Tratar e relatar o erro é dever de quem
   * passa o `onConfirm`.
   */
  onConfirm: () => void | Promise<void>
  /** Esc, Cancelar ou fechamento pelo navegador; chamado uma vez por gesto. */
  onCancel: () => void
}

/**
 * Pede confirmação de uma ação destrutiva num `<dialog>` modal nativo.
 *
 * Quem abre e fecha é o pai, pela prop `open`; Esc e Cancelar só avisam por
 * `onCancel`. Fechado, nada é montado: cada abertura nasce sem estado de
 * "confirmando" e guarda de novo quem tinha o foco.
 *
 * Cancelar continua disponível durante o "confirmando": o pai decide se fecha
 * com a ação em voo (o diálogo não a interrompe nem a desfaz).
 */
export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  return open ? <OpenConfirmDialog {...props} /> : null
}

function OpenConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open'>) {
  const t = useT()
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  // O estado só muda no próximo render; cliques síncronos antes dele passariam
  // pela guarda de estado. A ref barra o segundo clique na hora.
  const inFlight = useRef(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const previous = document.activeElement
    const dialog = dialogRef.current
    dialog?.showModal()
    // Foco no botão menos destrutivo, o primeiro do diálogo (Cancelar).
    dialog?.querySelector('button')?.focus()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [])

  // Um `cancel` não cancelável (o Chrome o dispara assim no Esc sem ativação
  // do usuário) vem seguido de `close`, e quem avisa o pai é o `close`: avisar
  // nos dois chamaria `onCancel` duas vezes pelo mesmo Esc.
  function handleCancelEvent(event: SyntheticEvent<HTMLDialogElement>) {
    if (!event.cancelable) {
      return
    }
    event.preventDefault()
    onCancel()
  }

  // O navegador pode fechar o diálogo apesar do `preventDefault` no `cancel`
  // (o Chrome ignora o cancelamento do Esc sem ativação do usuário). Fechado
  // por fora, o pai precisa saber, senão `open` fica verdadeiro com o diálogo
  // fechado. O `close` chega numa tarefa depois do `close()`: se o diálogo já
  // foi reaberto (o efeito do StrictMode fecha e reabre), não é cancelamento.
  function handleCloseEvent(event: SyntheticEvent<HTMLDialogElement>) {
    if (!event.currentTarget.open) {
      onCancel()
    }
  }

  async function handleConfirm() {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setConfirming(true)
    try {
      await onConfirm()
    } catch {
      // Quem conhece a falha e sabe contá-la ao usuário é o dono do
      // `onConfirm`, que trata o próprio erro. Aqui só importa sair do
      // "confirmando" para a pessoa poder tentar de novo ou cancelar.
    } finally {
      inFlight.current = false
      setConfirming(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={handleCancelEvent}
      onClose={handleCloseEvent}
      className="m-auto max-w-md rounded-ui border border-border-strong bg-bg-raised p-6 text-text-primary backdrop:bg-bg-canvas/80"
    >
      <h2 id={titleId} className="text-xl">
        {title}
      </h2>
      <p id={bodyId} className="mt-3 text-text-muted">
        {body}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button onClick={onCancel}>{t('ui.dialog.cancel')}</Button>
        <Button
          variant="danger-confirm"
          loading={confirming}
          onClick={() => {
            void handleConfirm()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
