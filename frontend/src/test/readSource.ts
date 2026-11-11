/// <reference types="node" />
// Leitura real de arquivos-fonte para os testes. O `?raw` de CSS não serve:
// no Vitest 5.0.1 ele passa pelo plugin `vitest:css-empty-post` e devolve "",
// o que deixaria vácuo todo teste que inspeciona CSS.
//
// A raiz sai de `fileURLToPath(import.meta.url)` + `path`, e não da forma
// `new URL('../../', import.meta.url)`: o Vite reescreve essa forma literal
// como URL de asset (`http://localhost:3000/@fs/...`) e o `fileURLToPath`
// recusa o esquema http. Medido no Vitest 5.0.1 com jsdom.
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_FILE = /\.test\.[jt]sx?$/

/** Lê um arquivo relativo a `frontend/`; arquivo vazio é erro, nunca "". */
export function readSource(pathFromFrontend: string): string {
  const text = readFileSync(resolve(FRONTEND_ROOT, pathFromFrontend), 'utf8')
  if (text.trim() === '') {
    throw new Error(`arquivo vazio: ${pathFromFrontend}`)
  }
  return text
}

/** Diz se um arquivo relativo a `frontend/` existe; serve a binários (woff2). */
export function sourceExists(pathFromFrontend: string): boolean {
  return existsSync(resolve(FRONTEND_ROOT, pathFromFrontend))
}

/** Tamanho em bytes de um arquivo relativo a `frontend/`; ausente é erro (ENOENT). */
export function sourceSize(pathFromFrontend: string): number {
  return statSync(resolve(FRONTEND_ROOT, pathFromFrontend)).size
}

/** Caminhos relativos a `frontend/` que casam com o glob, em ordem estável. */
export function listSources(pattern: string, opts?: { excludeTests?: boolean }): string[] {
  const paths = globSync(pattern, { cwd: FRONTEND_ROOT })
  const kept = opts?.excludeTests === true ? paths.filter((p) => !TEST_FILE.test(p)) : paths
  return [...kept].sort()
}
