import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAudio, memoryStorage } from '../../test/audioDoubles'
import { renderWithI18n } from '../../test/i18n'
import type { Locale } from '../i18n/locale'
import { SoundInvite } from './SoundInvite'

const BANNED = /não perca|última chance|don't miss|last chance/i

function throwingStorage(): Storage {
  const storage = memoryStorage({})
  storage.getItem = () => {
    throw new Error('blocked')
  }
  storage.setItem = () => {
    throw new Error('blocked')
  }
  return storage
}

describe('SoundInvite', () => {
  it('aparece sem ser modal e sem roubar o foco', () => {
    renderWithI18n(<SoundInvite />, {
      audio: { storage: memoryStorage({}), createElement: fakeAudio },
    })

    const card = screen.getByTestId('sound-invite')
    expect(card).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(card).not.toHaveAttribute('aria-modal')
    expect(document.activeElement).toBe(document.body)
    expect(screen.getByRole('heading', { name: 'Quer ouvir a Kairya?' })).toBeInTheDocument()
  })

  it('Ligar voz e efeitos liga os dois canais, grava e some', () => {
    const storage = memoryStorage({})
    renderWithI18n(<SoundInvite />, { audio: { storage, createElement: fakeAudio } })

    fireEvent.click(screen.getByRole('button', { name: 'Ligar voz e efeitos' }))

    expect(storage.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":true}')
    expect(screen.queryByTestId('sound-invite')).toBeNull()
  })

  it('Agora não some, grava o convite dispensado e mantém o som desligado', () => {
    const storage = memoryStorage({})
    renderWithI18n(<SoundInvite />, { audio: { storage, createElement: fakeAudio } })

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))

    expect(storage.getItem('kairyaquest.soundInvite')).toBe('1')
    expect(storage.getItem('kairyaquest.sound')).toBeNull()
    expect(screen.queryByTestId('sound-invite')).toBeNull()
  })

  it('com preferência salva, mesmo desligada, não aparece', () => {
    renderWithI18n(<SoundInvite />, {
      audio: {
        storage: memoryStorage({ 'kairyaquest.sound': '{"voice":false,"sfx":false}' }),
        createElement: fakeAudio,
      },
    })

    expect(screen.queryByTestId('sound-invite')).toBeNull()
  })

  it('com storage que lança, aparece e Agora não o esconde', () => {
    renderWithI18n(<SoundInvite />, {
      audio: { storage: throwingStorage(), createElement: fakeAudio },
    })

    expect(screen.getByTestId('sound-invite')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByTestId('sound-invite')).toBeNull()
  })

  it.each<Locale>(['pt-BR', 'en'])('o texto em %s não pressiona', (locale) => {
    renderWithI18n(<SoundInvite />, {
      locale,
      audio: { storage: memoryStorage({}), createElement: fakeAudio },
    })

    const text = screen.getByTestId('sound-invite').textContent
    expect(text).not.toMatch(BANNED)
  })

  it('em inglês, usa o catálogo em inglês', () => {
    renderWithI18n(<SoundInvite />, {
      locale: 'en',
      audio: { storage: memoryStorage({}), createElement: fakeAudio },
    })

    expect(screen.getByRole('heading', { name: 'Want to hear Kairya?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on voice and effects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })
})
