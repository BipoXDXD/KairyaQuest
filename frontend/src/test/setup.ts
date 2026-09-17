import '@testing-library/jest-dom/vitest'

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
