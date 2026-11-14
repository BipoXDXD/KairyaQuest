# Ressalvas Minor acumuladas (#131) — 2026-11-11

Branch `wt/ressalvas-minor`. Tipos, comentários, docstrings e docs, com uma
única mudança de comportamento (item 2, corpo `undefined`), coberta por um caso
novo no `it.each`. `docs/HANDOFF.md` fica intocado.

**Por item** (cada um conferido no código da `main` antes de mexer):

1. `MissionStateText` (substituído por `TextoDeEnum`): três comentários citavam o
   nome antigo (`missions/models.py` nos dois pontos de `OrigemDoReagendamentoText`
   e `tests/integration/test_tutoring_models.py`); agora citam `TextoDeEnum`. O
   `grep` de `MissionStateText` em `src`, `tests`, `frontend/src` e `README.md`
   sai vazio; sobra só o relato histórico em `docs/handoff/2026-11-11-pendencia-97.md`,
   que descreve o que aquele PR removeu e fica como está.
2. `messageFailure.ts` (`describeStreamErrorEvent`): o `data as { code?: unknown }`
   virou narrowing real (`typeof data === 'object' && data !== null && 'code' in data`).
   Os casos do `it.each` (`code` desconhecido, objeto sem `code`, `code` nulo,
   `code` de outro tipo, corpo nulo, corpo ausente, corpo que não é objeto) cobrem
   todos os ramos. Única mudança de comportamento: com corpo `undefined` o `as`
   antigo lançava `TypeError` (`undefined.code`); agora cai em
   `UNRECOGNIZED_FAILURE`, como a docstring promete ("nunca derruba o stream").
   O caso "corpo ausente" foi acrescentado para fixar isso.
3. `messageFailure.test.ts`: já resolvido antes (#110, "o teste afirma o texto"). O
   teste "a falha generica diz que a pergunta nao foi respondida…" afirma hoje o
   texto resolvido em pt-BR e en, e "as chaves de %s existem no catalogo" promete
   só chaves e só checa chaves. Nada a mudar.
4. `actionFailure.ts` (`failedActionText`): o comentário chamava `expired`,
   `invalidated` e `out-of-bounds` de "codes", mas são as saídas (`DecisionAction`)
   que o backend grava (`RECORDS`); os codes são os de `ACTION_FAILURE_BY_CODE`.
   Corrigido, e a linha que passava de 80 colunas foi refeita.
5. `docs/HANDOFF.md`: a limitação "ARCHITECTURE desatualizado" (rascunho do
   reagendar, bullet que começa em "`docs/ARCHITECTURE.md` (perto da linha 1242)",
   nas Limitações da pendência do reagendamento) já está resolvida: o
   `ARCHITECTURE.md` descreve o rascunho no registro do quadro, que sobrevive à
   remontagem do cartão e se perde só na recarga do navegador. **Não editado neste
   PR**: o `check-handoff` recusa branch que toca `docs/HANDOFF.md` (a consolidação
   é PR de quem coordena). Para a consolidação: riscar aquele bullet, com este
   motivo. A decisão F20 da spec do incremento F é registro histórico e fica.
6. `descartar_engine` (`core/database.py`): a docstring dizia "roda sob a MESMA
   trava", mas só a troca de `_engine` roda sob ela; o `dispose` roda fora. A
   docstring descreve isso e o porquê (não segurar a trava enquanto o pool fecha).
   Comportamento intacto.

**Comandos e resultados.**

- `vitest run` de `messageFailure.test.ts` e `actionFailure.test.ts`: 72 aprovados;
  `npm run typecheck`, `eslint --max-warnings 0` e `prettier --check` limpos.
- `make check` completo sob `lote-off9.lock`, três execuções: (1) EXIT 2 por
  timeout de 5 s em `noMathRandom.test.ts` com a máquina carregada (load ~25);
  (2) EXIT 2 por E501 de um comentário meu em `missions/models.py` (reescrito);
  (3) com load ~17, **EXIT 0**: Vitest 2564 testes em 125 arquivos, cobertura do
  frontend 100% (2332/2332 instruções, 1527/1527 ramos, 646/646 funções),
  pytest 2116 aprovados e 32 subtestes, Playwright 186 aprovados, gitleaks sem
  achados, wheel com 4 prompts.
