# Incremento C — Plano de Implementação (a campanha)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a área **Campanhas — planos de estudo**: a navegação lateral entre Quartel-General e Campanhas (C15) e a **trilha** da semana atual (os 7 dias com a disponibilidade, os dias futuros e a especial bloqueada como baú fechado), com o E2E abrindo Campanhas e o axe nas duas áreas.

**Architecture:** Nenhuma mudança de backend: o C consome o `GET /api/plans/current` que o B entregou (decisão P2). A navegação é **estado local** (`useState` no `App.tsx`), sem biblioteca de rotas (C15); o `App.tsx` passa a ser o roteador (`docs/ARCHITECTURE.md` §5 regra 6) e a barra lateral mora em `src/app/`. A trilha é uma feature nova, `src/features/campaigns/`, composta pela página `src/pages/Campaigns.tsx`. O Quartel-General **continua montado** (oculto com `hidden`) enquanto Campanhas está aberta, para a conversa da Tifa não ser interrompida pela troca de área (decisão K2).

**Tech Stack:** React 19, TypeScript, Tailwind 4, Vitest, Testing Library, Playwright + axe-core. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md` — decisões C11 (o que não foi revelado não existe para a API), C14 (a tela lê e mostra a campanha; o plano é criado só pela API), C15 (navegação lateral por estado local), B3 (baú fechado), seções "Endpoints" (`GET /api/plans/current`), "Frontend" ("Campanhas — a trilha") e "Testes" (E2E). README §7 (interface, navegação lateral no desktop, celular sem cobrir botões nem rolagem horizontal, avisos além da cor, teclado e foco visível).

## Global Constraints

- Interface em pt-BR com acento; contratos externos (chaves JSON, rotas) em inglês; identificadores do código em inglês; comentários e docstrings em português **sem acento**, como o resto do frontend (README §3, `docs/ARCHITECTURE.md` §5 regra 7).
- `make check` verde antes de cada commit (os hooks o rodam); proibido `--no-verify`, `SKIP`, `|| true`, teste ignorado, diretiva de ignorar cobertura, limiar reduzido (`AGENTS.md` §3).
- Cobertura de 100% nos quatro eixos em `frontend/src/` (fonte: `frontend/vite.config.ts`).
- **Regra da casa (spec, "Testes"):** cada teste novo é visto reprovando — antes do código (RED) e por mutação depois dele. Cada Task lista as mutações; o relatório da Task registra o resultado de cada uma.
- Datas civis (`day`, `week_start`) nunca passam por `new Date(civil)` com fuso: só pelas funções de `civilDate` (Risco 3 do B). Os testes do Vitest rodam em `Asia/Tokyo` (`vite.config.ts`).
- Disponibilidade sempre em **texto e ícone**, nunca só cor (spec, "Campanhas — a trilha"; README §7).
- Nenhuma chamada HTTP fora de `shared/api/` (`docs/ARCHITECTURE.md` §5 regra 6); nenhum import de detalhe interno de outra feature (§5 regra 1) — o que duas features usam sobe para `shared/` (§5 regra 3).
- Nenhuma dependência nova (nem roteador, nem ícones): os ícones são glifos Unicode com `aria-hidden`, acompanhados do texto.
- Dois agentes trabalham o frontend em paralelo, em worktrees separados, **sem banco**: `feat/incremento-c-nav` (Tasks 0 e 1) e `feat/incremento-c-trilha` (Tasks 2 e 3). Nenhum dos dois roda `make check-api`, `make check-e2e` nem nada que use o PostgreSQL ou as portas do E2E enquanto o outro trabalha — só `npm run lint`, `npm run format:check`, `npm run typecheck`, `npx vitest run` e `npm run test:coverage`, de dentro de `frontend/`. O `make check` completo roda na integração (Task 4) e depois dela.
- Base: a `main` com o B mesclado. Até o merge do B, os dois worktrees partem de `5d250b3` com o conserto final do frontend do B aplicado sem commit (os 5 arquivos de `features/missions/` do `patch-fixfront`) — **nenhuma Task do C edita esses 5 arquivos** antes da integração.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit, push, PR e merge só com autorização do dono (`AGENTS.md` §2).

## Review Focus

1. **Trocar de área não interrompe a Tifa.** Um rascunho digitado no painel e uma resposta em andamento sobrevivem a ir a Campanhas e voltar: o Quartel-General é ocultado, não desmontado (K2). Desmontar abortaria o stream, e o backend grava a resposta como `interrompida`. Teste na Task 1 (`o rascunho da Tifa sobrevive a ida e volta por Campanhas`).
2. **Um só `main` visível.** O Quartel-General oculto leva `hidden` no próprio `<main>` (o HTML proíbe mais de um `main` sem `hidden`), e as regiões ocultas saem da árvore de acessibilidade. Teste na Task 1 e axe na Task 6.
3. **O baú fechado não vaza nada.** Um dia `bloqueada` e a especial `bloqueada` chegam com `mission: null`; a tela mostra só "Missão de quinta-feira — revelada no dia" e "N de 7", nunca instrução, dificuldade nem XP. Nenhuma semana além da atual é pedida nem mostrada. Testes na Task 3.
4. **O dia da semana do baú vem da data civil, sem fuso.** "quinta-feira" sai de `"2026-09-24"` em `Asia/Tokyo` e em `America/Sao_Paulo` igual. Teste na Task 2 (`civilWeekday`) e na Task 3.
5. **O celular não ganha rolagem horizontal nem botão coberto.** A navegação vira uma barra no topo, no fluxo da página (não fixa), e o botão fixo "Falar com a Tifa" não a cobre. E2E na Task 6 (390 × 844).
6. **A especial EXPIRADA e a diária PERDIDA aparecem com conteúdo e estado**, nunca como baú (pendência deferida da Task 3 do B, "T3-EXPIRADA/PERDIDA na trilha"). Testes na Task 3.

---

## Decisões que a spec não fixava (entram no HANDOFF na Task 7)

| # | Decisão | Motivo |
|---|---|---|
| K1 | A área ativa mora num `useState<Area>` do **`App.tsx`**, que vira o roteador; a barra lateral é `src/app/SideNav.tsx` e a lista das áreas, `src/app/areas.ts` | C15 manda estado local e sem biblioteca de rotas; `docs/ARCHITECTURE.md` §5 regra 6: "o que entra no `App.tsx` é um roteador, não o conteúdo da segunda tela". `src/app/` é o lugar de "inicialização, rotas e providers" (§3). A URL não muda: a rota por URL entra quando houver a terceira área (C15). Custo: recarregar a página volta ao Quartel-General. |
| K2 | O **Quartel-General fica montado e oculto** (`hidden`) enquanto Campanhas está aberta; Campanhas **desmonta** ao sair | Desmontar o Quartel-General desmontaria o painel da Tifa: o rascunho não enviado se perderia, e um stream em andamento seria abortado — o `useTutorConversation` aborta na desmontagem, e o backend grava a resposta como `interrompida`. Campanhas, ao contrário, **deve** remontar: cada abertura busca a trilha de novo, e uma conclusão feita no Quartel-General aparece na trilha sem recarregar. Custo: o ciclo do Quartel-General oculto não se atualiza sozinho (ver K7). |
| K3 | O painel da Tifa continua **dentro do Quartel-General**; Campanhas não tem painel no C | Tirar o painel da página exigiria um canal do shell até o quadro de avulsas (`onMissionCreated`, `boardHref`) com o quadro às vezes desmontado — mudança na feature `tutoring` sem pedido de produto. Fica como pendência para o incremento que ligar a Tifa ao plano (`propose_plan`, pendência 55). |
| K4 | Os itens da navegação são **`<button>`** com `aria-current="page"` no ativo, dentro de `<nav aria-label="Áreas">` | Sem URL (K1) não há `href` para um link de verdade, e `<a>` sem `href` não recebe foco. `aria-current` é atributo global de ARIA. O ativo também se distingue **sem cor**: marcador `▸` visível (com `aria-hidden`, porque o leitor de tela já ouve o `aria-current`), barra lateral e peso da fonte (README §7, avisos além da cor). |
| K5 | Depois de navegar, o **foco vai ao título de nível 1** da área aberta (`tabIndex={-1}`, `id` em `src/pages/headings.ts`) | Sem troca de URL nem de documento, o leitor de tela não percebe que o conteúdo mudou; o foco no título anuncia a área nova e põe o teclado no começo dela. Os `id` moram em `pages/headings.ts` (e não no `App.tsx`) porque são das páginas, e o `App` os importa na direção certa (app → pages). |
| K6 | No **celular** (< `lg`), a navegação é uma **barra no topo, no fluxo** (`flex-wrap`, sem `position: fixed`); no desktop, coluna lateral `sticky`. Decidido **só por CSS** | README §7: no celular nada pode cobrir botões nem exigir rolagem horizontal. Uma barra fixa embaixo disputaria o canto com o botão fixo "Falar com a Tifa"; uma gaveta exigiria diálogo modal, foco preso e Esc para duas opções. Ao contrário do painel da Tifa (`useIsDesktop`, onde a semântica ARIA muda com o layout), aqui a semântica é a mesma nas duas larguras — o mesmo `nav` com os mesmos botões —, então media query basta. |
| K7 | O ciclo (`useCycle`) e a trilha (`useCurrentPlan`) **atualizam em silêncio** quando a aba volta a ficar visível (`visibilitychange`) ou a janela recebe foco (`focus`) — Task 5 | Fecha o achado m2 da revisão final do B ("aba aberta na virada do dia mostra o dia anterior até recarregar"). Silencioso pelo mesmo motivo da P9: passar por "carregando" desmontaria os cartões. O gancho mora em `shared/hooks/useRefreshOnReturn.ts` porque tem dois usuários reais, um em cada feature (§5 regra 3). Custo declarado: trocar de área **dentro** do app depois da meia-noite não dispara nenhum dos dois eventos; o Quartel-General oculto (K2) continua no dia anterior até a aba sair e voltar, ou até um recarregamento. |
| K8 | A trilha **só mostra**: não tem botão Concluir. O dia de hoje disponível diz "Disponível — conclua no Quartel-general" | O Quartel-General já conclui a diária e a especial, com registro de chaves próprio. Um segundo lugar de conclusão criaria um segundo registro para a mesma missão, com outra chave (`operation_id`) — a API não duplicaria (a segunda operação recebe `transicao_ilegal`), mas a tela mostraria erro para uma conclusão que deu certo. C14 diz que a tela "lê, conclui e mostra a campanha": a conclusão fica onde já está. |
| K9 | O marcador **"Hoje"** da trilha é o **último dia não `bloqueada`** da semana | `PlanRead` não tem `today`. Todo dia depois de hoje é `bloqueada`, e todo dia até hoje é revelado (`fora_do_plano`, `disponivel`, `concluida` ou `perdida`) — então o último revelado é hoje, e nenhuma segunda requisição (`GET /api/cycle`) é necessária. `GET /api/plans/current` é sempre a semana de hoje. |
| K10 | O contrato da trilha mora em `features/campaigns/types.ts`; o tipo `Mission` (e `MissionState`, `MissionType`, `Availability`, `MISSION_STATE_LABELS`) **sobe para `shared/types/mission.ts`**, e `formatCivilDate` sobe para **`shared/lib/civilDate.ts`**, que ganha `civilWeekday` | A trilha mostra o conteúdo de uma `MissionRead` e formata `day`: dois usos reais, um em `missions` e outro em `campaigns` (§5 regras 1 e 3). Mover, e não reexportar: um lugar só para o contrato. `DAYS_PER_MILESTONE` sobe junto (o "N de 7" é das duas features). |
| K11 | A página `Campaigns.tsx` e o componente `CampaignTrail` têm fronteira fixa: a página tem o `<main>`, o `h1` "Campanhas — planos de estudo" (`id` de `pages/headings.ts`) e compõe **`<CampaignTrail />`** de `features/campaigns/CampaignTrail.tsx`, sem props; o componente começa no `h2` e não renderiza `<main>` | Os dois agentes trabalham em paralelo: a página nasce na Task 1 com um espaço reservado honesto, e a Task 4 troca o espaço reservado pelo componente — uma linha de import e uma de JSX. Fixar o nome, a ausência de props e o nível de título aqui evita a divergência na integração. |

## Mapa de arquivos

Navegação (Task 1, worktree `feat/incremento-c-nav`):

- Create: `frontend/src/app/areas.ts`, `frontend/src/app/SideNav.tsx`, `frontend/src/app/SideNav.test.tsx`.
- Create: `frontend/src/pages/Campaigns.tsx`, `frontend/src/pages/Campaigns.test.tsx`, `frontend/src/pages/headings.ts`.
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/pages/Headquarters.tsx`, `frontend/src/pages/Headquarters.test.tsx`.

