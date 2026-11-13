# fix/cliente-http-e-limites: queda no corpo, parse do progresso e paridade de limites — 2026-11-13

Objetivo: resolver as issues #189 (queda de rede ao ler o corpo de um 200), #188
(custo de nível não positivo no parse do progresso) e a parte coerente da #187
(paridade de limites front × back). Revisão-base: `0067e2f` (main).

## Declarações

- Zero dependência nova, zero endpoint, zero migração. Nenhum teste pulado, limiar
  intacto, nenhum hook tocado.
- **Mudança de contrato (só na forma do 422):** `difficulty` e `estimated_minutes`
  passam de `gt=0` para `ge=1` nomeado. Para inteiro, o conjunto aceito é o mesmo; o
  `type` do item de erro do FastAPI muda de `greater_than` para `greater_than_equal`.
  O front não lê esse campo.

## Decisões e porquê

- **#189:** o `send` do cliente lê o corpo por `readJsonBody`. Falha de leitura (rede
  caiu, aborto) vira `ApiError` `interrupted` com o status da resposta e `code` nulo,
  como o `postStream` já fazia. O `SyntaxError` de um corpo inteiro que não é JSON
  **não** foi convertido: é defeito de contrato, não queda, e as telas o mostram como
  falha inesperada (vários testes de tela dependem desse caminho).
- **Prazo preservado:** o `sendWithin` passou a poupar do "demorou" só os erros de
  status (`kind` `http`), e não qualquer erro com status. Sem isso, um 200 cujo corpo
  estourasse o prazo sairia `interrupted`, e não como resultado desconhecido.
- **#188:** `parseProgress` recusa na fronteira `next_level_xp - level_floor_xp`
  não positivo (e o `NaN` de campos ausentes) com `ApiError` `format`, o texto do
  catálogo. O resto do corpo segue sem validação, como no restante do cliente.
- **#187 (parcial):** `MAX_DIFFICULTY` declarada só em `shared/types/mission.ts`;
  pisos nomeados no back (`DIFICULDADE_MINIMA`, `MINUTOS_MINIMOS`); teste de paridade
  que lê o TS como texto; teste de integração que lê os CHECKs da evidência no banco
  migrado.

## Alterações

- `frontend/src/shared/api/client.ts` e `client.test.ts`.
- `frontend/src/features/progression/parseProgress.ts` (novo), `useProgress.ts`,
  `parseProgress.test.ts`, `ProgressPanel.test.tsx`.
- `frontend/src/features/campaigns/weekPlanDraft.ts`, `WeekPlanForm.tsx`,
  `frontend/src/shared/types/mission.ts`, `frontend/src/features/missions/evidenceLimit.ts`
  (comentários e import).
- `src/focusquest/modules/missions/schemas.py`, `cycle_schemas.py`.
- `tests/unit/test_paridade_dos_limites.py`, `tests/integration/test_checks_da_evidencia.py`.

## Comandos

- `npx vitest run` dos arquivos afetados (vermelho antes da correção, verde depois).
- `uv run pytest -q --no-cov` dos testes novos e dos de limite da avulsa e do ciclo.
- `make check-web` (verde, cobertura 100%); `make check` completo pelo hook de commit.

## Resultados

Ver o PR: o resultado do `make check` vem do hook de commit desta branch.

## Pendências

- **#187, o que ficou:** espelho de `ESTIMATIVA_MAXIMA_DA_AVULSA` no front (hoje não há
  consumidor; uma constante sem uso seria especulativa) e o texto "365 dias" do
  catálogo interpolado de uma constante de prazo (mexe em seis textos e três telas).
- **#181:** o teto diário de avaliações por IA e o texto citado na issue não existem
  na `main`; não há o que reescrever até essa funcionalidade entrar.
