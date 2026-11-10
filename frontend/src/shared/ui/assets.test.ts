/// <reference types="node" />
import { expect, test } from 'vitest'
import { listSources, readSource, sourceExists, sourceSize } from '../../test/readSource'
import { ART } from './art'

const ART_MAX_BYTES = 200 * 1024
const cssFiles = listSources('src/**/*.css').map(readSource)
const artPaths: string[] = Object.values(ART).flatMap((group) => Object.values(group))
const inPublic = (p: string) => `public${p}`

test('o CSS lido não está vazio', () => {
  expect(cssFiles.some((t) => t.includes('--ink-950'))).toBe(true)
})

test('todo caminho de ART existe em public/', () => {
  expect(artPaths).toHaveLength(13)
  expect(artPaths.filter((p) => !sourceExists(inPublic(p)))).toEqual([])
})

/** Caminhos absolutos de `url()`, com aspas simples, duplas ou sem aspas. */
const CSS_URL = /url\(\s*['"]?(\/[^'")\s]+)['"]?\s*\)/g
const cssUrls = (css: string) => [...css.matchAll(CSS_URL)].map((m) => m[1])
const missingInPublic = (paths: readonly string[]) =>
  paths.filter((p) => !sourceExists(inPublic(p)))

test.each([
  ["url('/a/b.webp')", '/a/b.webp'],
  ['url("/a/b.webp")', '/a/b.webp'],
  ['url(/a/b.webp)', '/a/b.webp'],
  ["url( '/a/b.webp' )", '/a/b.webp'],
])('a varredura de url() lê %s', (css, path) => {
  expect(cssUrls(css)).toEqual([path])
})

test('a varredura ignora url() relativo e data:', () => {
  expect(cssUrls("url('a.webp') url(data:image/png;base64,AAAA)")).toEqual([])
})

test('a verificação acusa arquivo ausente em public/', () => {
  expect(missingInPublic(cssUrls('url("/art/nao-existe.webp")'))).toEqual(['/art/nao-existe.webp'])
})

test("todo url('/...') dos CSS existe em public/", () => {
  const urls = cssFiles.flatMap(cssUrls)
  expect(urls.length).toBeGreaterThan(0)
  expect(missingInPublic(urls)).toEqual([])
})

test('cada arte tem no máximo 200 KB', () => {
  expect(artPaths.filter((p) => sourceSize(inPublic(p)) > ART_MAX_BYTES)).toEqual([])
})
