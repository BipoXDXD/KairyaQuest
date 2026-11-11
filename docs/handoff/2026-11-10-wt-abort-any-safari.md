# Follow-up do #77: AbortSignal.any no Safari 17.0–17.3 — 2026-11-10

Branch `wt/abort-any-safari`, revisão-base `6335edb` (main com o #77).

## Objetivo

Fazer o prazo de leitura do #77 (pendência 213) funcionar também nos
navegadores sem `AbortSignal.any`.

## Problema

No `sendWithin` (`frontend/src/shared/api/client.ts`), o `setTimeout` do prazo
era criado antes de `AbortSignal.any([...])`, e essa chamada ficava fora do
`try`. O Safari 17.0–17.3 não tem `AbortSignal.any`. Ali, todo GET que recebe
`signal` (os `refresh` dos hooks) lançava `TypeError` em vez de `ApiError`, o
erro escapava da classificação dos hooks e o timer do prazo ficava pendurado.

## Decisões

- **Fallback em vez de declarar suporte mínimo.** Assim nenhum navegador fica
  de fora, e sem custo de dependência: são poucas linhas no próprio cliente,
  sem polyfill de pacote. Sem `AbortSignal.any`, um `AbortController` interno
  aborta quando o `signal` do chamador ou o prazo abortam. Os listeners saem
  no `finally`, porque o `signal` do chamador vive mais que o pedido. O
  fallback só entra quando `AbortSignal.any` não existe.
- **Signal já abortado.** O fallback aborta o controller interno na hora,
  porque o evento `abort` não dispara de novo para um signal que já chegou
  abortado.
- **Ordem.** O sinal combinado nasce antes do `setTimeout`, e o `finally`
  limpa o timer e o vínculo em todo caminho.
- **A classificação não muda.** Só o aborto do prazo vira `ApiTimeoutError`. O
  aborto do chamador continua sendo falha de rede (`ApiError`, `status` nulo).

## Alterações

- `frontend/src/shared/api/client.ts`: `sendWithin` passa a usar
  `linkSignals`/`unlinked` (tipo `LinkedSignal`, com `release`).
- `frontend/src/shared/api/client.test.ts`: o `describe.each` "requestJson
  com signal do chamador" roda os mesmos quatro casos com e sem
  `AbortSignal.any`: aborto do chamador, fim do prazo, signal já abortado e
  `vi.getTimerCount() === 0` em cada um. Mais um caso só do fallback: depois
  da resposta, abortar o chamador não alcança mais o pedido encerrado.

## Comandos e resultados

- Teste vermelho antes da implementação:
  `npx vitest run src/shared/api/client.test.ts` → 4 falhas, todas por
  `TypeError: AbortSignal.any is not a function`, e 47 aprovados.
- Depois da implementação, o mesmo arquivo: 51 aprovados. Cobertura do
  `client.ts`: 100% em instruções (94/94), ramos (35/35), funções (19/19) e
  linhas (91/91).
- Sabotagem do fallback, uma variante por vez, revertida no fim. O
  `client.ts` foi conferido com `diff` contra a cópia de antes:
  1. sem o listener do chamador → falha "o aborto do chamador…" (sem `any`);
  2. sem tratar o signal já abortado → falha "o signal que já chega
     abortado…" (sem `any`);
  3. `release` sem remover o listener do chamador → falha "depois da
     resposta…";
  4. fallback que devolve só o sinal do prazo → falham os casos 1 e 2.
- `make check`, primeira execução: EXIT 2 no `check-web`, porque o Prettier
  reprovou o formato do `client.test.ts`. Corrigido com `prettier --write`.
- `make check`, segunda execução: EXIT 2 no `check-api`. O Vitest passou
  (54 arquivos, 1107 testes); o pytest deu 1 falha e 1672 aprovados. A falha
  foi `tests/integration/test_tutoring_desconexao.py::test_desconectar_no_meio_grava_interrompida`:
  a resposta já estava `falhou` quando o teste esperava `gerando`. Esta
  branch não toca no backend. Rodado isolado 3 vezes, sob a trava: 2
  aprovações e 1 falha. É intermitente e veio da `main`.
- `make check` do hook de commit: ver o corpo do PR.

## Pendências e limitações

- Trocar o `setTimeout` de lugar (de volta para antes do sinal combinado) não
  derruba nenhum teste: com o fallback, nada entre os dois lança. A ordem é
  defensiva e está documentada no comentário do `sendWithin`.
- **Nova (backend, fora do escopo deste PR):**
  `test_desconectar_no_meio_grava_interrompida` falha de forma intermitente
  (1 em 4 execuções nesta máquina, com outros gates rodando em paralelo). A
  causa não foi investigada aqui. Precisa de pendência própria no
  `docs/HANDOFF.md` na próxima consolidação.
- Nenhum teste roda num Safari real: o navegador antigo é simulado apagando
  `AbortSignal.any` no jsdom.
