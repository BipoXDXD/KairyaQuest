# Pendência 104: matriz de conflitos cruzados e ordem global das travas — 2026-11-10

Objetivo: provar, em conexões reais, a ordem global **ação → missão →
avaliação → usuário** e os conflitos cruzados da escrita da avaliação, só
com teste novo, sem mudar produção. Revisão-base: `2c09706`.

Decisões:

- **Recorte: a escrita da avaliação (transação 2 de `avaliar_missao`) contra
  os dois fluxos de produção que disputam as mesmas linhas, nas duas ordens.**
  É a única transação que passa por missão, avaliação e usuário; a
  confirmação da Kairya cobre "ação → missão" e a conclusão cobre "missão →
  usuário".
- **Como a ordem é observada.** O PostgreSQL diz quem bloqueia quem
  (`pg_blocking_pids`) e em qual tabela está a espera (`pg_locks`,
  `locktype = 'tuple'`). Só então uma sonda `NOWAIT` (KEY SHARE para missão e
  ação, SHARE para avaliação e usuário) confere o que quem espera **já**
  segura e o que ainda não tocou. Sem `sleep` cego: o provedor falso segura a
  resposta e a sessão da transação 2 pode segurar o próprio `commit`, por
  eventos.
- **A ordem "ação antes da missão" é observada em `confirmar_acao`.** O
  cenário 3 abaixo mostra a confirmação esperando a missão já segurando a
  ação. Isso contradiz a frase da F14 em `docs/ARCHITECTURE.md`, que a dá
  como não observável por teste; o ARCHITECTURE.md não foi editado (está em
  PRs abertos), e a correção ficou como pendência 209.
- Helpers de espera e sonda são locais ao módulo: os equivalentes existentes
  são privados de `test_evaluation_concorrencia.py` e
  `test_tutoring_conclusao_concorrencia.py`, que outros PRs abertos tocam.
  Reaproveitadas as fixtures `banco_migrado` e `fabrica` do `conftest.py`.

Matriz provada (`tests/integration/test_ordem_global_das_travas.py`):

| Teste | Quem segura | Quem espera, e onde | O que a sonda prova |
|---|---|---|---|
| `test_avaliacao_espera_o_usuario_ja_segurando_missao_e_avaliacao` | conclusão de outra missão do mesmo usuário (outra missão + usuário) | escrita da avaliação, em `users` | missão e avaliação já travadas |
| `test_avaliacao_espera_a_missao_sem_tocar_avaliacao_nem_usuario` | confirmação da Kairya, reagendar a missão avaliada (ação + missão) | escrita da avaliação, em `missions` | avaliação e usuário livres |
| `test_confirmacao_espera_a_missao_ja_segurando_a_acao` | escrita da avaliação retida no `commit` (missão, avaliação, usuário) | confirmação da Kairya, em `missions` | ação já travada |
| `test_conclusao_espera_o_usuario_ja_segurando_a_propria_missao` | escrita da avaliação retida no `commit` | conclusão de outra missão, em `users` | a própria missão já travada |

Depois de liberar o dono, o que cada teste afirma:

- **Todos os quatro:** as duas transações terminam (o resultado de cada uma é
  lido, sem `DeadlockDetected` nem outra exceção) e a avaliação fica
  `concluida`, tentativa 1, veredito `atende`, com o modelo e o feedback do
  provedor e bônus de 20.
- **Testes 2 e 3:** a ação fica `falhou`/`reagendamento_invalido`, sem
  `mission_id`, e o prazo da missão avaliada não muda. O teste 3 confere
  também que a confirmação devolveu `ReagendamentoInvalido`.
- **Testes 1, 2 e 4:** a ordem dos créditos das duas missões no livro-razão
  (`xp_entries.id`) é a da serialização observada: teste 1, conclusão da
  avaliada, conclusão da outra, bônus; teste 2, conclusão e bônus da
  avaliada; teste 4, conclusão da avaliada, bônus, conclusão da outra. O
  teste 3 não confere créditos.

**Correção depois da revisão independente (corrida nos testes 3 e 4).** A
primeira versão ligava `devolver_resposta` logo depois de submeter a
avaliação, e a sessão observada marcava como transação 2 a primeira sessão
aberta depois disso; se a transação 1 abrisse mais tarde, ela era tomada pela
2. Duas mudanças: os testes 3 e 4 esperam `entrou_modelo` antes de liberar a
resposta, como os testes 1 e 2; e a transação 2 passou a ser a primeira
sessão aberta depois de o provedor **devolver** a resposta
(`modelo_respondeu`, marcado na própria thread da avaliação), o que não
depende de escalonamento. As outras passagens foram revistas: as sondas e a
liberação do dono só acontecem depois de uma condição observada no banco ou
num evento da thread.

O que ficou de fora (não inventei teste para fechar):

- Transação 1 (`abrir_tentativa`) e `registrar_falha` contra outros fluxos;
  já há provas de 409, retomada e relógio em `test_evaluation_concorrencia.py`.
- `iniciar_missao` e `reagendar_missao` pela tela × escrita da avaliação:
  travam só a missão, como a confirmação, sem a ação na frente.
- Confirmação de **criação** da Kairya (ação → `INSERT` de missão, que toma
  KEY SHARE no usuário) × bônus.
- `preparar_turno` da tutoria (FOR UPDATE no usuário, sem missão) × bônus e
  × conclusão.
- Duas escritas de avaliação de missões diferentes do mesmo usuário (as duas
  missão → usuário; disputa só o usuário).
- HTTP: a matriz roda nos serviços, não pelas rotas.

Sabotagens (temporárias, revertidas com `git checkout -- src`; depois de cada
uma, `git diff --exit-code -- src` saiu com 0):

| Sabotagem | Reprovou |
|---|---|
| S1: transação 2 da avaliação trava o usuário antes da missão (`evaluation/service.py`) | testes 1 (`DID NOT RAISE` na sonda da missão) e 2 (`LockNotAvailable` em `users` na sonda que devia aceitar) |
| S2: `_buscar_acao` sem `with_for_update` (`tutoring/service.py`) | teste 3 (`DID NOT RAISE` na sonda da ação) |
| S3: `concluir_missao` trava o usuário antes da missão (`missions/service.py`) | teste 4 (`DID NOT RAISE` na sonda da própria missão) |
| S4: `_corrente` sem `with_for_update` na missão (`evaluation_records.py`) | testes 1 (`DID NOT RAISE`, linha 458, sonda da missão), 2 e 3 (`DID NOT RAISE`, linha 541, sonda da missão) |

S1, S2 e S3 foram refeitas depois da correção da corrida, com as mesmas
reprovações da tabela.

S4 refeita depois da correção, com a saída lida no teste 2: ele **não** para
em `_esperar_bloqueio`. A transação 2 passa pela espera em `missions`
(linha 497, aprovada) e reprova na linha 502, `_aceita` da avaliação, com
`LockNotAvailable: could not obtain lock on row in relation
"mission_evaluations"` na consulta `... FOR SHARE NOWAIT`. Leitura: sem o
FOR UPDATE da missão, a transação 2 grava a avaliação e trava o usuário sem
esperar ninguém, e só para no `INSERT` do bônus em `xp_entries`, cuja FK para
`missions` toma FOR KEY SHARE na missão, que a confirmação segura com FOR
UPDATE. Por isso ela ainda espera em `missions`, mas já segurando a
avaliação, e o teste reprova pela ordem errada, não por "thread terminou
antes". Depois da reversão, `git diff --exit-code -- src` saiu com 0.

Comandos e resultados lidos (com `UV_PYTHON=3.14.10`):

- Os plugins de estresse do revisor (`troca_rapida.py`, que faz
  `sys.setswitchinterval(1e-6)`, e `atraso_tx1.py`, que atrasa 50 ms a
  entrada de `avaliar_missao`) ficam fora do repositório e foram carregados
  com `PYTHONPATH=<scratchpad> uv run pytest ... -p <plugin>`.
- Na versão **anterior** à correção: `-p atraso_tx1`, testes 3 e 4
  reprovados; `-p troca_rapida`, 3 execuções, testes 3 e 4 reprovados nas 3.
- Na versão corrigida, 10 execuções de cada: `-p atraso_tx1` 10/10 verdes;
  `-p troca_rapida` 10/10; `-p troca_rapida -p atraso_tx1` 10/10. Sem
  plugin, 5/5 verdes. São as execuções feitas; não afirmam estabilidade
  além delas.
- Com os vizinhos `test_evaluation_concorrencia.py` e
  `test_tutoring_conclusao_concorrencia.py`: 14 aprovados. Rodado de novo depois da
  correção: 14 aprovados.
- `ruff check`, `ruff format --check` e `mypy` no arquivo novo: sem erros.
- `make check` e a suíte inteira **não executados** neste incremento.

Defeitos de produção encontrados: nenhum.

Alterações: novo `tests/integration/test_ordem_global_das_travas.py`; este
HANDOFF (seção, linha 104 e pendência nova 209).

# Engine única sob chamadas simultâneas — 2026-11-10

Pendência 14, parte da corrida. Revisão-base: `2c09706`. `get_engine()` em
`src/focusquest/core/database.py` ganhou um `threading.Lock` de módulo com
dupla checagem: lê `_engine` sem trava (caminho comum, engine já criada) e,
se for `None`, trava, confere de novo e só então cria. O FastAPI roda
dependências síncronas no threadpool; sem a trava, duas requisições na
partida podiam criar duas engines, com dois pools, e a perdedora ficava
órfã. A engine continua preguiçosa e global; `/health`, `/ready` e
`get_engine_se_configurada` não mudaram. Nenhuma dependência, contrato ou
configuração mudou.

Testes novos em `tests/unit/test_engine_unica.py`, sem banco (a criação é
substituída por uma falsa) e sem `sleep`:

- 4 threads chamam `get_engine()`; a primeira criação espera num
  `threading.Event` (`wait(timeout=1.0)`) a segunda começar. Sem a trava, a
  segunda entra e a acorda: mais de uma criação (de 2 a 4, conforme o
  tempo das threads). Com a trava, a segunda fica no
  lock, a espera expira e há uma criação só; todas as threads recebem o
  mesmo objeto, e uma chamada posterior devolve o mesmo sem criar outra. O
  custo do caminho verde é a espera de 1 s. As threads são `daemon` e o
  `join` tem teto de 10 s: um deadlock vira falha sem segurar o processo.
  Limite conhecido: o ramo interno `if _engine is None` falso só é coberto
  se ao menos uma das threads 2–4 passar pela checagem externa durante a
  espera de 1 s; numa máquina muito carregada isso pode não ocorrer e o
  `fail_under = 100` acusaria o ramo.
- Configuração ausente levanta `ValidationError`, `_engine` continua `None`
  e a segunda chamada (numa thread com teto) levanta de novo, sem deadlock.

Vermelho antes da correção (observado nesta execução): `assert 2 == 1` em `len(criadas)`
(`test_chamadas_simultaneas_criam_uma_unica_engine`); o teste de
configuração ausente já passava (guarda de regressão). Depois: `2 passed`,
repetido 3 vezes. Sabotagem temporária, revertida: com a trava removida
(volta à checagem única), o mesmo `assert 2 == 1`, `FAILED
test_chamadas_simultaneas_criam_uma_unica_engine`. Cobertura de ramos de
`get_engine` pelos testes novos: os quatro ramos cobertos (fora de cobertura
no arquivo só as linhas de outras funções, exercitadas pelo resto da
suíte).

Validação: `ruff check`, `ruff format --check` e `mypy --strict` nos dois
arquivos sem erros; `tests/unit/test_clock.py` e `tests/unit/test_config.py`
passando. `make check` não executado nesta entrega.

Fora do escopo, resíduo da pendência 14: `dispose()` da engine no shutdown.
Exige um lifespan em `src/focusquest/main.py`, que está em quatro PRs abertos
de outras frentes, e mover a criação para o lifespan mudaria o `/health` sem
configuração.

# Fase 4, Tarefa 4.5: Field, NavTabs, LanguageSwitcher e SoundToggle — 2026-11-10

Objetivo: os componentes de entrada e navegação em `frontend/src/shared/ui/`.
Base: commit da 4.4 (`f6ff00b`), com a 4.3, a arte da F7 e a F3 PR1.

Decisões:

- `LanguageSwitcher` é o `LocaleSwitcher` da F3 movido por `git mv` para
  `shared/ui/`, com os casos de teste da F3 mantidos. Botões `Button
  tertiary`, texto visível de `ui.language.short.*` e nome acessível de
  `shell.locale.{ptBR,en}`, que o catálogo da F3 já guarda como `PT,
  Português (Brasil)`/`EN, English`: concatenar a sigla de novo daria `PT,
  PT, …`. O teste confere que o nome começa pelo texto visível (WCAG 2.5.3).
  O ativo leva marcador `aria-hidden` e sublinhado grosso além do
  `aria-pressed` (o `hover:underline` do terciário não imita o marcador). A
  falha do `setLocale` aparece numa `StatusLine` danger montada desde o
  início e `sr-only` enquanto vazia; o idioma anterior continua marcado. Só a
  tentativa mais recente (contador em `useRef`) pode mostrar a falha.
- `Field` por render prop (`FieldControlProps`), ajuda e erro em
  `aria-describedby` nessa ordem, erro com ícone e `aria-invalid`; `help`/
  `error` vazios contam como ausentes. Controle `border-border-strong` sobre
  `bg-bg-canvas`, válido em qualquer elevação.
- `NavTabs` sem landmark próprio (o `<nav>` é do `SideNav`), com
  `aria-current`, barra, peso 700 e marcador SVG `aria-hidden` no ativo, e
  `transition-colors` sem `motion-safe:`. O `SideNav` ainda não o usa: a
  troca é da migração das 4.6–4.9.
- `SoundToggle` controlado sobre o `IconButton`, ícone que muda de forma com
  o estado; não é montado no app até a Fase 8.
- Catálogo: `ui.language.short.{ptBR,en}` e `ui.sound.{voice,sfx}`. Galeria:
  11 casos novos; `language-switcher-save-failed` usa um `I18nContext` com
  `setLocale` que rejeita, porque o `I18nProvider` desta base não fala com
  `/api/me`, e o `ui-states.spec.ts` clica em EN e espera a falha antes do
  axe.

Pendências:

- `npx playwright test --project ui-states` (11 casos novos, incluindo o
  `SETUP` novo) e `make check` não rodaram nesta tarefa: ficam com o gate do
  controlador.
- Quando o `I18nProvider` passar a gravar em `/api/me`, o caso da galeria
  pode trocar o contexto falso por um `page.route` com 503.

# Fase 4, Tarefa 4.4: componentes de superfície e retorno + mapa de arte — 2026-11-10

Objetivo: `Panel`, `Badge`, `ProgressBar`, `StatusLine`, `Skeleton`,
`SpeechBubble` e `EmptyState` em `frontend/src/shared/ui/`, mais o mapa
`ART` (`shared/ui/art.ts`) da arte da Fase 7. Base: merge local da 4.3
(`wt/f4-componentes`, `5189789`) com `wt/f7-arte`; os 13 arquivos de
`public/art/{kairya,scenes,empty,trial}` conferidos antes de começar.

Decisões:

- `assets.test.ts` lê o disco por `readSource.ts` (`sourceExists` e o novo
  `sourceSize`), e não por `new URL(..., import.meta.url)`, que o Vite
  reescreve como URL http no Vitest 5.0.1. Reprova caminho de `ART` sem
  arquivo, `url('/...')` de CSS sem arquivo e arte acima de 200 KB.
- `ProgressBar` e `Skeleton` tratam entrada impossível como erro de
  programação (`RangeError`): `max` não positivo ou não finito, `value`
  NaN, `lines` não inteiro ou menor que 1. `value` fora da faixa é limitado
  a `[0, max]`. A largura do preenchimento vai no `style`, em %.
- `SpeechBubble` liga a `figcaption` por `aria-labelledby`: o jsdom não dá à
  `figure` o nome da legenda, e o atributo explícito vale em todo motor.
  Só `celebrating` ganha `shadow-glow-lantern`; `concerned` usa a borda
  `feedback-danger`.
- `Badge` sem fundo próprio (texto e borda `border-current` no tom, pares já
  medidos em `contrastPairs.ts`); `StatusLine` com um ícone SVG por tom, para
  a cor não ser o único sinal.
- `Panel`: props em união discriminada; `aria-labelledby` só com `as`
  `section`/`aside`/`article` (ARIA 1.2 proíbe nomear `div` generic), e o
  `div` não o repassa nem com o tipo contornado. `Skeleton` trata
  `label=""` como ausente.
- `EmptyState`: arte `alt=""` de 160 px com `width`/`height` e
  `object-cover`; se falhar ao carregar, some e o texto fica (guarda o `src`
  que falhou, então trocar a arte tenta de novo). Sem `body` ou
  `action`, nada é renderizado no lugar.
- Catálogo: só a chave nova `ui.loading` (`Carregando…` / `Loading…`). Pesos
  só 400 e 700 (M8). Galeria: 22 casos novos em `src/test/gallery/`,
  reaproveitando chaves existentes.

Pendências:

- O `npx playwright test --project ui-states` (axe e 44px nos 22 casos novos)
  não foi rodado nesta tarefa: fica com o gate do controlador.
- A fitness function de texto literal em JSX (`no-literal-jsx.test.ts`) não
  existe nesta base; o `alt=""` do `EmptyState` não tem letra e deve passar
  no seletor descrito no plano quando ela entrar.
- Nenhuma tela consome os componentes ainda: a migração é das Tarefas
  4.6–4.9 (o `TutorConversation` mantém o próprio esqueleto até lá).
- O `valueText` da `ProgressBar` na galeria (`caseComponents.tsx`) é montado
  à mão (`40 / 200`); passa a vir do catálogo, com `Intl`, quando a 4.6 criar
  as chaves de XP.
- A `StatusLine` fica montada e só o `children` muda (JSDoc): a migração das
  4.6–4.9 não pode montá-la condicionalmente, ou o retorno fica mudo.

# Fase 4, Tarefa 4.3: Button, IconButton, ConfirmDialog e lint de design — 2026-11-10

Objetivo: os componentes de ação do design system em `frontend/src/shared/ui/`
(sem barrel, que nasce na 4.6), um lint de design que barra classe fora dos
tokens e uma galeria de estados medida pelo axe. Base: merge local da 4.2
(`wt/f4-tipografia`) com a F3 PR1 (`wt/f3-i18n-catalogo`, `409031e`), porque
a tarefa consome `useT` e o catálogo.

Decisões:

- **M8: peso 500 só em título.** A Alegreya Sans só tem 400 e 700 (4.2); um
  `font-medium` no corpo cairia para 400 em silêncio. O 500 vive só na regra
  de `h1`–`h4` do `base.css` (Alegreya). O lint de design reprova
  `font-thin/extralight/light/medium/semibold/extrabold/black` e
  `font-weight` 100/200/300/600/800/900. Botões usam 700 (`font-bold`).
- Pirâmide de botões: `primary` sólido, `secondary` contorno (padrão),
  `tertiary` link, `danger-confirm` sólido só dentro do `ConfirmDialog`.
  Sem `className` público; alvo de 44px (`min-h-11 min-w-11`, `size-11` no
  `IconButton`). `loading` não usa `disabled` (o foco não se perde): põe
  `aria-busy` e `aria-disabled` e engole o clique com `preventDefault`, o que
  barra também o submit nativo. A lógica comum fica em `shared/ui/busy.ts`
  (`busyProps`); as classes base de todo botão, em `shared/ui/buttonBase.ts`.
- O `secondary` tem `hover:border-text-primary` além do `hover:bg-bg-raised`:
  dentro do `ConfirmDialog`, cujo fundo já é `bg-bg-raised`, o hover só de
  fundo não mudava nada.
- **Botão ocupado com `opacity-60`.** O rótulo de um botão em `loading`
  (focável, `aria-disabled`) pode ficar abaixo de 4,5:1. Aceito pelo WCAG
  1.4.3, que isenta componente inativo: o botão ocupado não aceita ação.
- `ConfirmDialog` em `<dialog>` nativo com `showModal`; fechado, nada é
  montado, então cada abertura nasce limpa e guarda quem tinha o foco para
  devolvê-lo ao fechar. Foco inicial em Cancelar. Esc (`cancel`) é
  cancelado e vira `onCancel`: quem fecha é o pai, pela prop `open`. Se o
  navegador fechar mesmo assim (o Chrome manda um `cancel` não cancelável
  no Esc sem ativação do usuário, visto na galeria), quem avisa é o `close`,
  salvo quando o diálogo já foi reaberto (o efeito do StrictMode fecha e
  reabre); o `cancel` não cancelável não avisa, e `onCancel` sai uma vez por
  gesto. Guarda de "em voo" numa ref além do estado: cliques no mesmo lote
  de render chamam o `onConfirm` uma vez. Um `onConfirm` que rejeita só tira
  o "confirmando": contar a falha é do dono do `onConfirm` (escrito no JSDoc
  da prop). Cancelar segue disponível durante o "confirmando"; o pai decide
  se fecha com a ação em voo.
- Lint de design (`designLint.test.ts`) lê `src/**/*.{ts,tsx,css}` do disco,
  sem os testes. Os `.ts` entram porque classe também mora neles (a base dos
  botões); uma sentinela confere que o `buttonBase.ts` é lido. A catraca
  `PENDING_MIGRATION` só encolhe e é testada nos dois sentidos (arquivo sujo
  fora dela e arquivo limpo ou inexistente dentro dela reprovam); as
  4.6–4.9 tiram arquivos dela e a 4.9 a apaga. Nasceu com 20 `.tsx`
  anteriores à fase (`App.tsx`, `app/`, `pages/`, `features/*` e o
  `LocaleSwitcher` da F3). O `src/index.css` **não** entrou: as regras miram
  utilitários de classe e as declarações dele são CSS puro (ver pendências);
  quem prova que a varredura lê CSS é a sentinela `a varredura enxerga o CSS
  de verdade`. O comentário do `base.css` citava `font-semibold` como
  exemplo e foi trocado por `font-bold`, para o arquivo não entrar na lista
  por um comentário.
- Galeria (`ui-gallery.html` + `src/test/gallery/`): um caso por página,
  fora do build de produção, servida pelo `vite` de desenvolvimento ao
  projeto `ui-states` do Playwright, com `VITE_API_URL=/api` como o
  frontend do E2E. O texto vem de chaves que já existem no catálogo, sem
  chave só de teste. O estado "confirmando" vem do clique que o spec faz
  (N3), sem prop nova no `ConfirmDialog`. A porta da galeria (5373 +
  deslocamento) mora em `tests/e2e/servers.ts`, fora da faixa do frontend do
  E2E (5273–5322) com qualquer deslocamento válido. O servidor da galeria
  sobe em todo `npx playwright test`, mesmo filtrado por projeto.
- O `<h1>` só para leitor de tela da galeria fica fora do `<dialog>` modal,
  sem prop de nível de título no `ConfirmDialog`: o axe-core 4.13 medido na
  galeria não acusa nada (ver comandos).
- `src/test/dialog.ts`: o jsdom 30 não tem `showModal` nem `close`; o
  preenchimento só define o que falta, e o `close` dele é síncrono (no
  navegador o evento chega numa tarefa depois).

Alterações:

- Novos: `frontend/src/shared/ui/{Button,IconButton,ConfirmDialog}.tsx`,
  `busy.ts`, `buttonBase.ts`, os testes de cada um e `designLint.test.ts`;
  `frontend/src/test/dialog.ts`; `frontend/src/test/gallery/{caseIds.ts,cases.tsx,caseComponents.tsx,main.tsx}`;
  `frontend/ui-gallery.html`; `frontend/tests/e2e/ui-states.spec.ts`.
- `frontend/src/test/setup.ts` (importa `dialog.ts`),
  `frontend/src/shared/i18n/messages/{pt-BR,en}.ts` (`ui.dialog.cancel`),
  `frontend/src/styles/base.css` (comentário),
  `frontend/tests/e2e/servers.ts` (`GALERIA_URL`),
  `frontend/playwright.config.ts` (quarto `webServer` e projeto
  `ui-states`; o `chromium` ignora o spec da galeria),
  `frontend/tests/unit/servers.test.ts`, `docs/QUALITY.md` §3 e §4 (dois
  projetos, quatro servidores, faixa da galeria),
  `docs/ARCHITECTURE.md` (quatro portas), `scripts/novo-worktree.sh`
  (mensagem final com a porta da galeria).

Comandos e resultados:

- Testes dos três componentes antes da implementação: falharam (módulo
  ausente); depois, 96 passaram junto com `src/shared/i18n`.
- `designLint.test.ts` com a lista vazia: 6 regras reprovaram com 21
  arquivos; com o comentário do `base.css` corrigido e os 20 `.tsx` na
  lista, 20 passaram. Sabotagem: trocar um arquivo sujo da lista por um
  limpo reprova as duas direções da catraca; voltar o glob para
  `{tsx,css}` reprova a sentinela do `buttonBase.ts`.
- Sabotagem da guarda de "em voo" (`if (inFlight.current && false)`):
  o teste dos cliques repetidos reprova. Sabotagem da guarda do `cancel`
  não cancelável: o teste do Esc seguido de `close` reprova (`onCancel`
  duas vezes).