Trilha (Tasks 2 e 3, worktree `feat/incremento-c-trilha`):

- Create: `frontend/src/shared/types/mission.ts`, `frontend/src/shared/lib/civilDate.ts` (+ `civilDate.test.ts`, movidos de `features/missions/`).
- Create: `frontend/src/features/campaigns/types.ts`, `useCurrentPlan.ts` (+ teste), `CampaignTrail.tsx` (+ teste), `availability.ts` (+ teste: rótulo e ícone de cada `Availability`).
- Modify: `frontend/src/features/missions/types.ts` e os imports de `features/missions/*` e `features/tutoring/*` que usavam `Mission`/`formatCivilDate` (mecânico).

Integração e depois (Tasks 4–7, `feat/incremento-c`):

- Modify: `frontend/src/pages/Campaigns.tsx` (+ teste) — compõe `<CampaignTrail />`.
- Create: `frontend/src/shared/hooks/useRefreshOnReturn.ts` (+ teste); Modify: `features/missions/useCycle.ts` (+ teste), `features/campaigns/useCurrentPlan.ts` (+ teste).
- Modify: `frontend/tests/e2e/cycle.spec.ts` (Campanhas pelo plano já semeado, axe nas duas áreas, celular).
- Docs: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md` (pendência 21: estados do axe).

---

### Task 0: Revisão-base do Incremento C

**Files:**

- Modify: `docs/HANDOFF.md` (seção "Revisão-base", no topo)
- Add: este plano

- [ ] **Step 1: Registrar a revisão-base.** Inserir, logo depois de `## Revisão-base`, um parágrafo "**Incremento C — a campanha.**" com: a branch de integração `feat/incremento-c` e os dois worktrees de trabalho (`feat/incremento-c-nav`, `feat/incremento-c-trilha`), a base (a `main` com o B mesclado — o SHA medido com `git rev-parse origin/main` na hora), a spec e este plano, e "**Estado de publicação: não publicado.**"
- [ ] **Step 2: Gate.** Run: `make check` — Expected: EXIT 0 (só documentação mudou).
- [ ] **Step 3: Commit.**

