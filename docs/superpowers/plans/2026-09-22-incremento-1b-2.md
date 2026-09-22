# Incremento 1b-2 — Plano de Implementação (a tela da Tifa, o E2E e a chamada real)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tifa na tela: um painel no Quartel-General (lateral expansível no desktop, folha no celular) que lê o histórico, envia a pergunta pelo `POST /api/tutoring/messages` e mostra a resposta chegando pelo stream SSE, com o cartão de proposta (Confirmar/Recusar) que cria a missão e recarrega o quadro — mais o E2E contra o servidor falso rodando como processo próprio e a chamada real, única e manual, que grava a camada 3 do falso.

**Architecture:** Feature nova `frontend/src/features/tutoring/`, que importa só de `shared/`. O `shared/api/client.ts` ganha `postStream` (fetch + `ReadableStream` + `TextDecoder`, um gerador assíncrono de eventos SSE), com os erros antes do stream traduzidos em `ApiError` pelo mesmo caminho do `send`. O estado da conversa é uma união discriminada num hook que vive **no topo do painel** (acima dos contêineres de desktop e de celular), para o rascunho e o stream sobreviverem à troca de layout. A página `Headquarters` compõe as duas features: o painel avisa "missão criada" e a página pede a recarga ao `MissionList` por um `ref` (`useImperativeHandle`), que passa pelo `useCompletionRegistry` do Incremento A e portanto espera a conclusão em voo. No E2E, o `ServidorAnthropicFalso` de `tests/integration/provedor_falso.py` sobe como processo próprio na porta **8150**, com um endpoint de controle HTTP; a API do E2E aponta para ele por `FOCUSQUEST_ANTHROPIC_BASE_URL` e recebe uma chave fictícia imposta pelo `scripts/e2e-env.sh`, que recusa subir a API fora do loopback.

**Tech Stack:** React 19.2, TypeScript 6.0, Vite 8.3, Vitest 5.0.1 (jsdom 30), Testing Library 16, Tailwind 4.3, Playwright 1.63 + `@axe-core/playwright` 4.13; no lado Python só `tests/` e `scripts/` mudam (Python 3.14, `anthropic==1.7.0`, pytest 9.1). **Nenhuma dependência nova**, npm ou Python.

**Spec:** `docs/superpowers/specs/2026-09-18-incremento-1b-design.md` (seções "A tela (1b-2)", "Testes → Frontend", "E2E", "A chamada real", "O servidor falso → camada 3", e as "Emendas" do 1b-1). Escopo: **só o 1b-2**. O backend do 1b-1 (`src/focusquest/`) **não muda** neste incremento. Se uma tarefa descobrir que precisa mudar `src/focusquest/`, ela **para** e registra o motivo antes (ver "Pontos de parada").

## Global Constraints

- A `main` é protegida. Trabalho na branch `feat/incremento-1b-2` (já criada a partir de `a795ee7`). **Commit local ao fim de cada tarefa** (autorizado); **push, PR e merge exigem autorização do dono, um passo por vez.** Este plano termina no último commit local.
- **Implementação serial, um implementador por vez.** Cada `git commit` roda o `make check` inteiro pelo `pre-commit`, e o `check-api` e o `check-e2e` usam o mesmo banco `focusquest_test` (a suíte pytest faz `DROP SCHEMA` nele): dois implementadores, ou um `make check` e um commit, ao mesmo tempo, na mesma máquina, reprovam por corrida (pendência 19). Nenhuma tarefa roda em paralelo com outra.
- **Cobertura de 100% no frontend nos quatro eixos** (linhas, ramificações, funções, instruções), fonte de verdade `frontend/vite.config.ts` (`test.coverage.thresholds`). **Nenhuma exclusão nova** em `coverage.exclude`; nada de `/* v8 ignore */`, `/* istanbul ignore */` ou qualquer diretiva de ignorar cobertura. Um arquivo novo em `frontend/src/test/` é infraestrutura de teste (já fora do denominador, pela exclusão existente `src/test/**`) e **não** pode conter código de aplicação.
- Cobertura de 100% no Python continua valendo (`fail_under = 100`); este incremento não acrescenta código em `src/focusquest/`.
- **Nenhum alvo de gate novo.** O trabalho estende `check-web` (Vitest, ESLint, Prettier, `tsc -b`) e `check-e2e` (Playwright); o `check-api` ganha testes novos em `tests/integration/`, sem receita nova. Nenhum job novo no CI.
- **Proibidos, sem exceção:** `--no-verify`, `SKIP`, `|| true` em receita ou script do gate, `continue-on-error`, `test.skip`/`test.only`/`it.skip`/`it.only`/`describe.skip`, `pytest.mark.skip`, limiar reduzido, diretiva de ignorar cobertura, desinstalar ou editar hooks. Se um hook bloquear, corrija a causa.
- **Toda guarda nova precisa de um teste que a faça dizer NÃO, visto reprovando por mutação antes de valer.** Protocolo de mutação (o mesmo do 1b-1): `cp <arquivo> /tmp/fq-mutacao.bak`; aplique a troca indicada; rode o comando e confira que reprova **pelo motivo indicado**; restaure com `cp /tmp/fq-mutacao.bak <arquivo> && rm /tmp/fq-mutacao.bak`; confira com `git diff --stat`. **Nunca** restaure com `git checkout -- <arquivo>` antes do commit (apagaria o trabalho não commitado da tarefa).
- **Dependência nova só com motivo escrito no `docs/HANDOFF.md`** (`AGENTS.md` §4). A expectativa deste plano é **nenhuma**: `postStream` é `fetch` + `ReadableStream` + `TextDecoder`, sem biblioteca de SSE; o layout é Tailwind; o `matchMedia` é do navegador. Se alguma tarefa achar que precisa de uma, **para** e pergunta ao dono.
- **O CI nunca chama a Anthropic e nunca recebe a chave.** Nenhum teste, nem o E2E, alcança `api.anthropic.com`, mesmo com a chave de verdade exportada no ambiente do shell (guarda do `tests/conftest.py`, do 1b-1, e guarda nova do `scripts/e2e-env.sh`, Task 6; o teste de regressão da Task 8 prova as duas com a variável no ambiente). **A chave real mora no Keychain do macOS** (decisão do dono, D-a), nunca no `.env` nem em arquivo do repositório; o agente nunca a vê. A única chamada real é a da Task 8, manual, local, uma vez.
- **Idioma:** interface em pt-BR com acento; chaves de payload, rotas, nomes de evento SSE e `data-testid` em inglês; identificadores TypeScript em inglês (padrão de `features/missions/`); comentários de código em português **sem acento** (padrão vizinho); valores de `code`, `status` e `state` em português, como o backend os grava. A tela **nunca** mostra `code`, `status`, `state` crus nem o `detail` do backend.
- Commits com prefixo convencional, texto em português sem acento, terminando em `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Ao fim de cada tarefa, `make check` com EXIT 0** (o `pre-commit` roda de novo no commit). Na Task 9, duas vezes seguidas.
- `gofmt` do projeto é o Prettier: `npm run format` antes do commit; o `check-web` roda `format:check`.
- Lições do 1a e do A que não voltam: um `Response` de teste não pode ser devolvido duas vezes (o corpo é consumido na primeira leitura — por isso o helper `routeFetch` da Task 3); região viva existe **desde o primeiro render**; o `operation_id` nasce no primeiro clique e mora **acima** do componente que remonta; o nome acessível de um botão repetido diz **qual** item ele afeta; o espaço antes de um `sr-only` fica fora do `span` (medido no A).

## Base e pré-requisitos

- **Base:** `main` em `a795ee7` (merge do PR #10, o 1b-1). Branch: `feat/incremento-1b-2`, já criada.
- **Preparação** (uma vez, antes da Task 0):

```bash
git switch feat/incremento-1b-2
git status --short            # esperado: vazio
make db-up
make migrate-test
make check
```

Esperado: `make check` com EXIT 0. Anote as contagens do resumo (testes do frontend, cobertura, testes do backend, cenários do E2E): a Task 0 as registra como a linha de base do 1b-2.

## Pontos de parada (o implementador para e pergunta ao dono)

1. Qualquer necessidade de mudar `src/focusquest/` (o backend do 1b-1 é contrato fechado deste incremento).
2. Qualquer dependência nova, npm ou Python.
3. Na Task 8, qualquer divergência entre a sequência de tipos de evento da API real e a do falso **além** do `ping` (ver a emenda E3 abaixo). O teste da camada 3 existe para acusar isso; ajustar o falso ou a referência para "passar" sem o dono decidir é exatamente a falha que ela previne.
4. Na Task 8, o item `focusquest-anthropic` não existir no Keychain, ou não passar na conferência de prefixo. Nunca imprima o valor para diagnosticar.

## Decisões que as instruções e a spec não fixavam

| Decisão | Motivo |
|---|---|
| Porta **8150** para o servidor falso do E2E | Fica na faixa 81xx, a mesma da API do E2E (8100), o que a identifica como porta de teste ponta a ponta à primeira vista; não colide com 8000/5173 (desenvolvimento), 8100/5273 (E2E) nem 55432 (PostgreSQL); e não é 8101, que seria o "próximo número" que alguém escolheria por reflexo para outro servidor e confundiria com a API. Não é porta de nenhuma ferramenta comum da máquina de desenvolvimento (8080, 8081, 8443, 8888). Fonte única: `frontend/tests/e2e/servers.ts`. |
| A guarda do E2E é uma **lista de permissão** (host do `anthropic_base_url` em `127.0.0.1`, `localhost` ou `::1`), e não uma recusa de `api.anthropic.com` | Recusar só o host da Anthropic falha **aberto**: um `https://api.anthropic.com.` com ponto final, um IP da Anthropic ou um proxy qualquer passariam. Exigir loopback falha **fechado**: o que não é a máquina local não sobe. O host é lido por `urlsplit(...).hostname`, o que desarma `http://127.0.0.1@api.anthropic.com` (o host é o que vem depois do `@`). |
| O `scripts/e2e-env.sh` **impõe** a chave fictícia (`FOCUSQUEST_ANTHROPIC_API_KEY=e2e-chave-ficticia`), em vez de a receber do Playwright | A chave de verdade chega ao ambiente do E2E por dois caminhos: o `.env` local e o `pre-push`, que exporta toda `FOCUSQUEST_*` do `.env` para o worktree (`docs/QUALITY.md` §6). Impor no script que já é o único caminho de subida da API do E2E fecha os dois de uma vez. O valor não começa com `sk-ant-` de propósito: não imita o formato de uma chave real, e o Gitleaks não tem por que acusá-lo. |
| O URL do falso vem do Playwright (`env` do `webServer` da API), e não do script | A porta mora em `servers.ts`, que o cenário também lê (controle do falso). Escrevê-la de novo no script criaria a segunda cópia que a regra de fonte única proíbe. O script **valida** o que recebeu. |
| O endpoint de controle do falso usa rotas sob `/_control/` e chaves JSON em inglês | É um contrato HTTP (entre o cenário TypeScript e o falso Python), e contrato de payload é em inglês (README §3). O prefixo `/_control/` não colide com `/v1/messages`, a única rota que o SDK usa; qualquer outra rota responde 404, para um SDK mal apontado reprovar alto. |
| O falso do E2E ganha **segurar e liberar** pelo controle (`hold_after_events` + `POST /_control/release`) | É o único jeito determinístico de o axe auditar o estado "escrevendo": com a resposta presa no meio, a tela fica comprovadamente com o texto parcial e a região viva em "Tifa está escrevendo…". O `Roteiro.segurar_apos_eventos` e o `liberar` já existem no falso (1b-1, desconexão); o controle só os expõe. |
| O limite de 4000 caracteres é contado em **pontos de código do texto sem espaços nas pontas** (`Array.from(text.trim()).length`), e não em `text.length` | O backend conta com `len()` do Python depois do `strip_whitespace` (`MessageCreate.content`): pontos de código, não unidades UTF-16. Com `text.length`, um emoji contaria 2 no navegador e 1 no servidor, e a tela recusaria perguntas que o servidor aceita. A constante `MAX_QUESTION_LENGTH` espelha `TAMANHO_MAXIMO_DA_PERGUNTA` à mão (pendência 41 continua aberta; pendência 32 ganha este espelho). |
| O contador de restantes aparece a partir de **3600** caracteres (90% do limite) | "Perto do limite" precisava de um número. 90% dá 400 caracteres de aviso — umas cinco linhas — sem poluir a tela na pergunta comum. Constante `COUNTER_VISIBLE_FROM`, derivada do limite, não escrita por extenso. |
| O `client_message_id` de um reenvio é o da pergunta pendente **se o texto não mudou**; texto editado vira pergunta nova | "Tentar de novo" reenvia a pendente (spec). Mas quem, depois de uma falha, clica em **Enviar** com o mesmo texto está fazendo a mesma pergunta — com um id novo, uma pergunta já gravada (resultado desconhecido) seria duplicada. Texto diferente é outra pergunta, e ganha outro id. A exceção é `operacao_reutilizada`, que pede id novo por definição. |
| O rascunho, o estado do envio e as chaves de confirmação moram no **topo do painel** (`TutorPanel`), não nos componentes que desenham | Desktop e celular desenham a conversa em contêineres diferentes; trocar de layout (girar o tablet, redimensionar a janela) remonta o contêiner. Guardado embaixo, o rascunho se perderia — e o README §7 manda preservar o texto digitado. Mesma lição da pendência 35 (chave acima do cartão). |
| O campo só é limpo se, ao chegar o `user_message`, ele ainda contém a pergunta enviada | A regra do dono é limpar no `user_message`. Se a pessoa começou a digitar a próxima pergunta enquanto a anterior estava "Enviando…", limpar apagaria esse texto novo — o §7 proíbe perder texto digitado. |
| "Tentar de novo" também é oferecido a partir do **histórico**: se a última pergunta do histórico não tem resposta `completa` nem `gerando` depois dela | A spec ("Fora do 1b") diz que recarregar no meio de uma resposta a deixa `interrompida` "e a tela oferece Tentar de novo". Sem derivar do histórico, depois de recarregar a página não haveria botão nenhum. |
| O estado de envio "desconhecido" é um membro próprio da união (`unknown`), separado de `failed` | Pedem textos diferentes: `failed` sabe o que houve (o `code`), `unknown` não sabe se a resposta chegou inteira. Os dois oferecem "Tentar de novo" com o mesmo id. |
| Um evento SSE de nome desconhecido é **ignorado** pelo hook; um quadro SSE malformado (sem `event:`/`data:` ou `data` que não é JSON) **reprova** o stream | O nome desconhecido é compatibilidade para frente (um backend mais novo pode acrescentar evento), e o final continua decidido só por `done`/`error`, então ignorar não esconde resultado: sem final, é `unknown`. O quadro malformado é defeito de protocolo, e continuar lendo depois dele seria adivinhar. |
| `postStream` aceita `AbortSignal`, ao contrário do `postJson` | Abortar o stream é o que acontece quando o painel desmonta (troca de tela no futuro, fechamento da aba); para o servidor, é a desconexão que o 1b-1 grava como `interrompida`, e o reenvio é seguro. O argumento do `postJson` ("cancelar não desfaz a mudança") não se aplica: aqui o cancelamento é parte do contrato. |
| Uma falha de leitura **no meio** do stream vira `ApiError` com o `status` da resposta (200) e `code` `null` | Houve resposta — `status: null` significa "não houve resposta nenhuma" (doc do `ApiError`). Quem decide o que mostrar é o hook, que trata qualquer fim sem `done`/`error` como resultado desconhecido. |
| Formatador do prazo sobe para `frontend/src/shared/lib/deadline.ts` | Passa a ter dois usuários reais (o cartão da missão e o cartão da proposta), que é o critério do `docs/ARCHITECTURE.md` §5 regra 3. Copiar o formatador duplicaria a regra do fuso de São Paulo (README §8), que já custou uma pendência (a 6). `shared/lib/` nasce com este primeiro arquivo legítimo. O "de 5" da dificuldade **não** sobe: é um literal espelhado, e uma terceira cópia fica declarada no comentário e na pendência 32. |
| A recarga do quadro é pedida pela página por `ref` (`useImperativeHandle` no `MissionList`), e não por um contador em prop observado por efeito | Um efeito que chama `setState` ao ver a prop mudar é o padrão que o `react-hooks/set-state-in-effect` reprova no `npm run lint` (medido no 1a, `useMissions.ts`). O `ref` torna a recarga um **evento** (o clique em Confirmar deu certo), que é o que ela é, e passa pelo mesmo `requestReload` do "Atualizar o quadro" — logo espera a conclusão em voo (Incremento A). React 19 aceita `ref` como prop de componente de função; não precisa de `forwardRef`. |
| O retrato é um círculo verde (`bg-emerald-700`, texto branco) com as iniciais "TL", `aria-hidden` | "Verde-mako" não é token do Tailwind; o `emerald-700` com branco tem contraste acima de 4.5:1 (o axe confere no E2E). `aria-hidden` porque o nome "Tifa" já está no título do painel: um leitor de tela leria "TL" como ruído. |
| `lang="pt-BR"` no `index.html` (hoje `lang="en"`) e `interactive-widget=resizes-content` na meta viewport | Um leitor de tela lê "Tifa está escrevendo…" com a voz do idioma declarado; em `en`, a região viva nova seria pronunciada em inglês. O `interactive-widget=resizes-content` faz o Chrome do Android encolher o layout quando o teclado abre, e é o que mantém o campo e o Enviar acima do teclado na folha do celular (README §7). |

## Emendas à spec (decididas pelo dono; escritas na spec na Task 9)

Estes pontos **mudam o que a spec diz**, e por isso não entram como "decisão que a spec não fixava": a Task 9 os escreve na seção "Emendas (1b-2)" da spec, no padrão da seção do 1b-1 (l.445+), com o texto original intocado e a emenda ao lado.

| # | O que a spec dizia | O que vale | Motivo medido |
|---|---|---|---|
| E1 (D-a) | D1: a chave "fica só no `.env` local dele". | A chave mora no **Keychain do macOS** (item `focusquest-anthropic`, conta `$USER`). O dono a grava no próprio terminal com `security add-generic-password -s focusquest-anthropic -a "$USER" -w` (a chave é colada no prompt; o agente nunca a vê). Na chamada real, o processo a recebe só no comando: `FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" ...`. O `.env` continua **sem** chave real, e por isso o `scripts/push-env.sh` não tem o que exportar. | (1) O `check-secrets` roda `gitleaks dir .`, que varre também arquivos ignorados pelo git: medido em 2026-09-22 num repositório descartável, com `.env` no `.gitignore` e uma chave fictícia `sk-ant-api03-...` dentro dele, o Gitleaks 8.30.1 com o `.gitleaks.toml` do projeto deu `leaks found: 1`, EXIT 1 — com a chave no `.env`, todo commit reprovaria. (2) O `pre-push` exporta toda `FOCUSQUEST_*` do `.env` para o worktree do gate (`scripts/push-env.sh`, `docs/QUALITY.md` §6): a chave iria para o ambiente do gate inteiro a cada push. |
| E2 (D-b) | "A chamada real que o dono faz uma vez no 1b-2 grava a sequência de tipos de evento" — uma chamada. | **Duas chamadas reais:** a da tela (roteiro (a)–(c), pelo dono) e a da captura (script `tests/integration/camada3.py`). O script monta a requisição com as mesmas peças de produção (`PERSONA`, `esquema_da_proposta()`, `DESCRICAO_DA_FERRAMENTA`, modelo e `max_tokens` do `Settings`) e lê as linhas cruas pelo `with_streaming_response` (existe no `anthropic` 1.7.0, conferido). | Capturar a chamada da tela exigiria um "modo de captura" em `src/` (a D8 proíbe modo alternativo no código de produção) ou um proxy no `anthropic_base_url` (o roteiro manda "sem override"). |
| E3 | A camada 3 compara "a mesma sequência". | A referência guarda a sequência **bruta** (inclusive `ping`); a comparação retira **só** os eventos que o SDK fixado descarta — hoje `ping` — e um teste lê a fonte do SDK e reprova se ele deixar de descartar. | Medido: o `anthropic` 1.7.0 descarta `ping` (`anthropic/_streaming.py`, `if sse.event == "ping": continue`, duas ocorrências); a API manda, o falso não. Comparar sem retirar reprovaria por um evento que o adaptador nunca vê; retirar tudo o que o falso não emite esconderia o que a camada 3 existe para ver. |
| E4 | E2E: "O estado indisponível". | O indisponível do E2E é produzido por `page.route` sobre `GET /api/tutoring/status` (`{"available": false}`), e não por uma segunda API sem chave. | Uma segunda API pediria mais uma porta, outro `vite preview` e outro `webServer`, para um contrato já provado no pytest (`test_status_indisponivel_sem_chave`, `test_sem_chave_responde_503_e_nao_grava`). O E2E prova a tela: campo desabilitado, texto literal, quadro funcionando, axe. |
| E5 | E2E: quatro cenários. | Um quinto, **(e) celular**: sem rolagem horizontal, Enviar visível na folha aberta, Esc devolve o foco. | O README §7 exige isso no celular, e o jsdom não tem layout: nenhum teste de unidade o mede. O teclado virtual continua não medido (pendência). |

## Contradições encontradas entre as instruções, a spec e o código

| Ponto | O que valia | O que o plano faz |
|---|---|---|
| HANDOFF, revisão-base do 1b-1 | "A implementação vai de `023d251` a `880dd60` — 13 commits". O PR #10 mesclou até `9fb9a8e`: `git log --oneline c7a91a5..9fb9a8e` conta **15** (medido nesta sessão), incluindo `130958c` (a documentação da Task 8) e `9fb9a8e` (a onda final de correção). E "Alterações do Incremento 1b-1" lista a Task 8 dentro de `023d251..880dd60`, mas o commit dela é `130958c`, **depois** de `880dd60`. | Task 0 corrige as duas coisas. |
| HANDOFF, "Resultados" | A última linha de `make check` do 1b-1 é sobre `880dd60`; nada foi medido e registrado sobre `9fb9a8e`. | Task 0 **não** inventa medição sobre `9fb9a8e`: registra o que `gh pr checks 10` mostrar sobre o PR (lido, não suposto) e mede o `make check` da base `a795ee7`. |
| Instrução original da Task 8 (`pbpaste >> .env`) × "Gitleaks segue no gate" | O Gitleaks varre o `.env` ignorado (medido, ver E1). | Resolvida pelo dono com o Keychain (E1). |
| Instrução da Task 6 | "o E2E reprova se a API dele apontar para `api.anthropic.com`". | A guarda é mais estrita: exige loopback (ver a decisão acima). Aponta para `api.anthropic.com` reprova, e qualquer outro host de fora também. |
| Instrução da Task 9 ("a 45 `max_tokens` como completa, que a tela passa a expor") | A pendência 45 é do backend (o `Fim` por `max_tokens` grava `completa`) e o 1b-2 não muda o backend. | Lida como: a 45 **continua aberta** e é atualizada — a partir do 1b-2 a consequência é visível para a pessoa (uma resposta cortada por falta de tokens aparece na tela como inteira, sem marca). Se o dono quis dizer "resolver a 45", isso exige mudar `src/` e é ponto de parada 1. |

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `docs/HANDOFF.md` | correção do 1b-1, revisão-base do 1b-2; depois decisões, alterações, resultados e pendências | 0, 9 (e registros curtos em cada task) |
| `docs/superpowers/plans/2026-09-22-incremento-1b-2.md` | este plano | 0 |
| `frontend/src/shared/api/client.ts` | `open` (o único `fetch`), `send`, `postStream`, `StreamEvent` | 1 |
| `frontend/src/shared/api/client.test.ts` | casos do `postStream` | 1 |
| `frontend/src/test/sse.ts` (novo, infraestrutura de teste) | `sseFrame`, `streamResponse`, `controlledStream` | 1 |
| `frontend/src/features/tutoring/types.ts` | contrato da tutoria como a API o publica; os três tipos de `code` | 2 |
| `frontend/src/features/tutoring/messageFailure.ts` (+ `.test.ts`) | `code` do envio → `{message, recovery}` | 2 |
| `frontend/src/features/tutoring/actionFailure.ts` (+ `.test.ts`) | `code` da decisão → `{message, recovery}` | 2 |
| `frontend/src/features/tutoring/questionLimit.ts` (+ `.test.ts`) | `MAX_QUESTION_LENGTH`, `COUNTER_VISIBLE_FROM`, `describeQuestionLength` | 3 |
| `frontend/src/features/tutoring/useTutorStatus.ts` (+ `.test.tsx`) | `GET /api/tutoring/status` | 3 |
| `frontend/src/features/tutoring/useTutorConversation.ts` (+ `.test.tsx`) | histórico, rascunho, envio, reenvio | 3 |
| `frontend/src/features/tutoring/conversationHistory.ts` (+ `.test.ts`) | funções puras sobre a lista: `appendTurn`, `replaceAction`, `pendingFromHistory` | 3 |
| `frontend/src/test/fetchRoutes.ts` (novo, infraestrutura de teste) | `routeFetch`: um `fetch` falso roteado por método e URL, um `Response` novo por chamada | 3 |
| `frontend/src/test/viewport.ts` (novo, infraestrutura de teste) | `stubViewport('desktop' \| 'mobile')` (o jsdom não tem `matchMedia`) | 4 |
| `frontend/src/features/tutoring/useIsDesktop.ts` (+ `.test.tsx`) | `matchMedia('(min-width: 1024px)')` por `useSyncExternalStore` | 4 |
| `frontend/src/features/tutoring/panelPreference.ts` (+ `.test.ts`) | aberto/fechado no `localStorage`, com `try/catch` | 4 |
| `frontend/src/features/tutoring/TutorPanel.tsx` (+ `.test.tsx`) | o painel: contêiner de desktop e de celular, estados da tabela da spec | 4 |
| `frontend/src/features/tutoring/TutorConversation.tsx` | a conversa desenhada (lista, parcial, falha, campo) — sem estado próprio | 4 |
| `frontend/index.html` | `lang="pt-BR"`, `interactive-widget=resizes-content` | 4 |
| `frontend/src/shared/lib/deadline.ts` (+ `.test.ts`) | `formatDeadline` em `America/Sao_Paulo` (sai do `MissionList`) | 5 |
| `frontend/src/features/tutoring/useActionKeys.ts` (+ `.test.tsx`) | `operation_id` por ação, acima dos cartões | 5 |
| `frontend/src/features/tutoring/useDecideAction.ts` (+ `.test.tsx`) | Confirmar e Recusar | 5 |
| `frontend/src/features/tutoring/ProposalCard.tsx` (+ `.test.tsx`) | o cartão e seus estados | 5 |
| `frontend/src/features/missions/MissionList.tsx` (+ teste) | aceita `ref` com `reload()`; usa `formatDeadline` | 5 |
| `frontend/src/pages/Headquarters.tsx` (+ teste) | compõe o quadro e o painel; recarga pelo `ref` | 4, 5 |
| `frontend/src/App.test.tsx`, `frontend/src/main.test.tsx` | passam a usar `routeFetch` e `stubViewport` (a página agora busca três recursos) | 4 |
| `tests/integration/provedor_falso.py` | `_Tratador` vira `TratadorDoFalso`; porta e tratador configuráveis | 6 |
| `tests/integration/falso_do_e2e.py` (novo) | o falso como processo, com `/_control/*` | 6 |
| `tests/integration/test_falso_do_e2e.py` (novo) | o controle e o processo | 6 |
| `scripts/e2e-env.sh` | chave fictícia imposta; recusa `anthropic_base_url` fora do loopback | 6 |
| `tests/integration/test_e2e_env.py` | casos da guarda nova | 6 |
| `frontend/tests/e2e/servers.ts` | `FALSO_URL` (8150) | 6 |
| `frontend/playwright.config.ts` | terceiro `webServer`; `env` da API | 6 |
| `frontend/tests/e2e/falso.ts` (novo) | cliente do controle do falso para os cenários | 6 |
| `frontend/tests/e2e/tutoring.spec.ts` (novo) | cenários (a)–(e) | 7 |
| `tests/integration/camada3.py` (novo) | `sequencia_de_tipos`, `comparavel`, e a captura real (`python -m`) | 8 |
| `tests/integration/referencia_da_api_real.json` (novo) | a sequência gravada, sem conteúdo | 8 |
| `tests/integration/test_camada3.py` (novo) | o falso emite a mesma sequência; a captura recusa endereço que não é a API real | 8 |
| `tests/unit/test_config.py` | regressão: a guarda da suíte vale com a chave exportada no ambiente | 8 |
| `docs/superpowers/specs/2026-09-18-incremento-1b-design.md` | seção "Emendas (1b-2)" (E1–E5) | 9 |
| `docs/QUALITY.md` | §3 (arquivos novos de `src/test/`), §4 (E2E com o falso, contagem de linhas), §9 (camada 3) | 9 |
| `docs/ARCHITECTURE.md` | árvore, feature `tutoring`, `shared/lib/`, árvore de testes (pendência 48) | 9 |

---

### Task 0: Corrigir o registro do 1b-1 e abrir a revisão-base do 1b-2

**Objetivo:** o `docs/HANDOFF.md` passa a dizer a verdade sobre o 1b-1 publicado e declara a base do 1b-2. Só documentação; mesmo assim, `make check` (o `AGENTS.md` §3 vale para mudança que só toca documentação).

**Files:**
- Modify: `docs/HANDOFF.md` (seção "Revisão-base", l.~63-84; "Alterações do Incremento 1b-1", l.~381-421; "Resultados", l.~450-466; "Próximo incremento", l.~930-978)
- Create (já existe no disco, sem commit): `docs/superpowers/plans/2026-09-22-incremento-1b-2.md` (este plano)

**Interfaces:** nenhuma de código.

- [ ] **Step 1: Medir o que vai ser escrito (nada é escrito de memória)**

```bash
git log --oneline c7a91a5..9fb9a8e | wc -l          # esperado: 15
git log --oneline c7a91a5..9fb9a8e | tail -1        # esperado: 023d251 docs: plano do incremento 1b-1...
git log -1 --format='%H %P' a795ee7                 # os dois pais: c7a91a5... e 9fb9a8e...
gh pr view 10 --json state,mergedAt,mergeCommit,headRefOid
gh pr checks 10
```

Anote a saída de `gh pr view 10` e `gh pr checks 10` **como veio**. Se `gh` não estiver autenticado ou a rede falhar, registre "não conferido nesta sessão" no lugar — não suponha.

- [ ] **Step 2: Reescrever o parágrafo da revisão-base do 1b-1**

Substitua os dois parágrafos que começam em "**Incremento 1b-1 — o backend da Tifa.**" e "**Estado de publicação: não publicado.**" por:

```markdown
**Incremento 1b-1 — o backend da Tifa.** Branch `feat/incremento-1b-1`,
aberta a partir de `c7a91a5` (a `main` naquele momento, com a spec do 1b já
mesclada). A branch vai de `023d251` a `9fb9a8e` — **15 commits**, contados
com `git log c7a91a5..9fb9a8e`: o plano (`023d251`), sete commits de
feature/teste das Tasks 1 a 7, cinco commits de correção de revisão
(`1542a78`, `acfbb46`, `e208a7b`, `696a51d`, `880dd60`), a documentação da
Task 8 (`130958c`) e a onda final de correção da revisão da branch
(`9fb9a8e`). Spec em
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`, com a seção
"Emendas (2026-09-19, execução do 1b-1)"; plano em
`docs/superpowers/plans/2026-09-19-incremento-1b-1.md`.