- `make check-web` (exit 0): lint, Prettier e `tsc` limpos; 63 arquivos,
  1168 testes passaram; cobertura 100% (1428/1428 statements, 1032/1032
  branches, 404/404 functions, 1385/1385 lines).
- Galeria conferida à mão no `vite` de desenvolvimento, com o axe-core 4.13
  injetado no Chromium do painel do Claude: zero violações nos 18 casos,
  inclusive `confirm-dialog-confirming` depois do clique; todo botão com
  44px de altura; o diálogo abre modal com foco em Cancelar e o clique em
  confirmar deixa `aria-busy` e `aria-disabled`. `page-has-heading-one`
  sai "passes" no `confirm-dialog-open` e "inapplicable" no
  `confirm-dialog-confirming`, nunca violação. Não é a execução do spec.
- `tests/e2e/ui-states.spec.ts`: escrito e **não executado** (os
  `webServer` incluem a API, que precisa do PostgreSQL; Playwright fica com
  o gate do controlador).

Pendências:

- Rodar o projeto `ui-states` do Playwright no gate. O resultado de
  `page-has-heading-one` nos casos do diálogo é inconsistente entre
  "passes" e "inapplicable"; se uma versão futura do axe passar a acusar,
  a saída é desligar só `page-has-heading-one`, com `disableRules`, nos
  casos `confirm-dialog-*` do spec `ui-states` (o `ConfirmDialog` fixa o
  título em `h2`), com o motivo escrito no próprio spec; nunca na suíte toda.
- **O lint de design não cobre valores crus de CSS.** As regras miram
  utilitários de classe; o `src/index.css` tem hex crus, `border-radius` de
  50%/14px/4px, `box-shadow` e `text-shadow` decorativos e `font-size:
  10px`, abaixo da escala. Ele não está na `PENDING_MIGRATION` porque não
  viola regra nenhuma, então apagar a lista na 4.9 **não** quer dizer CSS
  limpo: o `index.css` precisa de migração própria (ou de regras novas no
  lint para hex, `px` e sombras).

# Fase 4, Tarefa 4.2: tipografia Alegreya local — 2026-11-10

Objetivo: trocar o Georgia provisório pela tipografia da spec (Alegreya nos
títulos, Alegreya Sans no texto), servida localmente, com a escala de texto
da spec. Base: `5e3253e` (Tarefa 4.1).

Decisões:

- **As fontes são assets, não dependências.** Seis woff2 e duas licenças SIL
  OFL 1.1 em `frontend/public/fonts/`, sem pacote npm. Procedência, bytes e
  SHA-256 em `docs/ART.md`, seção "Fontes".
- **Sem CDN.** Servir da Google Fonts mandaria o IP e o User-Agent de cada
  visitante a um terceiro (privacidade), acrescentaria uma origem externa ao
  carregamento e deixaria o app sem fonte offline. Local, tudo sai da mesma
  origem do app.
- Só os subsets `latin` e `latin-ext`, com o `unicode-range` da Google Fonts:
  o `latin-ext` só baixa quando a página usa um caractere dele. A Alegreya é
  variável (um arquivo por subset declara `font-weight: 500 700`); a
  Alegreya Sans é estática, um arquivo por peso.
- `font-display: swap` em toda `@font-face` e preload só dos dois arquivos
  principais (`alegreya-sans-400-latin`, `alegreya-latin`), com
  `crossorigin`, que o preload de fonte exige para reaproveitar o download.
- No `@theme`, `--font-*: initial` e `--text-*: initial` antes de declarar:
  só existem `font-display`, `font-body` e `text-xs` a `text-4xl`
  (12/14/16/18/22/28/36/48 px), mais `leading-body` 1,6 e `leading-heading`
  1,15. O reset de `--font-*` não apaga o namespace `--font-weight-*`
  (conferido no build).
- `base.css` fica em `@layer base`: fora de layer, o `font-weight: 500` dos
  títulos venceria utilities como `font-semibold` num `h2`.
- As regras `.rpg-*` legadas trocam o Georgia por `var(--font-display)`;
  `.rpg-nav-caption` e `.rpg-eyebrow` perdem a caixa alta e o
  `letter-spacing: 0.18em` e passam de 600 para 700.
- `layoutData` saiu de `layout.spec.ts` para `tests/e2e/layoutData.ts`, para
  o `fonts.spec.ts` reaproveitar as mesmas respostas GET (o Playwright não
  aceita uma spec importando outra).

Alterações:

- Novos: `frontend/public/fonts/*`, `frontend/src/styles/fonts.css`,
  `frontend/src/styles/base.css`, `frontend/src/shared/ui/fonts.test.ts`,
  `frontend/tests/e2e/fonts.spec.ts`, `frontend/tests/e2e/layoutData.ts`.
- `frontend/src/styles/tokens.css` (famílias, escala, leading),
  `frontend/src/index.css` (imports e regras `.rpg-*`), `frontend/index.html`
  (preload), `frontend/src/test/readSource.ts` (`sourceExists`, para checar
  a existência de binários sem lê-los como texto),
  `frontend/tests/e2e/layout.spec.ts` (importa o `layoutData`),
  `docs/ART.md` (seção "Fontes").

Comandos e resultados:

- `npx vitest run src/shared/ui/fonts.test.ts` antes do `fonts.css`: falhou
  (`ENOENT` em `src/styles/fonts.css`); com `fonts.css` e tokens, 8 de 9
  (faltava o preload); depois do preload: 9 passaram.
- `npm run build`: `.font-bold{...font-weight:var(--font-weight-bold)}`
  presente e `--font-weight-bold:700` no CSS gerado; `dist/fonts/` com os
  seis woff2 e as licenças.
- `make check-web` (exit 0): lint, Prettier e `tsc` limpos; 54 arquivos,
  1044 testes passaram; cobertura 100% (1325/1325 statements, 989/989
  branches, 369/369 functions, 1286/1286 lines).
- `tests/e2e/fonts.spec.ts`: escrito e não executado (o E2E fica com o
  controlador).

Pendências:

- Componentes ainda usam `font-medium` (500) e `font-semibold` (600); a
  Alegreya Sans só tem 400 e 700, então o navegador casa 500 com 400 e 600
  com 700 enquanto isso. O lint de peso da Tarefa 4.3 os acusa e os põe na
  `PENDING_MIGRATION`; a troca acontece na migração das áreas (4.6–4.9).
  Peso 500 só em título (Alegreya).
- O `text-*` resetado perde a altura de linha padrão do Tailwind em cada
  tamanho; o texto herda `leading-body` (1,6) do `body`. Conferir no E2E de
  layout e no axe que nada ficou apertado.

# Fase 4, Tarefa 4.1: tokens em 3 níveis e teste de contraste — 2026-11-10

Objetivo: criar os tokens do design system "dojo-biblioteca ao anoitecer"
(primitivos, semânticos e de componente) e um teste que mede o contraste WCAG
de cada par de cor usado, sobre o CSS real. Base: `e57fa2b`.

Decisões:

- **O CSS é a fonte única dos tokens.** O TypeScript não repete nenhum hex:
  `contrast.ts` lê as declarações `--nome: valor;` do CSS e resolve `var()`
  sob demanda; `contrastPairs.ts` só nomeia os pares e o mínimo de cada um.
- **Tokens em `frontend/src/styles/tokens.css`, não em `index.css`.** Desvio
  da spec 4.1, que põe os tokens no `index.css`: o `index.css` passa a só
  importar (`tailwindcss`, `tokens.css`) e a carregar as regras `.rpg-*`
  legadas até a Tarefa 4.9, e os tokens ganham um arquivo que o teste lê
  sozinho.
- **Primitivos em `:root`, fora do `@theme`**, para não gerar utilities como
  `bg-ink-800` que pulem o nível semântico. Semânticos e de componente
  (`--radius-ui` 10px, `--radius-pill` 999px, `--shadow-glow-lantern`) no
  `@theme`, onde viram utilities (`bg-bg-canvas`, `rounded-ui`,
  `shadow-glow-lantern` etc.). `--glow-lantern-color`, o alias
  `--glow-lantern` e `--glow-lantern-filter` (forma do glow para SVG,
  `drop-shadow` sem spread) ficam em `:root`, sem utility.
- **Primitivo novo `ink-400` `#697b91` e `color-border-strong` = ink-400.**
  Origem: ruling 08:05 do controlador da Fase 4. A spec manda
  `border-strong` = ink-500 (`#5b6e84`), que mede 2,74:1 sobre `bg-raised` e
  reprova o 3:1 que a própria spec exige para componente de UI; o requisito
  de contraste vence o hex. O ink-400 mede 4,23 / 3,79 / 3,31 sobre
  canvas / surface / raised (margem ≥ 0,2 sobre 3:1) e 2,10:1 contra
  `text-muted`, distinto dele. Com isso o `Field` funciona sobre qualquer
  elevação, sem restrição de contexto.
- Um semântico de estado a mais, `color-action-primary-hover` = lantern-200
  (13,75:1 com `text-on-action`). Nenhum hover usa `color-mix`.
- `color-border-subtle` (ink-700) é decorativa e fica fora dos pares de 3:1
  (mede 1,61:1 no canvas); nunca é o único limite de um controle.
- Ciclo de `var()` é reportado como "ciclo em var()" no
  `findContrastFailures`, separado de "token ausente", para a mensagem
  apontar a causa certa.
- A razão na mensagem de falha é **truncada** em 2 casas, não arredondada:
  2,996 arredondado viraria "3.00 < 3", contradizendo a reprovação.
- `readSource` resolve a raiz por `fileURLToPath(import.meta.url)` +
  `node:path`, e não por `new URL('../../', import.meta.url)` como dizia o
  plano: o Vite reescreve essa forma literal como URL `http://localhost:3000/@fs/...`
  e o `fileURLToPath` a recusa (medido no Vitest 5.0.1 com jsdom).

Alterações:

- Novos: `frontend/src/styles/tokens.css`,
  `frontend/src/shared/ui/tokens/{contrast.ts,contrastPairs.ts,contrast.test.ts}`,
  `frontend/src/shared/ui/tokens.test.ts`, `frontend/src/test/readSource.ts`.
- `frontend/src/index.css`: importa `tokens.css`, remove o bloco
  `:root { --fq-* }` e troca cada `var(--fq-*)` pelo equivalente (`--fq-bg` →
  `--color-bg-canvas`, `--fq-surface` → `--color-bg-surface`, `--fq-text` →
  `--color-text-primary`, `--fq-muted` → `--color-text-muted`, `--fq-metal` →
  `--lantern-600`, `--fq-mako` → `--color-feedback-success`, `--fq-border` →
  `--color-border-strong`, `--fq-radius` → `--radius-ui`, `--fq-space` →
  `calc(var(--spacing) * 6)`, `--fq-font-display` → Georgia provisório até a
  4.2). Nenhum `--fq-*` tinha consumidor fora do `index.css`, então não ficou
  alias. Os hex soltos das regras `.rpg-*` ficam até a 4.9.
- `docs/QUALITY.md` §3: linha do `readSource.ts`.
- `docs/ARCHITECTURE.md`: `styles/` e `shared/ui/` passam a existir,
  `readSource.ts` entra na lista de `src/test/` e a linha "Token visual" da
  tabela passa a "existe".

Comandos e resultados:

- `npx vitest run src/shared/ui/tokens/contrast.test.ts` antes do
  `contrast.ts`: falhou (módulo inexistente); depois: passou (23 testes,
  contando o de truncamento, que falhou antes do ajuste com "3.00 < 3").
- `npx vitest run src/shared/ui/tokens.test.ts` antes do `tokens.css`:
  falhou (`ENOENT` em `src/styles/tokens.css`); depois: passou.
- Sabotagem manual: `color-border-strong` → ink-500 reprova 3 testes, com
  `color-border-strong/color-bg-raised = 2.74 < 3 (borda de controle)`;
  revertido.
- `vite build` numa pasta temporária: o CSS gerado tem `--ink-400:#697b91`,
  `--color-bg-canvas:var(--ink-950)`, `--radius-ui:10px`, o glow e o filtro,
  e nenhum `fq-`.
- `make check-web` (exit 0): lint, Prettier e `tsc` limpos; 53 arquivos,
  1035 testes passaram; cobertura 100% em statements (1325/1325), branches
  (989/989), functions (369/369) e lines (1286/1286).

Pendências:

- O gate completo (`make check`, com E2E de layout e axe) fica com o
  controlador. As cores das regras `.rpg-*` mudaram levemente com a troca
  (por exemplo, borda `#52606d` → `#697b91`, texto secundário `#b2beca` →
  `#a9b6c6`, fundo `#0b1421` → `#0d1520`); o contraste novo foi medido nos
  pares do teste, mas o axe sobre as telas reais ainda não rodou.
