/** Caminho de um mp3 em `/audio/`; só `audioSrc` o produz, para nenhum texto solto chegar ao player. */
export type AudioSrc = string & { readonly __brand: 'AudioSrc' }

export function audioSrc(path: `/audio/${string}.mp3`): AudioSrc {
  // O template literal do parâmetro já garante a forma; o cast só aplica o brand.
  return path as AudioSrc
}