**Estado de publicação: publicado pelo PR #10, mesclado por merge commit em
`a795ee7`; estado atual em `gh pr view 10`.** (Registro anterior, corrigido
no 1b-2: este parágrafo dizia "não publicado" e contava 13 commits até
`880dd60`; os dois últimos commits da branch não tinham entrado na conta.)
```

E troque a frase "que ainda não começou" do parágrafo seguinte ("O 1b-1 é só o backend: ...") por "que começou em `a795ee7` (ver abaixo)".

- [ ] **Step 3: Abrir a revisão-base do 1b-2, no topo da seção "Revisão-base"**

Acrescente, **antes** do parágrafo do Incremento A:

```markdown
**Incremento 1b-2 — a tela da Tifa, o E2E e a chamada real.** Branch
`feat/incremento-1b-2`, aberta a partir de `a795ee7` (a `main`: o merge do
PR #10, o 1b-1). Spec em
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md` (seções "A tela
(1b-2)", "E2E", "A chamada real" e a camada 3 do servidor falso); plano em
`docs/superpowers/plans/2026-09-22-incremento-1b-2.md`. **Estado de
publicação: não publicado.** Push, PR e merge exigem autorização do dono, um
passo de cada vez; quando mesclado, esta linha passa ao padrão "publicado
pelo PR #N, mesclado por `<forma>`; estado atual em `gh pr view N`".
```

- [ ] **Step 4: Corrigir "Alterações do Incremento 1b-1"**

- Troque "Commits `023d251`..`880dd60`, backend só" por "Commits `023d251`..`9fb9a8e` (15), backend só".
- No item "**Documentação (Task 8):**", acrescente ao fim: "Commit `130958c`."
- Acrescente um item novo ao fim da lista:

```markdown
- **Onda final de correção da revisão da branch (`9fb9a8e`):**
  `context._mensagens` descarta a mensagem sem texto antes de fundir papéis
  (uma `completa` vazia quebraria toda resposta seguinte: a API recusa
  mensagem sem conteúdo); `service.transmitir` move o `yield PerguntaGravada`
  para dentro do bloco guardado, e fechar o gerador nesse `yield` passa a
  gravar `interrompida`; comentário de `FOLGA_DO_ORFAO` corrigido;
  `Conversa.mission_ids` removido do `conftest` (morto); a frase do
  `docs/ARCHITECTURE.md` §3 sobre os valores de `role`/`status`/`state`
  corrigida; a contagem de commits de correção (cinco), o trailer
  `Co-Authored-By` e as pendências 45 a 48 registrados aqui.
```

- [ ] **Step 5: Corrigir "Resultados"**

Rode `make check` agora, com as edições dos Steps 2-4 na árvore, e leia o resumo. Acrescente duas linhas ao fim da tabela, com os valores lidos no Step 1 e neste `make check` (nada de memória):

```markdown
| `gh pr checks 10` (PR do 1b-1, topo `9fb9a8e`), lido em 2026-09-22 | <o que o comando mostrou, job por job; ou "não conferido nesta sessão"> |
| `make check` sobre a base do 1b-2 (`a795ee7`, com este registro por cima) | <EXIT; testes e cobertura do frontend; testes e cobertura do backend; cenários do E2E; Gitleaks — como o resumo imprimiu> |
```

Se `gh pr checks 10` mostrar o `quality-gate` verde, a linha diz isso **e só isso**: é a evidência de que `9fb9a8e` passou no CI; não há `make check` local registrado sobre ele.

- [ ] **Step 6: Ajustar "Próximo incremento"**

- No item "**1b — a Tifa**": troque "**1b-1 (backend) entregue** (ver "Alterações do Incremento 1b-1"), não publicado ("Revisão-base"). **1b-2 (frontend, E2E e a chamada real) é o próximo.**" por "**1b-1 (backend) entregue e publicado pelo PR #10** (ver "Revisão-base"). **1b-2 (frontend, E2E e a chamada real) em andamento** na branch `feat/incremento-1b-2`, pelo plano `docs/superpowers/plans/2026-09-22-incremento-1b-2.md`."
- No parágrafo "**Incremento 1b-2** — ...", acrescente ao fim: "Começou em `a795ee7`; o plano fixa as decisões que a spec não fixava."

- [ ] **Step 7: Gate e commit**

```bash
make check
git add docs/HANDOFF.md docs/superpowers/plans/2026-09-22-incremento-1b-2.md
git commit -m "docs: plano do incremento 1b-2 e correcao do registro de publicacao do 1b-1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Nenhum marcador `<...>` pode chegar ao commit: `grep -n '<o que\|<EXIT' docs/HANDOFF.md` tem de sair vazio. O `pre-commit` roda o `make check` de novo no commit e confirma a medição.

**Critério de pronto:** `make check` EXIT 0; `git log -1` mostra o commit; `grep -n "13 commits" docs/HANDOFF.md` não encontra mais a contagem antiga no parágrafo do 1b-1; `grep -n "não publicado" docs/HANDOFF.md` aparece só no parágrafo do 1b-2.

**Registrar no HANDOFF:** é a própria tarefa.

---

### Task 1: `postStream` no cliente HTTP

**Objetivo:** uma função no cliente único que faz o `POST` do stream e entrega os eventos SSE um a um, com a mesma tradução de erro do `send` antes do stream. É o único lugar da aplicação que lê um corpo em pedaços.

**Files:**
- Modify: `frontend/src/shared/api/client.ts`
- Modify: `frontend/src/shared/api/client.test.ts`
- Create: `frontend/src/test/sse.ts` (infraestrutura de teste, fora do denominador pela exclusão existente `src/test/**`)

**Interfaces:**
- Produces:
  - `export interface StreamEvent { event: string; data: unknown }`
  - `export function postStream(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<StreamEvent, void, undefined>`
  - Erros: antes do stream, `ApiError` idêntico ao do `send` (`status`, `code` lido do corpo JSON; rede → `status: null`); no meio do stream, `ApiError('A resposta foi interrompida no caminho.', <status da resposta>, null, { cause })`; quadro malformado, `ApiError('A resposta chegou num formato inesperado.', <status>, null, { cause })`. Stream que termina limpo: o gerador termina (quem decide se faltou o `done` é o chamador).
  - Em `src/test/sse.ts`: `sseFrame(event: string, data: unknown): string`, `streamResponse(chunks: string[], init?: ResponseInit): Response`, `controlledStream(): { response: Response; push(text: string): void; close(): void; fail(error: unknown): void }`.

- [ ] **Step 1: A infraestrutura de teste do SSE**

`frontend/src/test/sse.ts`:

```ts
/**
 * Pecas para testar o stream SSE sem rede.
 *
 * Mora em `src/test/` porque e infraestrutura de teste (fora do denominador da
 * cobertura, `docs/QUALITY.md` §3), e e usada por mais de um arquivo de teste:
 * o do cliente e os dos hooks da tutoria.
 */

const encoder = new TextEncoder()

/** Um quadro SSE no formato exato do backend (`tutoring/sse.py`). */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Uma resposta cujo corpo chega nos pedacos dados, na ordem, e termina.
 *
 * Os pedacos sao texto; cada um vira UM `enqueue`. E o que deixa o teste
 * partir um evento ao meio, ou juntar varios num pedaco so.
 */
export function streamResponse(chunks: string[], init?: ResponseInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  })
}

/** Uma resposta cujo corpo o teste alimenta aos poucos. */
export function controlledStream(): {
  response: Response
  push: (text: string) => void
  close: () => void
  fail: (error: unknown) => void
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    push: (text) => {
      controller.enqueue(encoder.encode(text))
    },
    close: () => {
      controller.close()
    },
    fail: (error) => {
      controller.error(error)
    },
  }
}

/** Os bytes UTF-8 de um texto, para partir um caractere de varios bytes. */
export function bytesOf(text: string): Uint8Array {
  return encoder.encode(text)
}
```

(`bytesOf` existe para o caso "caractere de dois bytes partido": o teste monta o `ReadableStream` com `Uint8Array` cortados no meio do `é`.)

- [ ] **Step 2: Escrever os testes que falham**

Acrescente a `frontend/src/shared/api/client.test.ts`, dentro do `describe('client', ...)` (mesmo padrão de `loadClient()` e `failureOf()` do arquivo):

```ts
  describe('postStream', () => {
    /** Consome o gerador inteiro e devolve os eventos. */
    async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
      const all: unknown[] = []
      for await (const event of events) {
        all.push(event)
      }
      return all
    }

    it('faz POST em JSON, pede text/event-stream e repassa o AbortSignal', async () => {
      const fetchMock = vi.fn().mockResolvedValue(streamResponse([]))
      vi.stubGlobal('fetch', fetchMock)
      const { postStream } = await loadClient()
      const controller = new AbortController()

      await collect(postStream('/tutoring/messages', { content: 'oi' }, controller.signal))

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/tutoring/messages')
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{"content":"oi"}')
      expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream')
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
      expect(init.signal).toBe(controller.signal)
    })

    it('entrega varios eventos que chegam num pedaco so, na ordem', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          streamResponse([sseFrame('delta', { text: 'a' }) + sseFrame('delta', { text: 'b' })]),
        ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'delta', data: { text: 'a' } },
        { event: 'delta', data: { text: 'b' } },
      ])
    })

    it('remonta um evento partido entre pedacos, inclusive no meio do separador', async () => {
      const frame = sseFrame('done', { id: 7 })
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([frame.slice(0, 5), frame.slice(5, -1), frame.slice(-1)]),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([{ event: 'done', data: { id: 7 } }])
    })

    it('remonta um caractere de varios bytes partido entre pedacos', async () => {
      // `é` e dois bytes em UTF-8. Um `TextDecoder` sem `{ stream: true }`
      // trocaria as duas metades por U+FFFD.
      const bytes = bytesOf(sseFrame('delta', { text: 'é' }))
      const corte = bytes.indexOf(0xc3) + 1
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes.slice(0, corte))
          c.enqueue(bytes.slice(corte))
          c.close()
        },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'delta', data: { text: 'é' } },
      ])
    })

    it('termina sem erro quando o stream acaba sem done nem error', async () => {
      // Resultado desconhecido: o cliente nao sabe o que e `done`. Quem decide
      // que faltou o final e o hook da tutoria (spec, "O stream").
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(streamResponse([sseFrame('user_message', { id: 1 })])),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'user_message', data: { id: 1 } },
      ])
    })

    it('descarta o quadro incompleto no fim do stream', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            streamResponse([sseFrame('delta', { text: 'a' }), 'event: delta\ndata: {"te']),
          ),
      )
      const { postStream } = await loadClient()

      expect(await collect(postStream('/x', {}))).toEqual([
        { event: 'delta', data: { text: 'a' } },
      ])
    })

    it.each([
      [503, 'provedor_nao_configurado'],
      [409, 'mensagem_em_andamento'],
      [409, 'operacao_reutilizada'],
    ])('um %i antes do stream vira ApiError com o code %s', async (status, code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'x', code }, { status })),
      )
      const { ApiError, postStream } = await loadClient()

      const error = await failureOf(collect(postStream('/x', {})))

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status, code, message: `O servidor respondeu ${String(status)}.` })
    })

    it('um 422 sem code vira ApiError com code null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: [] }, { status: 422 })),
      )
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 422,
        code: null,
      })
    })

    it('a falha de rede vira ApiError sem status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: null,
        code: null,
        message: 'Não foi possível falar com o servidor.',
      })
    })

    it('o AbortSignal cancela o pedido, e o erro carrega a causa', async () => {
      // O `fetch` de verdade rejeita com AbortError quando o sinal aborta.
      // O stub reproduz isso, e o teste confere que a causa nao se perde: o
      // hook decide por `signal.aborted`, e nao pelo tipo do erro.
      const abortError = new DOMException('Aborted', 'AbortError')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init: RequestInit) => {
          expect(init.signal?.aborted).toBe(true)
          return Promise.reject(abortError)
        }),
      )
      const { postStream } = await loadClient()
      const controller = new AbortController()
      controller.abort()

      const error = await failureOf(collect(postStream('/x', {}, controller.signal)))

      expect(error).toMatchObject({ status: null, cause: abortError })
    })

    it('a queda no meio do stream vira ApiError com o status da resposta', async () => {
      const stream = controlledStream()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream.response))
      const { postStream } = await loadClient()
      const events = postStream('/x', {})

      stream.push(sseFrame('user_message', { id: 1 }))
      expect(await events.next()).toEqual({
        done: false,
        value: { event: 'user_message', data: { id: 1 } },
      })
      stream.fail(new TypeError('network error'))

      expect(await failureOf(events.next())).toMatchObject({
        status: 200,
        code: null,
        message: 'A resposta foi interrompida no caminho.',
      })
    })

    it.each([
      ['sem a linha event', 'data: {}\n\n'],
      ['sem a linha data', 'event: delta\n\n'],
      ['com data que nao e JSON', 'event: delta\ndata: {nao e json\n\n'],
    ])('um quadro %s reprova o stream', async (_caso, quadro) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([quadro])))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 200,
        message: 'A resposta chegou num formato inesperado.',
      })
    })

    it('uma resposta 200 sem corpo reprova como formato inesperado', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
      const { postStream } = await loadClient()

      expect(await failureOf(collect(postStream('/x', {})))).toMatchObject({
        status: 200,
        message: 'A resposta chegou num formato inesperado.',
      })
    })

    it('parar de consumir no meio cancela a leitura do corpo', async () => {
      // Sem o cancelamento, a conexao ficaria aberta ate o servidor terminar
      // -- e o servidor so grava `interrompida` quando a conexao cai.
      const onCancel = vi.fn()
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytesOf(sseFrame('delta', { text: 'a' })))
        },
        cancel: onCancel,
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
      const { postStream } = await loadClient()

      for await (const event of postStream('/x', {})) {
        expect(event).toEqual({ event: 'delta', data: { text: 'a' } })
        break
      }

      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })
```

Imports no topo do arquivo: `import { bytesOf, controlledStream, sseFrame, streamResponse } from '../../test/sse'`.

(O último caso afirma o cancelamento pelo efeito observável na fonte do corpo: o `cancel` do `ReadableStream` é chamado quando o consumidor sai do `for await` no meio.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/shared/api/client.test.ts`
Expected: FAIL — `postStream` não é exportado (`TypeError: postStream is not a function`). Se algum caso falhar por **ambiente** (por exemplo, `TextDecoder` ou `ReadableStream` ausente no jsdom), pare: é medição, não implementação — registre e resolva antes de seguir (o Node 24 os expõe como globais; o esperado é que existam).

- [ ] **Step 4: Implementar**

Em `frontend/src/shared/api/client.ts`, troque `send` por `open` + `send` e acrescente `postStream` ao fim. O comentário do topo do arquivo passa a dizer "o unico `fetch` da aplicacao e `open`".

```ts
/**
 * Faz o pedido e devolve a resposta JA conferida: rede fora e status de erro
 * viram `ApiError` aqui. E o unico `fetch` da aplicacao.
 *
 * Separado de `send` porque o stream da tutoria precisa da resposta ANTES de
 * ler o corpo: os erros antes do stream (503, 409, 422) tem de sair iguais aos
 * de qualquer outro pedido, e o corpo de um 200 e lido em pedacos.
 */
async function open(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor.', null, null, { cause })
  }

  if (!response.ok) {
    const code = await readCode(response)
    throw new ApiError(`O servidor respondeu ${String(response.status)}.`, response.status, code)
  }

  return response
}

/**
 * Faz o pedido e devolve o JSON do corpo. (Doc anterior de `send` mantida:
 * o tipo `T` e afirmacao de quem chama, nao validacao.)
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  const response = await open(path, init)
  return (await response.json()) as T
}
```

E, ao fim do arquivo:

```ts
/** Um evento do stream SSE, com o `data` ja desserializado. */
export interface StreamEvent {
  event: string
  data: unknown
}

/** O separador de quadros do SSE que o backend escreve (`tutoring/sse.py`). */
const FRAME_SEPARATOR = '\n\n'

/**
 * Le um quadro `event: X\ndata: <json numa linha>`.
 *
 * Estrito de proposito: o backend so escreve este formato, e um quadro que
 * foge dele e defeito de protocolo. Continuar lendo depois dele seria
 * adivinhar o que o servidor quis dizer.
 */
function parseFrame(frame: string): StreamEvent {
  let event: string | null = null
  let data: string | null = null
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice('event: '.length)
    } else if (line.startsWith('data: ')) {
      data = line.slice('data: '.length)
    }
  }
  if (event === null || data === null) {
    throw new SyntaxError('quadro SSE sem as linhas event e data')
  }
  return { event, data: JSON.parse(data) as unknown }
}

/**
 * Faz um POST em `path` e entrega, um a um, os eventos SSE da resposta.
 *
 * `fetch` e `ReadableStream`, e nao `EventSource`: o `EventSource` so faz GET,
 * e o stream da tutoria e a resposta de um POST (spec do 1b, "Reuso do
 * Incremento A").
 *
 * Tres jeitos de terminar, e o chamador distingue os tres:
 *
 * - **erro antes do stream** (rede, 503, 409, 422): `ApiError` identico ao do
 *   `postJson`, lancado no primeiro `next()`. Nada foi gravado no servidor.
 * - **o stream acaba**: o gerador termina. Se o ultimo evento nao foi `done`
 *   nem `error`, o resultado e DESCONHECIDO -- quem sabe disso e o hook, nao
 *   este cliente, que nao conhece os nomes dos eventos.
 * - **a leitura cai no meio**: `ApiError` com o `status` da resposta (houve
 *   resposta, entao nao e `null`) e `code` `null`. Tambem e resultado
 *   desconhecido para o hook.
 *
 * Recebe `AbortSignal`, ao contrario do `postJson`: abortar o stream e a
 * desconexao que o backend grava como `interrompida`, e o reenvio com o mesmo
 * `client_message_id` e seguro. Parar de consumir o gerador (um `break`)
 * cancela a leitura do corpo, pelo mesmo motivo.
 *
 * O `TextDecoder` decodifica com `{ stream: true }`: um caractere de varios
 * bytes partido entre dois pedacos da rede so e montado assim.
 */
export async function* postStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, undefined> {
  const response = await open(path, {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (response.body === null) {
    throw new ApiError('A resposta chegou num formato inesperado.', response.status, null)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (cause) {
        throw new ApiError('A resposta foi interrompida no caminho.', response.status, null, {
          cause,
        })
      }
      if (chunk.done) {
        // O que sobrou no buffer e um quadro que a rede cortou no meio: sem o
        // separador, nao ha evento para entregar.
        return
      }
      buffer += decoder.decode(chunk.value, { stream: true })
      let end = buffer.indexOf(FRAME_SEPARATOR)
      while (end !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + FRAME_SEPARATOR.length)
        let event: StreamEvent
        try {
          event = parseFrame(frame)
        } catch (cause) {
          throw new ApiError('A resposta chegou num formato inesperado.', response.status, null, {
            cause,
          })
        }
        yield event
        end = buffer.indexOf(FRAME_SEPARATOR)
      }
    }
  } finally {
    // Cancelar num stream ja terminado nao faz nada; num stream que caiu,
    // rejeita com o erro da queda -- que ja foi traduzido acima.
    await reader.cancel().catch(() => undefined)
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/shared/api/client.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 6: Mutações (cada uma reprova pelo motivo indicado)**

1. Troque `decoder.decode(chunk.value, { stream: true })` por `decoder.decode(chunk.value)`. Run o arquivo. Expected: FAIL em "remonta um caractere de varios bytes" (`'��'` no lugar de `'é'`).
2. Troque o `while (end !== -1)` por `if (end !== -1)`. Expected: FAIL em "entrega varios eventos que chegam num pedaco so" (só o primeiro chega).
3. No `open`, troque `if (!response.ok)` por `if (response.status >= 500)`. Expected: FAIL nos casos `409` e `422` com `Error: a chamada deveria ter falhado` (do `failureOf`): o corpo JSON do erro passa a ser lido como stream, não tem o separador `\n\n`, nenhum quadro sai e o gerador termina limpo — o erro some em vez de virar `ApiError` com o `code`.
4. Apague o bloco `finally { await reader.cancel()... }`. Expected: FAIL em "parar de consumir no meio cancela a leitura do corpo".
5. Troque, em `parseFrame`, o `throw new SyntaxError(...)` por `return { event: event ?? 'message', data: data === null ? null : JSON.parse(data) }`. Expected: FAIL nos casos "sem a linha event" e "sem a linha data".

- [ ] **Step 7: Cobertura, gate e commit**

```bash
cd frontend && npm run test:coverage   # resumo: 100% nos quatro eixos
cd .. && make check
git add frontend/src/shared/api/client.ts frontend/src/shared/api/client.test.ts frontend/src/test/sse.ts
git commit -m "feat(tutoria): postStream no cliente HTTP, com fetch e ReadableStream

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** o arquivo de teste passa; cobertura 100% nos quatro eixos (leia o `Coverage summary`, não a tabela — `docs/QUALITY.md` §3, armadilha de leitura); as cinco mutações vistas reprovando; `make check` EXIT 0; commit local feito.

**Registrar no HANDOFF** (seção "Alterações do Incremento 1b-2", criada aqui, e completada na Task 9): "**Task 1** — `postStream` (commit `<sha>`): as três formas de terminar; `open` passou a ser o único `fetch`; `src/test/sse.ts`." E, em "Decisões", a linha do `AbortSignal` e a do quadro malformado (da tabela de decisões deste plano).

---

### Task 2: Tipos da tutoria e os dois mapas exaustivos de falha

**Objetivo:** o contrato da tutoria no frontend, como a API o publica, e a tradução de **todo** `code` que a tela pode receber em `{message, recovery}` — no padrão de `features/missions/completionFailure.ts`: `Record` sobre a união (um `code` novo reprova o `tsc` até ganhar texto e ação), `Object.hasOwn` (e não `in`), e um genérico para o desconhecido.

**Files:**
- Create: `frontend/src/features/tutoring/types.ts`
- Create: `frontend/src/features/tutoring/messageFailure.ts`, `messageFailure.test.ts`
- Create: `frontend/src/features/tutoring/actionFailure.ts`, `actionFailure.test.ts`

**Interfaces:**
- Consumes: `ApiError` de `shared/api/client`.
- Produces (`types.ts`):
  - `MessageRole = 'user' | 'tutor'`; `MessageStatus = 'gerando' | 'completa' | 'interrompida' | 'falhou'`; `ActionState = 'proposta' | 'executada' | 'recusada' | 'falhou'`
  - `MissionProposal { instructions: string; completion_criterion: string; difficulty: number; estimated_minutes: number; deadline: string }`
  - `ActionRead { id: number; kind: 'create_mission'; state: ActionState; payload: MissionProposal; mission_id: number | null; error_code: string | null }`
  - `MessageRead { id: number; role: MessageRole; content: string; status: MessageStatus; client_message_id: string | null; reply_to_id: number | null; error_code: string | null; created_at: string; actions: ActionRead[] }`
  - `CreatedMission { id: number; instructions: string }`; `ConfirmRead { action: ActionRead; mission: CreatedMission }`; `RejectRead { action: ActionRead }`; `StatusRead { available: boolean }`
  - `PreStreamErrorCode = 'provedor_nao_configurado' | 'mensagem_em_andamento' | 'operacao_reutilizada'`
  - `StreamErrorCode = 'provedor_indisponivel' | 'tempo_esgotado' | 'proposta_invalida'`
  - `ActionErrorCode = 'operacao_reutilizada' | 'transicao_ilegal' | 'prazo_expirado' | 'acao_nao_encontrada'`
- Produces (`messageFailure.ts`):
  - `MessageRecovery = 'retry' | 'retry-with-new-id' | 'edit' | 'unavailable'`
  - `MessageFailure { message: string; recovery: MessageRecovery }`
  - `describePreStreamFailure(error: unknown): MessageFailure`
  - `describeStreamFailure(code: string): MessageFailure`
  - `UNKNOWN_RESULT: MessageFailure` (o stream que termina sem final, ou cai no meio)
- Produces (`actionFailure.ts`):
  - `ActionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh' | 'expired'`
  - `ActionFailure { message: string; recovery: ActionRecovery }`
  - `describeActionFailure(error: unknown, attempted: 'confirm' | 'reject'): ActionFailure`

**Os textos, fixados aqui** (os testes os afirmam literalmente; a Task 4 e a Task 7 também):

| Origem | `code` | `message` | `recovery` |
|---|---|---|---|
| antes do stream | `provedor_nao_configurado` (503) | `A Tifa está fora do ar: falta configurar o provedor.` (o texto da spec) | `unavailable` |
| antes do stream | `mensagem_em_andamento` (409) | `A Tifa ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.` | `retry` |
| antes do stream | `operacao_reutilizada` (409) | `Não foi possível registrar esta pergunta. Tente de novo.` | `retry-with-new-id` |
| antes do stream | 422 sem `code` | `A pergunta não foi aceita. Confira o texto e envie de novo.` | `edit` |
| antes do stream | rede, 5xx, `code` desconhecido | = `UNKNOWN_RESULT` | `retry` |
| no stream | `provedor_indisponivel` | `A Tifa não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.` | `retry` |
| no stream | `tempo_esgotado` | `A resposta da Tifa demorou demais. Tentar de novo é seguro: a pergunta não será duplicada.` | `retry` |
| no stream | `proposta_invalida` | `A Tifa tentou propor uma missão que não passou na validação. Tente de novo ou peça de outro jeito.` | `retry` |
| no stream | `code` desconhecido | = `UNKNOWN_RESULT` | `retry` |
| sem final | — | `UNKNOWN_RESULT`: `Não deu para saber se a resposta chegou inteira. Tentar de novo é seguro: a pergunta não será duplicada.` | `retry` |
| decisão | `operacao_reutilizada` | `Não foi possível registrar esta tentativa. Tente de novo.` | `retry-with-new-operation` |
| decisão | `transicao_ilegal` | `Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.` | `refresh` |
| decisão | `acao_nao_encontrada` | `Esta proposta não existe mais. Atualize a conversa para ver o estado atual.` | `refresh` |
| decisão | `prazo_expirado` (422) | `O prazo desta proposta já passou. Peça à Tifa uma nova proposta.` | `expired` |
| decisão, confirmar | rede, 5xx, 422 sem `code`, desconhecido | `Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.` | `retry` |
| decisão, recusar | rede, 5xx, 422 sem `code`, desconhecido | `Não foi possível recusar a proposta. Tentar de novo é seguro.` | `retry` |

- [ ] **Step 1: Escrever os testes que falham**

`frontend/src/features/tutoring/messageFailure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describePreStreamFailure, describeStreamFailure, UNKNOWN_RESULT } from './messageFailure'

describe('describePreStreamFailure', () => {
  it.each([
    ['provedor_nao_configurado', 503, 'unavailable', 'A Tifa está fora do ar: falta configurar o provedor.'],
    [
      'mensagem_em_andamento',
      409,
      'retry',
      'A Tifa ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.',
    ],
    ['operacao_reutilizada', 409, 'retry-with-new-id', 'Não foi possível registrar esta pergunta. Tente de novo.'],
  ])('traduz %s', (code, status, recovery, message) => {
    expect(describePreStreamFailure(new ApiError('x', status, code))).toEqual({ message, recovery })
  })

  it('o 422 sem code pede para editar, e nao para repetir', () => {
    // Repetir o mesmo corpo daria o mesmo 422; so mudar o texto resolve.
    expect(describePreStreamFailure(new ApiError('x', 422, null))).toEqual({
      message: 'A pergunta não foi aceita. Confira o texto e envie de novo.',
      recovery: 'edit',
    })
  })

  it.each([
    ['rede fora', new ApiError('x', null, null)],
    ['500 sem code', new ApiError('x', 500, null)],
    ['code de um backend mais novo', new ApiError('x', 409, 'code_novo')],
    ['422 com code desconhecido', new ApiError('x', 422, 'code_novo')],
    ['erro que nao e ApiError', new TypeError('defeito nosso')],
  ])('%s cai no resultado desconhecido', (_caso, error) => {
    expect(describePreStreamFailure(error)).toBe(UNKNOWN_RESULT)
  })

  it('nao le a propriedade herdada do prototipo como traducao', () => {
    // `'toString' in MAPA` e true; `Object.hasOwn(MAPA, 'toString')` e false.
    expect(describePreStreamFailure(new ApiError('x', 409, 'toString'))).toBe(UNKNOWN_RESULT)
  })

  it('o resultado desconhecido diz que repetir e seguro', () => {
    expect(UNKNOWN_RESULT).toEqual({
      message:
        'Não deu para saber se a resposta chegou inteira. Tentar de novo é seguro: a pergunta não será duplicada.',
      recovery: 'retry',
    })
  })
})

describe('describeStreamFailure', () => {
  it.each([
    [
      'provedor_indisponivel',
      'A Tifa não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.',
    ],
    [
      'tempo_esgotado',
      'A resposta da Tifa demorou demais. Tentar de novo é seguro: a pergunta não será duplicada.',
    ],
    [
      'proposta_invalida',
      'A Tifa tentou propor uma missão que não passou na validação. Tente de novo ou peça de outro jeito.',
    ],
  ])('traduz %s, sempre com reenvio pelo mesmo id', (code, message) => {
    expect(describeStreamFailure(code)).toEqual({ message, recovery: 'retry' })
  })

  it.each(['code_novo', 'constructor'])('%s cai no resultado desconhecido', (code) => {
    expect(describeStreamFailure(code)).toBe(UNKNOWN_RESULT)
  })
})
```

`frontend/src/features/tutoring/actionFailure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeActionFailure } from './actionFailure'

describe('describeActionFailure', () => {
  it.each([
    ['operacao_reutilizada', 409, 'retry-with-new-operation', 'Não foi possível registrar esta tentativa. Tente de novo.'],
    ['transicao_ilegal', 409, 'refresh', 'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.'],
    ['acao_nao_encontrada', 404, 'refresh', 'Esta proposta não existe mais. Atualize a conversa para ver o estado atual.'],
    ['prazo_expirado', 422, 'expired', 'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.'],
  ])('traduz %s', (code, status, recovery, message) => {
    for (const attempted of ['confirm', 'reject'] as const) {
      expect(describeActionFailure(new ApiError('x', status, code), attempted)).toEqual({
        message,
        recovery,
      })
    }
  })

  it.each([
    ['rede fora', new ApiError('x', null, null)],
    ['422 sem code', new ApiError('x', 422, null)],
    ['code desconhecido', new ApiError('x', 409, 'code_novo')],
    ['herdado do prototipo', new ApiError('x', 409, 'hasOwnProperty')],
    ['erro que nao e ApiError', new Error('x')],
  ])('%s: confirmar diz que repetir nao cria duas missoes', (_caso, error) => {
    expect(describeActionFailure(error, 'confirm')).toEqual({
      message:
        'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
      recovery: 'retry',
    })
  })

  it('recusar tem o proprio texto generico', () => {
    expect(describeActionFailure(new ApiError('x', null, null), 'reject')).toEqual({
      message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
      recovery: 'retry',
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/tutoring/`
Expected: FAIL — os módulos não existem (`Failed to resolve import "./messageFailure"`).

- [ ] **Step 3: Implementar**

`frontend/src/features/tutoring/types.ts`:

```ts
/**
 * O contrato da tutoria como a API o publica (`tutoring/schemas.py`).
 *
 * Chaves em `snake_case` e em ingles porque sao payload -- contrato que
 * atravessa a rede --, como em `features/missions/types.ts`. Os VALORES de
 * `status` e `state` estao em portugues porque o backend os grava assim; sao
 * dado, e nunca vao crus para a tela.
 *
 * Esta feature nao importa nada de `features/missions/` (`docs/ARCHITECTURE.md`
 * §5, regra 1): a missao criada pela confirmacao e descrita aqui so pelo que o
 * cartao mostra.
 */

export type MessageRole = 'user' | 'tutor'

export type MessageStatus = 'gerando' | 'completa' | 'interrompida' | 'falhou'

export type ActionState = 'proposta' | 'executada' | 'recusada' | 'falhou'

/**
 * A entrada da ferramenta `create_mission`, JA validada pelo `MissionCreate`
 * antes de virar linha (spec do 1b, `tutor_actions.payload`). O `deadline` e
 * ISO 8601 com fuso.
 */
export interface MissionProposal {
  instructions: string
  completion_criterion: string
  difficulty: number
  estimated_minutes: number
  deadline: string
}

export interface ActionRead {
  id: number
  kind: 'create_mission'
  state: ActionState
  payload: MissionProposal
  mission_id: number | null
  error_code: string | null
}

export interface MessageRead {
  id: number
  role: MessageRole
  content: string
  status: MessageStatus
  client_message_id: string | null
  reply_to_id: number | null
  error_code: string | null
  created_at: string
  actions: ActionRead[]
}

/** O recorte da missao criada que o cartao usa. */
export interface CreatedMission {
  id: number
  instructions: string
}

export interface ConfirmRead {
  action: ActionRead
  mission: CreatedMission
}

export interface RejectRead {
  action: ActionRead
}

export interface StatusRead {
  available: boolean
}

/**
 * Os `code` que o `POST /api/tutoring/messages` devolve ANTES do stream, em
 * JSON comum (spec, "Erros antes do stream"). Espelham membros do
 * `CodigoDeErro` de `src/focusquest/main.py`, a mao -- nada amarra os dois
 * (pendencia 32 do HANDOFF). O 422 do Pydantic nao tem `code`.
 */
export type PreStreamErrorCode =
  | 'provedor_nao_configurado'
  | 'mensagem_em_andamento'
  | 'operacao_reutilizada'

/**
 * Os `code` do evento `error` DENTRO do stream. Espelham o `CodigoDoStream` de
 * `src/focusquest/modules/tutoring/domain.py`, a mao (pendencia 32). Nao estao
 * no `CodigoDeErro` porque nao passam por handler HTTP.
 */
export type StreamErrorCode = 'provedor_indisponivel' | 'tempo_esgotado' | 'proposta_invalida'

/**
 * Os `code` de confirmar e recusar uma proposta (spec, "Confirmar e recusar").
 * Espelham o `CodigoDeErro`, a mao (pendencia 32).
 */
export type ActionErrorCode =
  | 'operacao_reutilizada'
  | 'transicao_ilegal'
  | 'prazo_expirado'
  | 'acao_nao_encontrada'
```

`frontend/src/features/tutoring/messageFailure.ts`:

```ts
import { ApiError } from '../../shared/api/client'
import type { PreStreamErrorCode, StreamErrorCode } from './types'

/**
 * O que a tela oferece depois de um envio que falhou.
 *
 * - `retry`: reenviar com o MESMO `client_message_id`. O backend resolve os
 *   tres casos (ja respondida, ultima resposta falhou, em andamento), e nunca
 *   duplica a pergunta (spec, "Reenvio").
 * - `retry-with-new-id`: reenviar com um id NOVO. So o `operacao_reutilizada`:
 *   o id pertence a outro conteudo, e seria recusado para sempre.
 * - `edit`: nao ha o que repetir -- o corpo foi recusado (422). O texto fica no
 *   campo para a pessoa mudar.
 * - `unavailable`: a Tifa esta fora do ar (sem chave). O painel mostra o estado
 *   indisponivel e desabilita o campo, com o texto preservado.
 */
export type MessageRecovery = 'retry' | 'retry-with-new-id' | 'edit' | 'unavailable'

export interface MessageFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: MessageRecovery
}

/**
 * O resultado desconhecido: o stream acabou sem `done` nem `error`, a conexao
 * caiu no meio, ou a falha nao tem `code` conhecido. Nao se sabe se a resposta
 * chegou; o que se sabe e que repetir nao duplica.
 */
export const UNKNOWN_RESULT: MessageFailure = {
  message:
    'Não deu para saber se a resposta chegou inteira. Tentar de novo é seguro: a pergunta não será duplicada.',
  recovery: 'retry',
}

/** Exaustivo sobre o tipo: um code novo reprova o `tsc` ate ganhar texto e acao. */
const PRE_STREAM: Record<PreStreamErrorCode, MessageFailure> = {
  provedor_nao_configurado: {
    message: 'A Tifa está fora do ar: falta configurar o provedor.',
    recovery: 'unavailable',
  },
  mensagem_em_andamento: {
    message:
      'A Tifa ainda está respondendo a pergunta anterior. Espere um instante e tente de novo.',
    recovery: 'retry',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta pergunta. Tente de novo.',
    recovery: 'retry-with-new-id',
  },
}

const IN_STREAM: Record<StreamErrorCode, MessageFailure> = {
  provedor_indisponivel: {
    message:
      'A Tifa não conseguiu responder agora. Tentar de novo é seguro: a pergunta não será duplicada.',
    recovery: 'retry',
  },
  tempo_esgotado: {
    message:
      'A resposta da Tifa demorou demais. Tentar de novo é seguro: a pergunta não será duplicada.',
    recovery: 'retry',
  },
  proposta_invalida: {
    message:
      'A Tifa tentou propor uma missão que não passou na validação. Tente de novo ou peça de outro jeito.',
    recovery: 'retry',
  },
}

const REJECTED_BODY: MessageFailure = {
  message: 'A pergunta não foi aceita. Confira o texto e envie de novo.',
  recovery: 'edit',
}

/**
 * `Object.hasOwn`, e nao `in`: o `in` percorre o prototipo e diria sim para
 * `toString` (mesma razao de `completionFailure.ts`).
 */
function isPreStreamCode(code: string): code is PreStreamErrorCode {
  return Object.hasOwn(PRE_STREAM, code)
}

function isStreamCode(code: string): code is StreamErrorCode {
  return Object.hasOwn(IN_STREAM, code)
}

/** A falha de um envio que nem abriu o stream: nada foi gravado. */
export function describePreStreamFailure(error: unknown): MessageFailure {
  if (!(error instanceof ApiError)) {
    return UNKNOWN_RESULT
  }
  if (error.code !== null && isPreStreamCode(error.code)) {
    return PRE_STREAM[error.code]
  }
  return error.status === 422 && error.code === null ? REJECTED_BODY : UNKNOWN_RESULT
}

/** A falha que chegou no evento `error`, JA gravada como `falhou`. */
export function describeStreamFailure(code: string): MessageFailure {
  return isStreamCode(code) ? IN_STREAM[code] : UNKNOWN_RESULT
}
```