```bash
git add docs/HANDOFF.md docs/superpowers/plans/2026-09-25-incremento-c.md
git commit -m "docs(campanha): plano do incremento c e revisao-base

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: A navegação lateral

**Files:**

- Create: `frontend/src/app/areas.ts`, `frontend/src/app/SideNav.tsx`, `frontend/src/app/SideNav.test.tsx`, `frontend/src/pages/headings.ts`, `frontend/src/pages/Campaigns.tsx`, `frontend/src/pages/Campaigns.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/pages/Headquarters.tsx`, `frontend/src/pages/Headquarters.test.tsx`

**Interfaces:**

- Produces: `type Area = 'headquarters' | 'campaigns'`; `AREAS: readonly { id: Area; label: string }[]` (rótulos "Quartel-general" e "Campanhas"); `SideNav({ active, onNavigate })`; `Headquarters({ hidden? })`; `Campaigns()`; `HEADQUARTERS_HEADING_ID = 'headquarters-title'`, `CAMPAIGNS_HEADING_ID = 'campaigns-title'`. `data-testid`s que o E2E da Task 6 usa: `side-nav`, `nav-headquarters`, `nav-campaigns`, `nav-current-marker`, `campaigns`, `campaigns-placeholder` (este some na Task 4).

- [ ] **Step 1: Testes que reprovam.** `SideNav.test.tsx`:
  - "é um landmark de navegação chamado Áreas, com Quartel-general e Campanhas, nessa ordem" (`getByRole('navigation', { name: 'Áreas' })`, os nomes dos dois botões).
  - `it.each` das duas áreas: "só a área ativa tem aria-current=page" (a outra, sem o atributo).
  - "o marcador visível ▸ fica só na área ativa" (aviso além da cor, K4).
  - "clicar numa área chama onNavigate com o id dela" (`vi.fn()`, os dois botões).

  `Campaigns.test.tsx`:
  - "anuncia Campanhas no título de nível 1, focável por programa" (`id` = `CAMPAIGNS_HEADING_ID`, `tabIndex` -1, dentro de um `main`).
  - "diz que a trilha ainda não chegou, sem prometer conteúdo" (o `campaigns-placeholder`; nenhuma ida à rede).

  `App.test.tsx` (acrescentar a rota `GET /api/cycle` ao `stubPage` local):
  - "abre no Quartel-general, marcado como área atual".
  - "Campanhas abre pela navegação: o título dela recebe o foco e o Quartel-general fica oculto" (`toBeVisible` / `not.toBeVisible`, `aria-current` trocado, `document.activeElement`).
  - "voltar ao Quartel-general devolve o foco ao título dele".
  - "só um main visível; o do Quartel-general oculto tem o próprio hidden" (`getAllByRole('main')` com 1; o `main` do QG com o atributo `hidden`).
  - "o rascunho da Tifa sobrevive à ida e volta por Campanhas" (digitar no `tutor-input`, ir e voltar, o valor continua; `GET /api/missions` e `GET /api/tutoring/messages` chamados uma vez só — nada remontou).

  Run: `cd frontend && npx vitest run src/app src/pages src/App.test.tsx` — Expected: FAIL (módulos inexistentes / sem navegação).

- [ ] **Step 2: Implementar.** `pages/headings.ts` com os dois `id`. `Headquarters({ hidden = false })`: `hidden` na raiz **e** no `<main>` (K2, Review Focus 2); `h1` com `id={HEADQUARTERS_HEADING_ID}` e `tabIndex={-1}`. `Campaigns()`: `<main data-testid="campaigns">` com o `h1` "Campanhas — planos de estudo" e o parágrafo reservado "A trilha da semana ainda não chegou a esta versão. A missão de hoje continua no Quartel-general." `SideNav`: `<nav aria-label="Áreas" data-testid="side-nav">` com uma `<ul>` de `<button type="button">`, `aria-current="page"` e o marcador `<span aria-hidden="true" data-testid="nav-current-marker">▸</span>` só no ativo; classes: barra no topo em `flex flex-wrap`, coluna `lg:sticky lg:top-0 lg:h-screen lg:w-56` no desktop (K6). `App`:

```tsx
const HEADING_OF: Record<Area, string> = {
  headquarters: HEADQUARTERS_HEADING_ID,
  campaigns: CAMPAIGNS_HEADING_ID,
};

