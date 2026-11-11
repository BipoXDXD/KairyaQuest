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