`frontend/src/features/tutoring/actionFailure.ts`:

```ts
import { ApiError } from '../../shared/api/client'
import type { ActionErrorCode } from './types'

/**
 * O que o cartao oferece depois de uma decisao que falhou.
 *
 * - `retry`: repetir com o MESMO `operation_id` (confirmar) ou de novo
 *   (recusar, idempotente). Rede, 5xx, erro sem `code`.
 * - `retry-with-new-operation`: repetir com um `operation_id` NOVO. So o
 *   `operacao_reutilizada`, como no Concluir do Incremento A.
 * - `refresh`: a proposta ja foi decidida ou nao existe mais; recarregar a
 *   conversa mostra o estado de verdade.
 * - `expired`: o prazo passou, o backend GRAVOU a acao como `falhou` antes do
 *   422, e o cartao passa a esse estado.
 */
export type ActionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh' | 'expired'

export interface ActionFailure {
  message: string
  recovery: ActionRecovery
}

const BY_CODE: Record<ActionErrorCode, ActionFailure> = {
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
  transicao_ilegal: {
    message: 'Esta proposta já foi decidida. Atualize a conversa para ver o estado atual.',
    recovery: 'refresh',
  },
  acao_nao_encontrada: {
    message: 'Esta proposta não existe mais. Atualize a conversa para ver o estado atual.',
    recovery: 'refresh',
  },
  prazo_expirado: {
    message: 'O prazo desta proposta já passou. Peça à Tifa uma nova proposta.',
    recovery: 'expired',
  },
}

const UNCONFIRMED: Record<'confirm' | 'reject', ActionFailure> = {
  confirm: {
    message:
      'Não foi possível confirmar a missão. Tentar de novo é seguro: a missão não será criada duas vezes.',
    recovery: 'retry',
  },
  reject: {
    message: 'Não foi possível recusar a proposta. Tentar de novo é seguro.',
    recovery: 'retry',
  },
}

function isActionErrorCode(code: string): code is ActionErrorCode {
  return Object.hasOwn(BY_CODE, code)
}

/** A mensagem e a acao do cartao, decididas pelo `code` e so por ele. */
export function describeActionFailure(
  error: unknown,
  attempted: 'confirm' | 'reject',
): ActionFailure {
  if (error instanceof ApiError && error.code !== null && isActionErrorCode(error.code)) {
    return BY_CODE[error.code]
  }
  return UNCONFIRMED[attempted]
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/tutoring/`
Expected: PASS.

- [ ] **Step 5: Mutações**

1. Em `messageFailure.ts`, troque `Object.hasOwn(PRE_STREAM, code)` por `code in PRE_STREAM`. Expected: FAIL em "nao le a propriedade herdada do prototipo" (o `toString` herdado vira a "tradução"; o `toEqual`/`toBe` recebe uma função).
2. Em `actionFailure.ts`, a mesma troca em `isActionErrorCode`. Expected: FAIL no caso `herdado do prototipo`.
3. Em `messageFailure.ts`, troque `? REJECTED_BODY : UNKNOWN_RESULT` por `? UNKNOWN_RESULT : UNKNOWN_RESULT`. Expected: FAIL em "o 422 sem code pede para editar". E troque `error.status === 422 && error.code === null` por `error.status === 422`. Expected: FAIL no caso `422 com code desconhecido` (ele passaria a pedir edição em vez de cair no desconhecido).
4. Acrescente `'code_novo'` à união `StreamErrorCode` em `types.ts`, sem tocar no mapa. Run: `cd frontend && npx tsc -b`. Expected: FAIL do `tsc` (`Property 'code_novo' is missing in type ... Record<StreamErrorCode, MessageFailure>`). É a prova de exaustividade. Restaure.

- [ ] **Step 6: Gate e commit**

```bash
cd frontend && npm run format && npm run test:coverage
cd .. && make check
git add frontend/src/features/tutoring/
git commit -m "feat(tutoria): tipos da tutoria e mapas exaustivos de code para a tela

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** testes verdes, as mutações 1, 2, 3 e 4 vistas reprovando, cobertura 100%, `make check` EXIT 0, commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 2**: os três tipos de `code` e os dois mapas, com o arquivo de cada um.
- **Pendência 32, atualizada (continua aberta):** "Desde o 1b-2, são **dois** espelhos à mão no frontend: `MissionErrorCode` (`features/missions/types.ts`) e, na tutoria, `PreStreamErrorCode`, `StreamErrorCode` e `ActionErrorCode` (`features/tutoring/types.ts`), que espelham o `CodigoDeErro` de `main.py` **e** o `CodigoDoStream` de `tutoring/domain.py`. O desenho de segurança é o mesmo do A: um `code` que o backend acrescente sem a linha no frontend cai no texto genérico (`UNKNOWN_RESULT` ou o genérico do cartão), que é seguro — oferece repetir com a mesma chave — mas impreciso. Amarrar continua pedindo gerar os tipos do OpenAPI, e os códigos do stream nem estão no OpenAPI (viajam dentro de um 200)."

---

### Task 3: Hooks — status, histórico, envio e reenvio, e o limite de 4000 caracteres

**Objetivo:** toda a regra da conversa, sem desenho nenhum: o status da Tifa, o histórico, o rascunho, o envio como união discriminada, o reenvio com o **mesmo** `client_message_id`, a limpeza do campo só no `user_message`, e o limite de tamanho da pergunta (decisão do dono: 4000 caracteres, contador de restantes perto do limite, Enviar desabilitado acima dele, texto mantido).

**Files:**
- Create: `frontend/src/test/fetchRoutes.ts` (infraestrutura de teste)
- Create: `frontend/src/features/tutoring/questionLimit.ts`, `questionLimit.test.ts`
- Create: `frontend/src/features/tutoring/conversationHistory.ts`, `conversationHistory.test.ts`
- Create: `frontend/src/features/tutoring/useTutorStatus.ts`, `useTutorStatus.test.tsx`
- Create: `frontend/src/features/tutoring/useTutorConversation.ts`, `useTutorConversation.test.tsx`

**Interfaces:**
- Consumes: `postStream`, `requestJson`, `ApiError` (Task 1); `MessageRead`, `ActionRead`, `StatusRead` (Task 2); `describePreStreamFailure`, `describeStreamFailure`, `UNKNOWN_RESULT`, `MessageFailure` (Task 2).
- Produces:
  - `questionLimit.ts`: `MAX_QUESTION_LENGTH = 4000`; `COUNTER_VISIBLE_FROM = 3600`; `interface QuestionLength { length: number; remaining: number; sendable: boolean; counter: string | null }`; `describeQuestionLength(text: string): QuestionLength`.
  - `conversationHistory.ts`: `interface PendingQuestion { clientMessageId: string; content: string }`; `settleInterrupted(messages: MessageRead[], question: MessageRead, partial: string, status: 'falhou' | 'interrompida', placeholderId: number): MessageRead[]`; `appendTurn(messages: MessageRead[], question: MessageRead | null, answer: MessageRead): MessageRead[]`; `replaceAction(messages: MessageRead[], action: ActionRead): MessageRead[]`; `pendingFromHistory(messages: MessageRead[]): PendingQuestion | null`.
  - `useTutorStatus.ts`: `type TutorStatus = { status: 'loading' } | { status: 'available' } | { status: 'unavailable' } | { status: 'error' }`; `useTutorStatus(): { state: TutorStatus; reload: () => void }`.
  - `useTutorConversation.ts`:
    - `type HistoryState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; messages: MessageRead[] }`
    - `type SendState = { status: 'idle'; finished: boolean } | { status: 'sending'; pending: PendingQuestion } | { status: 'writing'; pending: PendingQuestion; question: MessageRead | null; partial: string } | { status: 'failed'; pending: PendingQuestion; question: MessageRead | null; partial: string; failure: MessageFailure } | { status: 'unknown'; pending: PendingQuestion; question: MessageRead | null; partial: string }`
    - `interface UseTutorConversationResult { history: HistoryState; messages: MessageRead[]; send: SendState; draft: string; setDraft: (text: string) => void; length: QuestionLength; canSubmit: boolean; submit: () => void; retryTarget: PendingQuestion | null; retry: () => void; reloadHistory: () => void; updateAction: (action: ActionRead) => void }`
    - `useTutorConversation(): UseTutorConversationResult`
  - `src/test/fetchRoutes.ts`: `type Route = (init: RequestInit | undefined, call: number) => Response | Promise<Response>`; `routeFetch(routes: Record<string, Route>): Mock`; `requestsTo(mock: Mock, key: string): RequestInit[]`. A chave é `"<MÉTODO> <URL>"`, por exemplo `'POST /api/tutoring/messages'`.

**Regras que os testes fixam** (cada uma é um caso abaixo):

1. O campo **só** é limpo quando chega o `user_message`, e só se ainda contém a pergunta enviada.
2. `503`, `409` e `422` antes do stream, e a rede fora, **deixam o texto no campo**.
3. "Tentar de novo" reenvia o **mesmo** `client_message_id` e o **mesmo** conteúdo; a exceção é `operacao_reutilizada`, que troca o id e mantém o conteúdo.
4. Enviar de novo o **mesmo** texto depois de uma falha reusa o id pendente; texto **editado** é pergunta nova, com id novo.
5. O stream que termina sem `done` nem `error`, ou cai depois do `user_message`, é `unknown`.
6. O `done` de uma pergunta já respondida (o backend devolve a resposta que já existe) **não duplica** nada na lista.
7. Depois de recarregar a página, se a última pergunta do histórico não tem resposta `completa` nem `gerando`, "Tentar de novo" é oferecido com o id dela.
8. Nada é enviado com o texto vazio, só de espaços, acima de 4000 pontos de código, ou com outro envio em andamento.
9. O limite conta **pontos de código do texto sem espaços nas pontas**, como o `len()` do Python depois do `strip_whitespace` do `MessageCreate`.

- [ ] **Step 1: A infraestrutura de teste do `fetch` roteado**

`frontend/src/test/fetchRoutes.ts`:

```ts
import { vi, type Mock } from 'vitest'

/**
 * Um `fetch` falso roteado por metodo e URL.
 *
 * Existe porque, com o painel da Tifa, a pagina busca TRES recursos na
 * montagem (missoes, status, historico), e o padrao antigo --
 * `vi.fn().mockResolvedValue(Response.json([]))` -- devolve o MESMO `Response`
 * a todas as chamadas: o corpo e consumido na primeira leitura e a segunda
 * explode com "Body is unusable". Aqui cada chamada recebe um `Response`
 * NOVO, construido pela rota.
 *
 * Uma chamada sem rota REJEITA com a chave na mensagem: um recurso que o teste
 * esqueceu de declarar aparece como falha nomeada, e nao como `undefined`.
 */
export type Route = (init: RequestInit | undefined, call: number) => Response | Promise<Response>

export function routeFetch(routes: Record<string, Route>): Mock {
  const calls = new Map<string, number>()
  const mock = vi.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input}`
    const route = routes[key]
    if (route === undefined) {
      return Promise.reject(new Error(`fetch sem rota no teste: ${key}`))
    }
    const call = (calls.get(key) ?? 0) + 1
    calls.set(key, call)
    return Promise.resolve(route(init, call))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Os `init` das chamadas feitas a uma chave, na ordem. */
export function requestsTo(mock: Mock, key: string): RequestInit[] {
  return mock.mock.calls
    .filter(([input, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${String(input)}` === key)
    .map(([, init]) => init as RequestInit)
}

/** O corpo JSON de um `init`, para conferir o que foi enviado. */
export function jsonBody(init: RequestInit): unknown {
  return JSON.parse(String(init.body))
}
```

- [ ] **Step 2: Testes que falham — limite e histórico (funções puras)**

`frontend/src/features/tutoring/questionLimit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { COUNTER_VISIBLE_FROM, describeQuestionLength, MAX_QUESTION_LENGTH } from './questionLimit'

describe('describeQuestionLength', () => {
  it('espelha o teto do backend', () => {
    // TAMANHO_MAXIMO_DA_PERGUNTA, em src/focusquest/modules/tutoring/schemas.py.
    expect(MAX_QUESTION_LENGTH).toBe(4000)
    expect(COUNTER_VISIBLE_FROM).toBe(3600)
  })

  it.each([
    ['vazio', ''],
    ['so espacos', '   \n\t '],
  ])('%s nao e enviavel e nao mostra contador', (_caso, text) => {
    expect(describeQuestionLength(text)).toMatchObject({ length: 0, sendable: false, counter: null })
  })

  it('abaixo do limiar do contador: enviavel, sem contador', () => {
    expect(describeQuestionLength('a'.repeat(COUNTER_VISIBLE_FROM - 1))).toEqual({
      length: 3599,
      remaining: 401,
      sendable: true,
      counter: null,
    })
  })

  it('no limiar, o contador aparece com os restantes', () => {
    expect(describeQuestionLength('a'.repeat(3600)).counter).toBe('Restam 400 caracteres.')
  })

  it('no limite exato ainda e enviavel', () => {
    expect(describeQuestionLength('a'.repeat(4000))).toEqual({
      length: 4000,
      remaining: 0,
      sendable: true,
      counter: 'Restam 0 caracteres.',
    })
  })

  it('um caractere restante no singular', () => {
    expect(describeQuestionLength('a'.repeat(3999)).counter).toBe('Resta 1 caractere.')
  })

  it('acima do limite: nao enviavel, e o contador diz quanto passou', () => {
    expect(describeQuestionLength('a'.repeat(4012))).toEqual({
      length: 4012,
      remaining: -12,
      sendable: false,
      counter: 'Passou 12 caracteres do limite de 4000.',
    })
    expect(describeQuestionLength('a'.repeat(4001)).counter).toBe(
      'Passou 1 caractere do limite de 4000.',
    )
  })

  it('conta pontos de codigo, como o len() do Python', () => {
    // Cada emoji e UM ponto de codigo e DUAS unidades UTF-16. Com
    // `text.length`, 4000 emojis dariam 8000 e a tela recusaria o que o
    // servidor aceita.
    expect(describeQuestionLength('😀'.repeat(4000))).toMatchObject({ length: 4000, sendable: true })
  })

  it('ignora os espacos das pontas, como o strip_whitespace do backend', () => {
    expect(describeQuestionLength(`  ${'a'.repeat(4000)}  \n`)).toMatchObject({
      length: 4000,
      sendable: true,
    })
  })
})
```

`frontend/src/features/tutoring/conversationHistory.test.ts` — um construtor de mensagem no topo do arquivo e os casos:

```ts
import { describe, expect, it } from 'vitest'
import { appendTurn, pendingFromHistory, replaceAction, settleInterrupted } from './conversationHistory'
import type { ActionRead, MessageRead } from './types'

function message(overrides: Partial<MessageRead> & Pick<MessageRead, 'id' | 'role'>): MessageRead {
  return {
    content: `mensagem ${String(overrides.id)}`,
    status: 'completa',
    client_message_id: overrides.role === 'user' ? `cmid-${String(overrides.id)}` : null,
    reply_to_id: null,
    error_code: null,
    created_at: '2026-09-22T12:00:00Z',
    actions: [],
    ...overrides,
  }
}

const action = (id: number, state: ActionRead['state'] = 'proposta'): ActionRead => ({
  id,
  kind: 'create_mission',
  state,
  payload: {
    instructions: 'Ler o capítulo 3',
    completion_criterion: 'Resumo entregue',
    difficulty: 2,
    estimated_minutes: 30,
    deadline: '2027-01-10T13:00:00Z',
  },
  mission_id: null,
  error_code: null,
})

describe('appendTurn', () => {
  it('acrescenta a pergunta e a resposta novas, na ordem', () => {
    const q = message({ id: 1, role: 'user' })
    const a = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([], q, a)).toEqual([q, a])
  })

  it('nao duplica a pergunta que ja esta na lista (reenvio)', () => {
    const q = message({ id: 1, role: 'user' })
    const a = message({ id: 3, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([q], q, a)).toEqual([q, a])
  })

  it('troca a resposta que ja esta na lista, em vez de repetir (ja respondida)', () => {
    const q = message({ id: 1, role: 'user' })
    const antiga = message({ id: 2, role: 'tutor', reply_to_id: 1, content: 'velha' })
    const nova = { ...antiga, content: 'a mesma resposta, como o servidor a devolveu' }
    expect(appendTurn([q, antiga], q, nova)).toEqual([q, nova])
  })

  it('sem pergunta (fora do contrato), acrescenta so a resposta', () => {
    const a = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    expect(appendTurn([], null, a)).toEqual([a])
  })

  it('nao muda a lista recebida', () => {
    const lista = [message({ id: 1, role: 'user' })]
    appendTurn(lista, null, message({ id: 2, role: 'tutor', reply_to_id: 1 }))
    expect(lista).toHaveLength(1)
  })
})

describe('settleInterrupted', () => {
  it('poe a pergunta e a resposta provisoria marcada, com o parcial', () => {
    const q = message({ id: 10, role: 'user' })
    const lista = settleInterrupted([], q, 'Meio', 'falhou', -1)
    expect(lista).toEqual([q, expect.objectContaining({ id: -1, role: 'tutor', content: 'Meio', status: 'falhou', reply_to_id: 10 })])
  })

  it('nao duplica a pergunta que ja esta na lista (segunda falha da mesma pergunta)', () => {
    const q = message({ id: 10, role: 'user' })
    const primeira = settleInterrupted([], q, 'a', 'falhou', -1)
    expect(settleInterrupted(primeira, q, 'b', 'interrompida', -2).map((m) => m.id)).toEqual([10, -1, -2])
  })
})

describe('replaceAction', () => {
  it('troca so a acao de mesmo id, na mensagem que a carrega', () => {
    const outra = message({ id: 1, role: 'tutor', reply_to_id: 9, actions: [action(5)] })
    const alvo = message({ id: 2, role: 'tutor', reply_to_id: 9, actions: [action(6), action(7)] })
    const executada = action(7, 'executada')

    const [primeira, segunda] = replaceAction([outra, alvo], executada)

    expect(primeira).toBe(outra)
    expect(segunda?.actions).toEqual([action(6), executada])
  })
})

describe('pendingFromHistory', () => {
  it('sem pergunta nenhuma, nao ha o que reenviar', () => {
    expect(pendingFromHistory([])).toBeNull()
  })

  it.each(['completa', 'gerando'] as const)('ultima pergunta com resposta %s: nada a reenviar', (status) => {
    const q = message({ id: 1, role: 'user' })
    expect(pendingFromHistory([q, message({ id: 2, role: 'tutor', reply_to_id: 1, status })])).toBeNull()
  })

  it.each(['interrompida', 'falhou'] as const)(
    'ultima pergunta so com resposta %s: reenviar com o id dela',
    (status) => {
      const q = message({ id: 1, role: 'user', content: 'Me ajuda com recursão?' })
      expect(
        pendingFromHistory([q, message({ id: 2, role: 'tutor', reply_to_id: 1, status })]),
      ).toEqual({ clientMessageId: 'cmid-1', content: 'Me ajuda com recursão?' })
    },
  )

  it('ultima pergunta sem resposta nenhuma: reenviar', () => {
    const antiga = message({ id: 1, role: 'user' })
    const respondida = message({ id: 2, role: 'tutor', reply_to_id: 1 })
    const ultima = message({ id: 3, role: 'user' })
    expect(pendingFromHistory([antiga, respondida, ultima])).toEqual({
      clientMessageId: 'cmid-3',
      content: 'mensagem 3',
    })
  })

  it('so a ULTIMA pergunta conta: uma antiga sem resposta nao e oferecida', () => {
    const antiga = message({ id: 1, role: 'user' })
    const ultima = message({ id: 2, role: 'user' })
    const respondida = message({ id: 3, role: 'tutor', reply_to_id: 2 })
    expect(pendingFromHistory([antiga, ultima, respondida])).toBeNull()
  })

  it('pergunta sem client_message_id (fora do contrato) nao e oferecida', () => {
    expect(pendingFromHistory([message({ id: 1, role: 'user', client_message_id: null })])).toBeNull()
  })
})
```

- [ ] **Step 3: Testes que falham — os dois hooks**

`frontend/src/features/tutoring/useTutorStatus.test.tsx`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { useTutorStatus } from './useTutorStatus'

describe('useTutorStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [true, 'available'],
    [false, 'unavailable'],
  ])('available: %s vira %s', async (available, status) => {
    routeFetch({ 'GET /api/tutoring/status': () => Response.json({ available }) })
    const { result } = renderHook(() => useTutorStatus())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status })
    })
  })

  it('a falha vira erro, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/tutoring/status': (_init, call) =>
        call === 1 ? Response.json({}, { status: 500 }) : Response.json({ available: true }),
    })
    const { result } = renderHook(() => useTutorStatus())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error' })
    })

    act(() => {
      result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'available' })
    })
  })

  it('desmontar no meio nao escreve estado de erro', async () => {
    let signal: AbortSignal | undefined
    routeFetch({
      'GET /api/tutoring/status': (init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    })
    const { result, unmount } = renderHook(() => useTutorStatus())
    unmount()
    await waitFor(() => {
      expect(signal?.aborted).toBe(true)
    })
    expect(result.current.state).toEqual({ status: 'loading' })
  })
})
```

`frontend/src/features/tutoring/useTutorConversation.test.tsx` — os fixtures no topo, e os casos. Cada caso é um `it` próprio; os nomes abaixo são os nomes dos `it`.

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonBody, requestsTo, routeFetch, type Route } from '../../test/fetchRoutes'
import { controlledStream, sseFrame, streamResponse } from '../../test/sse'
import type { MessageRead } from './types'
import { useTutorConversation } from './useTutorConversation'

const HISTORY = 'GET /api/tutoring/messages'
const SEND = 'POST /api/tutoring/messages'

const question = (id: number, content: string, cmid: string): MessageRead => ({
  id,
  role: 'user',
  content,
  status: 'completa',
  client_message_id: cmid,
  reply_to_id: null,
  error_code: null,
  created_at: '2026-09-22T12:00:00Z',
  actions: [],
})

const answer = (id: number, replyTo: number, content: string, status: MessageRead['status'] = 'completa'): MessageRead => ({
  id,
  role: 'tutor',
  content,
  status,
  client_message_id: null,
  reply_to_id: replyTo,
  error_code: status === 'falhou' ? 'provedor_indisponivel' : null,
  created_at: '2026-09-22T12:00:01Z',
  actions: [],
})

/** Monta o hook com o historico dado e a rota de envio dada, e espera carregar. */
async function mountWith(history: MessageRead[] | Route, send: Route) {
  // Uma lista fixa, ou uma rota por chamada: a atualizacao silenciosa depois
  // de uma falha e a SEGUNDA chamada do historico, e devolve o que o servidor
  // gravou.
  const historyRoute: Route = Array.isArray(history) ? () => Response.json(history) : history
  const fetchMock = routeFetch({ [HISTORY]: historyRoute, [SEND]: send })
  const hook = renderHook(() => useTutorConversation())
  await waitFor(() => {
    expect(hook.result.current.history.status).toBe('loaded')
  })
  return { ...hook, fetchMock }
}

/** O `client_message_id` e o `content` do n-esimo envio (1, 2, ...). */
function sent(fetchMock: ReturnType<typeof routeFetch>, n: number) {
  return jsonBody(requestsTo(fetchMock, SEND)[n - 1] as RequestInit) as {
    client_message_id: string
    content: string
  }
}

