import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import './dialog'

// O React so entra em "modo de teste" quando este sinalizador global esta
// definido. Sem ele, todo act() -- inclusive o de src/main.test.tsx --
// imprime "The current testing environment is not configured to support
// act(...)" e NAO faz o que o teste afirma que faz: o React nao garante
// que o trabalho agendado foi descarregado antes da assercao. O aviso
// passava despercebido porque o reporter padrao do Vitest so mostra a
// saida de stderr com --reporter=verbose.
//
// Nao vem de graca do @testing-library/react: quem usa render() ganha o
// sinalizador por tabela, mas main.test.tsx importa o modulo direto e
// chama act() do proprio React, sem passar pela biblioteca. Definir aqui
// cobre os dois casos.
declare global {
  // "var" e obrigatorio aqui: so declaracoes com var sao anexadas ao tipo
  // de globalThis. A regra no-var nao esta ligada nesta configuracao, e um
  // eslint-disable para ela seria uma diretiva inutil -- o proprio ESLint
  // avisa quando isso acontece.
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Desmonta o que cada teste renderizou.
//
// O @testing-library/react registra este afterEach por conta propria APENAS
// quando o `afterEach` global existe -- e o Vitest daqui roda com
// `globals: false` (nao ha `test.globals: true` no vite.config.ts), entao o
// registro automatico nao acontece. Sem esta linha o DOM ACUMULA entre os
// testes do mesmo arquivo, e a falha nao aparece como "vazou": aparece como
// getByTestId encontrando varios elementos, ou findByTestId estourando o
// tempo enquanto o elemento certo esta na tela -- medido nesta tarefa, com
// oito testes reprovando por este motivo.
afterEach(cleanup)

// O idioma do navegador fixado em `pt-BR`: o `I18nProvider` sem
// `initialLocale` (o de main.tsx) detecta o idioma por ele, e os testes
// existentes estao todos escritos em PT. No jsdom a propriedade vem do
// prototipo; redefini-la aqui como `configurable` e o que deixa um teste usar
// `vi.spyOn(navigator, 'language', 'get')` para simular outro idioma.
Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'pt-BR' })

// Nenhum teste vaza para o seguinte o idioma que simulou (spy do
// `navigator.language`), o que gravou no cache nem o `<html lang>`.
//
// O `restoreAllMocks` e global de proposito: um spy que vaza de um teste para
// o seguinte faz o resultado depender da ordem. O custo: TODO `vi.spyOn` volta
// ao original apos cada teste, entao um spy criado em `beforeAll` (ou no topo
// de um `describe`) vale so para o primeiro teste do arquivo, e os demais
// rodam contra a implementacao real -- a falha aparece como "o mock nao
// pegou" a partir do segundo teste. Crie spies em `beforeEach` ou no proprio
// teste. (`vi.fn()` solto nao e afetado.)
afterEach(() => {
  vi.restoreAllMocks()
  // Mesma guarda do localStorage abaixo: sem DOM no ambiente node.
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('lang')
  }
  // Os testes com `@vitest-environment node` (tests/unit/) nao tem
  // localStorage, e este setup roda para eles tambem.
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})
