import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { en } from '../../shared/i18n/messages/en'
import { renderWithI18n } from '../../test/i18n'
import { EvidenceForm } from './EvidenceForm'
import { COUNTER_VISIBLE_FROM, MAX_EVIDENCE_LENGTH, MAX_LINK_LENGTH } from './evidenceLimit'
import type { EvidenceDraft } from './types'

const VAZIO: EvidenceDraft = { text: '', link: '' }

/** O formulario controlado, como o cartao o usa: o rascunho mora fora dele. */
function Controlado({
  inicial = VAZIO,
  disabled = false,
  retryPending = false,
  onChange,
}: {
  inicial?: EvidenceDraft
  disabled?: boolean
  retryPending?: boolean
  onChange?: (draft: EvidenceDraft) => void
}) {
  const [draft, setDraft] = useState(inicial)
  return (
    <EvidenceForm
      draft={draft}
      disabled={disabled}
      retryPending={retryPending}
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
    renderWithI18n(<Controlado />)

    const botao = screen.getByRole('button', { name: 'Entregar com evidência (opcional)' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('O que você fez')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Link (opcional)')).not.toBeInTheDocument()
  })

  it('clicar abre: aria-expanded="true", o texto e o link rotulados', () => {
    renderWithI18n(<Controlado />)

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
    renderWithI18n(<Controlado />)

    abrir()
    abrir()

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('O que você fez')).not.toBeInTheDocument()
  })

  it('um rascunho que ja tem conteudo comeca aberto (o cartao remontou)', () => {
    renderWithI18n(<Controlado inicial={{ text: 'Fiz a lista', link: '' }} />)

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('O que você fez')).toHaveValue('Fiz a lista')
  })

  it('um rascunho so com link tambem comeca aberto', () => {
    renderWithI18n(<Controlado inicial={{ text: '', link: 'https://x.dev' }} />)

    expect(screen.getByLabelText('Link (opcional)')).toHaveValue('https://x.dev')
  })

  it('digitar chama onChange com o rascunho inteiro', () => {
    const onChange = vi.fn()
    renderWithI18n(<Controlado onChange={onChange} />)
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
    renderWithI18n(<Controlado />)
    abrir()
    const texto = screen.getByLabelText('O que você fez')
    expect(screen.getByTestId('evidence-counter')).toBeEmptyDOMElement()
    expect(texto).not.toHaveAttribute('aria-describedby')

    fireEvent.change(texto, { target: { value: 'a'.repeat(COUNTER_VISIBLE_FROM) } })

    const contador = screen.getByTestId('evidence-counter')
    expect(contador).toHaveTextContent('Restam 400 caracteres.')
    expect(texto.getAttribute('aria-describedby')).toContain(contador.id)
  })

  it('digitando um link invalido, o erro NAO aparece nem e anunciado', () => {
    renderWithI18n(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')

    fireEvent.change(link, { target: { value: 'h' } })
    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId('evidence-link-error')).not.toBeInTheDocument()
    expect(link).not.toHaveAttribute('aria-invalid')
    expect(link).not.toHaveAttribute('aria-describedby')
  })

  it('depois do primeiro blur, editar para valido apaga o erro e a proxima digitacao invalida nao o anuncia de novo', () => {
    renderWithI18n(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')
    fireEvent.change(link, { target: { value: 'x' } })
    fireEvent.blur(link)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(link, { target: { value: 'https://x.dev' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Apagar um caractere quebra o link: sem novo blur, nada e anunciado.
    fireEvent.change(link, { target: { value: 'https:/' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.blur(link)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Link vazio tambem e valido: reseta.
    fireEvent.change(link, { target: { value: '' } })
    fireEvent.change(link, { target: { value: 'h' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sair do campo (blur) com link valido nao mostra erro', () => {
    renderWithI18n(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')

    fireEvent.change(link, { target: { value: 'https://x.dev' } })
    fireEvent.blur(link)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('link invalido mostra o erro com role="alert" ao SAIR do campo, ligado a ele', () => {
    renderWithI18n(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } })
    fireEvent.blur(link)

    const erro = screen.getByRole('alert')
    expect(erro).toHaveTextContent('O link precisa começar com http:// ou https://')
    expect(link).toHaveAttribute('aria-invalid', 'true')
    expect(link.getAttribute('aria-describedby')).toContain(erro.id)
  })

  it('link valido nao mostra erro nem marca o campo como invalido', () => {
    renderWithI18n(<Controlado inicial={{ text: 'x', link: 'HTTPS://x.dev' }} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Link (opcional)')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Link (opcional)')).not.toHaveAttribute('aria-describedby')
  })

  it('so com link, avisa que falta contar o que foi feito', () => {
    renderWithI18n(<Controlado inicial={{ text: '  ', link: 'https://x.dev' }} />)

    const aviso = screen.getByTestId('evidence-text-missing')
    expect(aviso).toHaveTextContent('Para entregar o link, conte também o que você fez.')
    // Ligado ao campo que falta preencher.
    expect(screen.getByLabelText('O que você fez').getAttribute('aria-describedby')).toContain(
      aviso.id,
    )
  })

  it('o toggle mantem o nome exato e ganha a missao como descricao (describedBy)', () => {
    renderWithI18n(
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
    renderWithI18n(<Controlado />)

    expect(
      screen.getByRole('button', { name: 'Entregar com evidência (opcional)' }),
    ).not.toHaveAttribute('aria-describedby')
  })

  it('com texto, nao mostra o aviso de texto faltando', () => {
    renderWithI18n(<Controlado inicial={{ text: 'Fiz', link: 'https://x.dev' }} />)

    expect(screen.queryByTestId('evidence-text-missing')).not.toBeInTheDocument()
  })

  it('disabled desabilita os dois campos', () => {
    renderWithI18n(<Controlado inicial={{ text: 'Fiz', link: '' }} disabled />)

    expect(screen.getByLabelText('O que você fez')).toBeDisabled()
    expect(screen.getByLabelText('Link (opcional)')).toBeDisabled()
  })

  it('com retry pendente, os campos ficam SOMENTE LEITURA (focaveis) e o aviso os descreve', () => {
    renderWithI18n(<Controlado inicial={{ text: 'Feito', link: '' }} retryPending />)

    const aviso = screen.getByTestId('evidence-retry-notice')
    expect(aviso).toHaveTextContent(
      'A entrega anterior pode ter chegado. Tente de novo antes de editar a evidência.',
    )
    const texto = screen.getByLabelText('O que você fez')
    const link = screen.getByLabelText('Link (opcional)')
    for (const campo of [texto, link]) {
      expect(campo).toBeEnabled()
      expect(campo).toHaveAttribute('readonly')
      expect(campo).toHaveAttribute('aria-readonly', 'true')
      campo.focus()
      expect(document.activeElement).toBe(campo)
    }
    expect(texto.getAttribute('aria-describedby')?.split(' ')).toContain(aviso.id)
    expect(link.getAttribute('aria-describedby')?.split(' ')).toContain(aviso.id)
  })

  it('sem retry pendente, nao ha aviso e os campos editam', () => {
    renderWithI18n(<Controlado inicial={{ text: 'Feito', link: '' }} />)

    expect(screen.queryByTestId('evidence-retry-notice')).not.toBeInTheDocument()
    expect(screen.getByLabelText('O que você fez')).toBeEnabled()
    expect(screen.getByLabelText('O que você fez')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('O que você fez')).not.toHaveAttribute('aria-readonly')
    expect(screen.getByLabelText('O que você fez')).not.toHaveAttribute('aria-describedby')
  })

  it.each([
    ['resta 1', MAX_EVIDENCE_LENGTH - 1, 'Resta 1 caractere.'],
    ['restam N', COUNTER_VISIBLE_FROM + 1, 'Restam 399 caracteres.'],
    ['restam 0', MAX_EVIDENCE_LENGTH, 'Restam 0 caracteres.'],
    ['passou 1', MAX_EVIDENCE_LENGTH + 1, 'Passou 1 caractere do limite de 4000.'],
    ['passou N', MAX_EVIDENCE_LENGTH + 3, 'Passou 3 caracteres do limite de 4000.'],
  ])('o contador em pt-BR: %s', (_nome, tamanho, esperado) => {
    renderWithI18n(<Controlado inicial={{ text: 'a'.repeat(tamanho), link: '' }} />)

    expect(screen.getByTestId('evidence-counter')).toHaveTextContent(esperado)
  })

  it('link acima do limite mostra o erro de tamanho ao sair do campo', () => {
    renderWithI18n(<Controlado />)
    abrir()
    const link = screen.getByLabelText('Link (opcional)')

    fireEvent.change(link, { target: { value: `https://x.dev/${'a'.repeat(MAX_LINK_LENGTH)}` } })
    fireEvent.blur(link)

    expect(screen.getByRole('alert')).toHaveTextContent('O link passa de 2000 caracteres.')
  })

  it('em en, rotulos, contador e erro do link saem do catalogo ingles', () => {
    renderWithI18n(
      <Controlado inicial={{ text: 'a'.repeat(MAX_EVIDENCE_LENGTH + 2), link: '' }} />,
      {
        locale: 'en',
      },
    )
    expect(screen.getByRole('button', { name: en['missions.evidence.toggle'] })).toBeInTheDocument()
    expect(screen.getByTestId('evidence-counter')).toHaveTextContent(
      '2 characters over the 4000 limit.',
    )
    const link = screen.getByLabelText(en['missions.evidence.linkLabel'])

    fireEvent.change(link, { target: { value: 'x' } })
    fireEvent.blur(link)

    expect(screen.getByRole('alert')).toHaveTextContent(en['missions.evidence.linkError.format'])
    expect(screen.getByLabelText(en['missions.evidence.textLabel'])).toBeInTheDocument()
  })

  it('em en, o contador no limite exato diz que nao resta nada', () => {
    renderWithI18n(<Controlado inicial={{ text: 'a'.repeat(MAX_EVIDENCE_LENGTH), link: '' }} />, {
      locale: 'en',
    })

    expect(screen.getByTestId('evidence-counter')).toHaveTextContent('No characters left.')
  })
})