beforeEach(() => {
  let n = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    n += 1
    return `00000000-0000-4000-8000-00000000000${String(n)}` as `${string}-${string}-${string}-${string}-${string}`
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
```

Casos (escreva cada um com `mountWith`, `act(() => { result.current.setDraft(...) })`, `act(() => { result.current.submit() })` e `waitFor`):

| # | Nome do `it` | Roteiro | Asserções |
|---|---|---|---|
| H1 | `carrega o historico e o expoe em messages` | histórico `[q1, a1]` | `history` é `loaded` com os dois; `messages` é `[q1, a1]`; `send` é `{ status: 'idle', finished: false }`; `retryTarget` é `null` |
| H2 | `o historico que falha vira erro, e reloadHistory recarrega` | `HISTORY` responde 500 na 1ª chamada e `[]` na 2ª | `history` `error`; depois de `reloadHistory()`, `loading` e então `loaded` com `[]` |
| H3 | `desmontar durante o carregamento aborta sem escrever erro` | `HISTORY` pendente que rejeita no `abort` (como no `useTutorStatus`) | sinal abortado; `history` continua `loading` |
| S1 | `enviar manda o id novo e o texto sem espacos nas pontas, e mantem o rascunho` | `SEND` → `controlledStream()` sem push | corpo `{ client_message_id: '...0001', content: 'Oi, Tifa' }` para o rascunho `'  Oi, Tifa \n'`; `send.status` `sending`; `draft` ainda `'  Oi, Tifa \n'` |
| S2 | `o user_message limpa o campo e passa a escrevendo` | push `user_message` (q10) | `send` = `{ status: 'writing', question: q10, partial: '' }`; `draft` `''`; `messages` termina em q10 |
| S3 | `o user_message nao apaga o que foi digitado depois do envio` | antes do push, `setDraft('outra pergunta')` | depois do `user_message`, `draft` é `'outra pergunta'` |
| S4 | `os delta se acumulam no parcial` | push `user_message`, `delta {text:'Bora, '}`, `delta {text:'vamos!'}` | `send.partial` é `'Bora, vamos!'` |
| S5 | `o done volta a idle e poe pergunta e resposta na lista, uma vez cada` | push `user_message` q10, `done` a11; close | `send` `{ status: 'idle', finished: true }`; `messages` `[...history, q10, a11]`; q10 aparece **uma** vez |
| S6 | `o done de pergunta ja respondida nao duplica nada` | 1º envio: `user_message` q10, `delta`, close (vira `unknown`); `reloadHistory()` com a 2ª chamada de `HISTORY` devolvendo `[q10, a11]` (o servidor tinha terminado); `retry()`; 2º envio: `user_message` q10, `done` a11 (o backend devolve a resposta que já existe) | `messages` é exatamente `[q10, a11]`, cada um uma vez; o 2º corpo tem o mesmo `client_message_id` |
| S7 | `o error no meio mantem o parcial, traduz o code e reenvia com o mesmo id` | 1º envio: `user_message` q10, `delta 'Meio'`, `error {code:'provedor_indisponivel'}`; 2º: `user_message` q10, `done` a12 | depois do 1º: `send.status` `failed`, `partial` `'Meio'`, `failure.recovery` `retry`, `retryTarget` = `{ clientMessageId: '...0001', content }`; `retry()`; o 2º corpo tem o **mesmo** `client_message_id` e `content`; `messages` termina em `[q10, a12]`, q10 uma vez |
| S8 | `o stream que acaba sem final e resultado desconhecido` | `user_message` q10, `delta 'x'`, close; `HISTORY` 2ª chamada falha (500) | `send.status` `unknown`; `messages` termina na resposta provisória `{ status: 'interrompida', content: 'x' }`; `retry()` reenvia o mesmo id |
| S9 | `a queda no meio depois do user_message e resultado desconhecido` | `controlledStream`: push `user_message`, depois `fail(new TypeError())` | `send.status` `unknown`; `question` é q10 |
| S10 | `o 503 antes do stream mantem o texto e marca indisponivel` | `SEND` → `Response.json({code:'provedor_nao_configurado'}, {status: 503})` | `send.status` `failed`; `failure.recovery` `unavailable`; `draft` intacto; `retryTarget` `null` |
| S11 | `o 409 mensagem_em_andamento mantem o texto e reenvia com o mesmo id` | 1º: 409 `mensagem_em_andamento`; 2º: stream com `done` | `draft` intacto após o 1º; `retry()`; mesmo `client_message_id` |
| S12 | `o 409 operacao_reutilizada reenvia com id novo e o mesmo texto` | 1º: 409 `operacao_reutilizada`; 2º: stream | 2º corpo: `client_message_id` `'...0002'`, mesmo `content` |
| S13 | `o 422 pede edicao: texto mantido e nada a reenviar` | 422 `{detail: []}` | `failure.recovery` `edit`; `retryTarget` `null`; `draft` intacto |
| S14 | `a rede fora antes do stream e resultado desconhecido, com o texto mantido` | `SEND` rejeita (`() => Promise.reject(new TypeError('Failed to fetch'))`) | `send.status` `unknown`; `question` `null`; `draft` intacto; `retry()` usa o mesmo id |
| S15 | `enviar de novo o mesmo texto depois de falha reusa o id; texto editado ganha id novo` | 1º e 2º: 409 `mensagem_em_andamento`; `submit()` de novo com o mesmo rascunho; depois `setDraft('outra')` e `submit()` (3º: 409 de novo) | 2º corpo com `'...0001'`; 3º com `'...0002'` e `content: 'outra'` |
| S16 | `nao envia vazio, so espacos, acima do limite, nem com envio em andamento` | `SEND` → `controlledStream()` | `submit()` com `''`, com `'   '` e com `'a'.repeat(4001)` não chama `SEND` e `canSubmit` é `false`; com `'ok'`, chama uma vez; um segundo `submit()` durante `sending` não chama de novo |
| S17 | `desmontar durante o stream aborta o pedido e nao muda o estado` | `controlledStream`; o `Route` guarda `init.signal` | `unmount()`; `signal.aborted` `true` |
| S18 | `evento de nome desconhecido e ignorado` | `user_message`, `evento_novo {}`, `done` | termina em `idle`, sem erro |
| S19 | `delta antes do user_message (fora do contrato) ainda mostra o texto` | `delta 'x'`, `done` | durante: `send` `writing` com `question: null`, `partial: 'x'` (use `controlledStream` para observar antes do `done`) |
| S20 | `depois de recarregar, a ultima pergunta sem resposta completa pode ser reenviada` | histórico `[q10, answer(11, 10, 'meio', 'interrompida')]` | `retryTarget` = `{ clientMessageId: q10.client_message_id, content: q10.content }`; `retry()` manda esse corpo |
| S21 | `o done que chega com a conversa recarregando nao se perde nem quebra` | `controlledStream`; `user_message`, então `reloadHistory()` (2ª chamada de `HISTORY` fica pendente com um `Promise` controlado), então `done` | `send` `idle`; `history` continua `loading` (a lista recarregada é a fonte); resolvida a 2ª chamada com `[q10, a11]`, `messages` é `[q10, a11]` |
| S24 | `segunda pergunta depois de uma falha mantem o parcial marcado` | 1º: `user_message` q10, `delta 'Meio'`, `error provedor_indisponivel`; `HISTORY` 2ª chamada → `[q10, answer(11,10,'Meio','falhou')]`; 2º envio (`setDraft('outra')`, `submit()`) → `controlledStream` sem push | durante o 2º `sending`: `messages` ainda contém q10 e a 11 `falhou` com `'Meio'` |
| S25 | `a atualizacao silenciosa que falha mantem a resposta provisoria marcada` | como S24, com a 2ª chamada de `HISTORY` respondendo 500 | `messages` termina em `[q10, { id: -1, status: 'falhou', content: 'Meio' }]`; `history.status` continua `loaded` (nada de estado de erro) |
| S26 | `falha antes do stream nao poe nada na lista nem atualiza o historico` | `SEND` → 409 `mensagem_em_andamento` | `messages` igual ao histórico inicial; `HISTORY` chamado **uma** vez |
| S22 | `updateAction troca a acao na lista carregada, e nao faz nada durante o carregamento` | histórico com `answer` que carrega `actions: [acao 5 proposta]` | `updateAction({...acao5, state: 'executada'})` muda `messages`; depois `reloadHistory()` com a 2ª chamada pendente e `updateAction(...)` de novo: `history` continua `loading` |

Para S6 e S21, escreva o código completo; os demais seguem o mesmo molde. S7 por extenso, como modelo:

```ts
it('o error no meio mantem o parcial, traduz o code e reenvia com o mesmo id', async () => {
  const q10 = question(10, 'Me explica recursão', 'x')
  const gravada = answer(11, 10, 'Meio', 'falhou')
  const { result, fetchMock } = await mountWith(
    (_init, call) => Response.json(call === 1 ? [] : [q10, gravada]),
    (_init, call) =>
    call === 1
      ? streamResponse([
          sseFrame('user_message', q10),
          sseFrame('delta', { text: 'Meio' }),
          sseFrame('error', { code: 'provedor_indisponivel' }),
        ])
      : streamResponse([sseFrame('user_message', q10), sseFrame('done', answer(12, 10, 'Inteira'))]),
  )

  act(() => {
    result.current.setDraft('Me explica recursão')
  })
  act(() => {
    result.current.submit()
  })
  await waitFor(() => {
    expect(result.current.send.status).toBe('failed')
  })
  // O parcial entrou na lista, marcado -- e a atualizacao silenciosa trocou a
  // resposta provisoria pela linha que o servidor gravou.
  await waitFor(() => {
    expect(result.current.messages.map((m) => m.id)).toEqual([10, 11])
  })
  expect(result.current.messages[1]).toMatchObject({ status: 'falhou', content: 'Meio' })
  const failed = result.current.send
  expect(failed).toMatchObject({ partial: 'Meio', failure: { recovery: 'retry' } })
  expect(result.current.retryTarget).toEqual({
    clientMessageId: '00000000-0000-4000-8000-000000000001',
    content: 'Me explica recursão',
  })

  act(() => {
    result.current.retry()
  })
  await waitFor(() => {
    expect(result.current.send.status).toBe('idle')
  })
  expect(sent(fetchMock, 2)).toEqual(sent(fetchMock, 1))
  // A tentativa que falhou continua na lista, marcada; a nova vem depois.
  expect(result.current.messages.map((m) => [m.id, m.status])).toEqual([
    [10, 'completa'],
    [11, 'falhou'],
    [12, 'completa'],
  ])
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/tutoring/`
Expected: FAIL — os módulos `questionLimit`, `conversationHistory`, `useTutorStatus`, `useTutorConversation` não existem.

- [ ] **Step 5: Implementar**

`frontend/src/features/tutoring/questionLimit.ts`:

```ts
/**
 * O tamanho maximo da pergunta, em pontos de codigo.
 *
 * Espelha `TAMANHO_MAXIMO_DA_PERGUNTA`, em
 * src/focusquest/modules/tutoring/schemas.py, e nada amarra os dois (pendencia
 * 32). O numero e PROVISORIO: e teto tecnico de custo, e a decisao de produto
 * e do dono (pendencia 41). Quem mudar la muda aqui.
 */
export const MAX_QUESTION_LENGTH = 4000

/** A partir de quantos caracteres o contador aparece: 90% do limite. */
export const COUNTER_VISIBLE_FROM = (MAX_QUESTION_LENGTH * 9) / 10

export interface QuestionLength {
  /** Pontos de codigo do texto sem espacos nas pontas. */
  length: number
  /** Quanto falta para o limite; negativo quando passou. */
  remaining: number
  /** Nao vazio e dentro do limite. */
  sendable: boolean
  /** O texto do contador, ou `null` longe do limite. */
  counter: string | null
}

/**
 * O tamanho que o SERVIDOR vai medir.
 *
 * `Array.from(...).length` conta pontos de codigo, como o `len()` do Python; o
 * `.length` de uma string conta unidades UTF-16, e um emoji valeria 2 aqui e 1
 * la. O `trim()` reproduz o `strip_whitespace` do `MessageCreate`.
 */
export function describeQuestionLength(text: string): QuestionLength {
  const length = Array.from(text.trim()).length
  const remaining = MAX_QUESTION_LENGTH - length
  return {
    length,
    remaining,
    sendable: length > 0 && remaining >= 0,
    counter: length < COUNTER_VISIBLE_FROM ? null : counterText(remaining),
  }
}

function counterText(remaining: number): string {
  if (remaining < 0) {
    const over = -remaining
    return `Passou ${String(over)} ${over === 1 ? 'caractere' : 'caracteres'} do limite de ${String(MAX_QUESTION_LENGTH)}.`
  }
  return remaining === 1 ? 'Resta 1 caractere.' : `Restam ${String(remaining)} caracteres.`
}
```

`frontend/src/features/tutoring/conversationHistory.ts`:

```ts
import type { ActionRead, MessageRead } from './types'

/**
 * Uma pergunta a (re)enviar: o id que a torna idempotente e o texto.
 *
 * O backend amarra os dois: o mesmo id com OUTRO texto e `operacao_reutilizada`.
 */
export interface PendingQuestion {
  clientMessageId: string
  content: string
}

/**
 * A lista depois de um `done`: a pergunta entra se ainda nao estiver (um
 * reenvio a traz de novo), e a resposta entra ou TROCA a de mesmo id (uma
 * pergunta ja respondida recebe a resposta que ja existia). Nunca duplica.
 */
export function appendTurn(
  messages: MessageRead[],
  question: MessageRead | null,
  answer: MessageRead,
): MessageRead[] {
  const next =
    question === null || messages.some((m) => m.id === question.id)
      ? [...messages]
      : [...messages, question]
  const at = next.findIndex((m) => m.id === answer.id)
  if (at === -1) {
    next.push(answer)
  } else {
    next[at] = answer
  }
  return next
}

/**
 * A lista depois de um turno que NAO terminou bem, mas cuja pergunta foi
 * gravada (`error` no stream, ou queda depois do `user_message`).
 *
 * A spec manda o parcial "ficar visivel e marcado". Guardado so no estado do
 * envio, ele sumiria no "Tentar de novo" (que volta a `sending`), ao enviar
 * outra pergunta, e porque o `done` so acrescenta turnos que terminaram bem.
 * Aqui ele entra na LISTA, como uma resposta provisoria com id negativo (o
 * hook os gera: -1, -2, ...), ate a atualizacao silenciosa trazer a linha que
 * o backend gravou -- o backend grava `falhou` ANTES de emitir o `error`.
 */
export function settleInterrupted(
  messages: MessageRead[],
  question: MessageRead,
  partial: string,
  status: 'falhou' | 'interrompida',
  placeholderId: number,
): MessageRead[] {
  const next = messages.some((m) => m.id === question.id) ? [...messages] : [...messages, question]
  next.push({
    id: placeholderId,
    role: 'tutor',
    content: partial,
    status,
    client_message_id: null,
    reply_to_id: question.id,
    error_code: null,
    created_at: question.created_at,
    actions: [],
  })
  return next
}

/** A lista com a acao de mesmo id trocada pela versao nova. */
export function replaceAction(messages: MessageRead[], action: ActionRead): MessageRead[] {
  return messages.map((m) =>
    m.actions.some((a) => a.id === action.id)
      ? { ...m, actions: m.actions.map((a) => (a.id === action.id ? action : a)) }
      : m,
  )
}

/**
 * A pergunta que a tela oferece reenviar depois de recarregar a pagina.
 *
 * So a ULTIMA pergunta conta, e so se nao ha resposta `completa` (nada a
 * fazer) nem `gerando` (o backend responderia 409) depois dela. E o que a spec
 * promete para quem recarrega no meio de uma resposta: ela fica `interrompida`
 * "e a tela oferece Tentar de novo".
 */
export function pendingFromHistory(messages: MessageRead[]): PendingQuestion | null {
  const last = messages.findLast((m) => m.role === 'user')
  if (last === undefined || last.client_message_id === null) {
    return null
  }
  const settled = messages.some(
    (m) => m.reply_to_id === last.id && (m.status === 'completa' || m.status === 'gerando'),
  )
  return settled ? null : { clientMessageId: last.client_message_id, content: last.content }
}
```

(`Array.prototype.findLast` é ES2023, e o `tsconfig.app.json` já declara `"lib": ["ES2023", "DOM"]` — conferido nesta sessão.)

`frontend/src/features/tutoring/useTutorStatus.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { requestJson } from '../../shared/api/client'
import type { StatusRead } from './types'

/**
 * Se a Tifa esta disponivel (spec: `available: false` quando nao ha chave).
 *
 * `error` e separado de `unavailable` porque pedem acoes diferentes: sem
 * chave, nao ha o que a pessoa faca pela tela; sem resposta do servidor,
 * tentar de novo pode resolver.
 */
export type TutorStatus =
  | { status: 'loading' }
  | { status: 'available' }
  | { status: 'unavailable' }
  | { status: 'error' }

export function useTutorStatus(): { state: TutorStatus; reload: () => void } {
  const [state, setState] = useState<TutorStatus>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // O `loading` do reload mora aqui, e nao no efeito: um setState sincrono no
  // corpo do efeito reprova o `react-hooks/set-state-in-effect` (medido no 1a,
  // useMissions.ts).
  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<StatusRead>('/tutoring/status', controller.signal)
      .then((status) => {
        setState({ status: status.available ? 'available' : 'unavailable' })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'error' })
        }
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  return { state, reload }
}
```

`frontend/src/features/tutoring/useTutorConversation.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postStream, requestJson } from '../../shared/api/client'
import {
  appendTurn,
  pendingFromHistory,
  replaceAction,
  settleInterrupted,
  type PendingQuestion,
} from './conversationHistory'
import {
  describePreStreamFailure,
  describeStreamFailure,
  UNKNOWN_RESULT,
  type MessageFailure,
} from './messageFailure'
import { describeQuestionLength, type QuestionLength } from './questionLimit'
import type { ActionRead, MessageRead } from './types'

export type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; messages: MessageRead[] }

/**
 * O envio de UMA pergunta, como uniao discriminada.
 *
 * - `sending`: o POST saiu e o `user_message` ainda nao chegou. Nada foi
 *   confirmado; o texto continua no campo.
 * - `writing`: a pergunta foi GRAVADA (`user_message`) e os `delta` chegam.
 *   `question` e `null` so num stream fora do contrato (delta antes do
 *   `user_message`).
 * - `failed`: sabe-se o que houve -- o `code`, antes do stream ou no `error`.
 * - `unknown`: nao se sabe se a resposta chegou: o stream acabou sem `done`
 *   nem `error`, ou caiu no meio. Repetir com o mesmo id e seguro.
 *
 * `idle.finished` distingue "nada aconteceu ainda" (`false`, na montagem) de
 * "a Tifa acabou de responder" (`true`, depois de um `done`): e o que deixa a
 * regiao viva do painel anunciar o FIM da resposta (spec, "Escrevendo").
 */
export type SendState =
  | { status: 'idle'; finished: boolean }
  | { status: 'sending'; pending: PendingQuestion }
  | { status: 'writing'; pending: PendingQuestion; question: MessageRead | null; partial: string }
  | {
      status: 'failed'
      pending: PendingQuestion
      question: MessageRead | null
      partial: string
      failure: MessageFailure
    }
  | { status: 'unknown'; pending: PendingQuestion; question: MessageRead | null; partial: string }

export interface UseTutorConversationResult {
  history: HistoryState
  /** O historico mais a pergunta em voo, se ela ainda nao estiver nele. */
  messages: MessageRead[]
  send: SendState
  draft: string
  setDraft: (text: string) => void
  length: QuestionLength
  /** Ha o que enviar e nada em andamento. (A disponibilidade e do painel.) */
  canSubmit: boolean
  submit: () => void
  /** O que "Tentar de novo" reenvia, ou `null` quando nao ha o que repetir. */
  retryTarget: PendingQuestion | null
  retry: () => void
  reloadHistory: () => void
  updateAction: (action: ActionRead) => void
}

type TurnOutcome =
  | { kind: 'done'; question: MessageRead | null; answer: MessageRead }
  | { kind: 'failed'; question: MessageRead | null; partial: string; failure: MessageFailure }
  | { kind: 'unknown'; question: MessageRead | null; partial: string }
  | { kind: 'aborted' }

/**
 * Consome o stream de um turno e diz como ele terminou.
 *
 * O final e decidido so por `done` e `error` (spec, "O stream"). Um nome de
 * evento desconhecido e IGNORADO: um backend mais novo pode acrescentar
 * evento, e sem final o resultado e `unknown` do mesmo jeito -- ignorar nao
 * esconde nada.
 */
async function runTurn(
  pending: PendingQuestion,
  signal: AbortSignal,
  onQuestion: (question: MessageRead) => void,
  onDelta: (question: MessageRead | null, partial: string) => void,
): Promise<TurnOutcome> {
  let question: MessageRead | null = null
  let partial = ''
  try {
    const events = postStream(
      '/tutoring/messages',
      { client_message_id: pending.clientMessageId, content: pending.content },
      signal,
    )
    for await (const { event, data } of events) {
      if (event === 'user_message') {
        question = data as MessageRead
        onQuestion(question)
      } else if (event === 'delta') {
        partial += (data as { text: string }).text
        onDelta(question, partial)
      } else if (event === 'done') {
        return { kind: 'done', question, answer: data as MessageRead }
      } else if (event === 'error') {
        const failure = describeStreamFailure((data as { code: string }).code)
        return { kind: 'failed', question, partial, failure }
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return { kind: 'aborted' }
    }
    // Depois do `user_message`, qualquer queda e resultado desconhecido: a
    // pergunta esta gravada e a resposta pode ter terminado. Antes dele, o
    // `code` diz o que houve -- ou nao diz, e tambem e desconhecido.
    const failure = question === null ? describePreStreamFailure(error) : UNKNOWN_RESULT
    return failure === UNKNOWN_RESULT
      ? { kind: 'unknown', question, partial }
      : { kind: 'failed', question, partial, failure }
  }
  return { kind: 'unknown', question, partial }
}

/** O que "Tentar de novo" reenvia em cada estado. */
function retryTargetOf(send: SendState, history: HistoryState): PendingQuestion | null {
  if (send.status === 'unknown') {
    return send.pending
  }
  if (send.status === 'failed') {
    const repeatable =
      send.failure.recovery === 'retry' || send.failure.recovery === 'retry-with-new-id'
    return repeatable ? send.pending : null
  }
  if (send.status === 'idle' && history.status === 'loaded') {
    return pendingFromHistory(history.messages)
  }
  return null
}

/**
 * A conversa com a Tifa: historico, rascunho, envio e reenvio.
 *
 * Vive no TOPO do painel (`TutorPanel`), acima dos conteineres de desktop e de
 * celular: trocar de layout remonta o conteiner, e o rascunho e o stream
 * precisam sobreviver a isso (README §7: o texto digitado nao se perde).
 *
 * O stream usa o sinal de um `AbortController` que nasce com a montagem e
 * aborta na desmontagem. Abortar e a desconexao que o backend grava como
 * `interrompida`; o reenvio com o mesmo id, depois, e seguro.
 */
export function useTutorConversation(): UseTutorConversationResult {
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [send, setSend] = useState<SendState>({ status: 'idle', finished: false })
  const [draft, setDraft] = useState('')
  const lifetime = useRef<AbortController | null>(null)

  useEffect(() => {
    // Um controlador POR montagem: no StrictMode o efeito roda, limpa e roda
    // de novo, e um controlador criado uma vez so ficaria abortado para sempre.
    const controller = new AbortController()
    lifetime.current = controller
    return () => {
      controller.abort()
    }
  }, [])

  const reloadHistory = useCallback(() => {
    setHistory({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<MessageRead[]>('/tutoring/messages', controller.signal)
      .then((messages) => {
        setHistory({ status: 'loaded', messages })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory({ status: 'error' })
        }
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  // Ids das respostas provisorias (-1, -2, ...): nunca colidem com os do banco.
  const placeholderIds = useRef(0)

  /**
   * Busca o historico SEM passar por `loading`: a lista da tela fica ate a do
   * servidor chegar. Falhar aqui nao e erro para mostrar -- a resposta
   * provisoria continua na lista, marcada, e a proxima recarga corrige.
   */
  const refreshSilently = useCallback(() => {
    requestJson<MessageRead[]>('/tutoring/messages', lifetime.current!.signal)
      .then((messages) => {
        setHistory((current) => (current.status === 'loaded' ? { status: 'loaded', messages } : current))
      })
      .catch(() => undefined)
  }, [])

  const run = useCallback((pending: PendingQuestion) => {
    // O efeito de montagem ja rodou: `run` so e chamado por clique.
    const signal = lifetime.current!.signal
    setSend({ status: 'sending', pending })
    void runTurn(
      pending,
      signal,
      (question) => {
        // So agora a pergunta esta gravada, e so agora o campo pode ser limpo
        // -- e so se ainda contem ESTA pergunta: o que foi digitado depois do
        // envio e outra pergunta, e nao pode sumir.
        setDraft((current) => (current.trim() === pending.content ? '' : current))
        setSend({ status: 'writing', pending, question, partial: '' })
      },
      (question, partial) => {
        setSend({ status: 'writing', pending, question, partial })
      },
    ).then((outcome) => {
      if (outcome.kind === 'aborted') {
        return
      }
      if (outcome.kind === 'done') {
        // Com a conversa recarregando, a lista que chegar e a fonte: ela ja
        // traz esta pergunta e esta resposta.
        setHistory((current) =>
          current.status === 'loaded'
            ? {
                status: 'loaded',
                messages: appendTurn(current.messages, outcome.question, outcome.answer),
              }
            : current,
        )
        setSend({ status: 'idle', finished: true })
        return
      }
      const { question } = outcome
      if (question !== null) {
        // A pergunta foi gravada: o parcial entra na LISTA, marcado, e o
        // historico do servidor (que ja tem a linha `falhou`, ou a
        // `interrompida`/`completa` que a queda deixou) o substitui.
        placeholderIds.current -= 1
        const placeholderId = placeholderIds.current
        const status = outcome.kind === 'failed' ? 'falhou' : 'interrompida'
        setHistory((current) =>
          current.status === 'loaded'
            ? {
                status: 'loaded',
                messages: settleInterrupted(current.messages, question, outcome.partial, status, placeholderId),
              }
            : current,
        )
        refreshSilently()
      }
      setSend(
        outcome.kind === 'failed'
          ? { status: 'failed', pending, question: outcome.question, partial: outcome.partial, failure: outcome.failure }
          : { status: 'unknown', pending, question: outcome.question, partial: outcome.partial },
      )
    })
  }, [refreshSilently])

  const retryTarget = retryTargetOf(send, history)
  const length = describeQuestionLength(draft)
  const busy = send.status === 'sending' || send.status === 'writing'
  const canSubmit = length.sendable && !busy && history.status === 'loaded'
  const needsNewId = send.status === 'failed' && send.failure.recovery === 'retry-with-new-id'

  const submit = useCallback(() => {
    if (!canSubmit) {
      return
    }
    const content = draft.trim()
    // O mesmo texto depois de uma falha e a MESMA pergunta: um id novo
    // duplicaria uma pergunta que talvez ja esteja gravada.
    const reuse = retryTarget !== null && retryTarget.content === content && !needsNewId
    run(reuse ? retryTarget : { clientMessageId: crypto.randomUUID(), content })
  }, [canSubmit, draft, needsNewId, retryTarget, run])

  const retry = useCallback(() => {
    if (retryTarget === null) {
      return
    }
    run(needsNewId ? { ...retryTarget, clientMessageId: crypto.randomUUID() } : retryTarget)
  }, [needsNewId, retryTarget, run])

  const updateAction = useCallback((action: ActionRead) => {
    setHistory((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', messages: replaceAction(current.messages, action) }
        : current,
    )
  }, [])

  const messages = useMemo(() => {
    if (history.status !== 'loaded') {
      return []
    }
    // So o turno ESCREVENDO fica fora da lista; o que falhou ja entrou nela
    // (`settleInterrupted`), e continua visivel durante o proximo `sending`.
    const inFlight = send.status === 'writing' ? send.question : null
    return inFlight === null || history.messages.some((m) => m.id === inFlight.id)
      ? history.messages
      : [...history.messages, inFlight]
  }, [history, send])

  return {
    history,
    messages,
    send,
    draft,
    setDraft,
    length,
    canSubmit,
    submit,
    retryTarget,
    retry,
    reloadHistory,
    updateAction,
  }
}
```

Dois ramos acima só são alcançáveis por casos específicos, e cada um tem o seu `it`: o `retryTarget === null` de `retry` (um caso extra, **S23** `retry sem nada a repetir nao envia`: `retry()` no estado `idle` com histórico vazio, e `SEND` não é chamado) e o `!canSubmit` de `submit` (S16).

- [ ] **Step 6: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/features/tutoring/ && npm run lint && npx tsc -b`
Expected: PASS nos três. Se o ESLint acusar `react-hooks/exhaustive-deps` ou `react-hooks/refs` em algum trecho, **corrija o código** (a regra está certa até prova em contrário); não desligue a regra nem use `eslint-disable`.

- [ ] **Step 7: Mutações**

1. Em `run`, troque o callback de `onQuestion` por um que **não** limpa o rascunho, e acrescente `setDraft('')` logo depois de `setSend({ status: 'sending', pending })`. Expected: FAIL em S10, S11, S13 e S14 (o texto some antes da confirmação) — é a regra do §7.
2. Troque `current.trim() === pending.content ? '' : current` por `''`. Expected: FAIL em S3.
3. Em `retry`, troque `run(needsNewId ? {...} : retryTarget)` por `run({ ...retryTarget, clientMessageId: crypto.randomUUID() })`. Expected: FAIL em S7, S8 e S11 (id diferente no reenvio).
4. Em `submit`, troque `run(reuse ? retryTarget : {...})` por `run({ clientMessageId: crypto.randomUUID(), content })`. Expected: FAIL em S15.
5. Em `appendTurn`, troque o `next[at] = answer` por `next.push(answer)`. Expected: FAIL em S6 e no teste unitário "troca a resposta que ja esta na lista".
6. Em `runTurn`, troque o `return { kind: 'unknown', question, partial }` final por `return { kind: 'done', question, answer: question as MessageRead }`. Expected: FAIL em S8.
7. Em `describeQuestionLength`, troque `Array.from(text.trim()).length` por `text.trim().length`. Expected: FAIL em "conta pontos de codigo".
8. Em `pendingFromHistory`, retire `|| m.status === 'gerando'`. Expected: FAIL no caso `gerando`.
9. Em `run`, apague o bloco `if (question !== null) { ... settleInterrupted ... }`. Expected: FAIL em S24 (o parcial some no segundo envio), S25 e S7.

- [ ] **Step 8: Gate e commit**

```bash
cd frontend && npm run format && npm run test:coverage
cd .. && make check
git add frontend/src/features/tutoring/ frontend/src/test/fetchRoutes.ts
git commit -m "feat(tutoria): hooks da conversa, reenvio idempotente e limite da pergunta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** todos os casos de S1 a S26, H1 a H3 e os unitários passam; as nove mutações vistas reprovando; cobertura 100%; `npm run lint` sem aviso (`--max-warnings 0`); `make check` EXIT 0; commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 3**: os hooks, o `src/test/fetchRoutes.ts` e por que ele existe (um `Response` não serve duas chamadas).
- "Decisões": a contagem em pontos de código; o contador a partir de 3600; o reuso do id pelo mesmo texto; o campo limpo só se ainda contém a pergunta; o "Tentar de novo" derivado do histórico; o `unknown` como membro próprio; o evento desconhecido ignorado.
- **Pendência 41, atualizada (continua aberta):** "Desde o 1b-2 o teto é aplicado também na tela (`MAX_QUESTION_LENGTH`, `features/tutoring/questionLimit.ts`), espelhado à mão; mudar o número é mudar os dois lados."
- **Pendência 33, atualizada:** "O `crypto.randomUUID` passou a gerar também o `client_message_id` da pergunta e o `operation_id` da confirmação da Tifa (Task 5). O mesmo cenário (frontend aberto por HTTP num IP de rede) faria o Enviar lançar `TypeError` antes do pedido. Continua **não medido**."

---

### Task 4: O painel da Tifa — layout, retrato, região viva e os estados da spec

**Objetivo:** desenhar a conversa em todos os estados da tabela da spec (l.~337-349), com os textos literais dela, num painel lateral expansível no desktop (aberto/fechado lembrado no `localStorage`) e numa folha aberta por botão fixo no celular. O painel entra no Quartel-General. O cartão de proposta é da Task 5: aqui, uma mensagem com ação mostra só o texto.

**Files:**
- Create: `frontend/src/test/viewport.ts` (infraestrutura de teste)
- Create: `frontend/src/features/tutoring/useIsDesktop.ts`, `useIsDesktop.test.tsx`
- Create: `frontend/src/features/tutoring/panelPreference.ts`, `panelPreference.test.ts`
- Create: `frontend/src/features/tutoring/TutorConversation.tsx`
- Create: `frontend/src/features/tutoring/TutorPanel.tsx`, `TutorPanel.test.tsx` (cobre também o `TutorConversation`, que não tem estado próprio)
- Modify: `frontend/src/pages/Headquarters.tsx`, `Headquarters.test.tsx`
- Modify: `frontend/src/App.test.tsx`, `frontend/src/main.test.tsx` (passam a usar `routeFetch` e `stubViewport`)
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: `useTutorStatus`, `useTutorConversation` e tipos (Task 3); `UNKNOWN_RESULT` (Task 2).
- Produces:
  - `useIsDesktop(): boolean` — `true` a partir de `(min-width: 1024px)`, o `lg` do Tailwind.
  - `PANEL_OPEN_KEY = 'focusquest.tutor-panel.open'`; `readPanelOpen(): boolean` (padrão `true`); `writePanelOpen(open: boolean): void`.
  - `TutorPanel(): JSX.Element` (a Task 5 acrescenta a prop `onMissionCreated`).
  - `TutorConversation(props: { conversation: UseTutorConversationResult; status: TutorStatus; onReloadStatus: () => void; inputRef?: Ref<HTMLTextAreaElement> }): JSX.Element` (a Task 5 acrescenta `renderAction`).
  - `src/test/viewport.ts`: `stubViewport(kind: 'desktop' | 'mobile'): { setDesktop: (desktop: boolean) => void }`.

**Os textos, fixados aqui** (os testes afirmam cada um literalmente):

| Estado (spec) | O que aparece | `data-testid` |
|---|---|---|
| Carregando o histórico | esqueleto (três blocos `animate-pulse`, `aria-hidden`) e um `role="status"` `sr-only` "Carregando a conversa…" | `tutor-history-loading` |
| Status não carregou | "Não foi possível verificar se a Tifa está disponível." e o botão "Tentar novamente" | `tutor-status-error`, `tutor-status-retry` |
| Histórico não carregou | "Não foi possível carregar a conversa." e o botão "Tentar novamente" | `tutor-history-error`, `tutor-history-retry` |
| Indisponível | "A Tifa está fora do ar: falta configurar o provedor." (texto da spec); o campo e o Enviar desabilitados; o histórico, se carregou, continua visível | `tutor-unavailable` |
| Vazio | saudação **da interface**: "Aqui você conversa com a Tifa, sua tutora. Peça uma missão de estudo ou tire uma dúvida." | `tutor-greeting` |
| Escrevendo | o parcial numa bolha da Tifa; a região viva diz "Tifa está escrevendo…"; o Enviar diz "Enviando…" e fica desabilitado | `tutor-partial`, `tutor-live` |
| Fim da resposta | a região viva diz "Tifa terminou de responder." | `tutor-live` |
| Interrompida (histórico, ou `unknown`) | a bolha com a marca "Resposta interrompida" — no `unknown`, a resposta provisória da lista (Task 3, `settleInterrupted`) | `tutor-message-mark` |
| Falhou (histórico, ou `failed` no stream) | a bolha com a marca "Resposta com falha"; continua visível no "Tentar de novo" e ao enviar outra pergunta | `tutor-message-mark` |
| Em andamento (histórico `gerando`) | a bolha com a marca "Resposta em andamento" | `tutor-message-mark` |
| Falha do envio | `role="alert"` com o `failure.message` (Task 2) e "Tentar de novo" quando há o que repetir | `tutor-failure`, `tutor-retry` |
| Reenvio vindo do histórico | "A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada." (parágrafo comum, **não** `alert`: ninguém acabou de errar nada) e "Tentar de novo" | `tutor-history-retry-note`, `tutor-retry` |
| Contador | o `counter` de `describeQuestionLength`, ligado ao campo por `aria-describedby` | `tutor-counter` |

Rótulos: campo "Sua mensagem para a Tifa" (`<label>` visível); botão "Enviar"; autor de cada bolha "Você" ou "Tifa"; desktop: título "Tifa" e subtítulo "sua tutora", botão "Recolher o painel da Tifa" / "Abrir o painel da Tifa" (`aria-expanded`, `aria-controls="tutor-panel-body"`, `data-testid="tutor-panel-toggle"`); celular: botão fixo "Falar com a Tifa" (`data-testid="tutor-sheet-open"`, `aria-expanded`, `aria-controls="tutor-sheet"`), folha `role="dialog" aria-modal="true" aria-labelledby="tutor-sheet-title"` (`data-testid="tutor-sheet"`) com o botão "Fechar a conversa" (`data-testid="tutor-sheet-close"`). Retrato: círculo `bg-emerald-700` com "TL" em branco, `aria-hidden="true"`, `data-testid="tutor-portrait"`.

- [ ] **Step 1: A infraestrutura de teste do viewport**

`frontend/src/test/viewport.ts`:

```ts
import { vi } from 'vitest'

/**
 * `matchMedia` falso: o jsdom nao implementa `window.matchMedia` (chamar
 * lanca TypeError). O painel da Tifa decide entre lateral e folha pelo
 * `(min-width: 1024px)`, e todo teste que monta o painel -- inclusive os da
 * pagina, do App e do main -- precisa declarar em qual tela esta.
 *
 * `setDesktop` muda a resposta e avisa os ouvintes, como o navegador faz
 * quando a janela cruza o limite.
 */
export function stubViewport(kind: 'desktop' | 'mobile'): { setDesktop: (desktop: boolean) => void } {
  let matches = kind === 'desktop'
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matches
    },
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      listeners.delete(listener)
    },
  }))
  return {
    setDesktop: (desktop) => {
      matches = desktop
      for (const listener of listeners) {
        listener()
      }
    },
  }
}
```

- [ ] **Step 2: Testes que falham — `useIsDesktop` e `panelPreference`**

`frontend/src/features/tutoring/useIsDesktop.test.tsx`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '../../test/viewport'
import { useIsDesktop } from './useIsDesktop'

describe('useIsDesktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['desktop', true],
    ['mobile', false],
  ] as const)('%s responde %s', (kind, expected) => {
    stubViewport(kind)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(expected)
  })

  it('acompanha a janela cruzando o limite, e solta o ouvinte ao desmontar', () => {
    const viewport = stubViewport('mobile')
    const { result, unmount } = renderHook(() => useIsDesktop())
    act(() => {
      viewport.setDesktop(true)
    })
    expect(result.current).toBe(true)
    unmount()
    // Sem ouvinte, mudar de novo nao chama nada que ja desmontou.
    expect(() => {
      viewport.setDesktop(false)
    }).not.toThrow()
  })
})
```

`frontend/src/features/tutoring/panelPreference.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PANEL_OPEN_KEY, readPanelOpen, writePanelOpen } from './panelPreference'

describe('panelPreference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('sem nada gravado, o painel comeca aberto', () => {
    expect(readPanelOpen()).toBe(true)
  })

  it('grava e le o fechado e o aberto', () => {
    writePanelOpen(false)
    expect(localStorage.getItem(PANEL_OPEN_KEY)).toBe('false')
    expect(readPanelOpen()).toBe(false)
    writePanelOpen(true)
    expect(readPanelOpen()).toBe(true)
  })

  it('um valor estranho conta como aberto', () => {
    localStorage.setItem(PANEL_OPEN_KEY, 'talvez')
    expect(readPanelOpen()).toBe(true)
  })

  it('armazenamento que lanca na leitura: aberto, sem quebrar', () => {
    // Navegacao privada, cota estourada, armazenamento bloqueado.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(readPanelOpen()).toBe(true)
  })

  it('armazenamento que lanca na escrita: nao quebra', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError')
    })
    expect(() => {
      writePanelOpen(false)
    }).not.toThrow()
  })
})
```

- [ ] **Step 3: Testes que falham — o painel**

`frontend/src/features/tutoring/TutorPanel.test.tsx`. Fixtures: os mesmos construtores `question`/`answer` da Task 3 (copie-os para o topo deste arquivo; nenhum arquivo de teste importa outro), `routeFetch`, `stubViewport`, `streamResponse`/`controlledStream`/`sseFrame`. Um helper:

```ts
function mountPanel(routes: Record<string, Route>, kind: 'desktop' | 'mobile' = 'desktop') {
  const fetchMock = routeFetch({
    'GET /api/tutoring/status': () => Response.json({ available: true }),
    'GET /api/tutoring/messages': () => Response.json([]),
    ...routes,
  })
  const viewport = stubViewport(kind)
  return { fetchMock, viewport, ...render(<TutorPanel />) }
}

afterEach(() => {
  // P20 e P21 gravam o painel fechado: sem limpar, o proximo teste comecaria
  // com o painel recolhido e reprovaria por ordem de execucao.
  localStorage.clear()
  vi.unstubAllGlobals()
})
```

Interação por `fireEvent` do `@testing-library/react` (`fireEvent.change` no campo, `fireEvent.click`, `fireEvent.keyDown`), como os testes do Incremento A: o `@testing-library/user-event` **não** está instalado (conferido em `frontend/package.json` nesta sessão), e instalá-lo seria dependência nova.

Casos, cada um um `it`:

| # | Nome | Roteiro | Asserções |
|---|---|---|---|
| P1 | `a regiao viva existe desde o primeiro render, vazia` | histórico pendente (promise que não resolve) | `getByTestId('tutor-live')` existe, `role="status"`, texto `''` — **antes** de qualquer `await` |
| P2 | `carregando: esqueleto e anuncio de carregamento` | histórico pendente | `tutor-history-loading` visível; `getByText('Carregando a conversa…')` |
| P3 | `vazio: a saudacao da interface, e nao uma fala da Tifa` | histórico `[]` | `tutor-greeting` com o texto literal; nenhuma bolha com autor "Tifa" |
| P4 | `historico: perguntas e respostas com o autor, na ordem` | `[q1, a2]` | duas `li` em `tutor-messages` com `data-message-id` 1 e 2; "Você" e "Tifa" |
| P5 | `marcas de interrompida, com falha e em andamento no historico` | `[q1, answer(2,1,'meio','interrompida'), q3, answer(4,3,'x','falhou'), q5, answer(6,5,'y','gerando')]` | cada `tutor-message-mark` com o texto da tabela; a `completa` não tem marca |
| P6 | `indisponivel pelo status: texto da spec, campo e Enviar desabilitados` | status `{available:false}` | `tutor-unavailable` com o texto literal; `getByLabelText('Sua mensagem para a Tifa')` `toBeDisabled()`; Enviar `toBeDisabled()` |
| P7 | `indisponivel pelo 503: o texto digitado continua no campo` | status `true`; `POST` → 503 `provedor_nao_configurado` | digite "Minha dúvida", envie; `tutor-unavailable` aparece; o campo continua com "Minha dúvida" e desabilitado; **nenhum** `tutor-failure` |
| P8 | `o status que falha oferece tentar de novo` | status 500 e depois `true` | `tutor-status-error` com o texto; clicar em `tutor-status-retry` chama o status de novo e o campo habilita |
| P9 | `o historico que falha oferece tentar de novo` | histórico 500 e depois `[]` | `tutor-history-error`; `tutor-history-retry`; depois `tutor-greeting` |
| P10 | `escrevendo: o texto chega pelos delta e a regiao viva anuncia o inicio` | `controlledStream`; push `user_message`, `delta 'Bora'`, `delta ', vamos!'` | `tutor-partial` com "Bora, vamos!"; `tutor-live` "Tifa está escrevendo…"; Enviar "Enviando…" desabilitado |
| P11 | `a regiao viva anuncia o fim, e nao cada palavra` | idem, depois `done` | `tutor-live` "Tifa terminou de responder."; durante os `delta` o texto da região **não** mudou (afirme depois de cada push que é "Tifa está escrevendo…") |
| P12 | `o campo so e limpo quando o user_message chega` | `controlledStream` | depois do clique e antes do push: campo com o texto; depois do `user_message`: campo `''` |
| P13 | `falha no stream: parcial marcado, alerta e Tentar de novo com o mesmo id` | 1º: `user_message`, `delta 'Meio'`, `error provedor_indisponivel`; `HISTORY` 2ª chamada → a linha `falhou` gravada; 2º: `user_message`, `done` | um `tutor-message` com "Meio" e `tutor-message-mark` "Resposta com falha", que **continua** na tela depois do clique em "Tentar de novo" e da resposta nova; `role="alert"` com o texto de `provedor_indisponivel`; clicar em "Tentar de novo" manda o mesmo `client_message_id` (use `requestsTo` + `jsonBody`) |
| P14 | `resultado desconhecido: parcial marcado como interrompida` | `user_message`, `delta 'x'`, close; `HISTORY` 2ª chamada 500 | `tutor-message` com "x" e `tutor-message-mark` "Resposta interrompida"; alerta com `UNKNOWN_RESULT.message` |
| P15 | `409 antes do stream: alerta, texto mantido` | 409 `mensagem_em_andamento` | alerta com o texto; campo com o texto digitado; "Tentar de novo" presente |
| P16 | `422: alerta sem Tentar de novo, texto mantido` | 422 | alerta com o texto de `edit`; **sem** `tutor-retry`; campo com o texto |
| P17 | `depois de recarregar, a ultima pergunta interrompida pode ser reenviada` | histórico `[q10, answer(11,10,'meio','interrompida')]` | `tutor-history-retry-note` com o texto literal (e **sem** `role="alert"`); "Tentar de novo" manda `q10.client_message_id` |
| P18 | `contador: aparece perto do limite, some longe dele, e liga ao campo` | digite 3599 e depois 3600 caracteres | sem `tutor-counter` em 3599; em 3600, "Restam 400 caracteres." e `aria-describedby` do campo = `id` do contador |
| P19 | `acima do limite: Enviar desabilitado e o texto mantido` | digite 4001 | "Passou 1 caractere do limite de 4000."; Enviar desabilitado; o valor do campo tem 4001 caracteres; clicar/submeter o formulário não chama `POST` |
| P20 | `desktop: recolher e abrir o painel, lembrado no localStorage` | desktop | toggle com `aria-expanded="true"` e nome "Recolher o painel da Tifa"; clicar: `aria-expanded="false"`, nome "Abrir o painel da Tifa", `tutor-panel-body` fora do documento, `localStorage.getItem(PANEL_OPEN_KEY)` `'false'`; desmontar e montar de novo: começa fechado |
| P21 | `desktop fechado: o stream continua e a regiao viva segue anunciando` | desktop aberto; envie com `controlledStream`; push `user_message`; **feche** o painel; push `done` | `tutor-live` "Tifa terminou de responder." com o painel fechado; reabrir mostra a resposta |
| P22 | `celular: botao fixo abre a folha como dialogo, com o foco no campo` | mobile | `tutor-sheet-open` visível, `aria-expanded="false"`; clicar: `getByRole('dialog', { name: 'Tifa' })`, `aria-modal="true"`; `await waitFor(() => expect(document.activeElement).toBe(campo))` — o foco é aplicado num `queueMicrotask`, depois do render |
| P23 | `celular: Esc e Fechar a conversa fecham a folha e devolvem o foco ao botao` | mobile | abrir; `fireEvent.keyDown(dialog, { key: 'Escape' })`: sem dialog, e `await waitFor` até o foco estar no `tutor-sheet-open`; abrir; clicar em `tutor-sheet-close`: idem (também com `waitFor`) |
| P24 | `celular: o Tab fica dentro da folha` | mobile, folha aberta | com o foco no último focável (Enviar habilitado: digite algo), `keyDown Tab` leva ao primeiro (`tutor-sheet-close`); `Shift+Tab` no primeiro leva ao último |
| P24b | `celular: Tab e Shift+Tab no meio da folha seguem o fluxo normal` | mobile, folha aberta, foco no campo (o meio) | `fireEvent.keyDown(dialog, { key: 'Tab' })` e `{ key: 'Tab', shiftKey: true }` devolvem `true` (não houve `preventDefault`) e o foco continua no campo — cobre o ramo em que nenhuma das duas condições do `onSheetKeyDown` vale |
| P25 | `trocar de layout nao perde o rascunho nem o stream` | desktop; digite "Rascunho"; `viewport.setDesktop(false)`; abrir a folha | o campo da folha tem "Rascunho" |
| P26 | `o retrato e decorativo e nao usa asset nenhum` | desktop | `tutor-portrait` tem `aria-hidden="true"`, texto "TL", e **não** contém `img` |
| P30 | `indisponivel: nenhum Tentar de novo, nem o do historico` | status `{available:false}`; histórico `[q10, answer(11,10,'meio','interrompida')]` | nenhum `tutor-retry` e nenhum `tutor-history-retry-note`; a mensagem interrompida continua visível com a marca |
| P27 | `outras teclas na folha nao fazem nada` | mobile, folha aberta | `keyDown` com `key: 'a'`: a folha continua aberta (cobre o ramo "nem Esc nem Tab" do tratador) |

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/tutoring/`
Expected: FAIL — `useIsDesktop`, `panelPreference`, `TutorPanel` não existem.

- [ ] **Step 5: Implementar os dois módulos pequenos**

`frontend/src/features/tutoring/useIsDesktop.ts`:

```ts
import { useSyncExternalStore } from 'react'

/** O `lg` do Tailwind: a partir daqui o painel e lateral; abaixo, folha. */
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * Se a tela e de desktop, acompanhando a janela.
 *
 * `useSyncExternalStore`, e nao `useState` + `useEffect`: o valor e de uma
 * fonte externa ao React, e ler no efeito daria um primeiro render com o
 * layout errado e um segundo corrigindo -- o painel piscaria.
 *
 * O layout nao e decidido so por CSS porque a SEMANTICA muda junto: no
 * celular a conversa e um dialogo modal, com foco e Esc; no desktop e uma
 * regiao da pagina. Atributo ARIA nao tem media query.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
```

`frontend/src/features/tutoring/panelPreference.ts`:

```ts
/** A chave do `localStorage` onde mora o aberto/fechado do painel. */
export const PANEL_OPEN_KEY = 'focusquest.tutor-panel.open'

/**
 * Se o painel do desktop comeca aberto.
 *
 * O `localStorage` pode LANCAR -- navegacao privada em alguns navegadores,
 * armazenamento bloqueado, cota estourada. Lembrar o painel e conveniencia:
 * sem armazenamento, ele comeca aberto e a pagina funciona.
 */
export function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writePanelOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, String(open))
  } catch {
    // Sem armazenamento, o painel so nao lembra a escolha na proxima visita.
  }
}
```

- [ ] **Step 6: Implementar a conversa desenhada**

`frontend/src/features/tutoring/TutorConversation.tsx`:

```tsx
import { useId, type ReactElement, type Ref } from 'react'
import { UNKNOWN_RESULT } from './messageFailure'
import type { MessageRead, MessageStatus } from './types'
import type { UseTutorConversationResult } from './useTutorConversation'
import type { TutorStatus } from './useTutorStatus'

