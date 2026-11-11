import { vi, type Mock } from 'vitest'

/** `HTMLAudioElement` de mentira: `play`/`pause` espionáveis e `fire('error')` para simular 404 ou decodificação. */
export type FakeAudio = HTMLAudioElement & {
  play: Mock
  pause: Mock
  fire(type: 'error'): void
}

/**
 * Um `FakeAudio` novo. `play` devolve uma promessa resolvida, como um navegador
 * que tocou; cada teste troca a implementação quando quer outra resposta.
 */
export function fakeAudio(): FakeAudio {
  const errorListeners: (() => void)[] = []
  const partial = {
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    src: '',
    currentTime: 0,
    volume: 1,
    preload: 'auto',
    addEventListener(type: string, listener: () => void) {
      if (type === 'error') {
        errorListeners.push(listener)
      }
    },
    fire(type: 'error') {
      if (type === 'error') {
        for (const listener of errorListeners) listener()
      }
    },
  }
  // O jsdom não implementa mídia (`play` lança "not implemented"), e o player
  // só usa os membros acima; o cast fica aqui, uma vez, para nenhum teste
  // precisar de outro.
  return partial as unknown as FakeAudio
}

class MemoryStorage implements Storage {
  // A interface `Storage` tem assinatura de índice (`storage.chave`); este
  // dublê só é usado pelos métodos, mas a classe precisa declará-la.
  [name: string]: unknown
  readonly #items: Map<string, string>

  constructor(entries: Record<string, string>) {
    this.#items = new Map(Object.entries(entries))
  }

  get length(): number {
    return this.#items.size
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, String(value))
  }

  removeItem(key: string): void {
    this.#items.delete(key)
  }

  clear(): void {
    this.#items.clear()
  }
}

/** `Storage` em memória, isolado por teste (o `localStorage` do jsdom é global). */
export function memoryStorage(entries: Record<string, string> = {}): Storage {
  return new MemoryStorage(entries)
}

/**
 * Espera cada promessa já devolvida por um `play` espionado se resolver ou
 * rejeitar. O `.catch` do player foi registrado antes, então já rodou quando
 * esta promessa resolve: flush determinístico, sem timer.
 */
export async function settlePlays(play: {
  mock: { results: readonly { value: unknown }[] }
}): Promise<void> {
  await Promise.allSettled(play.mock.results.map((result) => result.value))
}
