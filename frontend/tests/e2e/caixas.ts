import { expect } from '@playwright/test'

/**
 * Se duas caixas de `boundingBox()` se sobrepoem. Uma caixa NULA reprova: e
 * o elemento sem caixa (oculto ou fora do layout), e tratar isso como "sem
 * sobreposicao" deixaria passar um botao escondido.
 */
export function caixasSeSobrepoem(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  expect(a, 'boundingBox() nulo: o elemento nao tem caixa').not.toBeNull()
  expect(b, 'boundingBox() nulo: o elemento nao tem caixa').not.toBeNull()
  // Os `expect` acima ja reprovaram se alguma for nula; isto so estreita o
  // tipo (e, por seguranca, responde "sobrepoe", nunca "passa").
  if (a === null || b === null) return true
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