/** O texto do estado indisponivel, literal da spec. */
export const UNAVAILABLE_TEXT = 'A Tifa está fora do ar: falta configurar o provedor.'

const GREETING =
  'Aqui você conversa com a Tifa, sua tutora. Peça uma missão de estudo ou tire uma dúvida.'

const HISTORY_RETRY_NOTE =
  'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.'

/**
 * A marca de cada estado de mensagem, EXAUSTIVA sobre o tipo: um estado novo
 * reprova o `tsc` ate ganhar marca (ou `null`, decidido). O estado cru nunca
 * vai para a tela.
 */
const STATUS_MARK: Record<MessageStatus, string | null> = {
  completa: null,
  gerando: 'Resposta em andamento',
  interrompida: 'Resposta interrompida',
  falhou: 'Resposta com falha',
}

const BUBBLE = {
  user: 'ml-8 rounded-lg bg-slate-800 p-3 text-sm text-slate-100',
  tutor: 'mr-8 rounded-lg border border-emerald-700/60 bg-emerald-950/40 p-3 text-sm text-slate-100',
} as const

const BUTTON =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

function Author({ role }: { role: MessageRead['role'] }) {
  return (
    <p className="mb-1 text-xs font-semibold text-slate-400">{role === 'user' ? 'Você' : 'Tifa'}</p>
  )
}

function MessageItem({ message }: { message: MessageRead }) {
  const mark = STATUS_MARK[message.status]
  return (
    <li
      data-testid="tutor-message"
      data-message-id={message.id}
      className={BUBBLE[message.role]}
    >
      <Author role={message.role} />
      <p className="whitespace-pre-wrap">{message.content}</p>
      {mark !== null && (
        <p data-testid="tutor-message-mark" className="mt-1 text-xs font-medium text-amber-300">
          {mark}
        </p>
      )}
    </li>
  )
}

/**
 * O que aparece no lugar da lista enquanto ela nao existe, ou quando esta
 * vazia. Retorna `null` quando ha lista para mostrar.
 *
 * Tipo de retorno declarado: um estado novo em `HistoryState` torna o fim
 * alcancavel e o `tsc` reprova (mesma tecnica de `MissionList.tsx`).
 */
function HistoryPlaceholder({
  conversation,
}: {
  conversation: UseTutorConversationResult
}): ReactElement | null {
  const { history, messages } = conversation
  switch (history.status) {
    case 'loading':
      return (
        <div data-testid="tutor-history-loading" className="flex flex-col gap-2">
          <p role="status" className="sr-only">
            Carregando a conversa…
          </p>
          {[0, 1, 2].map((n) => (
            <div key={n} aria-hidden="true" className="h-12 animate-pulse rounded-lg bg-slate-800" />
          ))}
        </div>
      )
    case 'error':
      return (
        <div data-testid="tutor-history-error" className="text-sm text-red-200">
          <p>Não foi possível carregar a conversa.</p>
          <button
            type="button"
            data-testid="tutor-history-retry"
            onClick={conversation.reloadHistory}
            className={`mt-2 ${BUTTON}`}
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return messages.length === 0 && conversation.send.status === 'idle' ? (
        <p data-testid="tutor-greeting" className="text-sm text-slate-300">
          {GREETING}
        </p>
      ) : null
  }
}

/**
 * A bolha da resposta que ESTA sendo escrita. A que falhou ou foi
 * interrompida ja esta na lista (`settleInterrupted`), com a marca do estado.
 */
function PartialAnswer({ send }: { send: UseTutorConversationResult['send'] }) {
  if (send.status !== 'writing') {
    return null
  }
  return (
    <li data-testid="tutor-partial" className={BUBBLE.tutor}>
      <Author role="tutor" />
      <p className="whitespace-pre-wrap">{send.partial}</p>
      <p className="mt-1 text-xs text-emerald-300">Tifa está escrevendo…</p>
    </li>
  )
}

/** O aviso da falha e o "Tentar de novo", quando ha o que repetir. */
function FailureNotice({
  conversation,
  canRetry,
}: {
  conversation: UseTutorConversationResult
  /** Falso com a Tifa indisponivel ou sem status: reenviar so daria 503. */
  canRetry: boolean
}) {
  const { send, retryTarget, retry } = conversation
  const retryButton =
    retryTarget === null || !canRetry ? null : (
      <button type="button" data-testid="tutor-retry" onClick={retry} className={`mt-2 ${BUTTON}`}>
        Tentar de novo
      </button>
    )
  if (send.status === 'failed' && send.failure.recovery !== 'unavailable') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>{send.failure.message}</p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'unknown') {
    return (
      <div role="alert" data-testid="tutor-failure" className="text-sm text-red-200">
        <p>{UNKNOWN_RESULT.message}</p>
        {retryButton}
      </div>
    )
  }
  if (send.status === 'idle' && retryTarget !== null && canRetry) {
    return (
      <div className="text-sm text-slate-300">
        <p data-testid="tutor-history-retry-note">{HISTORY_RETRY_NOTE}</p>
        {retryButton}
      </div>
    )
  }
  return null
}

/**
 * A conversa desenhada: lista, resposta em voo, aviso de falha e campo.
 *
 * Nao tem estado proprio -- tudo vem de `conversation`, que mora no topo do
 * painel. E o que deixa o painel desenhar esta mesma arvore na lateral do
 * desktop ou na folha do celular sem perder o rascunho.
 */
