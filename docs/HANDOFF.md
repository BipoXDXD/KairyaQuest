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
| 26 | Limites de negócio das avulsas: estimativa/prazo continuam com tetos técnicos. Ciclo já tem teto 1440 min e prazo derivado. |
| 41 | Teto técnico provisório de pergunta 4000 caracteres; decisão de produto pendente, espelho frontend/backend manual. |
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
| 9/10 | Paridade modelo/migração parcial; FKs/UNIQUE/índices específicos e CHECKs têm provas delimitadas, não comparação geral. Modo Alembic offline não é exercitado. |
| 11 | Porta 55432 repetida em Settings/compose/exemplo/workflow, sem prova geral de divergência. |
| 12/151 | Settings recusa chave desconhecida do arquivo, mas descarta variável desconhecida do processo; `uv --env-file` muda esse caminho. Suíte ainda depende da raiz. |
| 14 | Engine global/lazy, sem dispose no shutdown e corrida teórica; mover ao lifespan muda liveness sem configuração. |
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
| 104 | Missão retida/usuário livre durante escrita de avaliação tem prova própria; falta matriz de conflitos cruzados e prova global ação→missão→avaliação→usuário. |
| 160 | Corridas antigas não provam universalmente relógio após trava; preservar testes de mecanismo. Início na virada, reagendamento e F25 após espera têm provas determinísticas, mas não encerram toda a matriz/releitura/UNIQUE. |
| 164(a/c) | Reenvio direto pode aceitar chave de confirmação Kairya para mesmo conteúdo, sem nova escrita; epoch em texto passa na API de prazo, embora proposta Kairya o recuse. Sem mudança de contrato decidida. |
| 165 | FK do histórico só aponta operation_id; missão/kind corretos são garantidos pelo serviço/transação, não por FK composta/CHECK do elo. |

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
| 184 | Instruções com quebras entram cruas no contexto e podem forjar cabeçalhos; efeito no modelo real não medido. Normalização/recusa ainda não decidida. |
| 200 | Beta server-side-fallback-2026-07-01 tem data fixa; acompanhar compatibilidade em atualização SDK. Desligamento configurável; 4xx agora tem log local (100). |
| 201 | Avaliação sem fallback; adotá-lo pede modelo efetivamente servido persistido e prova strict no substituto. |
| 202/204 | Emenda parcial/substituto não medida na recusa real; custo por iteration/categoria da recusa não persistidos. Sem normalizar texto por suposição. |

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

## Decisões aceitas e limitações operacionais

Não confundir estes registros com defeitos novos ou implementação pendente:

| ID | Estado aceito/limite |
|---|---|
| 2 | OpenAPI date-time não expressa fuso obrigatório; recusa é runtime. Pattern foi recusado por compatibilidade de geradores. |
| 22/23 | Lock npm pode divergir local/CI; tabela Vitest vazia não prova cobertura, limiar/resumo sim. Limites em QUALITY. |
| 29/30 | Raiz é convenção com receita externa; barra final produz307. Não mudar Settings/redirect por estética. |
| 39 | Preparação Playwright usa rede/apt; falha reprova fechado. Sem cache parcial introduzido. |
| 44/71 | Medições antigas de mutações são histórico de prova, não taxas universais atuais nem tarefas por repetir. |
| 46 | Erro após recolhimento do órfão pode corresponder a estado persistido interrompida, não falhou. |
| 52 | Estado indisponível do browser pode ser fixture; API real sem chave é provada separadamente. Não declarar tutoria real por esse cenário. |
| 54/56 | Janela E2E perto da meia-noite SP aceita; segunda leitura de clock pós-commit é risco teórico, não bug reproduzido. |
| 67/68/69/70 | Subtítulo/fixture aceitos; reload invalida imediatamente e efeito cria outra geração; refresh após unmount é no-op sem efeito observável, aceito. |
| 73/74/75/76 | Compose só no principal; bancos sobrevivem à remoção de worktree; limpeza DB manual, sem DROP automático. Push simultâneo mesma árvore colide; script não atualiza main pela rede. |
| 79/82/85 | Reward congelado versus painel atual é correto; progression usa enums de tutoring; posição do texto de progresso no contexto não é requisito de ordenação. |
| 98 | PRs antigos #4–#18 podem pertencer ao remoto anterior, recriado; usar hash/época para identificar. Não confundir com PRs atuais de mesmo número. |
| 108 | Banco E2E limpo por execução, mas compartilhado entre specs; falso reiniciar não limpa banco. Assertar IDs/deltas, não contagens/XP absolutos; axe de uma spec pode incluir cartões anteriores. |
| 110 | Reagendar sem teto é escolha do recorte, com histórico visível; limite não está implicitamente autorizado. |
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
