import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EvidenceForm } from './EvidenceForm'
import { COUNTER_VISIBLE_FROM } from './evidenceLimit'
import type { EvidenceDraft } from './types'

const VAZIO: EvidenceDraft = { text: '', link: '' }

/** O formulario controlado, como o cartao o usa: o rascunho mora fora dele. */
function Controlado({
  inicial = VAZIO,
  disabled = false,
  onChange,
}: {
  inicial?: EvidenceDraft
  disabled?: boolean
  onChange?: (draft: EvidenceDraft) => void
}) {
  const [draft, setDraft] = useState(inicial)
  return (
    <EvidenceForm
      draft={draft}
      disabled={disabled}
      onChange={(d) => {
        setDraft(d)
        onChange?.(d)
      }}
    />
  )
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }))
}

describe('EvidenceForm', () => {
  it('comeca recolhido: aria-expanded="false" e nenhum campo no documento', () => {
    render(<Controlado />)

    const botao = screen.getByRole('button', { name: 'Entregar com evidência (opcional)' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('O que você fez')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Link (opcional)')).not.toBeInTheDocument()
  })

  it('clicar abre: aria-expanded="true", o texto e o link rotulados', () => {
    render(<Controlado />)

    abrir()

    const botao = screen.getByRole('button', { name: 'Entregar com evidência (opcional)' })
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    const texto = screen.getByLabelText('O que você fez')
    expect(texto.tagName).toBe('TEXTAREA')
    const link = screen.getByLabelText('Link (opcional)')
    expect(link.tagName).toBe('INPUT')
    // O botao aponta para a area que ele abre.
    const controla = botao.getAttribute('aria-controls')
    expect(controla).not.toBeNull()
    expect(document.getElementById(controla as string)).toContainElement(texto)
  })

  it('clicar de novo recolhe', () => {
    render(<Controlado />)

    abrir()
    abrir()

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('O que você fez')).not.toBeInTheDocument()
  })

  it('um rascunho que ja tem conteudo comeca aberto (o cartao remontou)', () => {
    render(<Controlado inicial={{ text: 'Fiz a lista', link: '' }} />)

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('O que você fez')).toHaveValue('Fiz a lista')
  })

  it('um rascunho so com link tambem comeca aberto', () => {
    render(<Controlado inicial={{ text: '', link: 'https://x.dev' }} />)

    expect(screen.getByLabelText('Link (opcional)')).toHaveValue('https://x.dev')
  })

  it('digitar chama onChange com o rascunho inteiro', () => {
    const onChange = vi.fn()
    render(<Controlado onChange={onChange} />)
    abrir()

    fireEvent.change(screen.getByLabelText('O que você fez'), {
      target: { value: 'Resolvi os 10' },
    })
    fireEvent.change(screen.getByLabelText('Link (opcional)'), {
      target: { value: 'https://github.com/x' },
    })

    expect(onChange).toHaveBeenNthCalledWith(1, { text: 'Resolvi os 10', link: '' })
    expect(onChange).toHaveBeenNthCalledWith(2, {
      text: 'Resolvi os 10',
      link: 'https://github.com/x',
    })
  })

  it('longe do limite nao mostra contador; perto dele, mostra e liga ao campo', () => {
    render(<Controlado />)
    abrir()
    const texto = screen.getByLabelText('O que você fez')
    expect(screen.getByTestId('evidence-counter')).toBeEmptyDOMElement()
    expect(texto).not.toHaveAttribute('aria-describedby')

    fireEvent.change(texto, { target: { value: 'a'.repeat(COUNTER_VISIBLE_FROM) } })

    const contador = screen.getByTestId('evidence-counter')
    expect(contador).toHaveTextContent('Restam 400 caracteres.')
    expect(texto.getAttribute('aria-describedby')).toContain(contador.id)
  })

  it('link invalido mostra o erro com role="alert", ligado ao campo', () => {
    render(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } })

    const erro = screen.getByRole('alert')
    expect(erro).toHaveTextContent('O link precisa começar com http:// ou https://')
    expect(link).toHaveAttribute('aria-invalid', 'true')
    expect(link.getAttribute('aria-describedby')).toContain(erro.id)
  })

  it('link valido nao mostra erro nem marca o campo como invalido', () => {
    render(<Controlado inicial={{ text: 'x', link: 'HTTPS://x.dev' }} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Link (opcional)')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Link (opcional)')).not.toHaveAttribute('aria-describedby')
  })

  it('so com link, avisa que falta contar o que foi feito', () => {
    render(<Controlado inicial={{ text: '  ', link: 'https://x.dev' }} />)

    const aviso = screen.getByTestId('evidence-text-missing')
    expect(aviso).toHaveTextContent('Para entregar o link, conte também o que você fez.')
    // Ligado ao campo que falta preencher (fix-1, item 5).
    expect(screen.getByLabelText('O que você fez').getAttribute('aria-describedby')).toContain(
      aviso.id,
    )
  })

  it('o toggle mantem o nome exato e ganha a missao como descricao (describedBy)', () => {
    render(
      <>
        <h3 id="titulo-7">Ler o capitulo 3</h3>
        <EvidenceForm
          draft={VAZIO}
          onChange={() => undefined}
          disabled={false}
          describedBy="titulo-7"
        />
      </>,
    )

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).toHaveAccessibleDescription('Ler o capitulo 3')
  })

  it('sem describedBy, o toggle nao tem descricao', () => {
    render(<Controlado />)

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).not.toHaveAttribute('aria-describedby')
  })

  it('com texto, nao mostra o aviso de texto faltando', () => {
    render(<Controlado inicial={{ text: 'Fiz', link: 'https://x.dev' }} />)

    expect(screen.queryByTestId('evidence-text-missing')).not.toBeInTheDocument()
  })

  it('disabled desabilita os dois campos', () => {
    render(<Controlado inicial={{ text: 'Fiz', link: '' }} disabled />)

    expect(screen.getByLabelText('O que você fez')).toBeDisabled()
    expect(screen.getByLabelText('Link (opcional)')).toBeDisabled()
  })
})
