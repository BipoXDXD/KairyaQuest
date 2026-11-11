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
