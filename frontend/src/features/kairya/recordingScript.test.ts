/// <reference types="node" />
// node:fs só para regerar o roteiro (escrita); a leitura passa pelos helpers.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, test } from 'vitest'
import { SFX_NAMES } from '../../shared/audio/sfx'
import { readSource, sourcePath } from '../../test/readSource'
import { lineSrc } from './lineAudio'
import { buildRecordingScript, SFX_GUIDE } from './recordingScript'

const ROTEIRO = '../assets-src/audio/roteiro.json' // relativo a frontend/

test('lineSrc separa por idioma', () => {
  expect(lineSrc('pt-BR', 'greet_morning_1')).toBe('/audio/pt-BR/greet_morning_1.mp3')
  expect(lineSrc('en', 'farewell_2')).toBe('/audio/en/farewell_2.mp3')
})

test('o roteiro tem 72 falas, o texto do catálogo e o arquivo de cada uma', () => {
  const { lines } = buildRecordingScript()
  expect(lines).toHaveLength(72)
  expect(lines[0]).toEqual({
    id: 'greet_morning_1',
    locale: 'pt-BR',
    text: 'Bom dia. Qual é o primeiro passo de hoje?',
    file: 'frontend/public/audio/pt-BR/greet_morning_1.mp3',
  })
  expect(lines.find((l) => l.locale === 'en' && l.id === 'comeback_1')?.text).toBe(
    "Your streak reset. What you learned didn't. Go again today?",
  )
})

test('o roteiro tem os 12 efeitos com prompt e duração entre 0,5 e 2 s', () => {
  const { sfx } = buildRecordingScript()
  expect(sfx.map((s) => s.name)).toEqual([...SFX_NAMES])
  for (const s of sfx) {
    expect(s.seconds).toBeGreaterThanOrEqual(0.5)
    expect(s.seconds).toBeLessThanOrEqual(2)
    expect(s.file).toBe(`frontend/public/audio/sfx/${s.name}.mp3`)
  }
})

test('nenhum prompt de efeito pede som agressivo', () => {
  // A verificação de franquia mora na fitness 2.3 (Python); aqui só o tom.
  // Radical com qualquer sufixo (screaming, alarmed, explosive); a negação
  // explícita sai antes, porque o `soft_error` pede "not alarming".
  const proibido = /\b(?:scream|alarm|buzzer|siren|explo)\w*/i
  const semNegacao = (texto: string) => texto.replace(/\bnot \w+/gi, '')
  for (const { prompt } of Object.values(SFX_GUIDE))
    expect(semNegacao(prompt)).not.toMatch(proibido)
  expect(semNegacao('a screaming siren')).toMatch(proibido) // o regex não é vácuo
  expect(semNegacao('soft, not alarming')).not.toMatch(proibido)
})

test('roteiro.json versionado é exatamente o gerado do catálogo', () => {
  const expected = JSON.stringify(buildRecordingScript(), null, 2) + '\n'
  // Regerar: KAIRYAQUEST_WRITE_ROTEIRO=1 npx vitest run src/features/kairya/recordingScript.test.ts
  if (process.env.KAIRYAQUEST_WRITE_ROTEIRO === '1') {
    mkdirSync(dirname(sourcePath(ROTEIRO)), { recursive: true })
    writeFileSync(sourcePath(ROTEIRO), expected)
  }
  expect(readSource(ROTEIRO)).toBe(expected)
})
