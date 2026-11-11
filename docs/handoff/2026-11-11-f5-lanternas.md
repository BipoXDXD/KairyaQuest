# wt/f5-lanternas: trilha de lanternas no lugar do `CampaignTrail` (F5 Tarefa 5.3) — 2026-11-11

Objetivo: a tela de Campanhas mostra a semana como uma trilha de lanternas em
SVG, com o estado dito em texto. Revisão-base: `63569a6` (branch
`wt/f5-conquistas`, Tarefas 5.1 e 5.2, mais a `main` atual). Plano:
`docs/superpowers/plans/2026-11-11-f5-gamificacao.md` (Tarefa 5.3).

## Declarações

- Zero dependência nova (nem de runtime, nem de dev).
- Zero endpoint novo.
- Zero migração, zero coluna nova.
- Delta de contrato desta tarefa: **vazio**. `GET /api/plans/current` e
  `GET /api/cycle` não mudam; o delta da fase (5.1 e 5.2) já está nos
  handoffs das tarefas dele.

## Em destaque: a fonte de dados (R9), o conteúdo (R10) e o mapa de estados (R11)

### R9. A trilha lê `GET /api/plans/current`, não `GET /api/cycle`

A letra da Tarefa 5.3 fala em dados do ciclo. Esta entrega se afasta dela de
propósito, e este é o único ponto em que isso acontece:

- O `GET /api/cycle` devolve só hoje, a diária de hoje, a sequência, a
  especial e a diária de ontem. Não traz o estado dos sete dias.
- A sequência sozinha não distingue dia concluído de dia perdido no meio da
  semana, e a trilha precisa dessa diferença (lanterna acesa ou apagada).
- O `GET /api/plans/current` já entrega os sete dias com a `availability` de
  cada um e a especial, e é o que o `CampaignTrail` já lia (`useCurrentPlan`,
  inalterado). A trilha segue com a mesma fonte, sem endpoint e sem campo
  novo.
- Custo se o dono exigir `/api/cycle`: um campo aditivo `week` em `CycleRead`
  (um PR de backend) e o hook trocaria de fonte.

### R10. A trilha não mostra o texto das missões

`LanternTrail` substitui o `CampaignTrail` inteiro. Instruções, critério,
dificuldade e XP já aparecem no Quartel-General (`CycleSection`). A trilha
mantém só o caminho para lá (`trail-go-headquarters`: botão com a navegação,
texto sem ela), e uma vez só, quando há alguma lanterna `disponivel` (diária
ou especial). Por isso o `campaigns.headquarters.which` (nome acessível com o
texto da missão) saiu. Se o dono quiser o detalhe, é uma lista sob a trilha
com `PlanDay.mission`, que o hook já traz.

### R11. Mapa de estados da lanterna

`concluida` → acesa; `perdida` e `expirada` → apagada; `disponivel`,
`bloqueada` e `fora_do_plano` → futura (`LANTERN_STATE`, `Record<Availability,
...>`, exaustivo no `tsc`). `fora_do_plano` nunca aparece como apagada: quem
começou no meio da semana não vê falha. O marcador "Hoje" segue a regra K9 (o
último dia revelado).

## Alterações

- Novos em `frontend/src/features/campaigns/`: `lanterns.ts` (regra pura),
  `LanternGlyph.tsx` (SVG; chama só na acesa, pavio na apagada, contorno
  tracejado na futura; `aria-hidden`; `small` e `grand`), `LanternTrail.tsx`
  (container, estados de `useCurrentPlan`, `<ol>` com uma `<li>` por lanterna,
  resumo "N de 7 lanternas acesas", brilho `shadow-glow-lantern` só na acesa),
  com os três testes correspondentes. A lanterna grande não entra na conta do
  resumo de sete.
- Usa `Panel`, `Skeleton`, `Button` e `Badge` do design system; só classes de
  token; nada anima (o brilho é estático), então `prefers-reduced-motion` é
  respeitado sem depender dele.
- `pages/Campaigns.tsx` e seu teste passam a usar o `LanternTrail`.
- `App.test.tsx`: três esperas de `trail-mission` viraram `trail-day`, e o
  botão ganhou o nome `Ir ao Quartel-General` (sem o sufixo da missão).
- E2E: `cycle.spec.ts` (estado e texto das lanternas: `Acesa`, `Ainda por
  vir`, `acende com 7 dias seguidos`, progresso `1 de 7`),
  `navigation.spec.ts` (espera `trail-week`) e `layout.spec.ts` (o teste de
  instruções longas na trilha virou "a trilha cabe na largura, sem texto de
  missão", com axe e sem rolagem horizontal).
- Catálogo (pt-BR e en, mesmas chaves): entram `campaigns.lantern.*` (título,
  resumo e o texto de cada disponibilidade, do dia e da especial); saem as
  chaves sem uso: `campaigns.availability.*`, `campaigns.mission.*`,
  `campaigns.headquarters.which`, `campaigns.trail.dayChest`,
  `campaigns.trail.special.chest` e `campaigns.trail.title`. Cada uma foi
  conferida com `grep` antes. `gamificationCopy.test.ts` varre o prefixo
  `campaigns.lantern.`.
- `designLint.test.ts`: `CampaignTrail.tsx` saiu de `PENDING_MIGRATION`.
- `docs/ARCHITECTURE.md`: parágrafos da página Campanhas e de `campaigns`.

## Removido

`CampaignTrail.tsx`, `CampaignTrail.test.tsx`, `availability.ts` e
`availability.test.ts` (com o `AVAILABILITY_DISPLAY`). Os casos de carga, erro,
`no-plan`, `refreshFailed` e refresh ao voltar a aba foram portados para o
`LanternTrail.test.tsx`; os de conteúdo de missão e de baú não têm mais o que
testar (R10).

## Correção da revisão (rodada 1)

- `Lantern` virou união discriminada (`DayLantern | SpecialLantern`); a
  `lanternsOf` devolve `{ days, special }` e o `as string` saiu do componente.
- A lista agora se chama "Lanternas da semana" (`campaigns.lantern.list`), pois
  tem 8 itens e o oitavo não é um dia; `campaigns.trail.days` saiu.
- O texto da lanterna grande para `fora_do_plano` passou a ser o de
  `bloqueada` ("acende com 7 dias seguidos"), coerente com o glifo futuro. Isso
  resolve a `P-f5-lanternas-1` desta entrega; `perdida` e `expirada` seguem
  como "apagada".
- O E2E de layout passou a usar acesas, apagadas, hoje pronta, por vir e a
  especial expirada (o texto mais longo).
- O nome deste arquivo segue o `docs/handoff/README.md`
  (`AAAA-MM-DD-<branch-sem-wt>`).

## Pendências e riscos

- Sem screenshot nem verificação visual no navegador (o plano não pede, e o
  gate cobre o layout pelo E2E e pelo axe).
