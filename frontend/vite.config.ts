import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O navegador nunca fala com a porta do backend. Ele pede `/api/...` para a
  // propria origem do Vite, e o proxy encaminha -- entao nao existe pedido
  // cross-origin e o backend nao precisa de CORSMiddleware. Autorizar origem
  // no servidor resolveria o sintoma; fazer tudo sair da mesma origem faz o
  // problema deixar de existir.
  //
  // O alvo vem do ambiente com a 8000 apenas como PADRAO porque o E2E sobe uma
  // API dedicada em outra porta (o README §10 proibe reutilizar servidor
  // pessoal). Com o alvo fixo em 8000, o pior caso do E2E nao seria falhar: ele
  // PASSARIA, encaminhando contra a API de desenvolvimento.
  //
  // Atencao: `API_PROXY_TARGET` e lida do ambiente do PROCESSO, nao do `.env`.
  // O Vite carrega `.env` para `import.meta.env` (so o que tem prefixo `VITE_`)
  // e nao o injeta em `process.env`. Quem quiser trocar o alvo exporta a
  // variavel antes de subir o Vite.
  server: {
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // QUEM roda sob o Vitest: o padrao do Vitest (`**/*.{test,spec}.*`) MENOS
    // a pasta do Playwright. E deliberadamente um `exclude`, e nao um
    // `include` estreito.
    //
    // O problema real: o padrao do Vitest varre `tests/e2e/`, e o cenario do
    // Playwright sob jsdom falharia no import do `@playwright/test` -- falha
    // ruidosa, mas sobre nada. A primeira tentativa de conserto foi
    // `include: ['src/**/*.test.{ts,tsx}']`, e ela trocou o problema por um
    // pior. MEDIDO: com aquele `include`, um `tests/unit/zz_guarda.test.ts`
    // contendo `expect(1).toBe(2)` nao era coletado -- `6 passed / 35 passed`,
    // exit 0. Um teste que REPROVA foi ignorado em silencio absoluto, que e o
    // "teste ignorado"/"sucesso com suite vazia" que o AGENTS.md §3 proibe.
    //
    // A regra por tras da inversao: `include` e lista de PERMISSAO e falha
    // ABERTA -- o que ninguem pensou em listar fica de fora e o gate aprova.
    // `exclude` e lista de NEGACAO e falha FECHADA -- o que ninguem pensou em
    // excluir e coletado e, no pior caso, reprova alto. Num gate, o padrao tem
    // de ser "roda" e a excecao tem de ser DECLARADA.
    //
    // `configDefaults.exclude`, e nao `configDefaults.test.exclude`: no Vitest
    // 5.0.1 (o instalado) o `configDefaults` e PLANO. Medido:
    // `configDefaults.test` e `undefined`, logo a forma aninhada explodiria com
    // TypeError no spread. Preservar o padrao (`**/node_modules/**`,
    // `**/.git/**`) importa: reescrever a lista na mao faria o Vitest tentar
    // coletar testes de dentro do `node_modules/`.
    //
    // Isto NAO e exclusao de codigo dificil da cobertura: o denominador de
    // cobertura e `coverage.include` (`src/**`), que nunca incluiu `tests/`.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    // O cliente HTTP recusa carregar sem `VITE_API_URL` (ver
    // src/shared/api/client.ts). Os testes precisam do mesmo valor que o
    // ambiente de desenvolvimento usa; `client.test.ts` sobrescreve com
    // `vi.stubEnv` para exercitar a ausencia.
    env: {
      VITE_API_URL: '/api',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
