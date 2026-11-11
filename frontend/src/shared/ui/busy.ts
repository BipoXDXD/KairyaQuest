import type { MouseEvent, MouseEventHandler } from 'react'

/**
 * Os atributos de um botão em `loading`, comuns ao `Button` e ao `IconButton`.
 *
 * O botão continua habilitado (sem `disabled`), para o foco não se perder no
 * meio da ação; quem diz que ele está ocupado é o `aria-busy` com o
 * `aria-disabled`. O clique é engolido com `preventDefault`, o que também barra
 * o submit nativo de um `type="submit"`.
 */
export function busyProps(
  loading: boolean,
  onClick: MouseEventHandler<HTMLButtonElement> | undefined,
): {
  'aria-busy'?: true
  'aria-disabled'?: true
  onClick: MouseEventHandler<HTMLButtonElement> | undefined
} {
  if (!loading) {
    return { onClick }
  }
  return {
    'aria-busy': true,
    'aria-disabled': true,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    },
  }
}
