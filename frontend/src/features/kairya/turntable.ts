/** O turntable da Kairya: video em loop e o quadro parado (poster). */
export interface TurntableAsset {
  video: '/art/kairya/turntable.webm'
  poster: '/art/kairya/turntable.webp'
  width: 480
  height: 600
}

/**
 * `null` enquanto o asset nao existe: o componente mostra o placeholder
 * (a arte `celebrating`). Quando o asset entrar no repositorio, o valor passa
 * a ser o objeto.
 */
export const TURNTABLE: TurntableAsset | null = null