- `listSources` ainda não tem consumidor; a 4.3 (lint de design) é a
  primeira. Foi conferido à mão nesta tarefa.
# i18n: catálogo tipado e seletor de idioma — 2026-11-10

Primeiro PR da Fase 3 (Tarefas 1 e 2 do plano de i18n). Cria
`frontend/src/shared/i18n/`: catálogo próprio e tipado (`ptBR` define as chaves,
`en` faz `satisfies Messages`), `translate` com interpolação `{nome}` que lança
quando falta variável, `plural` sobre `Intl.PluralRules` com a forma opcional
`zero`, e a detecção do idioma (cache `kairyaquest.locale` válido, senão
`navigator.language`: `pt*` → `pt-BR`, o resto → `en`). O storage que lança
(modo privado, cota) é tolerado: o cache só evita o "pisca" do idioma.

O `I18nProvider` envolve o `<App/>` em `main.tsx`, guarda o idioma, espelha em
`<html lang>` e no cache. O seletor PT/EN fica no bloco da marca da `SideNav`,
dentro do landmark "Áreas" (`role="group"`, `aria-pressed`, `lang` e nome
completo por botão). Neste PR a troca é só local: `users.locale` e
`/api/me` entram nos PRs seguintes. Zero dependências novas.

Convenções do catálogo, válidas para os PRs seguintes: chaves planas
`<área>.<componente>.<papel>`; plural em chaves irmãs `.one`/`.other` (e
`.zero` quando o texto do zero difere); números e datas formatados por
`Intl.*` antes de entrar como variável. Testes de componente renderizam com
`renderWithI18n` (`src/test/i18n.ts`); o setup do Vitest fixa
`navigator.language` em `pt-BR` e limpa mocks e `localStorage` após cada teste.
As strings da interface ainda estão fixas em PT; a migração é por área.

