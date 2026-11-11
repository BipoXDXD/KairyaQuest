# Fase 4, PR #52: sincronização com a main (9c8577e) — 2026-11-11

Merge de `origin/main` (squash do #46, mais a F3 completa e a arte da F7) em
`wt/f4-componentes`. Os conflitos vieram de a pilha ter nascido da F3 PR1: a
main já tinha o i18n completo (provider com servidor, `ServerLocaleSync`,
falhas de carga) e o shell traduzido, enquanto a pilha trocava o shell por
tokens e componentes.

Decisões:

- i18n (`I18nProvider`, `catalog`, `i18nContext`, `messages/*`, `test/i18n.ts`):
  versão da main inteira, mais as chaves que só a pilha usa
  (`ui.dialog.cancel`, `ui.language.*`, `ui.loading`, `ui.sound.*`,
  `campaigns.header.*`). A pilha passou a usar as chaves da main
  (`shell.area.*`, `shell.brand.tagline`, `headquarters.header.title/subtitle`).
  O inglês da nota do Quartel-General é o da main ("with its deadline and
  reward").
- `LanguageSwitcher` (pilha) absorveu o `LocaleSwitcher` evolvido da main: o
  endônimo com `lang` na mensagem de falha (`translateParts`) e o texto novo de
  `shell.locale.saveFailed`. O `LocaleSwitcher` e o teste dele saíram (os casos
  já existiam no teste do `LanguageSwitcher`); os testes de provider e de
  `ServerLocaleSync` da main passaram a montar o `LanguageSwitcher`. Como a
  `StatusLine` sempre tem o ícone, "região vazia" virou `textContent === ''`.
- Cabeçalho das áreas e navegação: ficam os da pilha (`AreaHero`, `NavTabs`).
  O eyebrow "Biblioteca do aventureiro" e a legenda "Explorar" da main não
  existem mais nesse desenho; as chaves `headquarters.header.eyebrow` e
  `shell.nav.caption` saíram do catálogo. Os testes EN da main (cabeçalho do
  Quartel-General e `SideNav`) foram mantidos, apontando os elementos novos.
- `index.css`: fica a versão da pilha (sem `.rpg-*` de shell e hero). O
  `heroContrast.test.ts` da F7 media o gradiente do `.rpg-hero`, que não existe
  mais: o texto do hero fica num `Panel` sólido e o contraste é medido nos
  tokens pelo `AreaHero.test.tsx`.
- `readSource.ts`: união dos helpers (`sourceSize` da pilha; `readSourceBytes` e
  `isSourceFile` da main). `ART.md`: a coluna "Uso" da pilha.
- E2E: `playwright.config.ts` com o comentário da main sobre o locale (o
  `locale: 'pt-BR'` já era igual nos dois lados); `cycle.spec.ts` e
  `layout.spec.ts` com a união dos imports.
