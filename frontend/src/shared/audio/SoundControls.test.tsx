import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAudio, memoryStorage } from '../../test/audioDoubles'
import { renderWithI18n } from '../../test/i18n'
import { SoundControls } from './SoundControls'

describe('SoundControls', () => {
  it('agrupa os botões de voz e efeitos, ambos desligados no começo', () => {
    const storage = memoryStorage({})
    renderWithI18n(<SoundControls />, { audio: { storage, createElement: fakeAudio } })

    const group = screen.getByRole('group', { name: 'Som' })
    expect(within(group).getByRole('button', { name: 'Voz da Kairya' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(group).getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('ligar a voz liga só ela e grava a preferência', () => {
    const storage = memoryStorage({})
    renderWithI18n(<SoundControls />, { audio: { storage, createElement: fakeAudio } })

    fireEvent.click(screen.getByRole('button', { name: 'Voz da Kairya' }))

    expect(screen.getByRole('button', { name: 'Voz da Kairya' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(storage.getItem('kairyaquest.sound')).toBe('{"voice":true,"sfx":false}')
  })

  it('em inglês, o grupo se chama Sound', () => {
    renderWithI18n(<SoundControls />, {
      locale: 'en',
      audio: { storage: memoryStorage({}), createElement: fakeAudio },
    })

    expect(screen.getByRole('group', { name: 'Sound' })).toBeInTheDocument()
  })
})
