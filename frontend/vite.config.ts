import { defineConfig } from 'vitest/config'
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
    // Os testes de unidade moram ao lado do codigo, em `src/`. O padrao do
    // Vitest (`**/*.{test,spec}.*`) tambem varre `tests/e2e/`, e MEDIDO:
    // `npx vitest list --filesOnly` listava `tests/e2e/headquarters.spec.ts`
    // antes desta linha. O cenario do Playwright rodando sob o jsdom falharia
    // no import do `@playwright/test` -- uma falha ruidosa, mas sobre nada.
    //
    // Isto NAO e exclusao de codigo dificil da cobertura: o denominador de
    // cobertura e `coverage.include` (`src/**`), que nunca incluiu `tests/`.
    // Aqui se declara apenas QUEM roda sob o Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
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
