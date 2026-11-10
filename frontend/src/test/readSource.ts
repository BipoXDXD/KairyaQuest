/// <reference types="node" />
// Leitura real de arquivos-fonte para os testes. O `?raw` de CSS não serve:
// no Vitest 5.0.1 ele passa pelo plugin `vitest:css-empty-post` e devolve "",
// o que deixaria vácuo todo teste que inspeciona CSS.
//
// A raiz sai de `fileURLToPath(import.meta.url)` + `path`, e não da forma
// `new URL('../../', import.meta.url)`: o Vite reescreve essa forma literal
// como URL de asset (`http://localhost:3000/@fs/...`) e o `fileURLToPath`
// recusa o esquema http. Medido no Vitest 5.0.1 com jsdom.
import { globSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_FILE = /\.test\.[jt]sx?$/

/** Caminho absoluto de um arquivo relativo a `frontend/`; aceita `../` para sair dela. */
export function sourcePath(pathFromFrontend: string): string {
  return resolve(FRONTEND_ROOT, pathFromFrontend)
}

/** Lê um arquivo relativo a `frontend/`; arquivo vazio é erro, nunca "". */
export function readSource(pathFromFrontend: string): string {
  const text = readFileSync(sourcePath(pathFromFrontend), 'utf8')
  if (text.trim() === '') {
    throw new Error(`arquivo vazio: ${pathFromFrontend}`)
  }
  return text
}

/** Bytes de um arquivo relativo a `frontend/`, sem decodificar; vazio é erro. */
export function readSourceBytes(pathFromFrontend: string): Uint8Array {
  const bytes = new Uint8Array(readFileSync(sourcePath(pathFromFrontend)))
  if (bytes.length === 0) {
    throw new Error(`arquivo vazio: ${pathFromFrontend}`)
  }
  return bytes
}

/**
 * `true` só para arquivo regular: o `globSync` do `listSources` também devolve
 * pastas, e um caminho ausente responde `false` em vez de lançar.
 */
export function isSourceFile(pathFromFrontend: string): boolean {
  return statSync(sourcePath(pathFromFrontend), { throwIfNoEntry: false })?.isFile() ?? false
}

/** Caminhos relativos a `frontend/` que casam com o glob, em ordem estável. */
export function listSources(pattern: string, opts?: { excludeTests?: boolean }): string[] {
  const paths = globSync(pattern, { cwd: FRONTEND_ROOT })
  const kept = opts?.excludeTests === true ? paths.filter((p) => !TEST_FILE.test(p)) : paths
  return [...kept].sort()
}
