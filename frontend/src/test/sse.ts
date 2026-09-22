/**
 * Pecas para testar o stream SSE sem rede.
 *
 * Mora em `src/test/` porque e infraestrutura de teste (fora do denominador da
 * cobertura, `docs/QUALITY.md` §3), e e usada por mais de um arquivo de teste:
 * o do cliente e os dos hooks da tutoria.
 */

const encoder = new TextEncoder()

/** Um quadro SSE no formato exato do backend (`tutoring/sse.py`). */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Uma resposta cujo corpo chega nos pedacos dados, na ordem, e termina.
 *
 * Os pedacos sao texto; cada um vira UM `enqueue`. E o que deixa o teste
 * partir um evento ao meio, ou juntar varios num pedaco so.
 */
export function streamResponse(chunks: string[], init?: ResponseInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  })
}

/** Uma resposta cujo corpo o teste alimenta aos poucos. */
export function controlledStream(): {
  response: Response
  push: (text: string) => void
  close: () => void
  fail: (error: unknown) => void
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    push: (text) => {
      controller.enqueue(encoder.encode(text))
    },
    close: () => {
      controller.close()
    },
    fail: (error) => {
      controller.error(error)
    },
  }
}

/** Os bytes UTF-8 de um texto, para partir um caractere de varios bytes. */
export function bytesOf(text: string): Uint8Array {
  return encoder.encode(text)
}
