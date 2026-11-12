# F9 — Pausa do turntable (WCAG 2.2.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao vídeo em loop do turntable um botão de pausa rotulado, para a T4 ligar o asset sem violar o WCAG 2.2.2 (Pause, Stop, Hide — nível A).

**Architecture:** só o subcomponente `Player` de `KairyaTurntable.tsx` muda. Com `<video>` na tela, aparece um `Button` (tertiary) logo abaixo que alterna `video.pause()` / `video.play()` por `ref`. Sob `prefers-reduced-motion` não há vídeo (só o poster), então não há botão; o placeholder e a volta por erro também não têm botão. O `TURNTABLE` continua `null`: o comportamento é provado nos testes injetando `asset`.

**Tech Stack:** React 19, Vitest 5 + Testing Library (jsdom), catálogo i18n próprio.

**Spec:** plano-mestre §8 e Fase 9; bloqueio registrado em `docs/handoff/2026-11-11-f9-3d.md` ("Bloqueio da T4").

## Global Constraints

- Frontend com 100% de cobertura (linhas, ramos, funções, instruções); zero dependências novas; nada de `!` em TS; nenhum texto literal em JSX (tudo pelo catálogo `useT`).
- Chaves novas existem em `pt-BR.ts` e `en.ts` (o tipo `Messages` obriga).
- Nada de `--no-verify`, teste ignorado, limiar reduzido ou diretiva de ignorar cobertura.
- Nenhum texto cita franquia de games.

## Review Focus

1. **`play()` rejeitado** (autoplay bloqueado ou mídia ainda carregando): a promessa rejeitada não vira erro não tratado; o botão volta a oferecer "retomar".
2. **Vídeo falha depois de pausado:** volta ao placeholder sem botão órfão.
3. **Foco:** o botão é alcançável por teclado e o rótulo muda junto com o estado (leitor de tela ouve a ação seguinte).
4. **Movimento reduzido trocado em tempo real:** sem vídeo, sem botão.
5. **O vídeo termina pausado por conta própria** (aba em segundo plano, `pause` do navegador): o rótulo segue o estado real do elemento (`onPause`/`onPlay`), não só o clique.

---

### Task 1: botão de pausa no `Player`

**Files:**
- Modify: `frontend/src/features/kairya/KairyaTurntable.tsx`
- Modify: `frontend/src/shared/i18n/messages/pt-BR.ts`, `frontend/src/shared/i18n/messages/en.ts`
- Test: `frontend/src/features/kairya/KairyaTurntable.test.tsx`
- Create: `docs/handoff/2026-11-11-f9-pausa-turntable.md`

**Interfaces:**
- Consumes: `Button` de `frontend/src/shared/ui/Button.tsx` (`variant="tertiary"`); `TurntableAsset` de `./turntable`.
- Produces: `data-testid="kairya-turntable-toggle"` no botão; chaves `kairya.turntable.pause` e `kairya.turntable.resume`.

**Textos (exatos):**

| Chave | pt-BR | en |
|---|---|---|
| `kairya.turntable.pause` | `Pausar a animação` | `Pause the animation` |
| `kairya.turntable.resume` | `Retomar a animação` | `Resume the animation` |

- [ ] **Step 1: testes que falham** (em `KairyaTurntable.test.tsx`, com `asset` injetado e `matchMedia` sem movimento reduzido; espie `HTMLMediaElement.prototype.pause` e `.play`, porque o jsdom não implementa mídia):
  - `com o video, mostra o botao "Pausar a animação"` → `getByRole('button', { name: 'Pausar a animação' })` presente.
  - `clicar pausa o video e troca o rotulo para retomar` → `pause` chamado 1×; após disparar o evento `pause` no `<video>`, o botão tem nome `Retomar a animação`.
  - `clicar de novo retoma o video` → `play` chamado 1× (resolvendo); após o evento `play`, o nome volta a `Pausar a animação`.
  - `play rejeitado mantem o rotulo de retomar e nao lanca` → `play` devolve `Promise.reject(new DOMException('', 'NotAllowedError'))`; nenhum erro não tratado (o teste falha se houver `unhandledrejection`); o nome continua `Retomar a animação`.
  - `pausa vinda do navegador atualiza o rotulo` → disparar o evento `pause` no `<video>` sem clicar → nome `Retomar a animação`.
  - `sob movimento reduzido nao ha botao`, `sem asset (placeholder) nao ha botao` e `depois de erro do video nao ha botao` → `queryByTestId('kairya-turntable-toggle')` é `null`.
  - `em EN o rotulo vem do catalogo` → com o idioma `en`, nome `Pause the animation`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/features/kairya/KairyaTurntable.test.tsx` → FAIL (botão inexistente).
- [ ] **Step 3: implementar no `Player`:** `useRef<HTMLVideoElement>(null)`; estado `paused: boolean` (inicial `false`) atualizado só pelos eventos `onPlay`/`onPause` do `<video>`; o clique chama `pause()` ou `play()`, e o `.catch` do `play()` não altera nada além de deixar `paused` como está (registrar o porquê num comentário de uma linha). Vídeo e botão ficam num wrapper `div` em coluna; o botão usa `Button variant="tertiary"` com o rótulo pelo `useT`.
- [ ] **Step 4:** o mesmo comando → PASS; depois `cd frontend && npx vitest run --coverage` → 100% mantido.
- [ ] **Step 5:** fragmento `docs/handoff/2026-11-11-f9-pausa-turntable.md` (o bloqueio WCAG 2.2.2 da T4 está resolvido; decisões; o E2E só passa a ver o botão quando houver asset). `make check` verde. Commit `feat(kairya): botão de pausa no turntable (WCAG 2.2.2)`.
