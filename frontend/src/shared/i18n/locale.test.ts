import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCALE_STORAGE_KEY,
  detectLocale,
  initialLocale,
  openStorage,
  parseLocale,
  readCachedLocale,
  writeCachedLocale,
} from './locale'

/**
 * Um `Storage` completo cujos metodos lancam, como o `localStorage` em modo
 * privado ou com a cota cheia. Completo, e nao um objeto parcial convertido
 * com `as`, para o compilador conferir a forma.
 */
function failingStorage(error: DOMException): Storage {
  const fail = (): never => {
    throw error
  }
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  }
}

describe('locale', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it.each<[string | undefined, string]>([
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['PT', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['de', 'en'],
    ['en-US', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('detectLocale(%s) → %s', (input, expected) => {
    expect(detectLocale(input)).toBe(expected)
  })

  it('parseLocale aceita exatamente os dois idiomas', () => {
    expect(parseLocale('en')).toBe('en')
    expect(parseLocale('pt-BR')).toBe('pt-BR')
  })

  it('parseLocale recusa o que não é exatamente um dos dois', () => {
    for (const lixo of ['EN', 'pt', 'fr', '', null, 1, {}]) {
      expect(parseLocale(lixo)).toBeNull()
    }
  })

  it('initialLocale prefere o cache válido à detecção', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    expect(initialLocale(localStorage, 'pt-BR')).toBe('en')
  })

  it('initialLocale ignora cache inválido', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, '{')
    expect(initialLocale(localStorage, 'pt-BR')).toBe('pt-BR')
  })

  it('initialLocale sobrevive a storage que lança (Review Focus 1)', () => {
    const quebrado = failingStorage(new DOMException('denied', 'SecurityError'))
    expect(initialLocale(quebrado, undefined)).toBe('en')
  })

  it('initialLocale com storage null usa a detecção', () => {
    expect(initialLocale(null, 'pt-PT')).toBe('pt-BR')
  })

  it('readCachedLocale sem nada gravado devolve null', () => {
    expect(readCachedLocale(localStorage)).toBeNull()
  })

  it('writeCachedLocale grava o idioma na chave do cache', () => {
    writeCachedLocale(localStorage, 'en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(readCachedLocale(localStorage)).toBe('en')
  })

  it('writeCachedLocale não propaga a falha do storage (Review Focus 1)', () => {
    const cheio = failingStorage(new DOMException('full', 'QuotaExceededError'))
    expect(() => {
      writeCachedLocale(cheio, 'en')
    }).not.toThrow()
  })

  it('writeCachedLocale com storage null não faz nada', () => {
    expect(() => {
      writeCachedLocale(null, 'en')
    }).not.toThrow()
  })

  it('openStorage devolve o storage quando o acesso funciona', () => {
    expect(openStorage(() => localStorage)).toBe(localStorage)
  })

  it('openStorage devolve null quando o próprio acesso ao storage lança', () => {
    // Navegador com cookies bloqueados: ler `window.localStorage` ja lanca
    // SecurityError, antes de qualquer getItem.
    const blocked = (): Storage => {
      throw new DOMException('denied', 'SecurityError')
    }
    expect(openStorage(blocked)).toBeNull()
  })
})
