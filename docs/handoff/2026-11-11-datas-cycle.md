# Helpers de data do `cycle.spec.ts` — 2026-11-11

Branch `wt/datas-cycle`, revisão-base `d3d96a2` (main com o #93).

## Objetivo

Resolver a pendência `P-achados-revisao-1` (registrada em
`2026-11-11-achados-revisao.md`): `frontend/tests/e2e/cycle.spec.ts` mantinha
helpers de data locais que duplicavam os de `frontend/tests/e2e/datas.ts`.
Refactor puro: nenhuma expectativa de teste mudou.

## Alterações

Só `frontend/tests/e2e/cycle.spec.ts`:

- `diaMes(civil)` removida; o uso passa a `diaEMes(hoje)`.
- `diaCivil(civil, deslocamento)` removida; o uso passa a
  `somarDias(segunda, deslocamento)`.
- O índice do dia da semana (`(new Date(...).getUTCDay() + 6) % 7`) vira
  `diasEntre(segundaDaSemana(hoje), hoje)`: os dois helpers já existiam em
  `datas.ts`, então não foi criado helper novo (Rule of Three: um único uso).

## Equivalência

Formato de saída e fuso conferidos antes de trocar. Os três pares operam em
UTC puro (sem `Intl`, sem horário de verão), e as versões locais usavam
`T12:00:00Z` onde `datas.ts` usa `T00:00:00Z`; a diferença não muda a data
civil. Verificação por força bruta em Node, 2020-01-01 a 2031-12-31 (4383
dias, deslocamentos -9, 0, 3, 6 e 400): 0 divergências nos três pares.

## Resultados

- Playwright `cycle.spec.ts` antes do refactor: 6 passed.
- Playwright `cycle.spec.ts` depois do refactor: 6 passed.
- `make check`: ver o corpo do PR.

## Pendências

- `P-achados-revisao-1` está resolvida por este PR; a consolidação a risca.
