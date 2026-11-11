# axe-core nos estados transitórios e de falha — 2026-11-11

Revisão-base: `162fc1f` (main). Branch `wt/axe-transitorios`.

Pendência 21/61 do `docs/HANDOFF.md` ("Axe não cobre toda a matriz
transitória de carregando/envio/espera/decisão/stale"): **a parte do axe sobre
os estados transitórios e de falha alcançáveis de forma determinística fica
resolvida por este arquivo**. Continuam pendentes, e a consolidação deve
rebaixar a linha 21/61 em vez de riscá-la: a certificação WCAG AA manual, a
aprovação humana da arte, o contraste em gradientes (`incomplete` do axe) e os
estados listados em "Ficou de fora" abaixo.

## Decisão da coordenação

**Opção escolhida: um spec novo, `frontend/tests/e2e/axe-transitorios.spec.ts`,
com 15 cenários, um axe de conjunto de regras PADRÃO por estado, e o estado
confirmado na tela (testid e texto) antes de cada axe.** Nenhum componente
mudou: o axe não achou violação em nenhum dos estados.

Critério de determinismo (sem `sleep`, sem corrida de tempo), só com os três
mecanismos que os specs existentes já usam:

- **Pedido segurado numa promessa** (`segurando`): o `page.route` segura o
  pedido até o cenário chamar `soltar()`. O estado "em voo" dura exatamente
  isso, e a espera é pelo texto do estado na interface. Mesmo desenho do
  `navigation.spec.ts`.
- **Falha no navegador**: `rota.abort()` (variante `rede`) e
  `rota.fulfill({ status: 503 })` (variante `servidor`), como o cenário de erro
  do `headquarters.spec.ts`. As duas variantes dão textos de falha diferentes.
- **Servidor falso roteirizado** (`definirRoteiro`): resposta cortada e
  avaliação que falha por erro do provedor.

Opções recusadas e por quê:

- *Esperar o estado por tempo (ex.: atrasar a API de verdade)*: recusada;
  corrida de relógio, intermitente por construção.
- *Um helper de axe compartilhado, trocando as 10 cópias locais de
  `new AxeBuilder({ page }).analyze()` dos specs existentes*: recusada; é
  refatoração de specs que não são deste item. O spec novo repete o helper
  local de uma linha (`semViolacoes`), igual a `tutoring.spec.ts` e
  `tracking.spec.ts`.
- *Reduzir o conjunto de regras (`withTags`) para passar*: não foi preciso, e
  seria baixar o limiar.
- *Auditar o estado de falha com cartões antigos já no quadro*: o banco do E2E
  é compartilhado entre specs (pendência 108); os cenários semeados usam o
  sufixo `EXECUCAO` e acham o cartão pelo `id`.

## Estados cobertos (15 cenários)

Quartel-General, leituras (mocks de rota, sem depender do banco):

1. **Carregando**: as quatro regiões de espera ao mesmo tempo
   (`missions-loading`, `cycle-loading`, `progress-loading`,
   `tutor-history-loading`); ao soltar, a tela se completa.
2. **Erro, variante rede**: as cinco leituras falham (`missions-error`,
   `cycle-error`, `progress-error`, `tutor-history-error`,
   `tutor-status-error`); axe; os cinco "Tentar novamente" recuperam.
3. **Erro, variante servidor (503)**: idem.
4. **Vazio**: `missions-empty` (GET `/api/missions` com `[]`).

Campanhas, trilha:

5. **Carregando** (`trail-loading`), 6/7. **Erro** (rede e servidor, com
   `trail-retry` recuperando), 8. **Sem plano** (`trail-no-plan`).

Kairya, tutoria (servidor falso):

9. **Enviando**: POST segurado antes de a pergunta ser gravada; botão
   "Enviando…" desabilitado.
10. **Falha**: resposta cortada no meio, `tutor-failure` (`role="alert"`) e
    "Tentar de novo".
11. **Decidindo**: confirmação da proposta em voo, os dois botões
    desabilitados ("Confirmando…").

Missões (API real, semeadas por HTTP):

12. **Iniciando** em voo, 13. **Concluindo** em voo ("Concluindo a missão…"),
14. **Avaliando** em voo ("A Kairya está avaliando…"),
15. **Avaliação falhou**: `evaluation-error` com `role="alert"`, com o 502 e o
    `code` `provedor_indisponivel` simulados no navegador (ver "Achado" abaixo).

Já estavam cobertos por outros specs e não foram repetidos: erro de carga das
missões (`headquarters.spec.ts`), falha de conclusão com resposta perdida
(`headquarters.spec.ts`), `cycle-stale`/`progress-stale` (`navigation.spec.ts`),
resposta escrevendo, proposta, truncada, recusada, com substituto e Kairya
indisponível (`tutoring.spec.ts`), conclusão com recompensa e avaliação
concluída.

## Achado: falha de verdade na avaliação contamina o banco compartilhado

A primeira versão do cenário 15 provocava a falha pelo falso (400 ao
provedor, 502 da API). O `make check` completo reprovou o cenário (c) do
`tutoring.spec.ts`: uma avaliação que falha de verdade é **gravada** (`falhou`)
no banco compartilhado entre specs (pendência 108), e o cartão dela passa a
mostrar, no quadro de todos os specs seguintes, o botão "Tentar de novo" do
pedido de avaliação, que colidiu (strict mode) com `getByRole('button',
{ name: 'Tentar de novo', exact: true })` do (c). **Decisão da coordenação:**
simular a falha no navegador (`rota.fulfill` 502) em vez de pelo falso, para
não deixar estado persistido que outro spec leia; recusado: editar o seletor
do (c) (spec fora do escopo) e limpar o banco (não há API de remoção). Regra
para os próximos specs: estado de falha que a interface lê de volta do banco
não se provoca pelo servidor real.

## Ficou de fora (registrado, não escondido)

- **Reagendar em voo e falha do reagendamento** (`reschedule-error`): exigem o
  formulário preenchido com data local `datetime-local`; o `tracking.spec.ts`
  já cobre o fluxo, mas o estado em voo não foi acrescentado aqui para não
  inflar o spec. Pendência **P-axe-transitorios-1**.
- **Falhas de decisão da proposta** (`proposal-failure`, `proposal-refresh`) e
  da avaliação com `action: refresh` (`evaluation-reload`): alcançáveis por
  mock de 409/404, mas dependem do texto exato de cada `code`; ficam para um
  incremento próprio. **P-axe-transitorios-2**.
- **`trail-stale`** e **`missions-reload-status`** (recarga com a lista já
  carregada): o stale do ciclo e do progresso já têm axe; o da trilha não.
  **P-axe-transitorios-3**.
- **Limite diário da Kairya e estado desconhecido da resposta**
  (`daily-limit`, `tutor-failure` por `unknown`): dependem de 429/SSE
  interrompido sem `message_stop`; não medidos.
- **Estados em viewport de celular** (390 px): este spec roda só em desktop;
  a folha da tutoria no celular já tem axe em `tutoring.spec.ts` para os
  estados finais.
- **Certificação WCAG AA manual, contraste em gradientes (`incomplete`) e a
  aprovação humana da arte**: continuam fora, como a linha 21/61 já dizia. O
  axe automático não substitui nenhum dos três.

## Verificação

Comandos executados e resultados lidos nesta sessão, no worktree, sob
`lote-off9.lock`, deslocamento de porta 9:

- `make reset-test-db`, `npm run build` (com `VITE_API_URL=/api`) e
  `npx playwright test axe-transitorios.spec.ts --project=chromium`:
  **15 passed (20.1s)** na primeira execução.
- **Sensibilidade do spec (vermelho antes do verde).** Com uma violação
  injetada em `semViolacoes` (um `<img>` sem `alt` acrescentado ao `body`
  antes do `AxeBuilder`), os **15 cenários reprovaram**; o spec foi restaurado
  logo depois. Prova que cada axe audita uma página de verdade e que a
  confirmação do estado não é a única coisa que sustenta o cenário.
- `npx prettier --write`, `npx eslint` e `npx tsc -p tsconfig.e2e.json
  --noEmit` sobre o spec: sem saída (limpos).
- **Repetição (intermitência).** O spec rodou 5 vezes seguidas, cada uma com
  servidores novos (cinco invocações do `npx playwright test`):
  cinco rodadas, todas **15 passed** (14,6 s, 15,6 s, 16,1 s, 16,8 s e 17,7 s),
  nenhuma reprovação nem `flaky`. A trava e o deslocamento 9 foram os mesmos.
- `make check` completo: **EXIT 0** (sob a trava, deslocamento 9); vitest 103 arquivos e 2177 testes
  passed, pytest `1980 passed, 32 subtests passed`, Playwright `138 passed (1.0m)`
  (os 15 cenários novos mais os existentes) e `check-wheel: 4 prompts presentes no
  wheel`. A primeira tentativa do `make check` reprovou o cenário (c) de
  `tutoring.spec.ts` (ver "Achado"); a corrigida passou inteira.

## Limitações

- O spec depende dos textos pt-BR dos estados em voo (`Enviando…`,
  `Concluindo a missão…`, `A Kairya está avaliando…`). Um ajuste de redação
  nesses textos quebra o cenário de propósito: o texto é o que prova qual
  estado está na tela.
- Os cenários de leitura (1 a 8) usam rota de navegador, não o servidor
  derrubado; provam a interface diante da falha, não o comportamento da API
  sob falha.
