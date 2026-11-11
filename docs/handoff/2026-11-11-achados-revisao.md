# Achados menores das revisões dos PRs #85, #86 e #88 — 2026-11-11

Branch `wt/achados-revisao`, revisão-base `e4d1ddd` (main com o #86),
com a `origin/main` em `3210ad0` (main com o #88) trazida por merge.

## Objetivo

Corrigir os achados menores das revisões dos PRs #85 (`wt/abort-any-safari`),
#86 (`wt/relogio-e2e`) e #88 (`wt/testes-sob-carga`). Cada item foi conferido
antes no código da `origin/main`; os que não existem lá ficaram de fora.

## Itens

1. **Feito.** `frontend/src/shared/api/client.ts`: o fallback de
   `AbortSignal.any` (Safari 17.0–17.3) abortava o sinal ligado sem motivo, e
   o `reason` do sinal de quem chamou se perdia. Agora o sinal ligado aborta
   com `caller.aborted ? caller.reason : deadline.reason`, como o
   `AbortSignal.any` nativo, que repassa o motivo da fonte que abortou
   primeiro.
2. **Feito.** `frontend/tests/e2e/cycle.spec.ts`: a cópia local `segundaDe`
   saiu, e o spec usa `segundaDaSemana` de `frontend/tests/e2e/datas.ts`. As
   duas contas dão o mesmo dia (aritmética UTC, segunda como início).
3. **Feito.** `frontend/src/features/missions/RescheduleForm.tsx`: o docblock
   dizia que um `saved` de outro prazo "monta fechado (e sem mexer no foco)",
   sem o porquê. Agora diz que o rascunho foi escrito contra um prazo que já
   não vale, e que montar fechado não devolve o foco porque ninguém fechou
   nada: a devolução é só para o fechamento pelo sucesso. Só comentário.
4. **Feito.** `docs/handoff/2026-11-10-wt-relogio-e2e.md`: a linha do STRIDE
   sobre o relógio fixado que vaza para os specs seguintes dizia
   "Repudiation". É Tampering do estado compartilhado da suíte. Não existe
   teste direto: o texto agora diz que a cobertura é indireta
   (`test_delete_devolve_o_relogio_real` e o 204 conferido no `afterAll`), e
   a falta do teste direto entrou nas limitações daquele arquivo.
5. **Feito.** `docs/handoff/2026-11-10-wt-abort-any-safari.md`: a pendência
   nova (o `test_desconectar_no_meio_grava_interrompida` intermitente) ganhou
   o rótulo `P-abort-any-safari-1`. O `docs/handoff/README.md` também pede o
   nome do arquivo **sem** o prefixo `wt-`
   (`AAAA-MM-DD-<branch-sem-o-prefixo-wt>.md`). Os arquivos já mergeados
   `2026-11-10-wt-abort-any-safari.md`, `2026-11-10-wt-relogio-e2e.md`,
   `2026-11-10-wt-ajustes-revisao.md` e `2026-11-10-wt-fitness-modulos.md`
   fogem dessa regra. Eles **não** foram renomeados: a consolidação os move
   para o `docs/HANDOFF.md` e os apaga, e o nome não muda nada até lá.
6. **Feito.** `tests/integration/test_falso_do_e2e.py` (veio do #88): o
   `Popen` com `stdout=subprocess.PIPE` não fechava o pipe, e o descritor
   ficava aberto até a coleta de lixo, que o acusava com `ResourceWarning`.
   O processo agora roda dentro de `with subprocess.Popen(...)`, que fecha o
   pipe na saída; o `terminate`/`wait(timeout=10)` continua no `finally`.
7. **Feito, só comentário.** `tests/integration/test_anthropic_provider.py`,
   `test_provedor_fora_do_ar_vira_indisponivel`: o `TIMEOUT_FOLGADO` de 30 s
   ficou, com o porquê escrito. No loopback a porta fechada recusa na hora e
   o teste só espera o backoff das tentativas (1,36 s medido); o prazo só
   correria se algo escutasse na porta 9 sem responder, e aí o erro viraria
   `TempoEsgotadoError` e reprovaria o teste de qualquer jeito. Um prazo
   curto não muda o resultado e traria de volta o risco de estouro no
   `connect` sob carga que o #88 tirou.

## Decisões

- Os itens 6 e 7 entraram depois do merge da `origin/main` com o #88, onde o
  código deles nasceu. O merge foi feito sem commit, e as mudanças dos itens
  1–7 foram commitadas no próprio commit de merge: assim o gate rodou uma vez
  só no commit, em vez de uma no commit dos itens 1–5 e outra no merge
  (o hook `pre-merge-commit` também roda o `make check`).
- No item 7, comentário em vez de prazo menor: o teste não ganha nada com o
  prazo curto, e o prazo curto é justamente o que o #88 tirou por estourar
  sob carga.
- O item 6 não ganhou guarda permanente no gate (`filterwarnings =
  error::ResourceWarning` no `pyproject.toml`): ela valeria para a suíte
  inteira e é outro incremento.
- No item 2, só a `segundaDe` saiu, como pedia o achado. O mesmo
  `cycle.spec.ts` ainda tem `diaMes` (igual a `diaEMes`) e um `diaCivil(civil,
  deslocamento)` local (igual a `somarDias`, e com o mesmo nome do
  `diaCivil(instante)` de `datas.ts`, mas outro significado). Ficam
  registrados abaixo.

## Alterações

- `frontend/src/shared/api/client.ts`: o motivo no `linked.abort(...)` do
  fallback e uma frase no docblock de `linkSignals`.
- `frontend/src/shared/api/client.test.ts`: dois casos novos no
  `describe.each` com e sem `AbortSignal.any`: o motivo do aborto do chamador
  durante o pedido e o do signal que já chega abortado chegam ao
  `signal.reason` do `fetch`.
- `frontend/tests/e2e/cycle.spec.ts`, `RescheduleForm.tsx` e os dois
  handoffs, como nos itens acima.

## Comandos e resultados

- Teste vermelho antes da correção:
  `npx vitest run src/shared/api/client.test.ts` → 2 falhas, ambas no modo
  "sem AbortSignal.any", e 53 aprovados. Com `AbortSignal.any` nativo os dois
  casos novos já passavam.
- Depois da correção, o mesmo arquivo: 55 aprovados.
- Item 6, vermelho com o arquivo da `origin/main`:
  `python -X dev -m pytest tests/integration/test_falso_do_e2e.py -k
  sobe_na_porta -W error::ResourceWarning -W
  error::pytest.PytestUnraisableExceptionWarning` → 1 falha
  (`ResourceWarning: unclosed file <_io.TextIOWrapper name=11>`). Com a
  correção, o mesmo comando → 1 aprovado.
- Correção da revisão do #92 (item 6): o `processo.wait(timeout=10)` do
  `finally` podia estourar, e então o `__exit__` do `Popen` chamaria `wait()`
  sem prazo e a suíte travaria. Agora o `TimeoutExpired` é capturado dentro do
  `with`, o processo leva `kill()` e o erro é relançado: o teste reprova em vez
  de travar. O caminho de estouro não tem teste próprio, porque exigiria um
  processo que ignora o `terminate`.
- Correção da revisão do #92 (item 3): a quebra de linha do docblock de
  `RescheduleForm.tsx` cortava a frase "O sucesso muda o prazo (o"; as linhas
  foram refeitas sem mudar o conteúdo.
- Item 7: `pytest tests/integration/test_anthropic_provider.py -k fora_do_ar
  --durations=1` → 1 aprovado, 1,36 s na chamada.
- `make check`: ver o corpo do PR.

## Pendências e limitações

- **`P-achados-revisao-1`**: `cycle.spec.ts` mantém `diaMes` e `diaCivil`
  locais, que duplicam `diaEMes` e `somarDias` de `datas.ts`.
- A troca de `deadline.reason` por `undefined` no fallback não derruba
  nenhum teste. O motivo do prazo é um `DOMException` `AbortError` interno, e
  um `abort()` sem motivo produz outro igual, então quem está de fora não vê
  a diferença.