export function TutorConversation({
  conversation,
  status,
  onReloadStatus,
  inputRef,
}: {
  conversation: UseTutorConversationResult
  status: TutorStatus
  onReloadStatus: () => void
  inputRef?: Ref<HTMLTextAreaElement>
}) {
  const counterId = useId()
  const { send, length } = conversation
  const unavailable =
    status.status === 'unavailable' ||
    (send.status === 'failed' && send.failure.recovery === 'unavailable')
  const inputDisabled = unavailable || status.status !== 'available'
  const busy = send.status === 'sending' || send.status === 'writing'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {unavailable && (
          <p data-testid="tutor-unavailable" className="mb-3 text-sm font-medium text-amber-200">
            {UNAVAILABLE_TEXT}
          </p>
        )}
        {status.status === 'error' && (
          <div data-testid="tutor-status-error" className="mb-3 text-sm text-red-200">
            <p>Não foi possível verificar se a Tifa está disponível.</p>
            <button
              type="button"
              data-testid="tutor-status-retry"
              onClick={onReloadStatus}
              className={`mt-2 ${BUTTON}`}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <HistoryPlaceholder conversation={conversation} />
        {conversation.messages.length > 0 || send.status !== 'idle' ? (
          <ol role="list" data-testid="tutor-messages" className="flex flex-col gap-2">
            {conversation.messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            <PartialAnswer send={send} />
          </ol>
        ) : null}
        <FailureNotice conversation={conversation} canRetry={!inputDisabled} />
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          conversation.submit()
        }}
      >
        <label htmlFor={`${counterId}-input`} className="text-sm font-medium text-slate-200">
          Sua mensagem para a Tifa
        </label>
        <textarea
          id={`${counterId}-input`}
          ref={inputRef}
          data-testid="tutor-input"
          rows={3}
          value={conversation.draft}
          disabled={inputDisabled}
          aria-describedby={length.counter === null ? undefined : counterId}
          onChange={(event) => {
            conversation.setDraft(event.target.value)
          }}
          className="w-full resize-none rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <p id={counterId} data-testid="tutor-counter" className="text-xs text-slate-400">
            {length.counter}
          </p>
          <button
            type="submit"
            data-testid="tutor-send"
            disabled={inputDisabled || !conversation.canSubmit}
            className={BUTTON}
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

(O `tutor-counter` fica no DOM sempre, vazio longe do limite, e o `aria-describedby` só aponta para ele quando há texto — o P18 afirma as duas coisas. Ajuste o P18 para `queryByText` em vez de `queryByTestId` na ausência.)

- [ ] **Step 7: Implementar o painel**

`frontend/src/features/tutoring/TutorPanel.tsx`:

```tsx
import { useRef, useState, type KeyboardEvent } from 'react'
import { readPanelOpen, writePanelOpen } from './panelPreference'
import { TutorConversation } from './TutorConversation'
import { useIsDesktop } from './useIsDesktop'
import { useTutorConversation, type SendState } from './useTutorConversation'
import { useTutorStatus } from './useTutorStatus'

/**
 * O que a regiao viva anuncia: o INICIO e o FIM da resposta, e nao cada
 * palavra (spec, estado "Escrevendo"). Uma regiao que mudasse a cada `delta`
 * faria o leitor de tela recitar o texto aos pedacos, atropelando a si mesmo.
 * A falha e anunciada pelo `role="alert"` da propria conversa.
 */
function liveText(send: SendState): string {
  if (send.status === 'sending' || send.status === 'writing') {
    return 'Tifa está escrevendo…'
  }
  return send.status === 'idle' && send.finished ? 'Tifa terminou de responder.' : ''
}

/** Retrato PLACEHOLDER: iniciais em verde, nenhum asset dos jogos (README §7). */
function Portrait() {
  return (
    <span
      data-testid="tutor-portrait"
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white"
    >
      TL
    </span>
  )
}

/** Os elementos focaveis da folha, na ordem do documento. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])'),
  )
}

/**
 * O painel da Tifa no Quartel-General.
 *
 * Os DOIS hooks moram aqui, acima dos conteineres: no desktop a conversa e
 * uma coluna lateral expansivel; no celular, uma folha modal aberta por um
 * botao fixo. Trocar de layout remonta o conteiner, e o rascunho e o stream
 * sobrevivem porque nao moram nele.
 *
 * A regiao viva tambem mora aqui, FORA dos conteineres: ela existe desde o
 * primeiro render e continua no documento com o painel recolhido ou a folha
 * fechada -- um leitor de tela so anuncia mudanca numa regiao que ja estava
 * la.
 */
export function TutorPanel() {
  const isDesktop = useIsDesktop()
  const { state: status, reload: reloadStatus } = useTutorStatus()
  const conversation = useTutorConversation()
  const [desktopOpen, setDesktopOpen] = useState(readPanelOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openButton = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  const toggleDesktop = () => {
    const next = !desktopOpen
    setDesktopOpen(next)
    writePanelOpen(next)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    // O foco volta a quem abriu: sem isto ele cairia no `body` e quem usa
    // teclado recomecaria do topo da pagina.
    queueMicrotask(() => openButton.current?.focus())
  }

  const onSheetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeSheet()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    // A folha e modal: o Tab da volta dentro dela, em vez de sair para a
    // pagina que ela cobre. Esc e "Fechar a conversa" saem -- o teclado nao
    // fica preso (README §7).
    const items = focusables(event.currentTarget)
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const body = (
    <TutorConversation
      conversation={conversation}
      status={status}
      onReloadStatus={reloadStatus}
      inputRef={input}
    />
  )

  return (
    <aside aria-label="Tifa" data-testid="tutor-panel" className="lg:border-l lg:border-slate-800">
      <p role="status" data-testid="tutor-live" className="sr-only">
        {liveText(conversation.send)}
      </p>

      {isDesktop ? (
        <div className={`flex h-screen flex-col gap-3 p-4 ${desktopOpen ? 'w-96' : 'w-20'}`}>
          <header className="flex items-center gap-3">
            <Portrait />
            {desktopOpen && (
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-50">Tifa</h2>
                <p className="text-xs text-slate-400">sua tutora</p>
              </div>
            )}
            <button
              type="button"
              data-testid="tutor-panel-toggle"
              aria-expanded={desktopOpen}
              aria-controls="tutor-panel-body"
              onClick={toggleDesktop}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
            >
              {desktopOpen ? 'Recolher o painel da Tifa' : 'Abrir o painel da Tifa'}
            </button>
          </header>
          {desktopOpen && (
            <div id="tutor-panel-body" className="flex min-h-0 flex-1 flex-col">
              {body}
            </div>
          )}
        </div>
      ) : (
        <>
          {!sheetOpen && (
            <button
              ref={openButton}
              type="button"
              data-testid="tutor-sheet-open"
              aria-expanded={false}
              aria-controls="tutor-sheet"
              onClick={() => {
                setSheetOpen(true)
                queueMicrotask(() => input.current?.focus())
              }}
              className="fixed right-4 bottom-4 z-20 flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
            >
              <Portrait />
              Falar com a Tifa
            </button>
          )}
          {sheetOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-30 bg-black/60"
                onClick={closeSheet}
              />
              <div
                id="tutor-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tutor-sheet-title"
                data-testid="tutor-sheet"
                onKeyDown={onSheetKeyDown}
                className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col gap-3 rounded-t-2xl bg-slate-950 p-4"
              >
                <header className="flex items-center gap-3">
                  <Portrait />
                  <h2 id="tutor-sheet-title" className="flex-1 text-lg font-semibold text-slate-50">
                    Tifa
                  </h2>
                  <button
                    type="button"
                    data-testid="tutor-sheet-close"
                    onClick={closeSheet}
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
                  >
                    Fechar a conversa
                  </button>
                </header>
                {body}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  )
}
```

Três pontos do código acima que os testes precisam alcançar, e que a execução pode ter de ajustar sem mudar o comportamento:

- O `openButton.current?.focus()` e o `input.current?.focus()` têm `?.`, que conta como ramo: o ramo `null` só existe se a folha fechar sem o botão montado. Se a cobertura acusar o ramo, troque o `queueMicrotask` por um `useEffect` que foca quando `sheetOpen` muda (dependência `[sheetOpen]`, pulando a montagem inicial com um `useRef(false)` escrito só dentro do efeito) — sem `?.`, com `!` e um comentário do porquê. Não use diretiva de ignorar cobertura.
- `last?.focus()` e `first?.focus()`: a folha sempre tem pelo menos o "Fechar a conversa", então `items` nunca é vazio; troque por `last!.focus()`/`first!.focus()` com comentário, se o `?.` deixar ramo sem cobertura.
- O `aria-expanded={false}` do botão fixo é constante porque o botão só existe com a folha fechada; o P22 afirma isso.

- [ ] **Step 8: Entrar na página e atualizar os testes que montam a página**

`frontend/src/pages/Headquarters.tsx` — o corpo passa a:

```tsx
export function Headquarters() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      {/* `pb-24` no celular: o botao fixo "Falar com a Tifa" fica no canto de
          baixo, e sem a folga cobriria os botoes do ultimo cartao do quadro
          (README §7: a conversa nao cobre botoes). */}
      <main data-testid="headquarters" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-24 lg:pb-8">
        <header className="mb-6">{/* ... o mesmo de hoje ... */}</header>
        <MissionList />
      </main>
      <TutorPanel />
    </div>
  )
}
```

E o comentário da função: acrescente que o painel da Tifa entrou no 1b-2, e que a página continua sem regra (compõe duas features).

`Headquarters.test.tsx`, `App.test.tsx` e `main.test.tsx`: troque o `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))` por

```ts
stubViewport('desktop')
const fetchMock = routeFetch({
  'GET /api/missions': () => Response.json([]),
  'GET /api/tutoring/status': () => Response.json({ available: true }),
  'GET /api/tutoring/messages': () => Response.json([]),
})
```

e, em `Headquarters.test.tsx`, o teste "compoe a feature de missoes, e nao busca dado por conta propria" troca `expect(fetchMock).toHaveBeenCalledTimes(1)` por:

```ts
// Uma ida a rede por recurso, e cada uma e de uma feature: a pagina nao
// chama a API. Contar o total deixou de servir quando a pagina passou a
// compor duas features (1b-2).
expect(requestsTo(fetchMock, 'GET /api/missions')).toHaveLength(1)
expect(requestsTo(fetchMock, 'GET /api/tutoring/status')).toHaveLength(1)
expect(requestsTo(fetchMock, 'GET /api/tutoring/messages')).toHaveLength(1)
expect(fetchMock).toHaveBeenCalledTimes(3)
```

Esta é uma **mudança de teste justificada**, não acomodação: o teste descrevia "a página compõe uma feature e faz uma chamada"; a página agora compõe duas, e a asserção nova continua proibindo a página de buscar dado por conta própria (o total é exatamente a soma das três). Acrescente um teste: `'compoe o painel da Tifa ao lado do quadro'` — `getByRole('complementary', { name: 'Tifa' })` presente e `getByTestId('missions')` presente.

`frontend/index.html`: `<html lang="pt-BR">` e `<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />`.

- [ ] **Step 9: Rodar e ver passar**

Run: `cd frontend && npm run lint && npx tsc -b && npm run test:coverage`
Expected: PASS; cobertura 100% nos quatro eixos. Se sobrar ramo sem cobertura, **escreva o teste que o alcança** ou simplifique o código (ver os três pontos do Step 7) — nunca exclua.

- [ ] **Step 10: Mutações**

1. Em `TutorPanel.tsx`, mova o `<p role="status" data-testid="tutor-live">` para dentro do `TutorConversation` (só existe com a conversa desenhada). Expected: FAIL em P21 (painel fechado, sem região) e P1 se o histórico pendente não desenhar a região.
2. Em `liveText`, troque o retorno de `writing` por `send.partial`. Expected: FAIL em P11 (a região muda a cada `delta`).
3. Em `readPanelOpen`, apague o `try/catch` (só o `return localStorage.getItem(...) !== 'false'`). Expected: FAIL em "armazenamento que lanca na leitura".
4. Em `onSheetKeyDown`, apague o ramo `Escape`. Expected: FAIL em P23.
5. Em `TutorConversation`, troque `disabled={inputDisabled}` do `textarea` por `disabled={false}`. Expected: FAIL em P6 e P7.
6. No hook, troque o `status` da resposta provisória do `unknown` para `'falhou'`. Expected: FAIL em P14.
7. Em `FailureNotice`, apague o `|| !canRetry` do `retryButton`. Expected: FAIL em P30.

- [ ] **Step 11: Gate e commit**

```bash
cd frontend && npm run format
cd .. && make check
git add frontend/index.html frontend/src/features/tutoring/ frontend/src/pages/ frontend/src/App.test.tsx frontend/src/main.test.tsx frontend/src/test/viewport.ts
git commit -m "feat(tutoria): painel da Tifa no quartel-general, lateral no desktop e folha no celular

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

O `make check` inclui o E2E atual: o axe dos quatro cenários do Quartel-General passa a auditar a página **com o painel** (histórico vazio ou com linhas de execuções anteriores). Se o axe acusar algo no painel, corrija o painel — é exatamente o que ele deve pegar.

**Critério de pronto:** P1–P30 (com o P24b), os testes de `useIsDesktop` e `panelPreference` e os testes da página verdes; as sete mutações vistas reprovando; cobertura 100%; `npm run lint` sem aviso; E2E atual (6 cenários) verde com o painel na página; `make check` EXIT 0; commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 4**: o painel, os dois contêineres, a região viva fora deles, `useIsDesktop`, `panelPreference`, `src/test/viewport.ts`, o `lang="pt-BR"` e o `interactive-widget`; a mudança justificada do teste da página.
- "Decisões": o retrato `emerald-700` + "TL"; o layout decidido por `matchMedia` (e não só por CSS) porque a semântica muda; a folha modal com Tab contido e Esc/Fechar saindo; a folga `pb-24` para o botão fixo não cobrir botões.
- **Pendência nova:** "O campo acima do teclado virtual no celular (`interactive-widget=resizes-content`, folha ancorada em `bottom-0` com `max-h-[85dvh]`) **não é medido** por teste nenhum: o Playwright não abre teclado virtual. O E2E (Task 7, cenário (e)) mede só a ausência de rolagem horizontal e o Enviar visível na folha aberta. Conferir num aparelho de verdade antes de afirmar."

---

### Task 5: O cartão de proposta, Confirmar e Recusar, e a recarga do quadro pela página

**Objetivo:** a proposta da Tifa vira um cartão com instruções, critério, dificuldade, minutos e prazo, e os botões Confirmar e Recusar. O Confirmar segue o desenho do Concluir do Incremento A: `operation_id` nasce no primeiro clique, é mantido entre tentativas de resultado desconhecido e só é trocado depois de `operacao_reutilizada`; a chave mora **acima** do cartão. Confirmada, a página recarrega o quadro — pelo mesmo caminho do "Atualizar o quadro", que espera a conclusão em voo.

**Files:**
- Create: `frontend/src/shared/lib/deadline.ts`, `deadline.test.ts`
- Modify: `frontend/src/features/missions/MissionList.tsx` (usa `formatDeadline`; aceita `ref` com `reload`), `MissionList.test.tsx` (um caso novo do `ref`)
- Create: `frontend/src/features/tutoring/useActionKeys.ts`, `useActionKeys.test.tsx`
- Create: `frontend/src/features/tutoring/useDecideAction.ts`, `useDecideAction.test.tsx`
- Create: `frontend/src/features/tutoring/ProposalCard.tsx`, `ProposalCard.test.tsx`
- Modify: `frontend/src/features/tutoring/TutorConversation.tsx` (desenha os cartões), `TutorPanel.tsx` (props `onMissionCreated` e `boardHref`; o registro de chaves), `TutorPanel.test.tsx`
- Modify: `frontend/src/pages/Headquarters.tsx`, `Headquarters.test.tsx`

**Interfaces:**
- Consumes: `postJson`, `ApiError`; `ActionRead`, `ConfirmRead`, `RejectRead`; `describeActionFailure`, `ActionFailure`; `useCompletionRegistry` (via `MissionList`, sem mudança).
- Produces:
  - `shared/lib/deadline.ts`: `formatDeadline(iso: string): string` (em `America/Sao_Paulo`, `pt-BR`, dia/mês/ano hora:minuto).
  - `MissionList`: `export interface MissionListHandle { reload: () => void }`; `MissionList(props: { ref?: Ref<MissionListHandle> })`.
  - `useActionKeys(): ActionKeys`, com `interface ActionKeys { operationIdFor: (actionId: number) => string; release: (actionId: number) => void }`.
  - `useDecideAction(action: ActionRead, keys: ActionKeys, on: { changed: (action: ActionRead) => void; missionCreated: () => void }): { state: DecisionState; confirm: () => void; reject: () => void }`, com `type DecisionState = { status: 'idle' } | { status: 'confirming' } | { status: 'rejecting' } | { status: 'failed'; failure: ActionFailure; attempted: 'confirm' | 'reject' }`.
  - `ProposalCard(props: { action: ActionRead; keys: ActionKeys; onChanged: (action: ActionRead) => void; onMissionCreated: () => void; onRefresh: () => void; boardHref: string; onGoToBoard?: () => void })`.
  - `TutorPanel(props: { onMissionCreated: () => void; boardHref: string })`.

**Os textos do cartão:**

| Estado | O que aparece | `data-testid` |
|---|---|---|
| `proposta` | título "Proposta de missão"; "Critério de conclusão: …"; "Dificuldade" `N de 5`; "Estimativa" `N min`; "Prazo" formatado em São Paulo (`<time dateTime>`); botões "Confirmar" e "Recusar", cada um com `sr-only` "a proposta: <instruções>" | `tutor-proposal` (com `data-action-id` e `data-state`), `proposal-confirm`, `proposal-reject` |
| confirmando / recusando | "Confirmando…" / "Recusando…", os dois botões desabilitados | idem |
| `executada` | "Missão criada" e o link "Ver no Quartel-General" | `proposal-created`, `proposal-board-link` |
| `recusada` | "Proposta recusada", sem botões | `proposal-rejected` |
| `falhou` com `prazo_expirado` | "O prazo desta proposta já passou. Peça à Tifa uma nova proposta." | `proposal-expired` |
| `falhou` com outro `error_code` | "Esta proposta não pôde ser executada. Peça à Tifa uma nova proposta." | `proposal-expired` |
| falha da decisão | `role="alert"` com o `failure.message`; `retry`/`retry-with-new-operation`: o botão da ação tentada vira "Tentar de novo"; `refresh`: botão "Atualizar a conversa" no lugar dos dois | `proposal-failure`, `proposal-refresh` |

- [ ] **Step 1: Testes que falham — prazo e o `ref` do quadro**

`frontend/src/shared/lib/deadline.test.ts`: **mova** para cá o teste de unidade do prazo em São Paulo que hoje está em `MissionList.test.tsx` (o de `2026-09-20T02:30:00Z`, que em São Paulo é 19/09 às 23:30 e no fuso do processo, `Asia/Tokyo`, seria 20/09) e acrescente:

```ts
import { describe, expect, it } from 'vitest'
import { formatDeadline } from './deadline'

describe('formatDeadline', () => {
  it('apresenta em America/Sao_Paulo, e nao no fuso de quem le', () => {
    // O processo dos testes roda em Asia/Tokyo (vite.config.ts): sem o
    // `timeZone` fixo, este instante sairia 20/09.
    expect(formatDeadline('2026-09-20T02:30:00Z')).toMatch(/19\/09\/2026.*23:30/)
  })

  it('le o instante com qualquer offset', () => {
    expect(formatDeadline('2027-02-15T21:00:00-03:00')).toMatch(/15\/02\/2027.*21:00/)
  })
})
```

`MissionList.test.tsx` continua afirmando o **texto** do prazo no cartão (não remova essa asserção: é ela que prova que o cartão usa o formatador). Acrescente:

```ts
it('o reload pelo ref recarrega o quadro, e espera a conclusao em voo', async () => {
  // O ref e como a PAGINA pede a recarga depois de a Tifa criar uma missao.
  // Ele passa pelo mesmo `requestReload` do "Atualizar o quadro": com uma
  // conclusao em voo, espera (Incremento A, Task 6).
  // Roteiro: GET /missions -> [pendente]; POST /7/complete fica pendente;
  // clique em Concluir; `ref.current.reload()`; conferir 1 GET so e a regiao
  // `missions-reload-status` com o texto de espera; resolver o POST; conferir
  // o 2o GET.
})
```

Escreva o corpo com `createRef<MissionListHandle>()`, `render(<MissionList ref={ref} />)`, `routeFetch` com o POST devolvendo uma `Promise` controlada (`let resolver!: (r: Response) => void; new Promise<Response>((r) => { resolver = r })`), e `act(() => { ref.current!.reload() })`.

- [ ] **Step 2: Testes que falham — chaves, decisão e cartão**

`frontend/src/features/tutoring/useActionKeys.test.tsx`:

```ts
it('a chave nasce na primeira pergunta e se repete ate ser solta', () => {
  const { result } = renderHook(() => useActionKeys())
  const primeira = result.current.operationIdFor(5)
  expect(result.current.operationIdFor(5)).toBe(primeira)
  expect(result.current.operationIdFor(6)).not.toBe(primeira)
  result.current.release(5)
  expect(result.current.operationIdFor(5)).not.toBe(primeira)
})

it('o registro sobrevive a novos renders', () => {
  const { result, rerender } = renderHook(() => useActionKeys())
  const chave = result.current.operationIdFor(5)
  rerender()
  expect(result.current.operationIdFor(5)).toBe(chave)
})
```

`frontend/src/features/tutoring/useDecideAction.test.tsx` — fixture `proposta(id)` (um `ActionRead` em `proposta`, prazo em 2027) e `routeFetch` para `POST /api/tutoring/actions/5/confirm` e `.../reject`. Casos:

| # | Nome | Roteiro | Asserções |
|---|---|---|---|
| D1 | `confirmar manda a chave, e o sucesso avisa a acao nova e a missao criada` | confirm → `{action: {...5, state:'executada', mission_id: 40}, mission: {id: 40, instructions}}` | corpo `{ operation_id: <uuid 1> }`; `changed` recebe a ação `executada`; `missionCreated` chamado **uma** vez; `state` `idle` |
| D2 | `a falha de rede mantem a chave para o reenvio` | 1º rejeita (`TypeError`); 2º 200 | `state` `failed` com `recovery: 'retry'`, `attempted: 'confirm'`; `confirm()` de novo manda a **mesma** chave; `missionCreated` só depois do 2º |
| D3 | `operacao_reutilizada troca a chave` | 1º 409 `operacao_reutilizada`; 2º 200 | 2º corpo com a chave **nova** |
| D4 | `prazo_expirado marca a acao como falhou, como o servidor gravou` | 422 `prazo_expirado` | `changed` recebe `{...acao, state: 'falhou', error_code: 'prazo_expirado'}`; `missionCreated` **não** chamado; `state` `failed` com `expired` |
| D5 | `transicao_ilegal e acao_nao_encontrada pedem atualizar a conversa, e soltam a chave` | 409 `transicao_ilegal` | `recovery: 'refresh'`; `keys.operationIdFor(5)` depois é **outra** chave |
| D6 | `recusar manda o POST sem chave e avisa a acao recusada` | reject → `{action: {...5, state:'recusada'}}` | `changed` com `recusada`; `missionCreated` não chamado |
| D7 | `a falha ao recusar oferece repetir` | reject rejeita | `state` `failed`, `attempted: 'reject'`, texto do recusar |
| D8 | `confirmando e recusando sao estados proprios` | POST pendente | durante: `state` `{status:'confirming'}` (e, noutro `it`, `{status:'rejecting'}`) |
| D9 | `o sucesso solta a chave` | confirm 200 | depois, `keys.operationIdFor(5)` é **outra** chave (o registro não cresce sem limite, como no A) |

`frontend/src/features/tutoring/ProposalCard.test.tsx` — casos, com `render(<ProposalCard ... />)` e as mesmas rotas:

| # | Nome | Asserções |
|---|---|---|
| C1 | `mostra instrucoes, criterio, dificuldade, minutos e prazo em Sao Paulo` | textos; `time` com `dateTime` igual ao `deadline` e texto em SP (fuso do processo em Tokyo) |
| C2 | `Confirmar e Recusar dizem qual proposta afetam` | `getByRole('button', { name: 'Confirmar a proposta: <instruções>' })` e o de Recusar |
| C3 | `confirmando: os dois botoes desabilitados` | "Confirmando…"; os dois `toBeDisabled()` |
| C4 | `executada: Missao criada e o link para o quadro` | depois do 200 (com o `onChanged` do teste re-renderizando com a ação nova: use um componente de teste com `useState`), `proposal-created` "Missão criada"; `getByRole('link', { name: 'Ver no Quartel-General' })` com `href` = `boardHref`; clicar chama `onGoToBoard` quando passado |
| C5 | `recusada: marcada, sem botoes` | ação `recusada` direto: `proposal-rejected`; nenhum `button` |
| C6 | `falhou por prazo: a explicacao e a sugestao` | ação `falhou`/`prazo_expirado`: texto literal |
| C7 | `falhou por outro motivo: o texto generico` | `falhou` com `error_code: 'outro'` |
| C8 | `falha de rede: alerta e o Confirmar vira Tentar de novo` | `role="alert"` com o texto; botão com nome "Tentar de novo a proposta: …" |
| C9 | `refresh: Atualizar a conversa no lugar dos botoes` | 409 `transicao_ilegal`; `proposal-refresh` chama `onRefresh` |
| C10 | `falha ao recusar: o Recusar vira Tentar de novo, e o Confirmar volta ao normal` | reject rejeita |

E em `TutorPanel.test.tsx`: **P28** `uma resposta com proposta mostra o cartao, e confirmar avisa a pagina` — histórico com `answer` que carrega uma ação `proposta`; clicar em Confirmar; `onMissionCreated` (um `vi.fn()` passado ao painel) chamado uma vez; o cartão passa a "Missão criada". **P29** `Ver no Quartel-General fecha a folha no celular` — mobile, folha aberta, ação `executada` no histórico; clicar no link fecha o diálogo.

E em `Headquarters.test.tsx`: **Q1** `confirmar uma proposta da Tifa recarrega o quadro` — `GET /api/missions` chamado 2 vezes depois do 200 do confirm; **Q2** `com uma conclusao em voo, a recarga pedida pela Tifa espera` — POST de conclusão pendente, confirm 200: ainda 1 GET e a região `missions-reload-status` com "Aguardando a conclusão em andamento para atualizar o quadro."; resolvido o POST: 2 GETs.

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/shared/lib src/features src/pages`
Expected: FAIL — `formatDeadline`, `useActionKeys`, `useDecideAction`, `ProposalCard`, `MissionListHandle` não existem; P28/P29/Q1/Q2 reprovam por falta do cartão e das props.

- [ ] **Step 4: Implementar**

`frontend/src/shared/lib/deadline.ts`: o `deadlineFormatter` sai de `MissionList.tsx` **com o comentário inteiro** (o porquê do `timeZone` e da fixação em Tokyo nos testes) e vira:

```ts
const deadlineFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * O prazo como a pessoa le: em `America/Sao_Paulo` (README §8, decisao A3).
 *
 * Mora em `shared/lib/` porque tem dois usuarios reais -- o cartao da missao e
 * o cartao da proposta da Tifa -- e a regra do fuso e UMA (`docs/ARCHITECTURE.md`
 * §5, regra 3). Uma copia por feature seria a segunda regra para divergir.
 */
export function formatDeadline(iso: string): string {
  return deadlineFormatter.format(new Date(iso))
}
```

`MissionList.tsx`: `import { formatDeadline } from '../../shared/lib/deadline'`, `{formatDeadline(mission.deadline)}` no `<time>`; e o `ref`:

```tsx
/** O que a PAGINA pode pedir ao quadro: recarregar (1b-2, a missao criada pela Tifa). */
export interface MissionListHandle {
  reload: () => void
}

export function MissionList({ ref }: { ref?: Ref<MissionListHandle> }) {
  const { state, reload } = useMissions()
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)
  // O `requestReload`, e nao o `reload` cru: com uma conclusao em voo, a
  // recarga pedida de fora ESPERA, como o "Atualizar o quadro" (Incremento A).
  useImperativeHandle(ref, () => ({ reload: requestReload }), [requestReload])
  // ... o resto sem mudanca
}
```

`frontend/src/features/tutoring/useActionKeys.ts`:

```ts
import { useMemo, useRef } from 'react'

export interface ActionKeys {
  /** A chave da acao: a que ja existe ou uma nova, que fica ate `release`. */
  operationIdFor: (actionId: number) => string
  release: (actionId: number) => void
}

/**
 * As chaves de confirmacao por acao, ACIMA dos cartoes.
 *
 * Mesma licao da pendencia 35 (Incremento A): a lista da conversa pode ser
 * recarregada ("Atualizar a conversa"), e a recarga remonta os cartoes. Uma
 * chave guardada no cartao morreria ali, e o reenvio de uma confirmacao com
 * resultado desconhecido sairia com chave nova.
 */
export function useActionKeys(): ActionKeys {
  const keys = useRef(new Map<number, string>())
  return useMemo(
    () => ({
      operationIdFor: (actionId) => {
        let key = keys.current.get(actionId)
        if (key === undefined) {
          key = crypto.randomUUID()
          keys.current.set(actionId, key)
        }
        return key
      },
      release: (actionId) => {
        keys.current.delete(actionId)
      },
    }),
    [],
  )
}
```

`frontend/src/features/tutoring/useDecideAction.ts`:

```ts
import { useCallback, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeActionFailure, type ActionFailure } from './actionFailure'
import type { ActionRead, ConfirmRead, RejectRead } from './types'
import type { ActionKeys } from './useActionKeys'

export type DecisionState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'rejecting' }
  | { status: 'failed'; failure: ActionFailure; attempted: 'confirm' | 'reject' }

/**
 * Confirma ou recusa UMA proposta.
 *
 * O clique vai direto ao backend, sem passar pelo modelo (decisao D2 da spec):
 * o "sim" e deterministico. A chave segue o Concluir do Incremento A: nasce no
 * primeiro clique, FICA depois de falha que se repete (rede, 5xx, sem code),
 * e SAI no sucesso e em toda falha que nao se repete com ela.
 *
 * `prazo_expirado`: o backend GRAVOU a acao como `falhou` antes do 422 (spec,
 * "Confirmar e recusar"). A tela espelha isso sem outra ida a rede.
 */
export function useDecideAction(
  action: ActionRead,
  keys: ActionKeys,
  on: { changed: (action: ActionRead) => void; missionCreated: () => void },
): { state: DecisionState; confirm: () => void; reject: () => void } {
  const [state, setState] = useState<DecisionState>({ status: 'idle' })
  const { changed, missionCreated } = on

  const confirm = useCallback(() => {
    const operationId = keys.operationIdFor(action.id)
    setState({ status: 'confirming' })
    postJson<ConfirmRead>(`/tutoring/actions/${String(action.id)}/confirm`, {
      operation_id: operationId,
    })
      .then((result) => {
        keys.release(action.id)
        setState({ status: 'idle' })
        changed(result.action)
        missionCreated()
      })
      .catch((error: unknown) => {
        const failure = describeActionFailure(error, 'confirm')
        if (failure.recovery !== 'retry') {
          keys.release(action.id)
        }
        if (failure.recovery === 'expired') {
          changed({ ...action, state: 'falhou', error_code: 'prazo_expirado' })
        }
        setState({ status: 'failed', failure, attempted: 'confirm' })
      })
  }, [action, keys, changed, missionCreated])

  const reject = useCallback(() => {
    setState({ status: 'rejecting' })
    postJson<RejectRead>(`/tutoring/actions/${String(action.id)}/reject`, {})
      .then((result) => {
        setState({ status: 'idle' })
        changed(result.action)
      })
      .catch((error: unknown) => {
        setState({ status: 'failed', failure: describeActionFailure(error, 'reject'), attempted: 'reject' })
      })
  }, [action, changed])

  return { state, confirm, reject }
}
```

`frontend/src/features/tutoring/ProposalCard.tsx`: um componente com um `switch` sobre `action.state` e retorno `ReactElement` declarado (estado novo reprova o `tsc`), usando `formatDeadline` de `shared/lib/deadline`, o "de 5" com o comentário que nomeia `DIFICULDADE_MAXIMA` e as outras duas cópias (`missions/types.ts`, `MissionList.tsx`), e os rótulos da tabela acima. O ramo `proposta` desenha os dois botões (`sr-only` com "a proposta: <instruções>", espaço **fora** do `span`, lição do A), o aviso `role="alert"` quando `state.status === 'failed'`, e troca os botões por "Atualizar a conversa" quando `failure.recovery === 'refresh'`. O rótulo de cada botão:

```ts
function confirmLabel(decision: DecisionState): string {
  if (decision.status === 'confirming') {
    return 'Confirmando…'
  }
  return decision.status === 'failed' && decision.attempted === 'confirm' ? 'Tentar de novo' : 'Confirmar'
}

function rejectLabel(decision: DecisionState): string {
  if (decision.status === 'rejecting') {
    return 'Recusando…'
  }
  return decision.status === 'failed' && decision.attempted === 'reject' ? 'Tentar de novo' : 'Recusar'
}
```

`TutorConversation.tsx`: `MessageItem` recebe `renderAction: (action: ActionRead) => ReactElement` e desenha, abaixo do texto de uma mensagem da Tifa, um `ProposalCard` por ação (a chave do React é `action.id`). `TutorPanel.tsx`: `const keys = useActionKeys()` no topo; props `onMissionCreated` e `boardHref`; o `renderAction` monta o cartão com `onChanged={conversation.updateAction}`, `onRefresh={conversation.reloadHistory}`, `onGoToBoard={isDesktop ? undefined : closeSheet}`.

`Headquarters.tsx`:

```tsx
export function Headquarters() {
  const board = useRef<MissionListHandle>(null)
  // O `!`: o quadro monta junto com a pagina, antes de qualquer clique que
  // chegue aqui. Um `?.` criaria um ramo que nenhum uso real alcanca.
  const reloadBoard = useCallback(() => {
    board.current!.reload()
  }, [])
  return (
    // ... o mesmo layout da Task 4, com:
    //   <MissionList ref={board} />
    //   <TutorPanel onMissionCreated={reloadBoard} boardHref="#missions-heading" />
  )
}
```

(O `#missions-heading` é o `id` do título do quadro em `MissionList.tsx`. A página é quem conhece as duas features, então é ela quem passa o endereço — a feature `tutoring` não sabe que esse `id` existe.)

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npm run lint && npx tsc -b && npm run test:coverage`
Expected: PASS, 100% nos quatro eixos.

- [ ] **Step 6: Mutações**

1. Em `useDecideAction.confirm`, gere a chave com `crypto.randomUUID()` direto (sem `keys`). Expected: FAIL em D2.
2. Troque o `if (failure.recovery !== 'retry') { keys.release(action.id) }` do `.catch` por um `keys.release(action.id)` incondicional. Expected: FAIL em D2.
3. Apague o `keys.release(action.id)` do `.then`. Expected: FAIL em D9.
4. Em `MissionList`, troque `useImperativeHandle(ref, () => ({ reload: requestReload }), ...)` por `({ reload })` (o `reload` cru do `useMissions`). Expected: FAIL no caso do `ref` em `MissionList.test.tsx` e em Q2 (a recarga não espera).
5. Em `useDecideAction`, apague o `changed({ ...action, state: 'falhou', ... })` do ramo `expired`. Expected: FAIL em D4.
6. Em `Headquarters.tsx`, troque `onMissionCreated={reloadBoard}` por `onMissionCreated={() => undefined}`. Expected: FAIL em Q1.

- [ ] **Step 7: Gate e commit**

```bash
cd frontend && npm run format
cd .. && make check
git add frontend/src/shared/lib/ frontend/src/features/ frontend/src/pages/
git commit -m "feat(tutoria): cartao de proposta com confirmar e recusar, e recarga do quadro pela pagina

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** D1–D9, C1–C10, P28–P29, Q1–Q2, os de `deadline` e `useActionKeys` e o novo de `MissionList` verdes; seis mutações vistas reprovando; cobertura 100%; E2E atual verde; `make check` EXIT 0; commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 5**: o cartão, as chaves por ação, a decisão, o `ref` do quadro, `shared/lib/deadline.ts`.
- "Decisões": o `ref` em vez de prop observada por efeito; o `formatDeadline` em `shared/lib/`; o "de 5" como terceira cópia declarada; o `prazo_expirado` espelhado sem nova ida à rede; o `boardHref` passado pela página.
- **Pendência 34, atualizada:** "`useDecideAction` herda a mesma forma: não se protege sozinho contra dois `confirm()` no mesmo tick; a guarda é o `disabled` dos botões, testada (C3). Com a chave idempotente, dois POSTs no mesmo tick não criam duas missões (o backend prova isso: `test_dois_confirmar_com_a_mesma_chave_criam_uma_missao`, em `tests/integration/test_tutoring_acoes.py`)."

---

### Task 6: Infraestrutura do E2E — o falso como processo, o controle HTTP e a guarda contra a Anthropic real

**Objetivo:** o E2E da tutoria roda contra o **mesmo** servidor falso do pytest (`tests/integration/provedor_falso.py`), agora como processo próprio na porta 8150, com um endpoint de controle HTTP pelo qual o cenário define o roteiro antes de agir e lê as requisições recebidas. A API do E2E aponta para ele e recebe uma chave fictícia. Uma guarda faz o E2E **não subir** se a API dele apontar para fora da máquina local — o que protege a chave real que o dono põe no `.env` na Task 8. Resolve a pendência 43. Nenhum "modo falso" em `src/`.

**Files:**
- Modify: `tests/integration/provedor_falso.py`
- Create: `tests/integration/falso_do_e2e.py`
- Create: `tests/integration/test_falso_do_e2e.py`
- Modify: `scripts/e2e-env.sh`
- Modify: `tests/integration/test_e2e_env.py`
- Modify: `frontend/tests/e2e/servers.ts`
- Modify: `frontend/playwright.config.ts`
- Create: `frontend/tests/e2e/falso.ts`

**Interfaces:**
- Consumes: `Roteiro`, `Texto`, `ChamadaDeFerramenta`, `ServidorAnthropicFalso`, `Recebida` do `provedor_falso`.
- Produces:
  - `provedor_falso.py`: `_Tratador` renomeado para `TratadorDoFalso` (público: outro módulo o estende); `falso_do_tratador(tratador: BaseHTTPRequestHandler) -> ServidorAnthropicFalso`; `ServidorAnthropicFalso` ganha os campos `porta: int = 0` e `tratador: type[TratadorDoFalso] = TratadorDoFalso`. Com os padrões, o comportamento do pytest não muda.
  - `falso_do_e2e.py`: `roteiro_do_json(dados: object) -> Roteiro` (levanta `ValueError` com a chave inválida no texto); `class TratadorComControle(TratadorDoFalso)`; `main(argv: list[str] | None = None) -> None` (`--porta`, obrigatório).
  - O contrato HTTP do controle (chaves em inglês):

| Método e rota | Corpo | Resposta |
|---|---|---|
| `PUT /_control/script` | `{"blocks": [{"text": ["pedaço", ...]} \| {"tool_input": {...}}], "http_status"?: int, "cut_after_events"?: int, "hold_after_events"?: int}` | `204`; corpo inválido: `400` com `{"error": "<motivo>"}` |
| `POST /_control/release` | — | `204`; solta a resposta presa em `hold_after_events` |
| `POST /_control/reset` | — | `204`; roteiro vazio, requisições apagadas, `liberar` rearmado |
| `GET /_control/requests` | — | `200` `{"requests": [{"api_key": "...", "body": {...}}]}` |
| `POST /v1/messages` | o do SDK | o stream do roteiro (o `do_POST` herdado) |
| qualquer outra rota | — | `404` |

  - `frontend/tests/e2e/servers.ts`: `export const FALSO_URL = 'http://127.0.0.1:8150'`.
  - `frontend/tests/e2e/falso.ts`: `interface Bloco = { text: string[] } | { tool_input: Record<string, unknown> }`; `interface RoteiroDoFalso { blocks: Bloco[]; http_status?: number; cut_after_events?: number; hold_after_events?: number }`; `definirRoteiro(roteiro: RoteiroDoFalso): Promise<void>`; `liberar(): Promise<void>`; `reiniciar(): Promise<void>`; `requisicoes(): Promise<{ api_key: string; body: unknown }[]>`.

- [ ] **Step 1: Escrever os testes que falham — o controle**

`tests/integration/test_falso_do_e2e.py`:

```python
"""O servidor falso do E2E: o controle HTTP e o processo.

O E2E (Playwright) nao importa Python: ele fala com o falso por HTTP, e este
arquivo prova o contrato desse controle do lado de ca. Os testes rodam o
falso NA MESMA thread do pytest (porta 0) para o controle, e como PROCESSO
(`python -m integration.falso_do_e2e`) para a linha de comando que o
`playwright.config.ts` usa.
"""

import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import anthropic
import httpx
import pytest

from integration.falso_do_e2e import TratadorComControle, roteiro_do_json
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture
def controlado() -> Iterator[ServidorAnthropicFalso]:
    with ServidorAnthropicFalso(tratador=TratadorComControle) as falso:
        yield falso


def _sdk(falso: ServidorAnthropicFalso) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key="e2e-chave-ficticia", base_url=falso.url, max_retries=0)


def test_roteiro_do_json_monta_texto_ferramenta_e_opcoes() -> None:
    roteiro = roteiro_do_json(
        {
            "blocks": [{"text": ["a", "b"]}, {"tool_input": {"difficulty": 2}}],
            "cut_after_events": 3,
            "hold_after_events": 2,
            "http_status": 200,
        }
    )
    assert roteiro == Roteiro(
        blocos=(Texto(("a", "b")), ChamadaDeFerramenta({"difficulty": 2})),
        cortar_apos_eventos=3,
        segurar_apos_eventos=2,
        status_http=200,
    )


@pytest.mark.parametrize(
    ("dados", "motivo"),
    [
        ([], "o roteiro precisa ser um objeto"),
        ({"blocks": "x"}, "blocks precisa ser uma lista"),
        ({"blocks": [{"imagem": 1}]}, "bloco desconhecido"),
        ({"blocks": [{"text": "nao e lista"}]}, "text precisa ser uma lista de textos"),
        ({"blocks": [{"text": [1]}]}, "text precisa ser uma lista de textos"),
        ({"blocks": [{"tool_input": []}]}, "tool_input precisa ser um objeto"),
        ({"blocks": [], "cut_after_events": "3"}, "cut_after_events precisa ser inteiro"),
        ({"blocks": [], "fantasia": 1}, "chave desconhecida: fantasia"),
    ],
)
def test_roteiro_invalido_e_recusado_com_o_motivo(dados: object, motivo: str) -> None:
    """Um roteiro mal escrito no cenario precisa reprovar ALTO, no PUT, e nao
    virar uma resposta vazia que o cenario leria como "a Tifa nao disse nada"."""
    with pytest.raises(ValueError, match=motivo):
        roteiro_do_json(dados)


def test_o_roteiro_definido_pelo_controle_chega_ao_sdk(
    controlado: ServidorAnthropicFalso,
) -> None:
    resposta = httpx.put(
        f"{controlado.url}/_control/script",
        json={"blocks": [{"text": ["Bora, ", "vamos!"]}, {"tool_input": {"difficulty": 2}}]},
    )
    assert resposta.status_code == 204

    with _sdk(controlado).messages.stream(
        model="claude-opus-5", max_tokens=10, messages=[{"role": "user", "content": "oi"}]
    ) as stream:
        final = stream.get_final_message()

    texto, ferramenta = final.content
    assert texto.type == "text" and texto.text == "Bora, vamos!"
    assert ferramenta.type == "tool_use" and ferramenta.input == {"difficulty": 2}


def test_roteiro_invalido_responde_400_com_o_motivo(controlado: ServidorAnthropicFalso) -> None:
    resposta = httpx.put(f"{controlado.url}/_control/script", json={"blocks": [{"x": 1}]})
    assert resposta.status_code == 400
    assert "bloco desconhecido" in resposta.json()["error"]


def test_as_requisicoes_recebidas_sao_lidas_pelo_controle_com_a_chave(
    controlado: ServidorAnthropicFalso,
) -> None:
    """E o que deixa o cenario provar que a API do E2E falou com o FALSO, e
    com a chave FICTICIA -- nao com a Anthropic, nem com a chave do .env."""
    with _sdk(controlado).messages.stream(
        model="claude-opus-5", max_tokens=7, messages=[{"role": "user", "content": "oi"}]
    ) as stream:
        stream.get_final_message()

    corpo = httpx.get(f"{controlado.url}/_control/requests").json()
    assert len(corpo["requests"]) == 1
    assert corpo["requests"][0]["api_key"] == "e2e-chave-ficticia"
    assert corpo["requests"][0]["body"]["max_tokens"] == 7


def test_reset_apaga_as_requisicoes_e_o_roteiro(controlado: ServidorAnthropicFalso) -> None:
    httpx.put(f"{controlado.url}/_control/script", json={"blocks": [{"text": ["x"]}]})
    with _sdk(controlado).messages.stream(
        model="claude-opus-5", max_tokens=7, messages=[{"role": "user", "content": "oi"}]
    ) as stream:
        stream.get_final_message()

    assert httpx.post(f"{controlado.url}/_control/reset").status_code == 204
    assert httpx.get(f"{controlado.url}/_control/requests").json() == {"requests": []}
    assert controlado.roteiro == Roteiro()
    assert not controlado.liberar.is_set()


def test_reset_solta_uma_resposta_presa(controlado: ServidorAnthropicFalso) -> None:
    """Um cenario que reprovou com a resposta presa nao pode prender o proximo:
    o `beforeEach` do E2E chama o reset, e ele tem de soltar o tratador."""
    httpx.put(
        f"{controlado.url}/_control/script",
        json={"blocks": [{"text": ["um", "dois"]}], "hold_after_events": 3},
    )
    terminou = threading.Event()

    def consumir() -> None:
        with _sdk(controlado).messages.stream(
            model="claude-opus-5", max_tokens=7, messages=[{"role": "user", "content": "oi"}]
        ) as stream:
            stream.get_final_message()
        terminou.set()

    threading.Thread(target=consumir, daemon=True).start()
    # Espera a resposta chegar ao ponto de espera (a requisicao foi registrada).
    prazo = time.monotonic() + 5
    while not controlado.recebidas:
        assert time.monotonic() < prazo
        time.sleep(0.05)

    httpx.post(f"{controlado.url}/_control/reset")

    # Solto na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert terminou.wait(timeout=5)
    assert not controlado.liberar.is_set()


def test_segurar_e_liberar_pelo_controle(controlado: ServidorAnthropicFalso) -> None:
    """A resposta fica presa depois de N eventos ate o `release`. E o que deixa o
    axe auditar o estado "escrevendo" com o texto comprovadamente no meio."""
    httpx.put(
        f"{controlado.url}/_control/script",
        json={"blocks": [{"text": ["um", "dois"]}], "hold_after_events": 3},
    )
    with _sdk(controlado).messages.stream(
        model="claude-opus-5", max_tokens=7, messages=[{"role": "user", "content": "oi"}]
    ) as stream:
        pedacos = stream.text_stream
        assert next(pedacos) == "um"
        antes = time.monotonic()
        httpx.post(f"{controlado.url}/_control/release")
        assert next(pedacos) == "dois"
    # O release destravou na hora, e nao pelo teto de 30 s do `liberar.wait`.
    assert time.monotonic() - antes < 5


def test_rota_desconhecida_responde_404(controlado: ServidorAnthropicFalso) -> None:
    """Um SDK apontado para o caminho errado precisa reprovar alto."""
    assert httpx.post(f"{controlado.url}/v1/complete", json={}).status_code == 404
    assert httpx.get(f"{controlado.url}/qualquer").status_code == 404


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_o_processo_sobe_na_porta_pedida_e_responde_o_controle() -> None:
    """A MESMA linha de comando do `playwright.config.ts`, numa porta livre."""
    porta = _porta_livre()
    processo = subprocess.Popen(
        [sys.executable, "-m", "integration.falso_do_e2e", "--porta", str(porta)],
        cwd=RAIZ,
        env={"PYTHONPATH": str(RAIZ / "tests"), "PATH": ""},
    )
    try:
        prazo = time.monotonic() + 15
        while True:
            try:
                resposta = httpx.get(f"http://127.0.0.1:{porta}/_control/requests")
                break
            except httpx.TransportError:
                assert time.monotonic() < prazo, "o falso nao subiu em 15 s"
                time.sleep(0.1)
        assert resposta.json() == {"requests": []}
    finally:
        processo.terminate()
        processo.wait(timeout=10)


def test_o_processo_exige_a_porta() -> None:
    resultado = subprocess.run(
        [sys.executable, "-m", "integration.falso_do_e2e"],
        cwd=RAIZ,
        env={"PYTHONPATH": str(RAIZ / "tests"), "PATH": ""},
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode != 0
    assert "--porta" in resultado.stderr
```

- [ ] **Step 2: Escrever os testes que falham — a guarda do `e2e-env.sh`**

Acrescente a `tests/integration/test_e2e_env.py`:

```python
FALSO_LOCAL = "http://127.0.0.1:8150"


@pytest.mark.parametrize(
    "url",
    [
        "https://api.anthropic.com",
        "https://api.anthropic.com.",
        "http://127.0.0.1.nip.io:8150",
        # O host de uma URL com credencial e o que vem DEPOIS do `@`.
        "http://127.0.0.1@api.anthropic.com",
        "http://192.168.0.10:8150",
    ],
)
def test_recusa_provedor_fora_do_loopback(url: str) -> None:
    """A guarda diz NAO, e a API do E2E nem sobe.

    E uma lista de PERMISSAO (loopback), e nao a recusa de um nome: o .env do
    dono tem a chave de verdade, e qualquer endereco de fora da maquina --
    nao so o da Anthropic -- levaria a chave e o gasto para longe do teste.
    """
    resultado = _rodar(
        ["sh", "-c", "echo A GUARDA DEIXOU PASSAR"],
        {"FOCUSQUEST_ANTHROPIC_BASE_URL": url},
    )

    assert resultado.returncode != 0
    assert "recusando subir a API do E2E" in resultado.stderr
    assert "loopback" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


def test_sem_o_endereco_do_falso_cai_no_padrao_e_e_recusado() -> None:
    """Sem `FOCUSQUEST_ANTHROPIC_BASE_URL` no ambiente, vale o .env ou o padrao
    do `Settings` -- `https://api.anthropic.com` -- e a guarda recusa.

    PREMISSA: o `.env` local nao aponta a base URL para loopback (o
    `.env.example` traz `https://api.anthropic.com`, e no CI nao ha `.env`).
    Um `.env` com `FOCUSQUEST_ANTHROPIC_BASE_URL=http://127.0.0.1:...` faria
    este teste reprovar -- e ai e o `.env` que esta fora do combinado.
    """
    ambiente = {k: v for k, v in os.environ.items() if k != "FOCUSQUEST_ANTHROPIC_BASE_URL"}
    resultado = subprocess.run(
        [str(SCRIPT), "sh", "-c", "echo A GUARDA DEIXOU PASSAR"],
        capture_output=True,
        text=True,
        check=False,
        env=ambiente,
    )
    assert resultado.returncode != 0
    assert "loopback" in resultado.stderr
    assert "A GUARDA DEIXOU PASSAR" not in resultado.stdout


@pytest.mark.parametrize("url", [FALSO_LOCAL, "http://localhost:8150", "http://[::1]:8150"])
def test_aceita_o_falso_local(url: str) -> None:
    resultado = _rodar(
        ["printenv", "FOCUSQUEST_ANTHROPIC_BASE_URL"],
        {"FOCUSQUEST_ANTHROPIC_BASE_URL": url},
    )
    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == url


def test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente() -> None:
    """A chave de verdade chega ao ambiente do E2E pelo .env e pelo `pre-push`
    (que exporta toda FOCUSQUEST_* do .env). O script a SUBSTITUI."""
    resultado = _rodar(
        ["printenv", "FOCUSQUEST_ANTHROPIC_API_KEY"],
        {
            "FOCUSQUEST_ANTHROPIC_BASE_URL": FALSO_LOCAL,
            "FOCUSQUEST_ANTHROPIC_API_KEY": "sk-ant-api03-parece-de-verdade",
        },
    )
    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == "e2e-chave-ficticia"
```

(`import pytest` no topo, se ainda não estiver. Os testes existentes do arquivo continuam passando sem mudança: a guarda de sessão de `tests/conftest.py` já põe `FOCUSQUEST_ANTHROPIC_BASE_URL=http://127.0.0.1:9` no ambiente do pytest, que é loopback — confira isso rodando o arquivo inteiro no Step 3.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `uv run pytest tests/integration/test_falso_do_e2e.py tests/integration/test_e2e_env.py -q`
Expected: FAIL — `ModuleNotFoundError: integration.falso_do_e2e`; e os casos novos do `e2e-env.sh` reprovam porque a guarda não existe (`returncode == 0`).

- [ ] **Step 4: Implementar o falso configurável e o controle**

Em `tests/integration/provedor_falso.py`:

- renomeie `class _Tratador` para `class TratadorDoFalso` (e o uso em `_Servidor`), com a docstring "O tratador do falso: `POST` em qualquer caminho responde o roteiro. O do E2E (`falso_do_e2e.TratadorComControle`) o estende com o controle HTTP.";
- `_Servidor.__init__(self, falso: ServidorAnthropicFalso, porta: int, tratador: type[TratadorDoFalso]) -> None`, com `super().__init__(("127.0.0.1", porta), tratador)`;
- uma função pública, usada pelos dois tratadores no lugar do `assert` inline de hoje:

```python
def falso_do_tratador(tratador: BaseHTTPRequestHandler) -> ServidorAnthropicFalso:
    """O falso dono do servidor que chamou o tratador.

    `self.server` e tipado como `socketserver.BaseServer`; o `assert` estreita
    o tipo para o mypy e reprova alto se o tratador for montado noutro servidor.
    """
    servidor = tratador.server
    assert isinstance(servidor, _Servidor)
    return servidor.falso
```

- em `ServidorAnthropicFalso`, os campos novos **depois** dos existentes:

```python
    # Porta 0: o sistema escolhe uma livre (o pytest). O E2E passa a 8150.
    porta: int = 0
    tratador: type[TratadorDoFalso] = TratadorDoFalso
```

  e `self._servidor = _Servidor(self, self.porta, self.tratador)` no `__post_init__`.

`tests/integration/falso_do_e2e.py`:

```python
"""O servidor falso da Anthropic como PROCESSO, para o E2E.

O Playwright sobe este modulo como `webServer` (`frontend/playwright.config.ts`)
numa porta fixa. E o MESMO `ServidorAnthropicFalso` do pytest -- os eventos
continuam construidos com os tipos do SDK fixado (camada 1) --, acrescido de
um controle HTTP sob `/_control/`, porque o cenario e TypeScript e nao
consegue trocar o `roteiro` do objeto Python como a fixture `falso` faz.

Nao existe "modo falso" em `src/`: a API do E2E e a de producao, apontada
para ca por `FOCUSQUEST_ANTHROPIC_BASE_URL`, e a guarda de
`scripts/e2e-env.sh` recusa subi-la fora do loopback.
"""

import argparse
import json
import threading
from typing import Any

from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
    TratadorDoFalso,
    falso_do_tratador,
)

_OPCOES = frozenset({"blocks", "http_status", "cut_after_events", "hold_after_events"})


def _inteiro(dados: dict[str, object], chave: str) -> int | None:
    """A opcao inteira `chave`, ou `None` se ausente. `bool` nao conta como
    inteiro (em Python, `True` e um `int`)."""
    if chave not in dados:
        return None
    valor = dados[chave]
    if not isinstance(valor, int) or isinstance(valor, bool):
        raise ValueError(f"{chave} precisa ser inteiro")
    return valor


def _bloco(dados: object) -> Texto | ChamadaDeFerramenta:
    if isinstance(dados, dict) and set(dados) == {"text"}:
        pedacos = dados["text"]
        if not isinstance(pedacos, list) or not all(isinstance(p, str) for p in pedacos):
            raise ValueError("text precisa ser uma lista de textos")
        return Texto(tuple(pedacos))
    if isinstance(dados, dict) and set(dados) == {"tool_input"}:
        entrada = dados["tool_input"]
        if not isinstance(entrada, dict):
            raise ValueError("tool_input precisa ser um objeto")
        return ChamadaDeFerramenta(entrada)
    raise ValueError(f"bloco desconhecido: {dados!r}")


def roteiro_do_json(dados: object) -> Roteiro:
    """O `Roteiro` que o cenario descreveu em JSON, ou `ValueError` com o motivo.

    Estrito: chave desconhecida reprova. Um erro de digitacao no cenario
    (`cut_after_event`) viraria, se ignorado, um roteiro sem o corte -- e o
    cenario do corte PASSARIA pelo motivo errado.
    """
    if not isinstance(dados, dict):
        raise ValueError("o roteiro precisa ser um objeto")
    desconhecidas = set(dados) - _OPCOES
    if desconhecidas:
        raise ValueError(f"chave desconhecida: {', '.join(sorted(desconhecidas))}")
    blocos = dados.get("blocks", [])
    if not isinstance(blocos, list):
        raise ValueError("blocks precisa ser uma lista")
    # Cada opcao POR NOME, e nao `Roteiro(**opcoes)`: com um `dict[str, int]`
    # desempacotado, o mypy strict confere o dict contra TODOS os campos do
    # `Roteiro` e reprova no `atrasar_evento: tuple[int, float] | None`
    # (medido na revisao do plano).
    status = _inteiro(dados, "http_status")
    return Roteiro(
        blocos=tuple(_bloco(b) for b in blocos),
        status_http=200 if status is None else status,
        cortar_apos_eventos=_inteiro(dados, "cut_after_events"),
        segurar_apos_eventos=_inteiro(dados, "hold_after_events"),
    )


class TratadorComControle(TratadorDoFalso):
    """O tratador do falso mais as rotas de `/_control/`."""

    def _falso(self) -> ServidorAnthropicFalso:
        return falso_do_tratador(self)

    def _responder(self, status: int, corpo: dict[str, Any] | None = None) -> None:
        dados = b"" if corpo is None else json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_PUT(self) -> None:
        if self.path != "/_control/script":
            self._responder(404)
            return
        tamanho = int(self.headers["content-length"])
        try:
            roteiro = roteiro_do_json(json.loads(self.rfile.read(tamanho)))
        except (ValueError, json.JSONDecodeError) as erro:
            self._responder(400, {"error": str(erro)})
            return
        self._falso().roteiro = roteiro
        self._responder(204)

    def do_GET(self) -> None:
        if self.path != "/_control/requests":
            self._responder(404)
            return
        recebidas = [
            {"api_key": r.cabecalhos.get("x-api-key", ""), "body": r.corpo}
            for r in self._falso().recebidas
        ]
        self._responder(200, {"requests": recebidas})

    def do_POST(self) -> None:
        falso = self._falso()
        if self.path == "/v1/messages":
            super().do_POST()
        elif self.path == "/_control/release":
            falso.liberar.set()
            self._responder(204)
        elif self.path == "/_control/reset":
            # Solta uma resposta presa por `hold_after_events` de um cenario
            # anterior ANTES de trocar tudo: o tratador preso espera no `Event`
            # que ele leu, e so este `set` o acorda. Depois, um `Event` NOVO
            # para o proximo roteiro -- `clear()` no mesmo objeto poderia
            # reprender o tratador que ainda nao acordou.
            falso.liberar.set()
            falso.liberar = threading.Event()
            falso.roteiro = Roteiro()
            falso.recebidas.clear()
            self._responder(204)
        else:
            self._responder(404)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--porta", type=int, required=True)
    argumentos = parser.parse_args(argv)
    with ServidorAnthropicFalso(porta=argumentos.porta, tratador=TratadorComControle):
        # O Playwright encerra o processo ao fim da suite (SIGTERM).
        threading.Event().wait()


if __name__ == "__main__":
    main()
```

Notas que o implementador confere, não supõe:
- O `falso_do_tratador` é a função nova do `provedor_falso` (ver o Step 4, primeira parte); ela carrega o `assert isinstance(servidor, _Servidor)` que o `do_POST` de hoje faz inline, e o `mypy --strict` aceita sem `type: ignore`.
- O `do_POST` herdado lê o corpo e registra a requisição; o controle **não** é registrado em `recebidas` (só `/v1/messages` passa por ali).
- Rode `uv run mypy tests` e `uv run ruff check tests` antes do gate.

- [ ] **Step 5: Implementar a guarda do `scripts/e2e-env.sh`**

No bloco Python do script (o `url="$(uv run python - <<'PY' ... PY)"`), depois da checagem do nome do banco e **antes** do `print`, acrescente a checagem do provedor. O bloco passa a imprimir só a URL do banco, como hoje; a recusa sai por `SystemExit` com a mensagem:

```python
from urllib.parse import urlsplit

# O provedor da API do E2E tem de ser a MAQUINA LOCAL (o servidor falso).
# Lista de permissao, e nao recusa de um nome: o .env do dono tem a chave de
# verdade (spec do 1b, D1), e qualquer endereco de fora -- a Anthropic, um
# proxy, um IP -- levaria a chave e o gasto para longe do teste.
endereco = Settings().anthropic_base_url
host = urlsplit(endereco).hostname
if host not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit(
        "recusando subir a API do E2E com o provedor em "
        f"'{host}'; o E2E so fala com o servidor falso em loopback -- "
        "confira FOCUSQUEST_ANTHROPIC_BASE_URL (o playwright.config.ts a define)"
    )
```

(Imprima só o **host** na mensagem, não o endereço inteiro: uma URL com credencial embutida iria para o log.)

E, depois do `export FOCUSQUEST_DATABASE_URL="$url"`:

```bash
# A chave da API do E2E e SEMPRE a ficticia. A de verdade chega a este
# ambiente pelo .env (o Settings o le) e pelo pre-push (que exporta toda
# FOCUSQUEST_* do .env para o worktree): impor aqui, no unico caminho de subida
# da API do E2E, fecha os dois. O valor nao imita o formato de uma chave real.
export FOCUSQUEST_ANTHROPIC_API_KEY="e2e-chave-ficticia"
```

Atualize o comentário do topo do script: ele agora aponta **duas** coisas (banco de teste e provedor falso) e impõe a chave.

- [ ] **Step 6: Rodar e ver passar (pytest)**

Run: `uv run pytest tests/integration/test_falso_do_e2e.py tests/integration/test_e2e_env.py tests/integration/test_provedor_falso.py -q`
Expected: PASS — inclusive os testes do falso do 1b-1 (`test_provedor_falso.py`), que provam que a mudança de `porta`/`tratador` não alterou o comportamento padrão.

- [ ] **Step 7: O terceiro `webServer` e o cliente do controle**

`frontend/tests/e2e/servers.ts`: acrescente, com a justificativa da porta (a mesma da tabela de decisões) no comentário:

```ts
/**
 * O servidor falso da Anthropic, como processo (`tests/integration/falso_do_e2e.py`).
 *
 * 8150: na faixa 81xx da API do E2E, para ser lida como porta de teste ponta a
 * ponta; nao colide com 8000/5173 (desenvolvimento), 8100/5273 (E2E) nem
 * 55432 (PostgreSQL); e nao e 8101, o "proximo numero" que alguem escolheria
 * por reflexo para outro servidor.
 */
export const FALSO_URL = 'http://127.0.0.1:8150'
```

`frontend/playwright.config.ts`: importe `FALSO_URL`; troque o comentário que abre o `webServer` (hoje "Os DOIS servidores sao subidos pelo proprio Playwright...", l.~50) por "Os TRES servidores -- o falso da Anthropic, a API e o frontend -- sao subidos pelo proprio Playwright...", mantendo o resto do parágrafo; no `webServer` da API, acrescente

```ts
      env: {
        // O provedor da API do E2E e o servidor falso, nunca a Anthropic. O
        // `scripts/e2e-env.sh` RECUSA subir com qualquer endereco fora do
        // loopback e impoe a chave ficticia -- a do .env nunca chega aqui.
        FOCUSQUEST_ANTHROPIC_BASE_URL: FALSO_URL,
      },
```

e um terceiro item em `webServer`, **antes** da API (a ordem não é garantia de partida, mas documenta a dependência):

```ts
    {
      // O MESMO servidor falso do pytest, como processo, com o controle HTTP
      // de `/_control/`. PYTHONPATH=tests porque o pacote e `integration`
      // (como o pytest o importa), e nao `tests.integration`.
      command: `uv run python -m integration.falso_do_e2e --porta ${new URL(FALSO_URL).port}`,
      cwd: REPO_ROOT,
      env: { PYTHONPATH: 'tests' },
      url: `${FALSO_URL}/_control/requests`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
```

`frontend/tests/e2e/falso.ts`:

```ts
import { FALSO_URL } from './servers'

/**
 * O controle do servidor falso, para os cenarios da tutoria.
 *
 * Contrato em `tests/integration/falso_do_e2e.py` (e provado do lado Python
 * por `tests/integration/test_falso_do_e2e.py`). `fetch` do Node, e nao o
 * `request` do Playwright: o controle nao passa pelo navegador nem pelo proxy.
 */
export type Bloco = { text: string[] } | { tool_input: Record<string, unknown> }

export interface RoteiroDoFalso {
  blocks: Bloco[]
  http_status?: number
  cut_after_events?: number
  hold_after_events?: number
}

async function exigir(resposta: Response, esperado: number): Promise<Response> {
  if (resposta.status !== esperado) {
    throw new Error(`controle do falso: ${String(resposta.status)} ${await resposta.text()}`)
  }
  return resposta
}

export async function definirRoteiro(roteiro: RoteiroDoFalso): Promise<void> {
  await exigir(
    await fetch(`${FALSO_URL}/_control/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roteiro),
    }),
    204,
  )
}

export async function liberar(): Promise<void> {
  await exigir(await fetch(`${FALSO_URL}/_control/release`, { method: 'POST' }), 204)
}

export async function reiniciar(): Promise<void> {
  await exigir(await fetch(`${FALSO_URL}/_control/reset`, { method: 'POST' }), 204)
}

export async function requisicoes(): Promise<{ api_key: string; body: unknown }[]> {
  const resposta = await exigir(await fetch(`${FALSO_URL}/_control/requests`), 200)
  return ((await resposta.json()) as { requests: { api_key: string; body: unknown }[] }).requests
}
```

- [ ] **Step 8: Rodar o E2E existente com a infraestrutura nova**

Run: `make check-e2e`
Expected: PASS nos 6 cenários atuais, com **três** servidores subindo (a saída do Playwright lista o `webServer` do falso). O `falso.ts` ainda não tem consumidor; o `tsc -b` (projeto `tsconfig.e2e.json`) o confere mesmo assim — `noUnusedLocals` não reclama de export.

- [ ] **Step 9: Mutações (a guarda obrigatória e o controle)**

1. **A guarda, pelo teste:** em `scripts/e2e-env.sh`, troque `if host not in {"127.0.0.1", "localhost", "::1"}:` por `if host == "api.anthropic.com":`. Run: `uv run pytest tests/integration/test_e2e_env.py -q`. Expected: FAIL em `https://api.anthropic.com.`, `http://127.0.0.1.nip.io:8150` e `http://192.168.0.10:8150` (é a prova de que a lista de permissão pega o que a recusa de nome deixaria passar). Restaure.
2. **A guarda, pelo gate de verdade:** em `frontend/playwright.config.ts`, troque `FOCUSQUEST_ANTHROPIC_BASE_URL: FALSO_URL` por `FOCUSQUEST_ANTHROPIC_BASE_URL: 'https://api.anthropic.com'`. Run: `make check-e2e`. Expected: FAIL — o `webServer` da API não sobe (`recusando subir a API do E2E com o provedor em 'api.anthropic.com'` no stderr do Playwright) e o `npx playwright test` sai com erro **antes** de qualquer cenário. Restaure. Registre o texto exato da falha no HANDOFF.
3. **A chave:** em `scripts/e2e-env.sh`, apague o `export FOCUSQUEST_ANTHROPIC_API_KEY=...`. Expected: FAIL em `test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente`. Restaure.
4. **O controle estrito:** em `roteiro_do_json`, apague o bloco `desconhecidas`. Expected: FAIL em `chave desconhecida: fantasia`. Restaure.
5. **O 404:** em `TratadorComControle.do_POST`, troque o `else: self._responder(404)` por `else: super().do_POST()`. Expected: FAIL em `test_rota_desconhecida_responde_404`. Restaure.
6. **O reset solta:** no ramo `/_control/reset`, apague o `falso.liberar.set()`. Expected: FAIL em `test_reset_solta_uma_resposta_presa` (`terminou.wait` devolve `False`). Restaure.

- [ ] **Step 10: Gate e commit**

```bash
cd frontend && npm run format && cd ..
uv run ruff format tests scripts
make check
git add tests/integration/provedor_falso.py tests/integration/falso_do_e2e.py tests/integration/test_falso_do_e2e.py tests/integration/test_e2e_env.py scripts/e2e-env.sh frontend/tests/e2e/servers.ts frontend/tests/e2e/falso.ts frontend/playwright.config.ts
git commit -m "test(tutoria): servidor falso como processo do e2e, com controle http e guarda de loopback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** os testes novos e os do falso do 1b-1 verdes; E2E atual verde com três servidores; as seis mutações vistas reprovando (a 2 pelo `make check-e2e` de verdade); `make check` EXIT 0; commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 6**: o falso configurável, o processo e o controle, a guarda e a chave imposta no `e2e-env.sh`, o terceiro `webServer`.
- "Decisões": a porta 8150 e o porquê; a lista de permissão de loopback; a chave imposta no script e o URL vindo do Playwright; o controle sob `/_control/` em inglês; segurar/liberar pelo controle.
- **Pendência 43: riscada**, com "Resolvida na Task 6 do 1b-2: o falso sobe como `webServer` do Playwright na 8150 (`frontend/tests/e2e/servers.ts`), sem reuso."
- **Pendência 19, atualizada:** "O E2E usa agora **três** portas fixas: 8100 (API), 5273 (frontend) e 8150 (servidor falso)."

---

### Task 7: Cenários E2E da tutoria

**Objetivo:** os quatro cenários da spec contra a API real, o banco real, o navegador real e o servidor falso — (a) perguntar, ver o texto chegar, confirmar e ver a missão no quadro; (b) recusar; (c) o corte vindo do falso e o "Tentar de novo" sem duplicar a pergunta; (d) o indisponível —, mais (e) o layout do celular (sem rolagem horizontal, Enviar visível na folha), que o README §7 exige e nenhum teste de unidade mede (o jsdom não tem layout). O axe, com o conjunto **padrão** de regras e zero violações, nos estados escrevendo, proposta e indisponível (e na folha aberta do celular). O stream sem final por queda navegador↔API fica coberto no Vitest (Task 1, "a queda no meio do stream"; Task 3, S8/S9) — não aqui.

**Files:**
- Create: `frontend/tests/e2e/tutoring.spec.ts`

**Interfaces:**
- Consumes: `definirRoteiro`, `liberar`, `reiniciar`, `requisicoes` (`falso.ts`, Task 6); `API_URL` (`servers.ts`); os `data-testid` e textos das Tasks 4 e 5.

**Duas regras estruturais, herdadas do `headquarters.spec.ts`:**
1. **Semear por HTTP, nunca por SQL** — a missão do cenário (d) entra por `POST /api/missions` na API dedicada.
2. **Afirmar só sobre as próprias linhas.** O banco é compartilhado com o pytest e não é limpo entre execuções do E2E: a conversa é **uma só** e acumula as mensagens de execuções anteriores. Toda pergunta e toda proposta carregam o sufixo `EXECUCAO` (`randomUUID().slice(0, 8)`), e cada cenário localiza o que é dele por esse texto. Nunca `toHaveCount(n)` sobre a lista inteira.

- [ ] **Step 1: Escrever os cenários**

`frontend/tests/e2e/tutoring.spec.ts`:

```ts
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { definirRoteiro, liberar, reiniciar, requisicoes } from './falso'
import { API_URL } from './servers'

/**
 * A tutoria ponta a ponta: navegador real, API real, banco real e o servidor
 * falso da Anthropic como processo (`tests/integration/falso_do_e2e.py`).
 *
 * O falso e roteirizado ANTES de cada acao pelo controle HTTP, e reiniciado
 * antes de cada cenario: roteiro e contagem de requisicoes nunca vazam de um
 * cenario para o outro. A API do E2E so fala com ele -- o `scripts/e2e-env.sh`
 * recusa subi-la com o provedor fora do loopback e impoe a chave ficticia, e
 * o cenario (a) confere a chave que o falso recebeu.
 *
 * O banco e compartilhado e a conversa e UMA so (spec do 1b, D3): cada
 * pergunta e proposta daqui carrega o sufixo `EXECUCAO`, e e por ele que o
 * cenario acha o que e seu.
 */
const EXECUCAO = randomUUID().slice(0, 8)

/** O texto literal do estado indisponivel (spec, tabela "Estados"). */
const INDISPONIVEL = 'A Tifa está fora do ar: falta configurar o provedor.'

interface Mensagem {
  id: number
  role: 'user' | 'tutor'
  content: string
  status: string
  client_message_id: string | null
  reply_to_id: number | null
  actions: { id: number; state: string; payload: { instructions: string } }[]
}

/** Uma proposta valida para o `MissionCreate`, com prazo uma semana adiante. */
function proposta(rotulo: string) {
  return {
    instructions: `${rotulo} (e2e ${EXECUCAO})`,
    completion_criterion: `Resumo de uma página entregue (e2e ${EXECUCAO})`,
    difficulty: 2,
    estimated_minutes: 30,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/** O painel pronto: status disponivel e historico carregado (campo habilitado). */
async function abrirPainel(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeEnabled()
}

async function perguntar(page: Page, texto: string): Promise<void> {
  await page.getByLabel('Sua mensagem para a Tifa').fill(texto)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
}

// `exact: true` nos nomes curtos ("Enviar", "Tentar de novo"): o Playwright
// casa nome acessivel por SUBSTRING por padrao, e o quadro tem botoes como
// "Tentar de novo a missão: ..." que casariam por acidente.

async function semViolacoes(page: Page): Promise<void> {
  // Conjunto PADRAO: sem `withTags` nem `disableRules`.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

/** A conversa como a API a guarda -- a fonte de verdade para "nao duplicou". */
async function conversa(page: Page): Promise<Mensagem[]> {
  const resposta = await page.request.get(`${API_URL}/api/tutoring/messages`)
  expect(resposta.status()).toBe(200)
  return (await resposta.json()) as Mensagem[]
}

test.beforeEach(async () => {
  await reiniciar()
})

test('(a) perguntar, ver o texto chegar, confirmar e ver a missao no quadro', async ({ page }) => {
  const pedido = proposta('Revisar recursão')
  await definirRoteiro({
    blocks: [{ text: ['Bora ', 'estudar ', 'recursão!'] }, { tool_input: pedido }],
    // Presa depois do primeiro pedaco: message_start, content_block_start e o
    // primeiro delta saem; o resto espera o `liberar()`.
    hold_after_events: 3,
  })
  await abrirPainel(page)

  await perguntar(page, `Me dá uma missão de recursão (e2e ${EXECUCAO})`)

  // ESCREVENDO: o texto chegou pela metade, e a regiao viva anuncia o inicio.
  await expect(page.getByTestId('tutor-partial')).toContainText('Bora')
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa está escrevendo…')
  // O campo foi limpo pelo `user_message`: a pergunta esta gravada.
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toHaveValue('')
  await semViolacoes(page)

  await liberar()

  // PROPOSTA: o cartao, e o fim anunciado.
  const cartao = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
  await expect(cartao).toBeVisible()
  await expect(page.getByTestId('tutor-live')).toHaveText('Tifa terminou de responder.')
  await semViolacoes(page)

  // A API falou com o FALSO, uma vez, e com a chave FICTICIA.
  const recebidas = await requisicoes()
  expect(recebidas).toHaveLength(1)
  expect(recebidas[0]?.api_key).toBe('e2e-chave-ficticia')

  await cartao.getByRole('button', { name: `Confirmar a proposta: ${pedido.instructions}` }).click()
  await expect(cartao.getByTestId('proposal-created')).toHaveText('Missão criada')

  // O quadro recarregou sozinho, pela pagina, e mostra a missao nova.
  await expect(
    page
      .getByTestId('missions-list')
      .getByTestId('mission-item')
      .filter({ hasText: pedido.instructions }),
  ).toHaveCount(1)
})

test('(b) recusar uma proposta: o cartao fica marcado e nenhuma missao nasce', async ({ page }) => {
  const pedido = proposta('Ler o capítulo 5')
  await definirRoteiro({ blocks: [{ text: ['Que tal esta?'] }, { tool_input: pedido }] })
  await abrirPainel(page)

  await perguntar(page, `Me propõe uma leitura (e2e ${EXECUCAO})`)
  const cartao = page.getByTestId('tutor-proposal').filter({ hasText: pedido.instructions })
  await cartao.getByRole('button', { name: `Recusar a proposta: ${pedido.instructions}` }).click()

  await expect(cartao.getByTestId('proposal-rejected')).toHaveText('Proposta recusada')
  await expect(cartao.getByRole('button')).toHaveCount(0)

  // O servidor gravou `recusada`, e nao criou missao.
  const acao = (await conversa(page))
    .flatMap((m) => m.actions)
    .find((a) => a.payload.instructions === pedido.instructions)
  expect(acao?.state).toBe('recusada')
  const missoes = (await (await page.request.get(`${API_URL}/api/missions`)).json()) as {
    instructions: string
  }[]
  expect(missoes.filter((m) => m.instructions === pedido.instructions)).toHaveLength(0)
})

test('(c) a resposta cortada no meio, e o Tentar de novo sem duplicar a pergunta', async ({
  page,
}) => {
  const pergunta = `Explica ponteiros pra mim (e2e ${EXECUCAO})`
  // O falso fecha a conexao depois do primeiro pedaco, sem `message_stop`:
  // o SDK termina em silencio e o servico grava `falhou` com
  // `provedor_indisponivel` (medicao M3 do 1b-1).
  await definirRoteiro({ blocks: [{ text: ['Começo ', 'do meio', ' e fim.'] }], cut_after_events: 3 })
  await abrirPainel(page)

  await perguntar(page, pergunta)

  const cortada = page.getByTestId('tutor-message').filter({ hasText: 'Começo' })
  await expect(cortada.getByTestId('tutor-message-mark')).toHaveText('Resposta com falha')
  await expect(page.getByRole('alert')).toContainText('A Tifa não conseguiu responder agora.')

  await definirRoteiro({ blocks: [{ text: ['Resposta inteira, agora sim.'] }] })
  await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click()

  await expect(
    page.getByTestId('tutor-message').filter({ hasText: 'Resposta inteira, agora sim.' }),
  ).toHaveCount(1)
  // Na TELA, a pergunta aparece uma vez so.
  await expect(page.getByTestId('tutor-message').filter({ hasText: pergunta })).toHaveCount(1)
  // E o parcial da tentativa que falhou CONTINUA na tela, marcado (spec, l.345).
  await expect(cortada.getByTestId('tutor-message-mark')).toHaveText('Resposta com falha')

  // No SERVIDOR: uma pergunta, duas respostas (a que falhou e a completa).
  const mensagens = await conversa(page)
  const perguntas = mensagens.filter((m) => m.role === 'user' && m.content === pergunta)
  expect(perguntas).toHaveLength(1)
  const respostas = mensagens.filter((m) => m.reply_to_id === perguntas[0]?.id)
  expect(respostas.map((m) => m.status).sort()).toEqual(['completa', 'falhou'])
  // E o modelo foi chamado duas vezes -- uma por tentativa, nenhuma a mais.
  expect(await requisicoes()).toHaveLength(2)
})

test('(d) indisponivel: o texto da spec, o campo desabilitado e o quadro funcionando', async ({
  page,
  playwright,
}) => {
  // Sem uma segunda API sem chave: o contrato "sem chave -> available: false
  // e 503 antes de gravar" e provado no pytest (test_status_indisponivel_sem_chave,
  // test_sem_chave_responde_503_e_nao_grava). Aqui se prova a TELA.
  const api = await playwright.request.newContext({ baseURL: API_URL })
  const semeada = (await (
    await api.post('/api/missions', {
      data: {
        instructions: `Missão do quadro com a Tifa fora (e2e ${EXECUCAO})`,
        completion_criterion: `Conferida (e2e ${EXECUCAO})`,
        difficulty: 1,
        estimated_minutes: 15,
        deadline: '2027-04-01T12:00:00Z',
      },
    })
  ).json()) as { id: number }
  await api.dispose()

  await page.route('**/api/tutoring/status', (rota) => rota.fulfill({ json: { available: false } }))
  await page.goto('/')

  await expect(page.getByTestId('tutor-unavailable')).toHaveText(INDISPONIVEL)
  await expect(page.getByLabel('Sua mensagem para a Tifa')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled()
  // O Quartel-General continua funcionando.
  await expect(
    page.getByTestId('missions-list').locator(`[data-mission-id="${String(semeada.id)}"]`),
  ).toHaveCount(1)
  await semViolacoes(page)
  expect(await requisicoes()).toHaveLength(0)
})

test.describe('(e) celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a folha abre pelo botao fixo, sem rolagem horizontal, com o Enviar visivel', async ({
    page,
  }) => {
    await page.goto('/')
    const semRolagemHorizontal = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )

    await expect(page.getByTestId('tutor-sheet-open')).toBeVisible()
    expect(await semRolagemHorizontal()).toBe(true)

    await page.getByTestId('tutor-sheet-open').click()
    const folha = page.getByRole('dialog', { name: 'Tifa' })
    await expect(folha).toBeVisible()
    await expect(folha.getByRole('button', { name: 'Enviar', exact: true })).toBeInViewport()
    expect(await semRolagemHorizontal()).toBe(true)
    await semViolacoes(page)

    await page.keyboard.press('Escape')
    await expect(folha).toHaveCount(0)
    await expect(page.getByTestId('tutor-sheet-open')).toBeFocused()
  })
})
```

- [ ] **Step 2: Rodar e ver passar — e, antes, ver falhar pelo motivo certo**

Primeiro, com a Task 6 pronta e **sem** este arquivo, nada a rodar. Com o arquivo:

Run: `make check-e2e`
Expected: PASS nos 6 cenários antigos e nos 5 novos. Se **(a)** reprovar em "Tifa está escrevendo…" com o parcial nunca aparecendo antes do `liberar()`, a hipótese a medir é **buffer no proxy do `vite preview`** (o `delta` só atravessa quando a resposta termina). Meça antes de mudar qualquer coisa: `curl -N -X POST http://127.0.0.1:5273/api/tutoring/messages ...` com o falso segurando, comparado com o mesmo `curl` direto na 8100. Registre o resultado no HANDOFF; o conserto, se for necessário, é de configuração do proxy (`vite.config.ts`), não do cenário.

- [ ] **Step 3: Mutações (cada cenário prova o que diz)**

1. **(a) prova a chave fictícia:** em `scripts/e2e-env.sh`, troque o valor imposto por `e2e-outra-chave`. Expected: FAIL em (a), `toBe('e2e-chave-ficticia')`. Restaure.
2. **(a) prova a recarga do quadro:** em `Headquarters.tsx`, troque `onMissionCreated={reloadBoard}` por `onMissionCreated={() => undefined}`. Rode `make check-e2e` (o build embute o código). Expected: FAIL em (a), no `toHaveCount(1)` do quadro. Restaure.
3. **(c) prova o "não duplica":** em `useTutorConversation.retry`, troque o reenvio por `run({ ...retryTarget, clientMessageId: crypto.randomUUID() })`. Expected: FAIL em (c) — duas perguntas no servidor (`toHaveLength(1)` recebe 2) e duas na tela. Restaure.
4. **(d) prova o campo desabilitado:** em `TutorConversation.tsx`, force `disabled={false}` no `textarea`. Expected: FAIL em (d). Restaure.
5. **(e) prova a folga do layout:** acrescente ao `<main>` do `Headquarters.tsx` um filho `<div style={{ width: 600 }} />`. Expected: FAIL em (e), `semRolagemHorizontal()` `false`. Restaure.

(As mutações 2 a 5 mexem em `src/` e exigem novo build: é o `make check-e2e` que o faz. Não rode `npx playwright test` sozinho depois de mudar `src/` — ele serviria o build antigo.)

- [ ] **Step 4: Contar as linhas que o E2E deixa**

Depois de um `make check` completo (o pytest faz `DROP SCHEMA` antes do E2E), conte, **só com consultas de leitura**:

```bash
PGPASSWORD=focusquest_local psql -h 127.0.0.1 -p 55432 -U focusquest -d focusquest_test -At \
  -c "select 'missions', count(*) from missions union all select 'tutor_messages', count(*) from tutor_messages union all select 'tutor_actions', count(*) from tutor_actions"
```

O esperado **pelo desenho** é 6 missões (as 4 do E2E atual, a confirmada em (a) e a semeada em (d)), 7 mensagens ((a) 2, (b) 2, (c) 3) e 2 ações ((a) e (b)). Registre o **medido**, não o esperado; se divergir, investigue antes de registrar.

- [ ] **Step 5: Gate e commit**

```bash
cd frontend && npm run format && cd ..
make check
git add frontend/tests/e2e/tutoring.spec.ts
git commit -m "test(tutoria): cenarios e2e da tifa contra o servidor falso, com axe

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** 11 cenários verdes em Chromium; as cinco mutações vistas reprovando; contagem de linhas medida; `make check` EXIT 0; commit local.

**Registrar no HANDOFF:**
- "Alterações", **Task 7**: os cinco cenários e o que cada um prova; o `(e)` como acréscimo aos quatro da spec, com o motivo (README §7 no celular, sem layout no jsdom).
- **Pendência 20, atualizada:** a contagem **medida** no Step 4, e que `make check-e2e` repetido sem o pytest no meio acumula por execução: 2 missões, 7 mensagens e 2 ações (ou o medido).
- **Pendência 21, atualizada:** o axe passa a auditar também escrevendo, proposta, indisponível e a folha do celular; **continuam fora** o carregando do painel (esqueleto), o "Enviando…" antes do `user_message`, os estados do cartão depois da decisão (executada, recusada, falhou) e o aviso de falha do envio — cobertos só no Vitest.
- **Pendência nova:** "Um `gerando` deixado por uma execução do E2E interrompida à força (Ctrl-C no meio de um stream) trava a conversa do `focusquest_test` até o órfão ser recolhido — `tutor_timeout_seconds` (60) mais 30 s de folga. Um `make check-e2e` rodado nesse intervalo recebe `409 mensagem_em_andamento` na primeira pergunta e reprova. O `make check` completo não sofre disso: o pytest faz `DROP SCHEMA` antes. Saída, se incomodar: `FOCUSQUEST_TUTOR_TIMEOUT_SECONDS` curto no `env` da API do E2E."
- **Pendência nova (a limitação da emenda E4):** "O estado indisponível do E2E é produzido por `page.route` sobre `/api/tutoring/status`; o caminho real 'API sem chave' é provado só no pytest. O `503 provedor_nao_configurado` do `POST`, na tela, só no Vitest (P7)."

---

### Task 8: A chamada real e a camada 3 do servidor falso

**Objetivo:** o dono faz, uma vez, localmente e com a chave dele, a conversa de verdade pela tela — pedir uma missão, confirmar, ver no quadro (roteiro (a)–(c) da pendência 42) — e o agente grava, **sem conteúdo nem chave**, a sequência de tipos de evento de uma resposta real com texto e proposta (o (d)), num arquivo em `tests/`. Um teste passa a conferir que o falso emite a mesma sequência. Resolve as pendências 40 e 42. **O CI nunca chama a Anthropic**: nada desta tarefa roda no gate, a não ser a comparação contra o arquivo gravado.

**Files:**
- Create: `tests/integration/camada3.py`
- Create: `tests/integration/referencia_da_api_real.json` (gerado pelo script, nunca à mão)
- Create: `tests/integration/test_camada3.py`
- Modify: `tests/unit/test_config.py` (regressão da guarda com a chave no ambiente)
- Modify: `docs/HANDOFF.md`, seção "Comandos" (o **único** lugar que documenta como subir a API local com a Tifa)
- Fora do repositório: o item `focusquest-anthropic` no Keychain do macOS. **Nenhuma** mudança em `.env`, `.env.example`, `.gitleaks.toml` ou `scripts/push-env.sh`.

**Interfaces:**
- Consumes: `PERSONA` (`tutoring/persona.py`), `esquema_da_proposta`, `DESCRICAO_DA_FERRAMENTA` (`tutoring/anthropic_provider.py`), `TipoDeAcao`, `Settings`; `ServidorAnthropicFalso`, `Roteiro`, `Texto`, `ChamadaDeFerramenta` (para o teste).
- Produces (`camada3.py`):
  - `DESCARTADOS_PELO_SDK: frozenset[str] = frozenset({"ping"})`
  - `REFERENCIA: Path` (o JSON ao lado do módulo)
  - `sequencia_de_tipos(linhas: Iterable[str]) -> list[str]` — só os nomes; `content_block_start` e `content_block_delta` ganham `:<tipo do bloco/delta>`; repetições seguidas viram uma
  - `comparavel(tipos: Sequence[str]) -> list[str]` — sem os `DESCARTADOS_PELO_SDK`
  - `capturar(cliente: anthropic.Anthropic, *, modelo: str, max_tokens: int, agora: datetime) -> list[str]`
  - `main() -> None` (`PYTHONPATH=tests uv run python -m integration.camada3`)

- [ ] **Step 1: Regressão — as guardas valem com a chave no ambiente do shell**

A chave nunca estará no `.env`, mas estará no **ambiente** de dois processos manuais (o uvicorn do roteiro e o script da captura), e alguém pode exportá-la no shell por hábito. Um `make check` rodado nesse shell herda a variável. As duas guardas precisam valer assim:

- **E2E:** já coberto pela Task 6 — `test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente` põe `FOCUSQUEST_ANTHROPIC_API_KEY` no **ambiente** e confere que o `scripts/e2e-env.sh` a substitui pela fictícia; e a lista de permissão de loopback não depende de onde a chave veio. Nada a acrescentar.
- **pytest:** não coberto hoje. O `test_a_suite_nunca_aponta_para_a_anthropic` (1b-1) confere o endereço sem chave no ambiente. Acrescente a `tests/unit/test_config.py`:

```python
def test_a_guarda_vale_com_a_chave_exportada_no_ambiente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A chave real vive no Keychain e entra no AMBIENTE dos comandos manuais
    (Task 8 do 1b-2). Um `make check` rodado num shell que a exportou herda a
    variavel: o provedor da suite tem de continuar numa porta fechada."""
    monkeypatch.setenv("FOCUSQUEST_ANTHROPIC_API_KEY", "sk-ant-api03-parece-de-verdade")
    settings = Settings()
    assert settings.anthropic_api_key is not None
    assert settings.anthropic_base_url == "http://127.0.0.1:9"
```

Mutação: em `tests/conftest.py`, troque o `setenv` da guarda de sessão por `pass` (mantendo o `yield`). Run: `uv run pytest tests/unit/test_config.py -q`. Expected: FAIL neste teste (`'https://api.anthropic.com' == 'http://127.0.0.1:9'`, o endereço do `.env`). Restaure.

Registre também, na seção de emendas do HANDOFF: o `push-env.sh` só exporta o que está no `.env`; se o shell de quem empurra tiver a variável exportada, ela passa ao worktree ("uma variável já exportada vence") — e as duas guardas acima são o que a neutraliza. A recomendação é nunca exportá-la no perfil do shell: só no comando.

Gate e commit:

```bash
make check
git add tests/unit/test_config.py
git commit -m "test(tutoria): a guarda da suite vale com a chave exportada no ambiente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: A chave entra no Keychain, pelo dono**

O dono cria a chave no console da Anthropic e, **no próprio terminal** (não pelo agente), roda:

```bash
security add-generic-password -s focusquest-anthropic -a "$USER" -w
```

e cola a chave no prompt (o `-w` sem valor faz o `security` perguntar; a chave não passa pela linha de comando nem pelo histórico do shell). O agente confere **só a forma**, sem ver o valor:

```bash
security find-generic-password -s focusquest-anthropic -a "$USER" >/dev/null && echo presente   # esperado: presente
security find-generic-password -s focusquest-anthropic -w | grep -c '^sk-ant-'                   # esperado: 1 (só a contagem sai)
git status --porcelain                                                                           # esperado: vazio (nada mudou no repositório)
grep -c '^FOCUSQUEST_ANTHROPIC_API_KEY=$' .env                                                    # esperado: 1 (a linha continua vazia)
```

Se qualquer conferência falhar: **ponto de parada 4**.

Documente, **num lugar só** — a seção "Comandos" do `docs/HANDOFF.md`, que já é onde mora "para rodar a aplicação em desenvolvimento" —, o jeito de subir a API local com a Tifa:

```bash
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
```

com uma frase: "a chave vem do Keychain só para este processo; não a exporte no shell nem a escreva no `.env` (o Gitleaks do gate a acusaria, e o `pre-push` a levaria ao gate — ver as emendas do 1b-2 na spec)". **Sem alvo novo no Makefile**: um alvo que lê o Keychain seria um comando macOS-only no arquivo que o CI usa, sem ser verificação — e a paridade 1:1 (`AGENTS.md` §4) não tem job para ele. O README não muda (é a especificação do produto, não o manual de operação).

- [ ] **Step 3: O roteiro (a)–(c) pela tela, com a chave de verdade**

Com `anthropic_base_url` **sem** override (o `.env` diz `https://api.anthropic.com`, que é também o padrão), e a chave vinda do Keychain **só** para o processo da API:

```bash
make db-up
make migrate
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000   # em segundo plano
cd frontend && npm run dev                                           # em segundo plano; frontend/.env com VITE_API_URL=/api
```

O **dono**, em `http://localhost:5173`:
(a) pede à Tifa uma missão — por exemplo "Me propõe uma missão de 30 minutos para revisar recursão, com prazo amanhã às 18h." — e vê o texto chegar e o cartão aparecer;
(b) clica em Confirmar e vê "Missão criada";
(c) vê a missão nova no Quartel-General.

O agente registra no HANDOFF, **sem o conteúdo** da conversa: cada passo aconteceu ou não; se houve erro, o `code` que a tela recebeu (a aba Rede mostra o evento `error` ou o status); o modelo (`tutor_model` do `.env`). Encerre os dois servidores ao fim.

- [ ] **Step 4: Testes que falham — a camada 3**

`tests/integration/test_camada3.py`:

```python
"""Camada 3 do servidor falso: ele emite a sequencia de TIPOS de evento que a
API real emitiu, gravada uma vez pela chamada real do 1b-2.

As camadas 1 (tipos do SDK) e 2 (o SDK real entende o falso) provam que o
falso e valido PARA O SDK; esta prova que ele se parece com o que a API manda
(`docs/QUALITY.md` §9). O arquivo de referencia nao tem conteudo: so nomes de
evento e de tipo de bloco.
"""

import inspect
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import anthropic
import anthropic._streaming
import pytest

from integration import camada3
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

PROPOSTA = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo entregue",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2027-01-10T13:00:00Z",
}


def test_sequencia_de_tipos_guarda_so_nomes_e_colapsa_repeticoes() -> None:
    linhas = [
        "event: message_start",
        'data: {"type":"message_start","message":{"content":[]}}',
        "",
        "event: ping",
        'data: {"type":"ping"}',
        "",
        "event: content_block_start",
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"SEGREDO"}}',
        "",
        "event: content_block_delta",
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"MAIS"}}',
        "",
        "event: message_stop",
        'data: {"type":"message_stop"}',
    ]
    tipos = camada3.sequencia_de_tipos(linhas)
    assert tipos == [
        "message_start",
        "ping",
        "content_block_start:text",
        "content_block_delta:text_delta",
        "message_stop",
    ]
    assert "SEGREDO" not in json.dumps(tipos)


def test_comparavel_retira_so_o_que_o_sdk_descarta() -> None:
    assert camada3.comparavel(["message_start", "ping", "message_stop"]) == [
        "message_start",
        "message_stop",
    ]


def test_o_sdk_fixado_ainda_descarta_ping() -> None:
    """A retirada do `ping` na comparacao so e honesta enquanto o SDK o
    descartar de fato (medido no 1b-2: `anthropic/_streaming.py`). Se uma versao
    nova passar a entrega-lo, esta guarda reprova e a decisao volta a mesa."""
    fonte = inspect.getsource(anthropic._streaming)
    assert 'if sse.event == "ping":' in fonte
    assert camada3.DESCARTADOS_PELO_SDK == frozenset({"ping"})


def test_a_referencia_gravada_nao_tem_conteudo() -> None:
    referencia = json.loads(camada3.REFERENCIA.read_text())
    assert set(referencia) == {"capturada_em", "sdk", "modelo", "eventos"}
    # A versao do SDK e so INFORMACAO sobre a fotografia. Mudar o SDK nao
    # reprova aqui: quem acusa um SDK que deixou de entender o falso e a
    # camada 2 (`test_provedor_falso.py`).
    assert isinstance(referencia["sdk"], str)
    for tipo in referencia["eventos"]:
        assert re.fullmatch(r"[a-z_]+(:[a-z_]+)?", tipo), tipo
    # Uma resposta com texto E proposta: e o que a camada 3 precisa comparar.
    assert "content_block_start:text" in referencia["eventos"]
    assert "content_block_start:tool_use" in referencia["eventos"]


def test_o_falso_emite_a_sequencia_da_api_real(falso: ServidorAnthropicFalso) -> None:
    """A camada 3. Mesma funcao de captura da chamada real, contra o falso."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Bora, ", "vamos estudar!")), ChamadaDeFerramenta(PROPOSTA))
    )
    cliente = anthropic.Anthropic(api_key="sk-ant-teste", base_url=falso.url, max_retries=0)
    do_falso = camada3.capturar(
        cliente, modelo="claude-opus-5", max_tokens=100, agora=datetime(2026, 9, 22, tzinfo=UTC)
    )
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]

    assert camada3.comparavel(do_falso) == camada3.comparavel(referencia)


def test_a_captura_recusa_gravar_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Sem esta guarda, "gravar" a referencia com o `.env` apontado para o falso
    produziria uma camada 3 que compara o falso com ele mesmo -- e sempre passa.
    (Na suite, a guarda de `tests/conftest.py` ja aponta para 127.0.0.1:9.)"""
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3, "REFERENCIA", destino)
    with pytest.raises(SystemExit, match="so grava a API real"):
        camada3.main()
    assert not destino.exists()
```

(O `test_a_referencia_gravada_nao_tem_conteudo` e o `test_o_falso_emite...` reprovam até o Step 6 gravar o arquivo — é o vermelho esperado.)

- [ ] **Step 5: Implementar a captura**

`tests/integration/camada3.py`:

```python
"""Camada 3 do servidor falso: a sequencia de TIPOS de evento da API real.

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \\
      PYTHONPATH=tests uv run python -m integration.camada3

Grava `referencia_da_api_real.json`, ao lado deste arquivo, com os NOMES dos
eventos SSE e o tipo de cada bloco/delta -- nunca o texto, a entrada da
ferramenta, os ids ou a chave. Le as linhas CRUAS da resposta
(`with_streaming_response`), e nao os eventos do SDK, porque o SDK descarta
o que ele nao usa (o `ping`), e a camada 3 existe para ver o que a API MANDA.

A requisicao e montada com as MESMAS pecas de producao -- a persona, o
esquema e a descricao da ferramenta, o modelo e o `max_tokens` do Settings --
mas nao e a chamada que a tela faz: interceptar aquela exigiria um modo de
captura em `src/` ou um proxy no `anthropic_base_url`, e os dois estao fora
(decisao D8 da spec; o roteiro manda "sem override").
"""

import json
import sys
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

import anthropic

from focusquest.core.config import Settings
from focusquest.modules.tutoring.anthropic_provider import (
    DESCRICAO_DA_FERRAMENTA,
    esquema_da_proposta,
)
from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.persona import PERSONA

REFERENCIA = Path(__file__).with_name("referencia_da_api_real.json")

# O que o SDK fixado descarta antes de o adaptador ver
# (`anthropic/_streaming.py`: `if sse.event == "ping": continue`). Retirado so
# na COMPARACAO; o arquivo guarda a sequencia bruta.
DESCARTADOS_PELO_SDK = frozenset({"ping"})

_API_REAL = "api.anthropic.com"

_PEDIDO = (
    "Me propõe uma missão de 30 minutos para revisar recursão, "
    "com prazo amanhã às 18h, horário de Brasília."
)


def sequencia_de_tipos(linhas: Iterable[str]) -> list[str]:
    """Os tipos de evento, na ordem, sem conteudo nenhum.

    `content_block_start` e `content_block_delta` levam o tipo do bloco ou do
    delta (`text`, `tool_use`, `text_delta`, `input_json_delta`): e o que
    distingue uma resposta com proposta de uma so de texto. Repeticoes
    seguidas viram UMA: o numero de `delta` depende do texto, e nao do
    formato.
    """
    tipos: list[str] = []
    evento: str | None = None
    for linha in linhas:
        if linha.startswith("event: "):
            evento = linha.removeprefix("event: ")
        elif linha.startswith("data: ") and evento is not None:
            tipo = evento
            if evento == "content_block_start":
                tipo = f"{evento}:{json.loads(linha[6:])['content_block']['type']}"
            elif evento == "content_block_delta":
                tipo = f"{evento}:{json.loads(linha[6:])['delta']['type']}"
            if not tipos or tipos[-1] != tipo:
                tipos.append(tipo)
            evento = None
    return tipos


def comparavel(tipos: Sequence[str]) -> list[str]:
    return [t for t in tipos if t not in DESCARTADOS_PELO_SDK]


def capturar(
    cliente: anthropic.Anthropic, *, modelo: str, max_tokens: int, agora: datetime
) -> list[str]:
    with cliente.messages.with_streaming_response.create(
        model=modelo,
        max_tokens=max_tokens,
        system=f"{PERSONA}\n\nAgora (UTC): {agora.isoformat()}",
        messages=[{"role": "user", "content": _PEDIDO}],
        tools=[
            {
                "name": TipoDeAcao.CRIAR_MISSAO.value,
                "description": DESCRICAO_DA_FERRAMENTA,
                "input_schema": esquema_da_proposta(),
            }
        ],
        tool_choice={"type": "auto", "disable_parallel_tool_use": True},
        stream=True,
    ) as resposta:
        return sequencia_de_tipos(resposta.iter_lines())


def main() -> None:
    settings = Settings()
    if urlsplit(settings.anthropic_base_url).hostname != _API_REAL:
        raise SystemExit(
            "a camada 3 so grava a API real; o anthropic_base_url aponta para "
            f"'{urlsplit(settings.anthropic_base_url).hostname}'"
        )
    if settings.anthropic_api_key is None:
        raise SystemExit("sem FOCUSQUEST_ANTHROPIC_API_KEY no ambiente; nada foi gravado")
    cliente = anthropic.Anthropic(
        api_key=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        max_retries=0,
    )
    try:
        tipos = capturar(
            cliente,
            modelo=settings.tutor_model,
            max_tokens=settings.tutor_max_tokens,
            agora=datetime.now(UTC),
        )
    except anthropic.APIStatusError as erro:
        # So o status: o corpo do erro nao tem a chave, mas tambem nao interessa.
        raise SystemExit(f"a API respondeu {erro.status_code}; nada foi gravado") from None
    except anthropic.APIError as erro:
        raise SystemExit(f"falha ao falar com a API: {type(erro).__name__}") from None
    if "content_block_start:text" not in tipos or "content_block_start:tool_use" not in tipos:
        raise SystemExit(
            "a resposta nao teve texto E proposta; rode de novo (nada foi gravado)"
        )
    REFERENCIA.write_text(
        json.dumps(
            {
                "capturada_em": datetime.now(UTC).date().isoformat(),
                "sdk": f"anthropic=={anthropic.__version__}",
                "modelo": settings.tutor_model,
                "eventos": tipos,
            },
            indent=2,
        )
        + "\n"
    )
    # So os tipos vao para a tela.
    json.dump(tipos, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
```

Antes do Step 6, rode só os testes que não dependem da referência: `uv run pytest tests/integration/test_camada3.py -q -k "sequencia or comparavel or ping or recusa"`. Expected: PASS nos quatro.

- [ ] **Step 6: A captura real (uma vez)**

```bash
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  PYTHONPATH=tests uv run python -m integration.camada3
```

Expected: uma linha JSON com a lista de tipos, e `tests/integration/referencia_da_api_real.json` criado. Confira o arquivo **inteiro** antes de qualquer outra coisa (`cat` dele é seguro: só tem nomes): nenhum texto da resposta, nenhum id `msg_`/`toolu_`, nenhuma chave. Rode `make check-secrets` sobre ele.

Então:

```bash
uv run pytest tests/integration/test_camada3.py -q
```

- **Se passar:** o falso emite a mesma sequência que a API real, fora o `ping`. Siga.
- **Se reprovar em `test_o_falso_emite_a_sequencia_da_api_real`: ponto de parada 3.** Mostre ao dono o diff das duas listas (`comparavel(do_falso)` × `comparavel(referencia)`) e **não** mude nem o falso nem a referência. É o achado que a camada 3 existe para produzir; a decisão (mudar o falso para imitar a API, ou aceitar e documentar a diferença) é do dono.

- [ ] **Step 7: Mutações**

1. Em `test_o_falso_emite...`, a guarda é a comparação: edite `referencia_da_api_real.json` trocando `"message_delta"` por `"message_deltaX"` (cópia de segurança pelo protocolo de mutação). Expected: FAIL. Restaure pelo `cp` do protocolo (o arquivo ainda não está commitado).
2. Em `camada3.main`, apague o bloco da checagem de `_API_REAL`. Expected: FAIL em `test_a_captura_recusa...` — sem a guarda, o `main()` tenta falar com `127.0.0.1:9` e sai com "falha ao falar com a API: APIConnectionError", que não casa com `so grava a API real`. Restaure.
3. Em `sequencia_de_tipos`, troque `if not tipos or tipos[-1] != tipo:` por `if True:`. Expected: FAIL em `test_sequencia_de_tipos_guarda_so_nomes_e_colapsa_repeticoes` **e** em `test_o_falso_emite...` (o falso manda dois `text_delta`; a real, outro número). Restaure.

- [ ] **Step 8: Gate e commit**

```bash
uv run ruff format tests
make check
git status --porcelain       # confira: .env NAO aparece
git add tests/integration/camada3.py tests/integration/test_camada3.py tests/integration/referencia_da_api_real.json
git commit -m "test(tutoria): camada 3 do servidor falso, com a sequencia de eventos da api real

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Critério de pronto:** o teste de regressão do Step 1 verde e visto reprovando por mutação; a chave no Keychain conferida só pela forma, e o `.env` sem chave; o roteiro (a)–(c) feito pelo dono e registrado sem conteúdo; a referência gravada pela API real, sem conteúdo; `test_camada3.py` inteiro verde (ou a parada 3 acionada e resolvida pelo dono); as mutações vistas reprovando; `make check` EXIT 0; commit local; `git status` sem `.env` nem nada fora do previsto.

**Registrar no HANDOFF:**
- "Decisões": ponteiro para as emendas E1–E3 da spec (a Task 9 as escreve).
- "Comandos": a linha de subir a API com a chave do Keychain (Step 2), e a da captura.
- "Alterações", **Task 8**: o teste de regressão, o `camada3.py`, a referência.
- "Resultados": a sonda do Gitleaks que motivou o Keychain (E1); o teste de regressão com a mutação; o resultado de cada passo do roteiro (a)–(c); a sequência gravada (a lista de tipos, que não é conteúdo); o `test_camada3.py`.
- **Pendências 40 e 42: riscadas**, com o commit e o que foi medido. Se a parada 3 acionou, a 40 fica aberta com o diff e a decisão do dono.
- `docs/QUALITY.md` §9, subseção "Camada 3": passa de "pendente" a "existe" (texto na Task 9).

---

### Task 9: Documentação — HANDOFF, QUALITY e ARCHITECTURE

**Objetivo:** os três documentos passam a descrever o sistema como ele ficou, com cada afirmação apoiada num comando rodado nesta sessão. Fecha a pendência 48. Nenhuma mudança de código; mesmo assim, `make check` duas vezes seguidas.

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/QUALITY.md` (§3, §4, §9)
- Modify: `docs/ARCHITECTURE.md` (§1 árvore e "O que a árvore não tem", §3 Frontend, §4 tabela do frontend)

- [ ] **Step 1: `docs/HANDOFF.md`**

Consolide o que as Tasks 1–8 registraram ao longo do caminho (as seções já existem desde a Task 1; aqui elas são revisadas de ponta a ponta, não reescritas de memória):

- **"Revisão-base":** o parágrafo do 1b-2 ganha o intervalo real de commits (`git log --oneline a795ee7..HEAD | wc -l`, contado, não estimado) e continua "não publicado".
- **"Decisões tomadas" → nova subseção "Incremento 1b-2 — decisões que a spec não fixava":** a tabela "Decisões que as instruções e a spec não fixavam" deste plano, **com as linhas que a execução mudou corrigidas** (por exemplo, a forma final do teste de cancelamento da Task 1, qualquer ajuste de foco da Task 4) — **sem** as cinco emendas E1–E5, que vão para a spec (Step 1b) e aqui só ganham um ponteiro — e uma subseção "decisões tomadas durante a execução" para o que o plano não previu.
- **"Dependências e infraestrutura que entraram no 1b-2":** "Nenhuma dependência npm ou Python nova (conferido: `git diff a795ee7 -- frontend/package.json pyproject.toml` vazio)." Infraestrutura: o servidor falso como processo na 8150 (terceiro `webServer`); a chave real no Keychain do macOS (E1), fora do repositório — o `.gitleaks.toml` não mudou. Endpoints: nenhum na aplicação; o controle `/_control/*` é do falso, em `tests/`.
- **"Alterações do Incremento 1b-2":** um item por tarefa (0 a 9), com o SHA de cada commit (`git log --oneline a795ee7..HEAD`).
- **"Comandos":** acrescente

| Comando | O que faz |
|---|---|
| `PYTHONPATH=tests uv run python -m integration.falso_do_e2e --porta 8150` | Sobe o servidor falso do E2E à mão (o Playwright o sobe sozinho no `make check-e2e`). |
| `PYTHONPATH=tests uv run python -m integration.camada3` | Captura a referência da camada 3 **com a API real e a chave do `.env`**. Uso manual, raro; nunca no gate. |

- **"Resultados":** as linhas medidas nesta tarefa (Step 4) e nas anteriores, cada uma com a revisão em que foi medida.
- **Pendências:**
  - riscar **40**, **42** (Task 8), **43** (Task 6), **48** (Step 3 abaixo), cada uma com o texto de como foi fechada;
  - atualizar **19** (três portas: 8100, 5273, 8150), **20** (contagem medida na Task 7), **21** (estados auditados e não auditados, Task 7), **32** (os espelhos da tutoria, Task 2), **33** (`crypto.randomUUID` no Enviar e no Confirmar, Task 3), **34** (`useDecideAction`, Task 5), **41** (o teto também na tela, Task 3);
  - atualizar **45**, que **continua aberta**: "Desde o 1b-2 a consequência é visível: uma resposta cortada por `max_tokens` chega à tela como `completa`, sem marca, e o cartão de proposta não aparece se o corte veio antes do `tool_use`. A tela não tem como distinguir: o `MessageRead` não carrega o `stop_reason`. Resolver pede mudar o backend (gravar o `stop_reason`, ou tratar `max_tokens` como `interrompida`)."
  - acrescentar, em "**Criadas pelo Incremento 1b-2**", as que as Tasks 4, 7 e 8 registraram (teclado virtual não medido; o `gerando` órfão que trava um `check-e2e` repetido; o indisponível do E2E por `page.route`, limitação da emenda E4) e qualquer outra que a execução encontrar.
- **"Próximo incremento":** o 1b-2 entregue (não publicado); o próximo é o **B — o ciclo diário**, que começa por design próprio (pendência 26); e o que o B encontra pronto do 1b (o painel, o `postStream`, o falso como processo).

- **Registro da D-a no HANDOFF** (em "Decisões tomadas", subseção do 1b-2, e em "Setup"): a chave real mora no Keychain, nunca no `.env`; o motivo com as duas exposições medidas — o `gitleaks dir .` varre o `.env` ignorado (a sonda da E1) e o `pre-push` exporta toda `FOCUSQUEST_*` do `.env` para o worktree do gate (`scripts/push-env.sh`), o que levaria a chave real ao ambiente do gate inteiro a cada push; e o resíduo: uma variável exportada no shell de quem empurra também passa ao worktree, neutralizada pelas guardas (teste de regressão da Task 8 e `test_impoe_a_chave_ficticia...` da Task 6).

- [ ] **Step 1b: A seção "Emendas (1b-2)" na spec**

Em `docs/superpowers/specs/2026-09-18-incremento-1b-design.md`, depois da seção "Emendas (2026-09-19, execução do 1b-1)" e antes de "Entregas de documentação", uma seção "## Emendas (2026-09-22, 1b-2)" no mesmo formato: um parágrafo dizendo que o texto original fica intocado, e uma tabela "O que a spec dizia | O que vale | Motivo" com as cinco linhas da tabela "Emendas à spec" deste plano (E1 a E5), cada uma com o motivo **medido** e o arquivo/teste que a prova. A linha da D1 cita a sonda do Gitleaks (data, versão, EXIT) e o `push-env.sh`. Nenhuma dessas cinco aparece no HANDOFF como "decisão que a spec não fixava": lá, só um ponteiro para esta seção.

- [ ] **Step 2: `docs/QUALITY.md`**

- **§3 (Frontend):** na tabela "Fora", a linha de `frontend/src/test/**` passa a citar os quatro arquivos que existem lá (`setup.ts`, `sse.ts`, `fetchRoutes.ts`, `viewport.ts`) e diz por que cada um é infraestrutura e não código de aplicação. **Nenhuma exclusão nova** — a linha já existia; o que muda é a descrição do conteúdo.
- **§4 (`check-e2e`):** servidores dedicados passam a ser **três** (o falso na 8150, com o `webServer` descrito); a guarda nova do `scripts/e2e-env.sh` (loopback e chave imposta), com o texto da falha medida na mutação 2 da Task 6; o axe nos estados novos (lista da Task 7) e os que continuam fora; e a contagem de linhas **medida** na Task 7 — missões, mensagens e ações da tutoria —, substituindo o "4 linhas" do Incremento A.
- **§9:** a subseção "Camada 3: pendente" vira "**Camada 3: a sequência da API real**" — como foi gravada (script próprio, segunda chamada, linhas cruas, sem conteúdo), o que ela compara (`comparavel`, o `ping` retirado e a guarda de que o SDK ainda o descarta), o que ela **não** prova (que a API não mude amanhã: a referência é uma fotografia de `<data>` com `anthropic==<versão>` e `<modelo>`), e como regravar (o comando da tabela de "Comandos" do HANDOFF, só pelo dono). Acrescente uma subseção "**O falso como processo (E2E)**": `falso_do_e2e.py`, o controle `/_control/*`, e por que isso não é um "modo falso" (continua em `tests/`, e a API do E2E é a de produção apontada por variável).
- Em §6 (limitações), um parágrafo: o `gitleaks dir .` varre arquivos ignorados pelo git (medido, E1), e é por isso que a chave real não mora no `.env`; o `.gitleaks.toml` **não** mudou.

- [ ] **Step 3: `docs/ARCHITECTURE.md`**

- **§1, árvore:** regere com `git ls-files` (não à mão) e anote: `frontend/src/features/tutoring/` com cada arquivo e uma linha do que faz; `frontend/src/shared/lib/deadline.ts`; `frontend/src/test/` com os quatro arquivos; `frontend/tests/e2e/` com `falso.ts` e `tutoring.spec.ts`; em `tests/integration/`, **todos** os arquivos — inclusive `test_install_gitleaks.py` e `test_push_env.py`, que faltavam (**pendência 48**) — e os novos (`falso_do_e2e.py`, `camada3.py`, `referencia_da_api_real.json`, `test_falso_do_e2e.py`, `test_camada3.py`, ). O parágrafo de abertura de §1 passa a dizer "ao fim do Incremento 1b-2 (`feat/incremento-1b-2`, ainda não publicado)".
- **"O que a árvore acima não tem":** a feature `tutoring` sai da lista de ausentes; `shared/lib/` também; `shared/ui/`, `shared/hooks/`, `shared/types/` e a feature `rewards` continuam.
- **§3, Frontend:** `features/<feature>/` passa a "existe para `missions` e `tutoring`"; um parágrafo sobre a `tutoring` — os hooks no topo do painel e por quê, a união do envio, o reenvio idempotente, os dois contêineres, a região viva fora deles, o cartão e as chaves por ação, a recarga do quadro pela página por `ref`. `shared/api/` ganha o `postStream`. `shared/lib/` nasce com o `formatDeadline`.
- **§4, tabela do frontend:** "Componente específico de uma feature" e "Hook que só faz sentido dentro de uma feature" passam a citar `tutoring` também; "Função pura usada por mais de uma feature" → `frontend/src/shared/lib/`, estado **existe** (`deadline.ts`).
- Confira o §5 regra 1 contra o código: `grep -rn "features/missions" frontend/src/features/tutoring/` e `grep -rn "features/tutoring" frontend/src/features/missions/` devem sair **vazios**; registre os dois comandos e a saída no HANDOFF ("Resultados").

- [ ] **Step 4: Gate duas vezes e commit**

```bash
make check     # 1a vez
make check     # 2a vez, em seguida
git add docs/HANDOFF.md docs/QUALITY.md docs/ARCHITECTURE.md docs/superpowers/specs/2026-09-18-incremento-1b-design.md
git commit -m "docs(tutoria): handoff, qualidade e arquitetura do incremento 1b-2

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Registre as **duas** execuções em "Resultados" (EXIT, testes e cobertura do frontend com as contagens dos quatro eixos, testes e cobertura do backend, cenários do E2E, Gitleaks), no padrão das linhas existentes — o que o resumo imprimiu, não o que se esperava. Se a segunda execução divergir da primeira, investigue antes de registrar (é sinal de teste intermitente).

**Critério de pronto:** os três documentos conferidos contra o código (árvore por `git ls-files`, commits por `git log`, números pelos resumos); pendências riscadas e atualizadas; `make check` EXIT 0 duas vezes seguidas; commit local. **Fim do plano: nada de push, PR ou merge sem autorização do dono.**

**Registrar no HANDOFF:** é a própria tarefa.

---

## Autorrevisão do plano contra a spec

| Requisito da spec (seção) | Onde |
|---|---|
| Painel à direita, expansível, estado no `localStorage` (A tela) | Task 4 (P20, `panelPreference`) |
| Celular: botão fixo, folha, campo acima do teclado, sem esconder o Enviar, sem rolagem horizontal (A tela; README §7) | Task 4 (P22–P25), Task 7 (e); teclado virtual **não medido** (pendência nova) |
| Retrato placeholder, iniciais, verde, nenhum asset (A tela) | Task 4 (P26) |
| `features/tutoring/` não importa nada fora de `shared/`; recarga pela página (A tela) | Tasks 2–5; conferência por `grep` na Task 9 |
| Os nove estados da tabela (Estados) | Task 4 (P2–P17), Task 5 (C1–C10) |
| Texto digitado nunca se perde; limpo só no `user_message`; `503`/`409` deixam o texto (Estados) | Task 3 (S1–S3, S10–S14), Task 4 (P7, P12, P15, P16) |
| Confirmar como o Concluir do A (Reuso) | Task 5 (D1–D5, D9) |
| Mapa exaustivo com `Object.hasOwn` (Reuso) | Task 2 |
| `postJson` para confirmar/recusar; `postStream` com `fetch` e `ReadableStream` (Reuso) | Tasks 1 e 5 |
| Vitest: cada estado e o `postStream`, stream cortado sem `done`, `503`/`409` antes do stream com texto preservado (Testes → Frontend) | Tasks 1, 3, 4 |
| E2E: perguntar/confirmar/quadro, recusar, cortada + "Tentar de novo" sem duplicar, indisponível (E2E) | Task 7 (a)–(d) |
| axe em escrevendo, proposta e indisponível (E2E) | Task 7 (a), (d) |
| Porta própria do falso, somada às pendências 19 e 20 (E2E) | Task 6; HANDOFF 19/20/43 |
| Chamada real pelo dono, roteiro no HANDOFF, grava a camada 3; CI nunca chama a Anthropic (A chamada real) | Task 8 |
| Camada 3: sequência de tipos sem conteúdo, teste que confere o falso (O servidor falso) | Task 8 |
| Estado de publicação no formato que não envelhece (Entregas de documentação) | Task 0, Task 9 |
| Cobertura 100%, toda guarda vista reprovando por mutação (Testes) | cada task, passo "Mutações" |

Gaps conscientes, registrados como pendência e não escondidos: o teclado virtual do celular (não mensurável no Playwright); o indisponível do E2E por `page.route` (o caminho sem chave é do pytest); a pendência 45 (exige backend).