O nome acessível de cada botão do seletor começa pelo texto visível ("PT,
Português (Brasil)", "EN, English", WCAG 2.5.3), e o alvo de toque é de 44×44 px.
O `vi.restoreAllMocks()` global do setup desfaz todo `vi.spyOn` após cada
teste: spy criado em `beforeAll` vale só para o primeiro teste do arquivo,
então spies nascem em `beforeEach` ou no próprio teste.

Pendências deste PR: a conferência visual do seletor na coluna de 224px do
desktop (e em 390px) fica para o gate E2E e para a F4 4.6; o texto EN de
`shell.locale.saveFailed` passa pela revisão de UX writing na Tarefa 5, quando
aparecer na tela.
# Arte da Kairya integrada (Fase 7) — 2026-11-10

Base `e57fa2b`. Os 13 WebP aprovados da Fase 7 (retrato, avatar, cinco
expressões, dois cenários, três estados vazios e a prova da semana) estão em
`frontend/public/art/{kairya,scenes,empty,trial}/`, todos abaixo de 200 KB.
A procedência por arquivo (prompt, modelo, id da tarefa Tripo, data e custo
real) e os retoques locais estão em [ART.md](ART.md).

O painel da Kairya usa `kairya/portrait.webp`, com texto alternativo
descritivo, e `kairya/avatar.webp`, que é decorativo. Os heroes do
Quartel-General e de Campanhas usam `scenes/hq.webp` e
`scenes/campaigns.webp`. Os placeholders `kairya-mentor.webp` e
`kairya-avatar.webp` e os dois cenários medievais saíram de `public/art`.
As expressões serão ligadas na Fase 6; os estados vazios e a prova da semana,
na Fase 5. Não entra dependência, endpoint nem serviço novo.

**Contraste dos heroes.** O axe não mede contraste sobre imagem de fundo, então
o pior caso foi calculado pela fórmula WCAG 2.x. O cenário é um pixel branco
(#ffffff) sob o gradiente de cor #07101b com alfa `a`, composto por canal como
`a·cor + (1 − a)·255`. As cores do texto são o eyebrow #ecd1a4, o título
`text-slate-50` (≈ #f8fafc) e o subtítulo #d3dce5. Os dois cenários têm
realces quase brancos em toda a largura, e o texto alcança a borda direita
no celular. Por isso todo stop entra na conta, não só o de 55%.

| Stop | Alfa | Fundo resultante | Eyebrow | Título | Subtítulo |
|---|---:|---|---:|---:|---:|
| antigo QG 55% `99` | 0,600 | (106, 112, 118) | 3,40 | 4,80 | 3,62 |
| antigo Campanhas 55% `80` | 0,502 | (131, 135, 141) | 2,45 | 3,46 | 2,61 |
| antigo QG 100% `33` | 0,200 | (205, 207, 209) | 1,06 | 1,49 | 1,12 |
| novo 0% `e6` | 0,902 | (31, 39, 49) | 10,16 | 14,34 | 10,81 |
| novo 55% e 100% `b3` | 0,702 | (81, 87, 95) | **4,93** | 6,96 | 5,25 |

O alfa mínimo para 4,5:1 com fundo branco é 0,678 (eyebrow), 0,661
(subtítulo) e 0,582 (título). `.rpg-hero-library` e `.rpg-hero-citadel`
passaram a `#07101be6 0%, #07101bb3 55%, #07101bb3 100%`. O teste
`frontend/src/heroContrast.test.ts` lê os stops e as cores do `index.css`
e reprova qualquer stop abaixo de 4,5:1. Com o stop de 100% de Campanhas
de volta em `1a`, ele falhou (1,19:1). A contrapartida é que a metade
direita dos cenários fica mais escura do que antes.

Comandos e resultados:

- `make check-web`: ESLint, Prettier, `tsc -b` e Vitest aprovados, com
  52 arquivos e 1007 testes e cobertura de 100% (1269/1269 instruções,
  962/962 ramificações, 352/352 funções, 1235/1235 linhas).
- `npx tsc --noEmit` no `frontend/`: exit 0.
- O `make check` completo, que inclui `check-e2e` e axe, roda no gate de
  commit.

Pendências:

- Renomear `.rpg-hero-citadel` para `.rpg-hero-campaigns` e
  `.rpg-hero-library` para `.rpg-hero-hq` na Fase 4 (tarefa 4.6), num
  refactor separado. A cena de Campanhas não mostra mais uma cidadela.
- `empty/campaign-new.webp`: o retoque local deixou a lanterna com halo
  claro, e ela ainda parece levemente acesa. O responsável decide antes da
  Fase 5 entre aceitar, trocar pela versão sem retoque ou regerar
  (5 créditos).
- O `make bootstrap` de `scripts/novo-worktree.sh` falhou no `uv sync
  --locked` por falta do Python 3.14.9 no PATH do `uv`. Foi contornado com
  `UV_PYTHON=3.14.10 uv sync --locked`.

# `.env` de worktree sem segredo — 2026-11-10

**Objetivo.** O `scripts/novo-worktree.sh` montava o `.env` do worktree novo
copiando linha a linha o `.env` do principal, inclusive chaves de segredo
reais (`FOCUSQUEST_GROQ_API_KEY`). Cada worktree multiplicava as cópias da
chave em disco.

**Decisão.** O `.env` do worktree passa a ser gerado a partir do
`.env.example` da `main` (lido com `git show main:.env.example`, a mesma
revisão de onde o worktree nasce, antes de criar qualquer coisa). Do `.env`
do principal só se lê `FOCUSQUEST_TEST_DATABASE_URL`, como antes: o nome do
banco vira `focusquest_<nome>_test`, e servidor, credencial local e opções da
URL ficam. O deslocamento do E2E continua sendo escrito no fim. Alternativa
descartada: continuar copiando o principal e apagar chaves por padrão de nome
(`*_API_KEY`, `*_TOKEN`...). É uma denylist: a próxima chave com outro nome
vazaria em silêncio. O exemplo funciona como allowlist, porque só tem o que é
seguro versionar. O custo é que ajustes não secretos do `.env` do principal
(nível de log, modelo, URL do banco de desenvolvimento) não passam para o
worktree, que fica com os valores do exemplo. Quem precisa de uma chave no
worktree a preenche à mão.

**Alterações.** `scripts/novo-worktree.sh`: gera a partir do exemplo, recusa
se a `main` não tiver `.env.example` e acrescenta a linha do banco de teste
se o exemplo não a tiver (sem ela, o worktree cairia no banco do principal).
Trava, validações, `noclobber` e as demais recusas não mudaram.
`tests/integration/test_novo_worktree.py`: o repositório sintético versiona
uma cópia do `.env.example` real. Teste novo com canários (`CANARY-<uuid>`)
em toda chave que o exemplo deixa em branco, mais uma que ele não conhece.
Dois testes novos cobrem as bordas acima. Dois testes antigos afirmavam a
cópia de valores do principal (`FOCUSQUEST_TUTOR_MODEL`); passaram a afirmar
o contrário, ou, no da chamada por outro worktree, que o servidor do banco de
teste vem do principal e não do worktree que chamou. `docs/QUALITY.md`
descreve a geração.

**Resultados.** O teste dos canários falhou antes da implementação, com dois
canários no `.env` gerado. Depois dela, o arquivo
`tests/integration/test_novo_worktree.py` inteiro passou: 56 testes. Ruff,
`ruff format --check` e mypy passaram nesse arquivo, e `shellcheck -x` no
script. `make check` completo roda no hook `pre-commit` deste commit (o commit só
existe se ele passar).

**Pendência.** Worktrees criados antes desta mudança ainda guardam a cópia
da chave no próprio `.env`; apagá-la é manual.

# Porta do PostgreSQL com prova de concordância — 2026-11-10

Pendência 11 resolvida. Revisão-base: `e57fa2b`. `tests/unit/test_porta_do_banco.py`
toma `Settings.db_port` como referência e confere, com contagem esperada por
extrator, `compose.yaml` (1), `.env.example` (variável 1, URLs 2) e
`.github/workflows/quality.yml` (`ports` 2, URLs 4, `psql -p` 2). Varre
menções `55xxx` em `config.py`, `.env.example`, `compose.yaml`, workflow,
`docs/QUALITY.md` e `frontend/tests/e2e/servers.ts`, e usa `git grep` para
recusar arquivo rastreado que repita a porta fora dessa lista (exceto
`tests/`, este HANDOFF e os lockfiles). URL sem porta explícita é recusada com
`arquivo:linha`. Teste unitário, sem banco; nenhum contrato, dependência ou
configuração mudou. Fonte única (workflow montando URLs de uma `env` comum,
compose sem padrão) foi avaliada e descartada: mudaria contratos do CI e
quebraria `docker compose up` sem `.env`.

Vermelho antes da implementação: `3 failed` (`NameError` nos extratores).
Depois: `12 passed`. Sabotagens temporárias, cada uma revertida antes da
seguinte, com a falha lida na saída:

| Sabotagem | Resultado |
|---|---|
| `.env.example:4` → `FOCUSQUEST_DB_PORT=55433` | `2 failed`: extrator da variável e varredura, ambos `.env.example:4: 55433` |
| `compose.yaml:16` → `:-55433}` | `2 failed`: extrator do compose e varredura, ambos `compose.yaml:16: 55433` |
| `quality.yml:88` → `- "55432:5432"` | `1 failed`: extrator de `ports`, "esperadas 2 … achadas 1" |
| `docs/QUALITY.md:24` → `55433` | `1 failed`: só a varredura, `docs/QUALITY.md:24: 55433` |
| `scripts/porta.txt` com `55432` (`git add -N`) | `1 failed`: `git grep`, `['scripts/porta.txt']` |

Limitação: uma porta DIFERENTE num arquivo novo fora da lista não é
detectada; a lista é o que se declarou como fonte.

Validação: `ruff check`, `ruff format --check` e `mypy` no arquivo novo sem
erros. `make check`: completo
no hook `pre-commit` deste commit (o commit só existe se ele passar).

# Paridade geral modelo/migração e Alembic offline — 2026-11-10

Pendência 9/10. Revisão-base: `e57fa2b`. Nenhuma migração, modelo,
dependência ou contrato mudou.

`tests/integration/test_paridade_geral_do_esquema.py` roda `compare_metadata`
do Alembic (`compare_type` e `compare_server_default` ligados, sem filtro)
contra o banco migrado até `head`: diff vazio. Cobre tabelas, colunas, tipos,
nulabilidade, server defaults, FKs com `ON DELETE`, UNIQUE e índices. Um
segundo teste compara os nomes dos CHECKs por tabela, porque o autogenerate
não compara CHECK. O autogenerate **não** compara, e por isso fica fora:

- o texto dos CHECKs (só o nome é comparado; o texto segue provado pelos
  testes de comportamento, INSERT recusado);
- o predicado de índice parcial (`postgresql_where` de
  `uq_missions_especial_por_plano` e dos índices parciais de
  `tutor_messages`): só unicidade e colunas entram.

Sabotagens temporárias no modelo, revertidas (`git diff --exit-code -- src`
vazio), cada uma reprovando o teste esperado:

- `ondelete` da FK `xp_entries.mission_id` de `CASCADE` para `SET NULL`:
  `remove_fk` + `add_fk` em `xp_entries`;
- sem `server_default=func.now()` em `users.created_at`: `modify_default`
  em `users.created_at`;
- `missions.instructions` de `Text` para `String(50)`: `modify_type`
  `TEXT()` → `String(length=50)`;
- `ck_xp_entries_amount` renomeado: "so no banco:
  [('xp_entries', 'ck_xp_entries_amount')]; so no modelo:
  [('xp_entries', 'ck_xp_entries_valor')]".

`tests/integration/test_migracoes_offline.py` gera SQL com `sql=True`, sem
conexão, nas faixas: upgrade `base→0003` e `0004→head` (0005, 0006, 0007);
downgrade `0007→0006`, `0004→0003` e `0002→base`. Exclusões, porque
`op.get_bind()` offline não devolve resultado e a migração lê dados:

- upgrade da 0004 (backfill): `alembic -x test=true upgrade 0003:0004 --sql`
  termina em `AttributeError: 'NoneType' object has no attribute 'scalars'`;
- downgrade de 0003, 0005 e 0006 (guardas que contam linhas): cada um
  termina em `AttributeError: 'NoneType' object has no attribute
  'scalar_one'`.

Sabotagens temporárias, revertidas (`git diff --exit-code -- alembic` vazio):
faixa `0003:head` no lugar de `0004:head` e uma leitura de dados no upgrade da
0007 reprovam só o caso `0004-ate-head` (1 failed, 4 passed).

Resultados lidos: os dois arquivos com `pytest` 7 passed; Ruff check, Ruff
format `--check` e mypy estrito sem erros nos dois arquivos.

Validação: `make check` completo roda no hook `pre-commit` deste commit (o
commit só existe se ele passar); o resultado do CI fica no PR. Um gate anterior,
rodado ao mesmo tempo que o de outro worktree, mostrou 2 `F` no pytest e foi
cortado por timeout antes do resumo, sem nome dos testes; a suíte pytest
inteira, rodada sozinha logo depois, passou sem falha. Possível intermitência
sob carga, não reproduzida nem investigada.

# Bíblia e voz da Kairya — 2026-11-10

`docs/kairya/personagem.md` (quem é, cenário, história, personalidade,
visual, paleta, expressões, máquina de estados e limites) e
`docs/kairya/voz.md` (princípios, exemplos PT/EN, padrão de erro, forma do
chat, gatilhos das 36 falas por idioma e descrições das vozes) passam a ser a
fonte da persona da tutora, dos prompts de arte e do roteiro das falas. A
Kairya é original e descrita só por traços próprios: nenhum desses textos
compara a personagem com obra ou franquia existente. O texto final de cada
fala gravada continua no catálogo i18n (Tarefa 6.2). Só documentação; sem
código, dependência, endpoint ou custo.

# Base Nginx com brotli-libs corrigido — 2026-11-06

CVE-2026-111497 afeta `brotli-libs` na imagem web. A tag `nginx:1.30.6-alpine`
foi republicada sem mudar de nome: o digest antigo `c59d1f8b…` traz
`brotli-libs 1.2.0-r1` em AMD64 e ARM64, e o índice atual `583b7f2f…` traz
`1.2.1-r0` nas duas plataformas, lido em `lib/apk/db/installed` das camadas.
O `FROM` fixa o índice multiplataforma, não um manifesto de arquitetura, porque
a publicação gera AMD64 e ARM64.

O índice `e9b2d762…` foi o anterior da mesma tag. Difere do atual só em
ppc64le; os manifestos AMD64 (`bb8f722b…`) e ARM64 (`564a0993…`) são idênticos.

Nenhum teste nem documento fixava o digest antigo. O `pull_request` do CI não
constrói a imagem web: o primeiro build do CI é o `publish-web`, no push à `main`,
e ele confere plataformas, não pacotes. Nada muda em contrato, segredo ou
configuração de publicação. Merge e publicação seguem fora desta etapa.

# Gitleaks em Linux ARM64 — 2026-10-22

O instalador rejeitava `Linux-aarch64` antes de tentar obter o Gitleaks,
impedindo o gate nessa plataforma. Agora aceita `Linux-aarch64` e
`Linux-arm64`, usando o artefato oficial ARM64 do Gitleaks 8.30.1. Os hashes
SHA-256 do arquivo e do binário foram conferidos contra a release oficial;
a versão e as guardas de integridade existentes foram mantidas.

O novo teste reproduziu a falha antes da correção e verifica a seleção do
artefato ARM64 e a propagação da falha de download. Os cinco testes do
instalador passaram após a correção. O binário oficial também executou como
usuário sem privilégios num contêiner Linux ARM64 nativo, sem rede e com
sistema de arquivos somente leitura; a guarda de cache passou e a versão
retornada foi 8.30.1. Os hooks obrigatórios verificam o gate completo antes
de gravar o commit e de enviar a branch.

# Groq Free para conversa e avaliação (2026-10-22)

Objetivo autorizado: concluir o PR da renomeação com Groq Free para Kairya,
sem consumir Anthropic nem usar fallback pago. Base: `72fc969`.

A dependência de produção agora instancia somente `ProvedorGroq`, com a
chave `FOCUSQUEST_GROQ_API_KEY`. Usa HTTPX2 já existente: nenhuma dependência,
serviço adicional, migração ou contrato HTTP introduzido. Endpoint e modelo
fixos (`api.groq.com`, `openai/gpt-oss-20b`); sem retries, redirects, proxy do
ambiente, ferramentas pagas do servidor ou troca de modelo/provedor.
Os esquemas das propostas foram extraídos para módulo sem SDK e permanecem
os mesmos. Avaliação usa a rubrica existente e a confirmação das propostas
continua obrigatória; XP e idempotência permanecem no domínio.

Configuração antiga da Anthropic/modelo/fallback é aceita para não quebrar
.env existentes, mas não pode ativar chamadas na dependência de produção.
Os testes históricos preservam o adaptador antigo; o E2E o monta em entrada
exclusiva de testes com chave fictícia e endereço loopback. O gate bloqueia
tráfego real a Groq mesmo se existir uma chave no ambiente local.

Limite operacional: a API de completions não informa o plano da conta.
A conta Groq deve permanecer Free; não automatizar upgrade, cadastro de
pagamento ou compra de cota. 429 falha fechado e não tenta outro serviço.
Configuração detalhada e fontes primárias em [GROQ.md](GROQ.md).

Provas iniciais: testes do adaptador falharam antes de existir implementação;
o teste da dependência reproduziu seleção indevida da Anthropic antes da
correção. Testes HTTP cobrem deltas, propostas, avaliação, cortes, recusa,
JSON inválido, múltiplas ferramentas, 401/429/5xx, redirecionamento, timeout,
cancelamento e ausência de reenvio. Integração com banco cobre proposta sem
criação automática e avaliação com recompensa idempotente.
Gate inicial aprovado: 1559 testes Python e 32 subtestes, 1002 frontend,
66 E2E e cobertura de 100%. Revisão do contrato oficial do Groq acrescentou
quatro casos de campos nulos, recusa explícita e erro em metadados: falharam
antes da correção, depois os 37 testes do adaptador passaram. Os hooks
obrigatórios validam novamente o conteúdo final antes de commit e push.
CI e revisão exata publicada são verificadas no PR.
Ativação e aceitação reais aguardam chave Groq Free fornecida localmente.

# Identidade da personagem Kairya — 2026-10-22

O responsável definiu Kairya como nome próprio da tutora e usará artes de sua
autoria. Interface, mensagens acessíveis, prompts de conversa e avaliação,
documentação corrente e testes usam Kairya. Os arquivos de retrato passaram a
`kairya-avatar.webp` e `kairya-mentor.webp`, com os mesmos pixels e hashes;
são placeholders até que as artes próprias sejam fornecidas. A procedência
histórica está documentada em `docs/ART.md`, sem atribuir autoria nova aos
retratos existentes.

Os dois valores já persistidos (`tifa` em origens e `tifa_partnership` em
conquistas) conservam seu contrato de armazenamento/API para que o histórico
e os clientes existentes continuem legíveis. Os identificadores internos dos
enums e todas as apresentações desses valores foram renomeados. Esta mudança
não exige migração de banco nem altera XP, histórico ou credenciais.

O usuário não autoriza consumir créditos da Anthropic neste projeto. Nenhuma
chave foi instalada nem chamada paga foi efetuada. Alternativas sem consumir
esse saldo foram pesquisadas em documentação primária: Ollama com modelo
local e planos gratuitos de Groq/Gemini. O usuário selecionou Groq Free em seguida; a integração abaixo substitui
a configuração de produção anterior. A instalação atual ainda depende da
chave Free e de publicação para ativar a tutoria real.

Validação desta revisão: `make check` EXIT 0 com 1.519 testes Python, 32
subtestes, 1.002 testes do frontend e 66 E2E; cobertura de 100%, lint, tipos,
formatação e scanner de segredos aprovados. Hooks e CI têm verificação própria
na revisão publicada.

# Publicação automática GHCR (2026-10-22)

Objetivo autorizado: publicar API e web com Linux AMD64 e ARM64 após o CI e
integrar por PR com todos os checks verdes. Base: `49c79af` (PR #33 integrado).
O checkout original com alterações locais foi preservado; implementação em branch isolada.

O `quality.yml` mantém os quatro checks e o agregador. Após sucesso em push da
`main`, os jobs `publish-api` e `publish-web` publicam as
tags pelo commit. A promoção de `main`/`latest` depende das duas referências por
digest aprovadas. O alvo `check-image-platforms` valida o índice e os configs
reais, inclusive depois da promoção. Tags móveis não são uma referência imutável;
para fixar uma release, use o digest registrado no resumo do job.
`scripts/promote_images.py` consulta a ponta da `main` antes e depois do preflight;
rerun de execução antiga não volta os aliases a uma release anterior. O builder
da promoção usa o mesmo digest de BuildKit fixado nos dois jobs de imagem.

Infraestrutura justificada: GHCR e as actions oficiais do Docker atendem a
publicação automática solicitada. QEMU permite o build ARM64 no runner AMD64;
Buildx/BuildKit geram o índice portátil. Actions e imagens auxiliares fixadas por
SHA/digest; cache separado por imagem. Só os jobs de publicação recebem
`packages: write` no token temporário do Actions. Nenhuma biblioteca de aplicação,
PAT, segredo de produção, contrato de API ou operação de deploy acrescentados.

Validação inicial: `make check` aprovado na base, 1507 testes Python, 1002 frontend,
66 E2E, cobertura de aplicação 100%, lint, tipos e segredos aprovados. Regressões
novas: oito falhas observadas sem o verificador, depois oito testes aprovados,
incluindo plataformas ausentes/duplicadas, configs divergentes, atestados,
digest trocado, transporte e JSON inválidos. A primeira implementação passou
também no `make check` completo (1515 Python, 1002 frontend e 66 E2E). A guarda
de promoção acrescentou três cenários: são 11 testes novos aprovados. O helper
real foi exercitado em registry descartável: os dois índices e aliases corretos
passaram; rerun antigo e avanço da main no preflight preservaram os aliases atuais.
`actionlint`, `zizmor`, Ruff e mypy aprovados; revisão independente aprovada após
as duas correções. Os hooks validam o conteúdo final do commit e da ref enviada
com o gate inteiro. CI e primeira publicação GHCR serão conferidos nos runs do
Actions após a integração, sem usar resultados de outra revisão como aprovação.

Limite operacional: a promoção de múltiplos aliases não é uma transação do
registry. Uma falha de rede no meio reprova o job; reexecutar os jobs reprovados
após diagnóstico repete a promoção por digests aprovados, sem pular o gate.

# Builds Docker nativos e releases portáveis (2026-10-22)

As imagens temporárias AMD64 de publicação estavam aparecendo no Docker do Mac ARM64.
O fluxo agora é versionado: `make image` usa os Dockerfiles em `docker/` e verifica a arquitetura
do daemon; `make image-release` exporta OCI com AMD64 e ARM64 sem sobrescrever tags locais.
`scripts/docker-build.sh` também protege builds personalizados e o `make db-up`. Não muda
contratos de API, segredos, volumes ou configuração de publicação. As bases são índices
multiplataforma fixados por digest, e a API segue o Python 3.14.9 agora declarado na main.
A regressão em `tests/unit/test_docker_build.py` exercita builds scratch reais, a substituição
de uma imagem estrangeira, a recusa de overrides e o conteúdo do OCI.
Commit, push e abertura de PR foram autorizados; merge e deploy seguem fora desta etapa.


# HANDOFF

Estado para retomar o KairyaQuest. Leia antes `README.md` e
`docs/ARCHITECTURE.md`; depois deste documento, leia `docs/QUALITY.md`.
README é a autoridade de produto. AGENTS contém as regras comuns dos agentes.

## Estado corrente — 2026-10-05

A main integra o PR #30 em `ca3b03c93d57c24a0054747564f475677734de24`.
O redesign foi publicado no commit assinado `7b1ff3ba5f20becf4229145795ef2624a2b8146d`,
com assinatura válida e hooks aprovados. Sua árvore é a mesma do merge.
PR #29, correção dos worktrees internos, já está integrado; PRs #7–#28 também.
Essas fases estão encerradas: não reimplementar nem abrir PRs duplicados.

Entrega do PR #30: cenários medievais no QG/Campanhas, Kairya semirrealista no
traje clássico escolhido pelo responsável, navegação e superfícies refinadas,
conquistas em disclosure nativo com nível/XP visíveis, e pares dt/dd alinhados.
Quatro WebP somam 668.608 bytes. Procedência, prompts e hashes em `docs/ART.md`.
O produto permanece focado em estudos; a proposta intermediária de habit tracker
foi cancelada. O redesign não acrescentou fluxo de criação manual nem contrato.

Resultados registrados da entrega, anteriores a esta redução documental:

- Gate fresco do redesign: EXIT 0, 1500 Python, 1002 frontend e 66 E2E;
  cobertura 100%, lint, tipos, formatação e segredos aprovados.
- As 378 fontes, HEAD, índice e `.env` ficaram estáveis durante o gate.
- Hooks de commit/push e CI push/PR aprovados no SHA publicado, cinco jobs cada.
- [CI da main 37283106424](https://github.com/BipoXDXD/KairyaQuest/actions/runs/37283106424):
  cinco jobs verdes no merge `ca3b03c`; [PR #30](https://github.com/BipoXDXD/KairyaQuest/pull/30).

Revisão visual técnica: 14 cenários, depois duas capturas prioritárias e dois
probes de altura curta, com fontes/build estáveis. Capturas usam fixtures GET,
sem provar persistência/API real ou tutoria paga. Limites em 21/50/61/194.

Esses resultados não aprovam alterações posteriores, nem esta limpeza.
Validação da limpeza: `make check` EXIT 0 nesta sessão, com 1500 Python,
1002 frontend e 66 E2E, cobertura 100%, lint, tipos, formatação e scanner
aprovados. Os cinco snapshots sujos foram restaurados em diretórios
temporários: patches, hashes e estado do índice conferiram. Revisões
independentes aprovaram documentação e recuperação. Hooks, commit, push,
PR e CI desta revisão têm evidência própria no ledger da limpeza e no PR;
os resultados de outra revisão não autorizam seu merge.
A limpeza removeu 24 worktrees, 31 branches locais e 30 remotas após preservar
recuperação; o conteúdo formalmente integrado permanece no histórico.
Artefatos locais, ignorados e ausentes num clone novo:

| Caminho | Conteúdo |
|---|---|
| `.superpowers/sdd/desktop-medieval/` | Ledger atual do redesign, originais PNG e capturas preservados. |
| `.superpowers/sdd/cleanup-2026-10-05/branches-before.bundle` | Refs/objetos das branches anteriores à limpeza. |
| `.superpowers/sdd/cleanup-2026-10-05/worktree-recovery.tar.gz` | Recuperação dos deltas locais; inventário em worktrees-recovery-manifest.json. |
| `.superpowers/sdd/cleanup-2026-10-05/historical-evidence.tar.gz` | Scratch histórico, incluindo ledger do fix de worktrees; hashes em historical-evidence-manifest.json. |

Arquivos exclusivos ignorados não são recuperáveis pelo Git. Preservar esses
arquivos de recuperação; consultar manifests antes de restaurar dados/refs.

## Identidade KairyaQuest — 2026-10-22

O responsável autorizou dois PRs separados para a atualização do Python e a
renomeação deste projeto para KairyaQuest. O repositório passou a
`BipoXDXD/KairyaQuest`, preservando o mesmo ID, histórico e proteção da main.
A pasta local também foi renomeada. Interface, título da página, metadados
públicos da API, textos da tutora e documentação corrente usam KairyaQuest.
O pacote `focusquest`, variáveis `FOCUSQUEST_*`, chaves de preferências e nomes
de banco continuam compatíveis com a instalação existente.

O CI instala o Python de `.python-version` com `actions/setup-python` antes
do uv: o catálogo de downloads embutido no uv ainda não inclui o patch.

O `make check` da revisão com o novo nome passou: 1500 testes Python, 1002
frontend e 66 E2E, cobertura de 100% e scanner sem segredos. O gate também
roda nos hooks de commit e de push; os resultados da CI ficam no PR. As alterações locais de volumes não fazem
parte deste PR.

## Atualização do runtime — 2026-10-22

Solicitação: atualizar o patch do Python, com base em
`fc6b5d8093016e13c7034d10c0b6c2190a0d303f`. O interpretador de desenvolvimento e
CI é selecionado por `.python-version`; o CI já usa esse arquivo por meio do
`uv sync --locked`. A compatibilidade do pacote e os alvos do Ruff/mypy
continuam na série 3.14; não houve mudança de dependências ou de contratos.

A instalação local e a sincronização pelo lock foram executadas com sucesso.
Validação desta alteração: `make check` EXIT 0 com Python 3.14.9: 1500 testes
Python, 1002 frontend e 66 E2E, cobertura de 100% e scanner sem segredos.
A publicação foi autorizada em PR separado; este incremento não autoriza merge
nem deploy.

## Continuação e autorização

Coordenação com quatro auxiliares GPT 6.1 Sol High. Preferência do responsável
para o principal: GPT 6 Astra Medium; não presumir a seleção efetiva pelo texto.
A autorização da etapa cobre sua limpeza e publicação por commit assinado,
push de uma ref, PR e merge somente com testes reforçados, gate completo,
CI verde e base atualizada. Não transforma o backlog abaixo em implementação
autorizada de funcionalidades, nem autoriza gastos ou decisões críticas novas.

Use o checkout/status atuais, não fotografias de pausas ou branches antigas.
Um implementador por worktree; revisão não autoriza editar a árvore alheia.
`scripts/novo-worktree.sh` cria `.claude/worktrees/<nome>` no principal,
branch `wt/<nome>`, banco/portas próprios e scratch ligado ao ledger central.
Recusa containers inseguros do principal/destino/ledger antes da criação;
scratch inseguro do checkout é recusado antes do bootstrap, preservando dados
e deixando a árvore criada. A allowlist de segredos não foi ampliada.

Nunca `make db-up` num worktree filho. API/E2E não rodam simultaneamente no
mesmo banco. Push de uma ref por vez; dois pushes do mesmo worktree colidem.
Preservar fontes, dados e evidências exclusivas antes de remover árvores.

## Decisões tomadas que continuam valendo

Os IDs abaixo preservam referências do código; não são tarefas novas.
Contratos completos e responsabilidades estão em `docs/ARCHITECTURE.md`.
Tabelas integrais de decisões/specs/rulings estão no índice histórico ao final.
Essas decisões descrevem o recorte aceito; autorizações históricas não são
permissões permanentes para publicar, gastar ou ampliar funcionalidades.

| Referência | Decisão e motivo vigente |
|---|---|
| A1 | Pacote Python via hatchling/instalação editável; sem remendos de `sys.path`. Não existe chave `package = true` no pyproject atual. |
| A2 | Usuário único local, sem login; autenticação/autorização por recurso precedem contas reais. |
| A3/A5 | Instantes com fuso; apresentação em `America/Sao_Paulo`; `concluida` terminal. |
| A4/D3/D10 | XP da missão deriva da dificuldade; créditos persistem em livro-razão na transação da conclusão. Reward é reconstruído após commit e conserva o saldo daquela recompensa. |
| Domínio | Dificuldade aceita 1–5; XP `20 + 10*d*(d-1)`. Int4/faixa datetime são limites técnicos, distintos dos limites de negócio pendentes. |
| Persistência | PostgreSQL em UTC por `SET TIME ZONE` nas conexões; `operation_id` vincula missão/tipo/conteúdo. Nas escritas diretas de missões, o commit pertence à rota; avaliação e worker SSE coordenam transações próprias. |
| Ocultação | Missão alheia e inexistente têm o mesmo 404. Diárias futuras não vazam conteúdo. |
| B/C | Plano semanal tem sete diárias; sequência perdida não remove XP/conclusões; marco de sete dias libera especial de dificuldade máxima e XP triplo. |
| K2/K3/K5 | QG permanece montado/hidden; Campanhas remonta, sem painel Kairya. Navegação põe foco no h1; rascunho e stream ficam acima dos containers desktop/mobile. |
| K7 | Refresh silencioso no retorno da aba/foco e, agora, no retorno interno ao QG; não desmontar cartões apenas para atualizar. |
| D8 | Migrações congelam regras de XP/catálogo/sequência; não importam regras vivas da aplicação. |
| D16/P4 | Recompensa pertence ao cartão/região viva da conclusão; painel mostra saldo atual, que pode diferir do reward reenviado. |
| E1/E3/E4/E5 | Evidência acompanha concluir; concluir não espera IA. Avaliar é pedido separado e opcional; IA interpreta, não verifica automaticamente. Backend nunca abre o link da evidência. |
| E8/E14/EM4 | Uma avaliação concluída por missão; falha pode repetir. Bônus atende = metade do XP, um lançamento no máximo; tentativa superada não grava. |
| E11/E16 | Dados da avaliação/evidência em missions; processo em evaluation; direção evaluation → missions/progression/tutoring. Usuário único em core, sem router importar outro router. |
| E17/RE4 | Evidência opcional/recolhida; rascunho no registro por missão. Falha preserva texto; release da chave não descarta rascunho. |
| E18/EM1 | Avaliar fica habilitado com evidência/sem avaliação completa; trata 503 sem importar disponibilidade de tutoring. Bonus numérico sai no reward, não no resumo MissionRead. |
| F1/F6/F14/F17 | Iniciar/reagendar têm rotas próprias; sem PATCH genérico. Travas antes do relógio/releitura; ordem ação → missão → avaliação → usuário. Confirmar revalida pré-condições. |
| F5/F7/F11/F16/F20 | Sem sessões/pausa; diária/especial não se reagendam; sem teto de reagendamentos. Proposta mostra fotografia e execução grava prazo real; rascunho de reagendamento é local ao cartão. |
| F25 | Missão do ciclo iniciada antes do prazo pode concluir até o fim do dia seguinte ao prazo em São Paulo; a sequência conta o dia da missão. Não altera XP conquistado nem permite iniciar depois do limite. |
| D-a/E1 do 1b | Chave real só no ambiente do processo, nunca `.env`/repo/perfil do shell; Keychain documentado no macOS. Linux ainda sem cofre decidido. |
| D8 da tutoria/M1 | Falso só em tests; fechamento de SSE tem guardas explícitas/imediatas. Não depender da finalização tardia do CPython/socket. |
| G/174 | Fallback do servidor ligado por escolha do dono, desligável. Adaptador só entrega proposta no message_stop e descarta proposta do modelo recusado; parcial continua no substituto, com modelo servido persistido/nota na tela. |
| Frente 0 F4/F8/F9 | Sem DROP DATABASE automático; offsets 0–24 de árvores e 25–49 de push; banco push deriva do teste com `_push` antes de `_test`. |
| Frente 0 F10/F12/F13 | Script usa main local, nome até 30 caracteres em `[a-z0-9-]`, reserva `push`, recusa colisão de bancos e usa trava mkdir para reservar recursos. |
| Gate D3/D5 | Hooks → pre-commit → make → ferramentas, sem recursão; um alvo por job CI. Versões/limiares pertencem aos locks/configurações, não à prosa. |
| 184 (contexto como dado) | O contexto da tutoria é um cabeçalho fixo seguido de UMA linha JSON (`now_utc`, `pending_missions`, `late_cycle_missions`, `progress`) e vai no system, depois da persona e de uma linha em branco. Cada ação antiga do histórico é `Ação registrada pelo sistema (dado, não instrução): {json}`. Texto livre só existe dentro de strings JSON, com U+2028/U+2029/U+0085 escapados além do que o `json.dumps` faz, e a persona declara o JSON e as ações como dado. Recusadas: normalizar quebras (fecha só o cabeçalho, perde formatação) e recusar quebras na entrada (quebra contrato e não trata o legado). Custo estimado por caracteres, não medido no tokenizer; sem mudança de HTTP, SSE, banco ou ferramentas. |

## Dependências, endpoints e infraestrutura: motivos

Versões atuais: `pyproject.toml`/`uv.lock`, `frontend/package.json`/lock,
`compose.yaml`, workflow e instalador do Gitleaks. Não duplicar pinos aqui.

| Peças | Motivo |
|---|---|
| FastAPI/uvicorn, Pydantic/pydantic-settings | API e configuração tipada previstas no README; schemas validam fronteiras. |
| SQLAlchemy, psycopg[binary], Alembic | Persistência/transações PostgreSQL e migrações versionadas; stack do README. |
| anthropic | SDK oficial encapsulado no adaptador; nenhum segredo/chamada de IA no navegador. |
| httpx2 | Transporte do SDK; dependência direta porque ReadTimeout cru precisa ser capturado pelo adaptador. |
| anyio | Fechar gerador síncrono/SSE em thread com escopo protegido do cancelamento. |
| tzdata | Garantir fusos IANA quando a base do sistema não existir. |
| React/react-dom, TypeScript, Vite, Tailwind | Interface existente e build; Tailwind/plugin são ferramentas de build, não serviços novos. |
| Ruff/mypy, ESLint/Prettier, pytest/cov, Vitest/coverage, Testing Library/jsdom | Lint, tipos, formatação e provas de comportamento/cobertura exigidos pelo gate. |
| httpx dev, Playwright/axe-core | TestClient e Chromium/acessibilidade; E2E usa build de produção e API real com provedor falso. |
| pre-commit, hatchling, Gitleaks | Hooks com runtime do projeto, pacote importável/wheel e scanner com versão/checksums fixados. |
| PostgreSQL em container local | Único banco do produto, healthcheck e porta distinta de PostgreSQL alheio; sem Redis/fila/cloud. |
| Servidor falso `/_control/*` | Infraestrutura isolada em tests; roteiriza SDK/SSE sem chamadas pagas, não é endpoint de produto. |
| Cache Gitleaks + retries curl | Falha de rede medida no CI; só aceitar cache com hash conferido, falhar fechado após esgotar tentativas. Chromium não usa cache parcial de diretório. |
| `/health`, `/ready`, `/api/missions` e complete | Liveness, readiness real, criar/listar/concluir com persistência e idempotência. |
| `/api/tutoring` | Conversa/SSE, histórico, disponibilidade, proposta e decisão persistida. Modelo propõe; pessoa confirma; backend executa. |
| `/api/plans`, `/api/plans/current`, `/api/cycle` | Persistir semana e ler trilha/ciclo derivado; não representam formulário de criação implementado. |
| `/api/progress`, `/api/missions/{id}/evaluation` | Saldo/conquistas agregados; avaliação separada evita que conclusão dependa da IA/custo. |
| `/api/missions/{id}/start` e reschedule | Transições claras, motivo/histórico e idempotência; ferramenta reschedule_mission usa o mesmo serviço após confirmação. |
| PRs #29/#30 | Organização interna/ledger preservado e arte local; sem dependência, endpoint ou serviço adicional. |

Implantar migrações 0004–0006 com API parada: migrar e reiniciar, sem misturar
código antigo/esquema novo. Downgrade 0005 recusa evidência/avaliação/bônus;
0006 recusa histórico/ações de reagendamento. Voltar após esses dados exige
decisão humana sobre eles; não contornar as guardas.
Migração 0007 acrescenta fallback_model/CHECK só na resposta Kairya; downgrade
remove apenas essa atribuição de modelo, preservando o texto da resposta.

## Comandos

Receitas completas/fontes de verdade em Makefile e `docs/QUALITY.md`.
Todos os comandos abaixo partem da raiz do checkout configurado.

| Comando | Finalidade/limite |
|---|---|
| `make bootstrap` | Dependências; não instala hooks. |
| `uv run pre-commit install --install-hooks` | Ativar hooks num clone/worktree novo; não contorná-los. |
| `make db-up` / `make db-down` | PostgreSQL apenas no principal; down preserva volume. |
| `make migrate` / `make migrate-test` | Migrações de desenvolvimento/teste. |
| `make check` | Gate completo antes de commit/merge, inclusive documentação. |
| `make check-api` / `make check-e2e` | Nunca simultâneos no mesmo banco; E2E começa por reset-test-db. |
| `make reset-test-db` | Destrutivo somente no esquema do banco de teste aprovado pelas guardas. |
| `scripts/novo-worktree.sh <nome> [deslocamento]` | Árvore interna/main local, .env/banco/offset próprios, bootstrap; não db-up nem instalação de hooks. |
| `FOCUSQUEST_E2E_PORT_OFFSET=N make check-e2e` | Offset validado 0–49; reserva 25–49 pertence ao pre-push. |

Para primeiro clone, seguir a ordem de QUALITY: bootstrap, hooks, `.env`
a partir do exemplo, db-up no principal, migrate-test e check. No worktree
criado pelo script, preservar o `.env` próprio e não executar compose.

Desenvolvimento, sem chave real:

```bash
make migrate
uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
```

Em outro terminal, dentro de `frontend/`, com seu `.env` do exemplo:
`npm run dev`. `API_PROXY_TARGET` deve vir do ambiente do processo Vite,
não do `.env`; padrão do proxy de desenvolvimento é a API na porta 8000.

Fora da raiz (29/151), usar caminhos explícitos, sem mudar o Settings:

```bash
uv run --project <raiz> --env-file <raiz>/.env uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
uv run --project <raiz> --env-file <raiz>/.env alembic -c <raiz>/alembic.ini upgrade head
```

Chamada real/camada 3 só com autorização específica e chave para o processo.
No macOS, substituir a linha da API por:

```bash
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
```

Para referência real, mesmo prefixo acima, seguido de
`PYTHONPATH=tests uv run python -m integration.<script>`:

| Script | O que a referência registra |
|---|---|
| `camada3` | Sequência de tipos de evento da conversa, sem texto/ids/chave. |
| `camada3_da_avaliacao` | Sequência de eventos e metadados da captura; imprime veredito validado, sem gravar o conteúdo do modelo. |
| `camada3_do_reagendamento` | Conversa com duas ferramentas; só regrava se a sequência mudar. |
| `camada3_do_fallback` | Aceitação do pedido/beta, não provocação de recusa/fallback real. |
| `camada3_da_conclusao_tardia` | Amostra de contexto tardio/persona; não grava referência. |

Esses scripts não entram no gate; referências não se criam à mão. Chamadas
pagas prévias não autorizam repetição automática. No Linux, falta decisão do
cofre (53). Para desligar fallback: `FOCUSQUEST_TUTOR_FALLBACK=false`.

## Pendências: backlog e resíduos

IDs históricos permanecem estáveis. A lista registra limites, não prioridade
nem autorização de implementá-los. Decisões aceitas ficam na seção seguinte.

### Produto e fluxos

| ID | O que continua aberto |
|---|---|
| 4/5 | Autenticação/autorização por recurso; conferir dono antes de prender linha em missions/tutor_actions quando houver contas. Hoje é contenção teórica no recorte único, sem 404 diferente. |
| 25 | Hospedagem fora do Vite precisa proxy reverso ou CORS decidido; não há contrato de implantação externa pronto. |
| ~~26~~ | ~~Limites de negócio das avulsas: estimativa/prazo continuam com tetos técnicos.~~ Resolvida na Fase 1 (Tarefa 1.5): `POST /api/missions` recusa estimativa fora de 1–1440 min (422 `estimativa_fora_do_limite`) e prazo fora de `(agora, agora+365 dias]` (422 `prazo_fora_do_limite`), contra o relógio injetado e antes de qualquer escrita; o reagendamento recusa acima de 365 dias com o mesmo code (o passado segue `prazo_expirado`). Schema intacto: 0/negativo continuam no 422 nativo, e a ferramenta da Kairya não muda. A confirmação pela Kairya aplica os mesmos limites: criação e reagendamento fora deles gravam a ação `falhou` com o `error_code` igual ao `code` do 422, e o cartão mostra o texto próprio. Resíduo: não há formulário de criação no frontend, então `estimativa_fora_do_limite` só aparece no cartão da Kairya; o formulário de reagendar ganhou `min`/`max` e o bloqueio do teto. Os prazos literais do E2E do QG ficam na pendência 207. |
| 55/59 | Tutoria conhece avulsas e conclusão tardia; falta diária de hoje, sequência/marco, especial na janela e plano semanal. Kairya em Campanhas/propose_plan permanecem adiados. |
| 90 | Verificação automática inexistente; avaliação IA não é prova automática. Critérios executáveis/execução de código requerem desenho e isolamento. |
| 92 | Sem upload nem abertura de link; evidência texto 1–4000 e link http(s) até 2000. Armazenamento/SSRF/varredura não implementados. |
| 93 | Sem contestação/reavaliação de veredito concluído; uma avaliação evita roleta de bônus. Falha pode repetir. |
| 101/102 | Evidência preservada pode ficar inacessível após falha refresh; retry persistente não tem descarte explícito. Recarregar perde o rascunho. |
| 111 | Sem sessões/pausa: duração real é tempo de parede iniciado→concluído, incluindo tempo parado. |
| 112 | Rascunho de reagendar não sobrevive à remontagem; chave sobrevive. Conteúdo mudado pode receber um 409 antes de chave nova; sent/lastSentReschedule duplicados. |
| 113 | Diária/especial não se reagendam; replanejar semana continua fora do fluxo implementado. |
| 114 | Fotografia do prazo na proposta pode envelhecer; confirmação executa contra estado atual e histórico grava prazo anterior real. |
| 116 | Sem E2E atravessando meia-noite/F25; há testes de serviço/API/componente, sem relógio controlável no browser/API de E2E. |
| 161(b) | Kind de ação desconhecido mostra texto neutro sem confirmar/recusar. Definir outra recuperação/texto pede decisão; Python/frontend ainda espelham rótulos (32). |

### Contratos, persistência e concorrência

| ID | O que continua aberto |
|---|---|
| 8 | User ainda em missions/models; ao criar users, retirar a classe antiga para não duplicar tabela. |
| ~~9/10~~ | ~~Paridade modelo/migração parcial; FKs/UNIQUE/índices específicos e CHECKs têm provas delimitadas, não comparação geral. Modo Alembic offline não é exercitado.~~ Resolvida em 2026-11-10 (seção "Paridade geral modelo/migração e Alembic offline"). Resíduo declarado: texto de CHECK e predicado de índice parcial (o Alembic não compara); offline sem upgrade da 0004 e sem downgrade de 0003/0005/0006 (leem dados). |
| 12/151 | Settings recusa chave desconhecida do arquivo, mas descarta variável desconhecida do processo; `uv --env-file` muda esse caminho. Suíte ainda depende da raiz. |
| 14 | Engine global/lazy, sem dispose no shutdown ~~e corrida teórica~~; mover ao lifespan muda liveness sem configuração. Corrida resolvida em 2026-11-10 (trava com dupla checagem em `get_engine`, `tests/unit/test_engine_unica.py`). Resta o dispose no shutdown, via lifespan em `main.py`. |
| 32/161 | Códigos HTTP/SSE, dificuldade, dias por marco e rótulos Python/frontend espelhados à mão; respostas externas não têm validação runtime geral. |
| 36 | Erro sem code persistente pode oferecer retry sem saída; fallback genérico é seguro, mas impreciso. |
| 38 | Poda só chaves de conclusão de IDs explicitamente concluídos, após voos; ausências, rascunhos e chaves start/reschedule permanecem. Sem promessa de ganho de memória. |
| 47 | Revalidar payload histórico com schema endurecido pode produzir ValidationError/500 na confirmação de create/reschedule; falta versionamento/compatibilidade dessas propostas. |
| 65 | Três ou mais refresh concorrentes de useCycle/useCurrentPlan não têm prova dedicada; redução ao caso de dois é argumento estrutural. |
| 80 | Sequência O(D) por conclusão; backfill 0004 O(N·D). Rever quando histórico justificar, sem otimização especulativa. |
| 81 | CASCADE de xp_entry pode remover conquista em exclusão futura; hoje não há rota de exclusão. Conquista deve sobreviver se esse fluxo nascer. |
| 88 | Pares missions↔progression e progression↔tutoring continuam no nível de pacote; constante de usuário/router foi corrigida. Evaluation não cria terceiro par. |
| 97(a/c/g/i) | TypeDecorators semelhantes/cascade sem passive_deletes; último tool_use da mesma ferramenta vence e falso tem dois membros tool_input; rascunho retido após refresh; downgrade0005 pode falhar pela guarda0006 antes do bônus. |
| 97/S-M6 | Só o rótulo foi recuperado; falta requisito verificável. Não inventar teste para fechar o item. |
| 97/T-M1 | Provas de ausência de escrita antes do rollback são parciais; faltam todas as falhas, _mesma_evidencia, disputa UNIQUE e HTTP. Casos sequenciais não provam todos os entrelaçamentos. |
| ~~104~~ | ~~Missão retida/usuário livre durante escrita de avaliação tem prova própria; falta matriz de conflitos cruzados e prova global ação→missão→avaliação→usuário.~~ Resolvida em 2026-11-10 (seção "Pendência 104: matriz de conflitos cruzados e ordem global das travas"): escrita da avaliação × confirmação da Kairya e × conclusão de outra missão, nas duas ordens, com sonda NOWAIT do que já está travado. Resíduo declarado: transação 1 e `registrar_falha`, início/reagendamento pela tela, confirmação de criação × bônus, `preparar_turno` × bônus/conclusão, duas avaliações do mesmo usuário e HTTP. |
| 160 | Corridas antigas não provam universalmente relógio após trava; preservar testes de mecanismo. Início na virada, reagendamento e F25 após espera têm provas determinísticas, mas não encerram toda a matriz/releitura/UNIQUE. |
| 164(a/c) | Reenvio direto pode aceitar chave de confirmação Kairya para mesmo conteúdo, sem nova escrita; epoch em texto passa na API de prazo, embora proposta Kairya o recuse. Sem mudança de contrato decidida. |
| 165 | FK do histórico só aponta operation_id; missão/kind corretos são garantidos pelo serviço/transação, não por FK composta/CHECK do elo. |
| 209 | A F14 de `docs/ARCHITECTURE.md` diz que a ordem ação→missão não é observável por teste; `test_ordem_global_das_travas` a observa em `confirmar_acao`. Corrigir a frase quando o ARCHITECTURE.md estiver livre (hoje em PRs abertos). |

### Provedor, custo e diagnósticos

| ID | O que continua aberto |
|---|---|
| 49 | Code SSE desconhecido usa texto de resultado desconhecido, mesmo com falha gravada. GET antigo versus updateAction já foi corrigido por reconciliação; sobra o texto genérico. |
| 53 | Cofre/chamada real pela tela no Linux não documentados; Keychain macOS não é solução presumida para esta máquina. |
| 100 | Log local HTTP/tipo SDK já integrado, sem segredos; decidir codes/textos públicos para 4xx de configuração no tradutor compartilhado chat/avaliação. |
| 106 | Corte de órfão pode anteceder fim de tentativa viva com retries SDK; retomada pode duplicar chamada paga, embora tentativa antiga não grave nem duplique bônus. |
| 175 | Refusal/context_window/fallback efetivo não provocados em chamada real; avaliação não distingue recusa de inválida nem tem provas de todas as paradas. Aceitação do beta não prova substituição real. |
| 176 | Retry de contexto excedido conserva histórico; aumentar teto não compacta contexto. Orientação de dividir ajuda apenas parcialmente. |
| 177/203 | Teto 2048 e fallback ainda podem exceder timeout total60s; latência real/espera adequada não medidas. Alterar custo/timeout depende do responsável. |
| 180 | Amostra real tardia autorizada de2026-09-30 existe; não cobre especial vencida, nova sequência de reschedule_mission sob persona atual nem tela. |
| 184 (resíduo) | Contexto e ações antigas agora vão como JSON; efeito do formato novo no modelo real não medido — os roteiros reais e os `referencia_*_real.json` são do prompt antigo. Regravar exige autorização e custo. Verificado neste incremento: Ruff, `ruff format --check`, mypy, `tests/unit` e os `test_camada3_*` (servidor falso) verdes; `test_tutoring_service.py` ajustado e `make check` ainda **não executados** (sem banco nesta janela). |
| 200 | Beta server-side-fallback-2026-07-01 tem data fixa; acompanhar compatibilidade em atualização SDK. Desligamento configurável; 4xx agora tem log local (100). |
| 201 | Avaliação sem fallback; adotá-lo pede modelo efetivamente servido persistido e prova strict no substituto. |
| 202/204 | Emenda parcial/substituto não medida na recusa real; custo por iteration/categoria da recusa não persistidos. Sem normalizar texto por suposição. |
| 205 | `rubric.py` usa `json.dumps(ensure_ascii=False)` sem escapar U+2028, U+2029 e U+0085, que `splitlines()` trata como quebra; a tutoria escapa (`context._como_dado`). Alinhar a avaliação num PR próprio. |

### Interface, acessibilidade e manutenção

| ID | O que continua aberto |
|---|---|
| 16/131 | Interpretador pessoal/arquivos .run não validados dentro do PyCharm; Gate.run.xml usa /bin/zsh. Não inferir configuração atual do editor a partir da fotografia Homebrew. |
| 21/61 | Axe não cobre toda a matriz transitória de carregando/envio/espera/decisão/stale. Revisão técnica atual cobre layout cheio/vazio/mobile, mas contraste em gradientes ficou incomplete; não é certificação AA nem aprovação humana definitiva da arte. |
| 31 | Dívida cosmética de monkeypatch/editor, sem linha original inequívoca; não remover isolamento do engine ao simplificar teste. |
| 33/50 | randomUUID exige contexto seguro; HTTP por IP móvel não foi medido. Viewport em browser não mede teclado virtual de aparelho físico. |
| 63 | CampaignTrail tem vários subcomponentes num arquivo; decompor quando crescimento/segundo uso justificar. Contagem histórica de linhas não é estado atual. |
| 94/150 | Logs frontend só console; backend simples sem correlação/JSON. Reload/workers/log-config uvicorn não exercitados; Alembic usa log próprio; nova interpolação de segredo exige revisão. |
| 130 | Rever runner ubuntu-24.04 em2026-12-01; troca por PR com gate inteiro na imagem nova. |
| 162 | Tolerância a reschedules/reward ausentes permanece para deploy defasado; remover conjuntamente quando esse cenário não existir, com os testes correspondentes. |
| 192/37 | Concluir e avaliação sem timeout frontend; espera do quadro pode persistir. Avaliação precisa prazo compatível com backend/órfão, não20s indiscriminados. |
| 193 | Timeout20s sem medida real de rede; texto não distingue demora/rede. Timer na leitura de corpo de erro pode perder status/code e custar outro reenvio seguro. |
| 194 | Anúncio de falha gravada provado no DOM, não VoiceOver/NVDA/TalkBack/dialog móvel. Remontagem não repete alerta de propósito. |
| 207 | E2E do QG usa prazos literais de 2027; trocar por datas relativas a hoje antes de 2027-01-10. |

## Decisões aceitas e limitações operacionais

Não confundir estes registros com defeitos novos ou implementação pendente:

| ID | Estado aceito/limite |
|---|---|
| 2 | OpenAPI date-time não expressa fuso obrigatório; recusa é runtime. Pattern foi recusado por compatibilidade de geradores. |
| 22/23 | Lock npm pode divergir local/CI; tabela Vitest vazia não prova cobertura, limiar/resumo sim. Limites em QUALITY. |
| 29/30 | Raiz é convenção com receita externa; barra final produz307. Não mudar Settings/redirect por estética. |
| 39 | Preparação Playwright usa rede/apt; falha reprova fechado. Sem cache parcial introduzido. |
| 41 | Pergunta à tutora limitada a 4000 caracteres, decidido pelo dono. O espelho `MAX_QUESTION_LENGTH` (frontend) ↔ `TAMANHO_MAXIMO_DA_PERGUNTA` (backend) é provado por `tests/unit/test_limite_da_pergunta.py`, que reprova com `arquivo:linha` dos dois lados se divergirem, e com o caminho do arquivo se a constante do frontend sumir. Mudar o número é decisão de produto. |
| 44/71 | Medições antigas de mutações são histórico de prova, não taxas universais atuais nem tarefas por repetir. |
| 46 | Erro após recolhimento do órfão pode corresponder a estado persistido interrompida, não falhou. |
| 52 | Estado indisponível do browser pode ser fixture; API real sem chave é provada separadamente. Não declarar tutoria real por esse cenário. |
| 54/56 | Janela E2E perto da meia-noite SP aceita; segunda leitura de clock pós-commit é risco teórico, não bug reproduzido. |
| 67/68/69/70 | Subtítulo/fixture aceitos; reload invalida imediatamente e efeito cria outra geração; refresh após unmount é no-op sem efeito observável, aceito. |
| 73/74/75/76 | Compose só no principal; bancos sobrevivem à remoção de worktree; limpeza DB manual, sem DROP automático. Push simultâneo mesma árvore colide; script não atualiza main pela rede. |
| 79/82/85 | Reward congelado versus painel atual é correto; progression usa enums de tutoring; posição do texto de progresso no contexto não é requisito de ordenação. |
| 98 | PRs antigos #4–#18 podem pertencer ao remoto anterior, recriado; usar hash/época para identificar. Não confundir com PRs atuais de mesmo número. |
| 108 | Banco E2E limpo por execução, mas compartilhado entre specs; falso reiniciar não limpa banco. Assertar IDs/deltas, não contagens/XP absolutos; axe de uma spec pode incluir cartões anteriores. |
| 110 | Reagendar sem teto de quantidade é escolha do recorte, com histórico visível; limite não está implicitamente autorizado. O novo prazo, pela tela ou pela Kairya, tem desde a Tarefa 1.5 o horizonte de 365 dias (`prazo_fora_do_limite`, pendência 26); a contagem de reagendamentos continua sem teto. |
| 164(b) | Reenvio de ação executada devolve missão atual, não sua fotografia antiga; a ação/idempotência permanece igual. |
| 170/171/172 | error_code também marca corte; stop_sequence/pause_turn hoje normais pois ferramentas de servidor inexistem; parcial pode aparecer antes da recusa final e depois sumir. Fallback atenua, não elimina a última limitação. |
| 182/185 | _completar usa sessão própria sem cache anterior; risco se contrato mudar. Chat depende de ciclo legível, confiando em CHECK/FKs, sem proteção para dado impossível por eles. |

## Histórico recuperável e referências antigas

Fotografia integral preservada no Git, commit
`ca3b03c93d57c24a0054747564f475677734de24`. Recuperação, sem reaplicar patches:

```bash
git show ca3b03c93d57c24a0054747564f475677734de24:docs/HANDOFF.md
git show ca3b03c93d57c24a0054747564f475677734de24:CONTINUACAO.md
git show ca3b03c93d57c24a0054747564f475677734de24:docs/RETOMADA-2026-10-04.md
git show ca3b03c93d57c24a0054747564f475677734de24:docs/REVISAO-2026-10-04.md
```

| Referência antiga | Local da fotografia Git, não estado corrente |
|---|---|
| Fases/pausas/revisão-base | HANDOFF linhas57–1534; histórico não reabre autorização/pausa antiga. |
| Decisões/rulings por incremento | HANDOFF1535–2446; A, 1b, B/C, Frente0, D/E/F e motivos das bibliotecas. Specs versionadas registram os contratos integrais. |
| Alterações por incremento | HANDOFF2447–4387; ARCHITECTURE pode apontar ao blob histórico em vez de pedir essas seções atuais. |
| Comandos/resultados/setup anteriores | HANDOFF4388–4624; resultados datados não validam revisões posteriores. |
| Todos os IDs antigos/resolvidos | HANDOFF4625–7331; números não serão reciclados. Descrições integrais residuais também podem ser consultadas ali. |
| Próximo incremento antigo/estabilização | HANDOFF7332–7973; roteiro superado, não instrução atual. |
| 20/35/42/91/99/103/163/166/167 | Resoluções históricas preservadas; 20 schema E2E limpo, 35 chaves no registro, 42/91 amostras reais datadas, 99 runner fixado, 103 AST limitado a imports estáticos, 163(a–e) resolvidos, 166 consultas e167 prova concorrente integrados. |
| 49/51/60 | GET versus updateAction reconciliado; check-e2e já faz reset próprio; QG refresca ao voltar da navegação. Não repetir as descrições antigas de falha como atuais. |

Link permanente do arquivo antigo:
[HANDOFF em ca3b03c](https://github.com/BipoXDXD/KairyaQuest/blob/ca3b03c93d57c24a0054747564f475677734de24/docs/HANDOFF.md).
QUALITY continua apontando à seção Comandos deste arquivo; ARCHITECTURE/specs
podem usar este índice/commit para decisões e achados encerrados. `docs/ART.md`,
README, AGENTS, ARCHITECTURE e QUALITY permanecem documentos vivos.