function App() {
  const [area, setArea] = useState<Area>("headquarters");
  const navigate = useCallback((next: Area) => {
    // flushSync: o titulo da area nova precisa existir no DOM antes do foco.
    flushSync(() => {
      setArea(next);
    });
    document.getElementById(HEADING_OF[next])!.focus();
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      <SideNav active={area} onNavigate={navigate} />
      <div className="min-w-0 flex-1">
        <Headquarters hidden={area !== "headquarters"} />
        {area === "campaigns" && <Campaigns />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Ver passar.** Run: `cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage` — Expected: verdes, 100% nos quatro eixos.

- [ ] **Step 4: Mutações** (cada uma aplicada, vista reprovando, desfeita): (1) `aria-current` sempre `undefined` → os testes de `aria-current` reprovam; (2) marcador em todos os itens → o teste do marcador reprova; (3) `onNavigate(area.id)` trocado por `onNavigate('headquarters')` → o teste do clique reprova; (4) `{area === 'headquarters' && <Headquarters />}` no lugar do `hidden` → o teste do rascunho reprova; (5) sem o `.focus()` → os dois testes de foco reprovam; (6) `hidden` só na raiz, não no `<main>` → o teste do `main` oculto reprova; (7) `tabIndex` tirado do `h1` de Campanhas → o teste do título focável reprova.

- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0 (o E2E existente continua passando: o QG é a área inicial e o Playwright ignora elementos ocultos).

```bash
git add frontend/src
git commit -m "feat(campanha): navegacao lateral entre quartel-general e campanhas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: O contrato da trilha, a data civil compartilhada e o hook do plano

**Files:**

- Create: `frontend/src/shared/types/mission.ts`, `frontend/src/shared/lib/civilDate.ts`, `civilDate.test.ts` (movidos), `frontend/src/features/campaigns/types.ts`, `useCurrentPlan.ts`, `useCurrentPlan.test.tsx`
- Modify: `frontend/src/features/missions/types.ts` (sai o que subiu), imports em `features/missions/*`, `features/tutoring/*`, `pages/*` e testes (mecânico, `git grep` pelos nomes)
- Delete: `frontend/src/features/missions/civilDate.ts`, `civilDate.test.ts` (movidos com `git mv`)

**Interfaces:**

- Produces: `shared/types/mission.ts` com `Mission`, `MissionState`, `MissionType`, `Availability`, `MISSION_STATE_LABELS`, `DAYS_PER_MILESTONE`; `shared/lib/civilDate.ts` com `formatCivilDate(civil)` e **`civilWeekday(civil): string`** ("quinta-feira"); `features/campaigns/types.ts`:

```ts
/** Um dia da trilha, como `GET /api/plans/current` o publica. */
export interface PlanDay {
  /** Data CIVIL, sem fuso. */
  day: string;
  availability: Availability;
  /** `null` enquanto o dia nao foi revelado (bau fechado, C11). */
  mission: Mission | null;
}

export interface PlanSpecial {
  availability: Availability;
  /** Dias de sequencia ate o proximo marco: o "N" de "N de 7". */
  progress: number;
  /** `null` enquanto bloqueada: sem id, sem conteudo, sem dificuldade. */
  mission: Mission | null;
}

export interface Plan {
  week_start: string;
  days: PlanDay[];
  special: PlanSpecial;
}

export interface CurrentPlan {
  plan: Plan | null;
}
```

`useCurrentPlan(): { state: CurrentPlanState; reload(): void; refresh(): void }` com `CurrentPlanState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'no-plan' } | { status: 'loaded'; plan: Plan; refreshFailed: boolean }` — o mesmo desenho do `useCycle` (P9: `refresh` sem "carregando"; guarda do pedido cancelado).

- [ ] **Step 1: Mover sem mudar comportamento.** `git mv` de `civilDate.ts`/`.test.ts` para `shared/lib/`; os tipos para `shared/types/mission.ts`; imports atualizados. Run: `npm run typecheck && npx vitest run` — Expected: os 305+ testes existentes passam sem mudança de asserção.
- [ ] **Step 2: Testes que reprovam.** `civilDate.test.ts`: "civilWeekday dá o dia da semana da data civil, sem fuso" (`'2026-09-24'` → `'quinta-feira'`; `'2026-09-21'` → `'segunda-feira'`, o caso que escorregaria para domingo). `useCurrentPlan.test.tsx`: carregando; `{"plan": null}` → `no-plan` (e não erro); plano → `loaded`; erro com "Tentar novamente" (`reload`); `refresh` sem passar por `loading`; `refresh` que falha mantém o plano com `refreshFailed`; o pedido cancelado que rejeita depois do bom não vira erro (StrictMode, o mesmo teste do `useCycle`); **uma** ida a `GET /api/plans/current` e nenhuma outra rota (nenhuma semana futura).
- [ ] **Step 3: Implementar e ver passar** (lint, format, typecheck, coverage 100%).
- [ ] **Step 4: Mutações.** (1) `civilWeekday` com `new Date(civil)` e sem `timeZone: 'UTC'` → reprova em Tokyo; (2) `plan === null` tratado como `loaded` → o teste `no-plan` reprova; (3) sem a guarda do `aborted` → o teste do StrictMode reprova; (4) `refresh` passando por `loading` → o teste do refresh reprova.
- [ ] **Step 5: Commit** (`refactor(campanha): contrato de missao e data civil em shared` e `feat(campanha): hook do plano da semana` — dois commits, o movimento separado do comportamento).

---

### Task 3: A trilha

**Files:**

- Create: `frontend/src/features/campaigns/availability.ts` (+ teste), `CampaignTrail.tsx`, `CampaignTrail.test.tsx`

**Interfaces:**

- Consumes: Task 2.
- Produces: `CampaignTrail()` (sem props; `<section aria-labelledby="campaign-trail-heading" data-testid="campaign-trail">`, título `h2` "Trilha da semana"); `AVAILABILITY_DISPLAY: Record<Availability, { label: string; icon: string }>` — mapa **exaustivo** sobre o tipo. `data-testid`s: `campaign-trail`, `trail-loading`, `trail-error`, `trail-retry`, `trail-no-plan`, `trail-day` (com `data-day`), `trail-day-availability`, `trail-chest`, `trail-today`, `trail-special`, `trail-special-progress`, `trail-stale`.

- [ ] **Step 1: Testes que reprovam.** Fixture: um plano da semana de `2026-09-21` com hoje na quarta (`23`): segunda `concluida`, terça `perdida`, quarta `disponivel`, quinta a domingo `bloqueada` com `mission: null`; especial `bloqueada`, `progress: 1`.
  - carregando (`role="status"`), erro com "Tentar novamente", sem plano ("Nenhum plano nesta semana" — e que um dia sem plano não quebra a sequência, como no QG).
  - "mostra os 7 dias, de segunda a domingo, e só eles" (7 `trail-day`, `data-day` da semana, nenhum além de `2026-09-27`).
  - `it.each` das disponibilidades: cada uma com **rótulo em texto e ícone** (`AVAILABILITY_DISPLAY` exaustivo; o teste de `availability.test.ts` percorre todos os valores do tipo).
  - "dia revelado mostra instrução, critério, dificuldade e o estado" (segunda `concluida`, terça **`perdida`**).
  - "o dia futuro é um baú fechado com 'Missão de quinta-feira — revelada no dia', sem conteúdo" (nenhum texto de missão, nenhum "XP", nenhuma dificuldade dentro do `trail-chest`).
  - "a especial bloqueada é um baú com '1 de 7'"; "a especial disponível mostra a missão e o XP"; "a especial **expirada** mostra a missão e 'Expirada'" (pendência T3 do B); "a especial concluída mostra 'Concluída'".
  - "o dia de hoje é marcado como Hoje" (K9: a quarta; e num plano com hoje no domingo, o domingo).
  - "hoje disponível diz para concluir no Quartel-general, e a trilha não tem botão Concluir" (K8: nenhum `button` com nome "Concluir…").
  - "um plano criado no meio da semana mostra os dias anteriores como Fora do plano, com conteúdo".
  - "as datas saem sem conversão de fuso" (a segunda aparece como "segunda-feira, 21/09" com o processo em Tokyo).
- [ ] **Step 2: Implementar e ver passar.** Uma lista ordenada (`<ol>`), um item por dia; o baú fechado é um glifo com `aria-hidden` mais o texto acessível visível; a especial em seguida. Estados carregando/erro/sem plano/stale como no `CycleSection`.
- [ ] **Step 3: Mutações.** (1) o baú renderizando `day.mission?.instructions` → não muda nada visível (a API manda `null`): **a mutação certa** é o componente passar a desenhar dias `bloqueada` pelo ramo de dia revelado → o teste do baú reprova; (2) tirar o ícone de uma disponibilidade → o teste "texto e ícone" reprova; (3) marcador "Hoje" no primeiro dia não `bloqueada` em vez do último → o teste do Hoje reprova; (4) `expirada` desenhada como baú → o teste da especial expirada reprova; (5) `progress` trocado por `DAYS_PER_MILESTONE - progress` → o teste "1 de 7" reprova.
- [ ] **Step 4: Commit** (`feat(campanha): trilha da semana com bau fechado e a especial`).

---

### Task 4: Integração dos dois worktrees

**Files:**

- Modify: `frontend/src/pages/Campaigns.tsx`, `frontend/src/pages/Campaigns.test.tsx`

- [ ] **Step 1: Juntar as branches** em `feat/incremento-c` (merge das duas, na ordem nav → trilha; conflito esperado só em `docs/`).
- [ ] **Step 2: Compor a trilha.** Em `Campaigns.tsx`, trocar o parágrafo reservado por `<CampaignTrail />` (import de `../features/campaigns/CampaignTrail`). No teste, trocar "diz que a trilha ainda não chegou" por "compõe a trilha da semana" (rota `GET /api/plans/current` com `{"plan": null}`, `trail-no-plan` na tela) — a mudança de teste **é** a mudança da Task, não ajuste de passagem.
- [ ] **Step 3: App.** O `stubPage` do `App.test.tsx` ganha a rota `GET /api/plans/current`; um teste novo: "cada abertura de Campanhas busca a trilha de novo" (ida, volta, ida → 2 pedidos; K2).
- [ ] **Step 4: Mutações.** (1) Campanhas oculta em vez de desmontada → o teste "cada abertura busca de novo" reprova.
- [ ] **Step 5: Gate e commit.** `make check` — EXIT 0.

---

### Task 5: Atualizar na volta à aba (a virada do dia)

**Files:**

- Create: `frontend/src/shared/hooks/useRefreshOnReturn.ts`, `useRefreshOnReturn.test.tsx`
- Modify: `frontend/src/features/missions/useCycle.ts` (+ teste), `frontend/src/features/campaigns/useCurrentPlan.ts` (+ teste)

**Interfaces:**

- Produces: `useRefreshOnReturn(refresh: () => void): void` — ouve `visibilitychange` (só quando `document.visibilityState === 'visible'`) e `focus` da janela, e remove os ouvintes na desmontagem.

- [ ] **Step 1: Testes que reprovam.** O gancho: chama no `visibilitychange` visível, **não** chama no oculto, chama no `focus`, para de chamar depois de desmontar. `useCycle`/`useCurrentPlan`: "a aba que volta a ficar visível atualiza em silêncio" (segundo GET, sem `loading` no meio; o valor novo aparece — o cenário da meia-noite: `today` passa de `2026-09-23` para `2026-09-24`).
- [ ] **Step 2: Implementar e ver passar.**
- [ ] **Step 3: Mutações.** (1) sem a checagem de `visibilityState` → "não chama no oculto" reprova; (2) sem a remoção dos ouvintes → "para depois de desmontar" reprova; (3) `reload` no lugar de `refresh` → "sem loading no meio" reprova.
- [ ] **Step 4: Gate e commit** (`feat(ciclo): atualiza o ciclo e a trilha na volta a aba`).

---

### Task 6: E2E — Campanhas, axe nas duas áreas e o celular

**Files:**

- Modify: `frontend/tests/e2e/cycle.spec.ts`

O plano é **único por semana**, e o `cycle.spec.ts` já o semeia no `beforeAll`: os cenários novos entram **no mesmo arquivo**, em série, depois dos dois que existem — um segundo arquivo que semeasse de novo receberia `409 plano_existente`.

- [ ] **Step 1: Cenários.**
  - "Campanhas abre pela navegação, com a trilha do plano semeado, e passa no axe": clicar em `nav-campaigns`; o `h1` "Campanhas — planos de estudo" focado; `nav-campaigns` com `aria-current="page"`; 7 `trail-day`; o dia de `today` (da API) marcado como Hoje e **concluído** (o cenário anterior concluiu); os dias depois de `today` como baú, com "revelada no dia"; a especial como baú com "1 de 7"; axe sem violações. Voltar ao Quartel-general: o `h1` dele focado e axe sem violações de novo (as duas áreas, spec "Testes").
  - "pelo teclado": `Tab` até a navegação, `Enter` em Campanhas, foco no título.
  - `test.describe('celular')` com `viewport: { width: 390, height: 844 }`: a navegação visível no topo, sem rolagem horizontal nas duas áreas, e o botão "Falar com a Tifa" não se sobrepõe a nenhum botão da navegação (caixas de `boundingBox()` sem interseção).
  - As datas vêm do `today` da API, nunca do relógio do navegador (Asia/Tokyo).
- [ ] **Step 2: Rodar duas vezes.** Run: `make check-e2e && make check-e2e` — Expected: EXIT 0 nas duas.
- [ ] **Step 3: Mutações.** (1) `aria-current` tirado → o cenário de Campanhas reprova; (2) a barra do celular com `fixed bottom-0` → o teste de sobreposição reprova; (3) um `w-[480px]` na navegação do celular → o teste de rolagem horizontal reprova.
- [ ] **Step 4: Gate e commit** (`test(e2e): campanhas pela navegacao, axe nas duas areas e celular`).

---

### Task 7: Documentação

**Files:**

- Modify: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`

- [ ] **Step 1: HANDOFF.** "Revisão-base" com a contagem de commits medida; "Incremento C — decisões que a spec não fixava" (K1–K11) e "decisões tomadas durante a execução"; "Alterações do Incremento C" arquivo a arquivo; "Resultados" com `make check` duas vezes e `make check-e2e` duas vezes, números lidos da saída; "Pendências": a 21 cresce (os estados do axe em Campanhas); novas — (a) o painel da Tifa só no Quartel-General (K3); (b) a troca de área depois da meia-noite não atualiza o QG oculto (K7); (c) a revisão visual de desktop e celular pedida pelo README §7, se não tiver sido feita num navegador de verdade; "Próximo incremento": o C entregue.
- [ ] **Step 2: ARCHITECTURE.** §1 com os arquivos novos (`git ls-files`); §3 "Frontend": `src/app/` deixa de ser contrato (a navegação), `features/campaigns/` existe, `shared/types/` e `shared/hooks/` existem; §4 atualiza os estados da tabela; §5 regra 6: "Hoje `App.tsx` é o roteador de duas áreas, por estado local (C15)".
- [ ] **Step 3: QUALITY.** O que o axe audita agora (Campanhas carregada; o QG depois da volta; o celular).
- [ ] **Step 4: Gate duas vezes e commit** (`docs(campanha): handoff, arquitetura e qualidade do incremento c`).

---

## Autorrevisão do plano contra a spec

- **Cobertura da spec.** C15 e README §7 (navegação lateral, `nav`, `aria-current`, celular): Tasks 1 e 6. "Campanhas — a trilha": 7 dias com `availability` em texto e ícone (Task 3), dias revelados com conteúdo e estado (Task 3), dias futuros como baú com o texto acessível (Tasks 2 e 3), especial bloqueada com "N de 7" e o conteúdo quando desbloqueada (Task 3), nenhuma semana futura (Tasks 2 e 3), sem plano/carregando/erro (Task 3). C11 na tela: o baú nunca desenha conteúdo (Task 3). C14: nenhuma tela de criar plano; a trilha só mostra (K8). "Testes" do frontend (a trilha sem semana futura, datas civis sem fuso) e E2E (abrir Campanhas, axe nas duas áreas, `today` da API): Tasks 3 e 6.
- **Pendências do B absorvidas.** m2 da revisão final (a virada do dia com a aba aberta): Task 5. T3-EXPIRADA/PERDIDA na trilha: Task 3 (no frontend; o teste de **serviço** que o revisor da Task 3 do B pediu é backend e fica registrado como pendência — o C não muda `src/focusquest/`). O axe em Campanhas que a Task 9 do B deixou para o C: Task 6.
- **Fora do C.** A Tifa em Campanhas (K3), a rota por URL (C15: na terceira área), a tela de criar plano (C14).
