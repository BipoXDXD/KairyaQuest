# F6 pendências: fitness functions por AST (11/11/2026)

**Objetivo:** fechar as pendências menores da F6 que ficaram nas fitness functions do frontend.

**Decisões**

- `noCrossFeatureInternals` passa a varrer `src/**/*.{ts,tsx}`, e os especificadores vêm da AST do `typescript`, que já era devDependency. A varredura achou uma violação real em `App.test.tsx`, corrigida pelos `index.ts` da feature.
- `noMathRandom` troca a regex pela AST, o que elimina os falsos positivos em comentário e string.
- `missions`, `tutoring`, `progression` e `campaigns` ganham `index.ts` como fronteira pública. As tabelas de falha reexportadas servem ao teste de comprimento dos textos de erro.

**Pendências (Minor, da revisão):**

- `noMathRandom` não segue alias (`const m = Math`) nem `globalThis['Math']`.
- O `import()` com template interpolado não é lido.
