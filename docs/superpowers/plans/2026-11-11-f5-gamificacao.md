# Fase 5 — Gamificação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as faixas por nível, as três conquistas novas (`first_pass`, `weekly_trial`, `comeback`) e a trilha de lanternas, tudo derivado na leitura.

**Architecture:** As faixas e as três conquistas novas saem de funções puras em `progression/domain.py` e são calculadas em `ler_progresso`, sem job, sem coluna e sem migração: a tabela `user_achievements` e o seu CHECK continuam guardando só as 7 conquistas atuais. A trilha de lanternas é um componente de apresentação sobre os dados que a tela de Campanhas já carrega, em SVG, com os componentes e tokens do design system da F4.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, pytest, mypy estrito, Ruff; React 19, TypeScript, Vitest (100% de cobertura), Tailwind com tokens, Playwright. Zero dependências novas.

**Spec:** `/private/tmp/claude-501/-Users-01bipo-Documents-Projetos/ac851d54-7f62-4e05-a37b-5bf36e8490d5/scratchpad/f5-spec.md` (Tarefas 5.1, 5.2, 5.3 e seção "Desafios e recompensas" do plano-mestre). Contexto de código: `src/focusquest/modules/progression/`, `src/focusquest/modules/missions/cycle_domain.py`, `frontend/src/features/{progression,campaigns,kairya}/`.

## Global Constraints

- `make check` verde antes de cada commit/PR; um PR por tarefa, com `quality-gate` verde e base atualizada; push de uma ref por vez. Proibidos: `--no-verify`, `SKIP`, `|| true`, `continue-on-error`, teste ignorado, limiar reduzido, diretiva de ignorar cobertura.
- Frontend com 100% de cobertura. **Zero dependências novas** (nem de runtime, nem de dev).
- **Sem endpoint novo, sem migração, sem coluna nova.** Faixas e conquistas derivadas na leitura, sem job.
- Toda string de UI passa pelo catálogo; `en.ts` e `pt-BR.ts` com as mesmas chaves e os mesmos placeholders (`catalog.test.ts` garante).
- Contratos externos em inglês (chaves JSON, códigos `rank_*` e de conquista); nomes de faixa neutros em gênero nas duas línguas.
- Testes de fronteira com on point e off point, com os valores do plano-mestre: níveis 1, 4, 5, 9, 10, 19, 20, 34, 35; `comeback` com 3 dias sem conclusão (ganha) e 2 (não ganha).
- Ética: nada de aversão à perda, nada de contagem regressiva, nada de notificação insistente. Sequência zerada recebe texto acolhedor.
- Um handoff por PR em `docs/handoff/AAAA-MM-DD-<branch-sem-wt>.md`; nunca editar `docs/HANDOFF.md` (o `check-handoff` reprova). Cada arquivo declara: zero dependência nova, zero endpoint novo, zero migração, e o delta de contrato desta fase.
- Fora de escopo: a fala da Kairya em nível, conquista e especial (Fase 8), nada de gasto com imagem, 3D ou voz, deploy e `.env`.

## Rulings

Formato: decisão — motivo — custo se errado.

- **R1 Nome da função de faixa.** A função nova é `rank_do_nivel(nivel: int) -> Rank` (`Rank` é um `Literal` com os cinco códigos), e não `faixa_do_nivel` — já existe `faixa_do_nivel(xp) -> FaixaDoNivel` (nível, piso e próximo piso) usada pelo painel e pelos testes — o nome da spec colidiria e quebraria os chamadores — custo: renomear uma função.
- **R2 As três conquistas nunca são gravadas.** Elas moram num catálogo à parte (`CodigoDerivado`, `ConquistaDerivada`, `CATALOGO_DERIVADO`), e `PAINEL = CATALOGO + CATALOGO_DERIVADO` (10 itens) é o que o painel lê. `Codigo`, `CATALOGO`, o CHECK `ck_user_achievements_code`, `registrar_conclusao` e a migração 0004 ficam intactos — a spec manda derivar na leitura; colocar os códigos em `Codigo` mudaria o CHECK do modelo (montado de `Codigo`) e exigiria migração e backfill — custo: se o dono quiser persistir depois, a derivação continua valendo e a migração entra como expand, sem retrabalho de regra.
- **R3 Ordem do painel.** As 7 atuais, depois `first_pass`, `weekly_trial`, `comeback` — a spec diz "além das 7 atuais" — custo: trocar a ordem em uma tupla.
- **R4 `comeback` conta dias civis de conclusão, não o estado do histórico.** Dadas as conclusões de diárias em ordem (data civil em São Paulo, `dia_de(completed_at)`), a conclusão `i` (com `i >= 1`) é "a volta" quando os dias **planejados** estritamente entre a conclusão anterior e ela são 3 ou mais. Dia planejado é o que está no `carregar_historico` com `dia >= plano_criado_em`; dia sem plano, de semana sem plano ou anterior à criação do plano **não conta**, coerente com `sequencia_ate`. Vale a primeira volta, só diárias (especial e avulsa não entram), e exige uma conclusão anterior: quem ainda não concluiu nenhuma diária não "volta" — motivo: a lista de conclusões só cresce no fim (uma conclusão tardia da diária de ontem tem `completed_at` de agora), então a conquista nunca é revogada nem muda de instante, e a reconstrução do reenvio (D10) segue idêntica; já derivar do `concluida` por dia do plano faria a conclusão tardia de ontem encolher o intervalo e revogar a conquista — custo: se o dono quiser premiar quem começa já "atrasado", é tirar a exigência da conclusão anterior (uma linha e um teste).
- **R5 `first_pass`.** Destrava na primeira avaliação com `state = concluida` e `verdict = atende` (menor `finished_at`, empate por `id`), e `unlocked_at` é esse `finished_at`. Ela nasce na avaliação, não na conclusão: por isso é anunciada na recompensa do bônus (`recompensa_do_bonus`) e não na da conclusão — custo: mover o anúncio.
- **R6 `weekly_trial`.** Primeira missão `especial` com `state = concluida` (menor `completed_at`, empate por `id`); `unlocked_at` é esse `completed_at`; anunciada na recompensa da conclusão dela.
- **R7 O anúncio inclui as derivadas.** `Recompensa.achievements_unlocked` passa a incluir `weekly_trial` e `comeback` na conclusão que as causou e `first_pass` no bônus que a causou, só a primeira vez; o formato do corpo não muda, só os valores possíveis — a Fase 8 (fala da Kairya) lê esse campo para saber que houve conquista; sem isso as novas só apareceriam no painel — custo: remover duas linhas de `recompensa_*`.
- **R8 Consistência de leitura.** As derivadas são lidas em comandos separados do saldo, no mesmo request. A garantia de snapshot único do saldo com as conquistas persistidas (comentário em `ler_progresso`) continua valendo para elas; uma conclusão que comite entre os comandos pode mostrar, num refresh, uma conquista nova com o saldo antigo, e o refresh seguinte corrige. Usuário único e a conclusão trava o usuário — custo: um refresh com o XP defasado; a correção seria um único comando com os fatos agregados.
- **R9 Fonte de dados da trilha: `GET /api/plans/current`, não `GET /api/cycle`.** O `GET /api/cycle` devolve só hoje, a diária de hoje, a sequência, a especial e a diária de ontem; não tem o estado dos 7 dias, e a sequência sozinha não distingue dia concluído de dia perdido no meio da semana. A trilha usa o `useCurrentPlan` que o `CampaignTrail` já usa — os "mesmos dados" da seção 3 da spec — e continua sem endpoint novo e sem campo novo. **É o único ponto em que o plano se afasta da letra da Tarefa 5.3** — custo: se o dono exigir `/api/cycle`, entra um campo aditivo `week` em `CycleRead` (um PR de backend) e o hook troca de fonte.
- **R10 A trilha não mostra o texto das missões.** `LanternTrail` substitui o `CampaignTrail` inteiro (container, estados e dias). As instruções, o critério, a dificuldade e o XP da diária de hoje e da especial já aparecem no Quartel-General (`CycleSection`); a trilha mantém só o botão "Ir ao Quartel-General" quando há lanterna disponível — a spec pede substituição e a trilha é um painel de hábito — custo: se o dono quiser o detalhe, é uma lista sob a trilha com `PlanDay.mission`, que o hook já traz.
- **R11 Mapa de estados da lanterna.** `concluida` → acesa; `perdida` e `expirada` → apagada; `disponivel`, `bloqueada` e `fora_do_plano` → futura. O texto de cada disponibilidade é próprio da trilha e acolhedor. `fora_do_plano` (dia anterior à criação do plano) nunca aparece como apagada, para não parecer falha. O marcador "Hoje" segue a regra K9 existente (último dia revelado) — custo: ajustar a tabela.
- **R12 Leitor tolerante no front.** `Progress.rank` é opcional no tipo; `rank` ausente ou desconhecido esconde a faixa, em vez de mostrar o código cru. Conquista de código desconhecido continua caindo no `title` e na `description` do back (`achievementText`) — custo: nenhum.
- **R13 Texto das conquistas novas.** Título e descrição moram no catálogo (fonte da UI) e, em português, também em `CATALOGO_DERIVADO` (fallback do leitor tolerante). O vocabulário é o que o catálogo usa hoje para "diária", "especial" e "missão"; a renomeação para "Treino do dia" e "Prova da semana" na UI é do plano de nomes, não desta fase — custo: um passe de renomeação nos textos.
- **R14 Handoff por PR.** A spec fala em `docs/HANDOFF.md`; o `AGENTS.md` do worktree manda um arquivo por PR em `docs/handoff/` — segue-se o `AGENTS.md`.

## Contract delta (aditivo; nenhum campo existente muda)

| Contrato | Ganha | Fica igual |
|---|---|---|
| `GET /api/progress` | `rank`: `rank_seed \| rank_sprout \| rank_blade \| rank_flame \| rank_star` (5.1); `achievements` passa de 7 para 10 itens, mesmos 4 campos (`code`, `title`, `description`, `unlocked_at`) (5.2) | `xp_total`, `level`, `level_floor_xp`, `next_level_xp` e o formato de cada item |
| `reward` (conclusão da missão e bônus da avaliação) | os `code` `weekly_trial`, `comeback` e `first_pass` podem aparecer em `achievements_unlocked` (5.2) | o formato do corpo e dos itens |
| `GET /api/cycle`, `GET /api/plans/current` | nada | tudo |
| Banco | nada | tabelas, CHECKs e migrações |

## Review Focus

Falhas que nenhum teste de feature cobre sozinho, da mais provável para a menos. Cada linha tem o teste na tarefa dona.

1. **Conclusão tardia da diária de ontem depois da volta**: a pessoa volta numa sexta e, à tarde, conclui com atraso a diária de quinta. Esperado: o `comeback` continua ganho, com o mesmo `unlocked_at`, e o reenvio da conclusão de sexta devolve o mesmo corpo (Task 5.2, `test_comeback_nao_e_revogado_pela_conclusao_tardia_de_ontem`).
2. **Dia sem plano e quem acabou de chegar**: semana sem plano, dias anteriores à criação do plano e quem nunca concluiu uma diária não ganham `comeback`. Esperado: ausência por falta de plano não é "dia sem conclusão" (Task 5.2, `test_dia_sem_plano_nao_conta_como_dia_sem_conclusao` e `test_sem_conclusao_anterior_nao_ha_volta`).
3. **Anúncio uma vez só, para o usuário certo**: a segunda especial e a segunda avaliação "atende" não repetem `weekly_trial` e `first_pass`; a especial e a avaliação de outro usuário não destravam as do usuário. Esperado: `achievements_unlocked` vazio nesses casos (Task 5.2, `test_derivadas_so_anunciam_a_primeira_vez` e `test_derivadas_contam_so_o_usuario`).
4. **Back e front fora de compasso**: `rank` ausente (back antigo), `rank` ou código de conquista desconhecido (back novo). Esperado: nada cru na tela, nenhuma exceção (Task 5.1, `rankText.test.ts`; Task 5.2, `achievementText.test.ts`).
5. **Texto que pune**: trilha de semana sem nenhuma lanterna acesa, dias anteriores ao plano e especial expirada. Esperado: copy acolhedora, nunca "perdeu", "quebrou" ou "última chance", e o estado nunca depende só de cor (Task 5.1, `gamificationCopy.test.ts` varre os prefixos `progression.rank.`, `progression.achievement.` e `campaigns.lantern.`; Task 5.3, teste de `fora_do_plano` e de zero lanternas).

---

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `src/focusquest/modules/progression/domain.py` | `Rank`, `rank_do_nivel`; `CodigoDerivado`, `ConquistaDerivada`, `CATALOGO_DERIVADO`, `PAINEL`, `indice_da_volta` | 5.1, 5.2 |
| `src/focusquest/modules/progression/service.py` | `Progresso.rank`; derivadas na leitura e nas recompensas | 5.1, 5.2 |
| `src/focusquest/modules/progression/schemas.py` | `ProgressRead.rank`; tipos das conquistas do painel | 5.1, 5.2 |
| `frontend/src/features/progression/` | `rankText.ts` (novo), `ProgressPanel.tsx`, `types.ts` | 5.1 |
| `frontend/src/shared/i18n/` | `achievementText.ts`, `gamificationCopy.test.ts` (novo), `messages/{pt-BR,en}.ts` | 5.1, 5.2, 5.3 |
| `frontend/src/features/campaigns/` | `lanterns.ts`, `LanternGlyph.tsx`, `LanternTrail.tsx` (novos); remove `CampaignTrail.tsx` e `availability.ts` | 5.3 |

Ordem: 5.1, 5.2, 5.3. A 5.1 e a 5.2 mexem nos mesmos arquivos (domínio, serviço, painel, catálogo) e vão em sequência. A 5.3 só se junta a eles nos arquivos de catálogo e pode andar em paralelo num worktree próprio, com conflito trivial no `messages/*.ts`. Cada PR sai de uma branch nova a partir da `main` atualizada: `wt/f5-faixas`, `wt/f5-conquistas`, `wt/f5-lanternas`. Antes de começar: `make bootstrap`, hooks instalados, `.env` e banco de teste do worktree migrados (`make migrate-test`).

---

### Task 5.1: Faixas por nível (PR `wt/f5-faixas`)

**Files:**
- Modify: `src/focusquest/modules/progression/domain.py`, `service.py`, `schemas.py`
- Test: `tests/unit/test_progression_domain.py`, `tests/integration/test_progression_api.py`
- Create: `frontend/src/features/progression/rankText.ts`, `rankText.test.ts`, `frontend/src/shared/i18n/gamificationCopy.test.ts`
- Modify: `frontend/src/features/progression/{types.ts,ProgressPanel.tsx,ProgressPanel.test.tsx}`, `frontend/src/shared/i18n/messages/{pt-BR,en}.ts`
- Create: `docs/handoff/AAAA-MM-DD-f5-faixas.md`

**Interfaces:**
- Produces (back): `Rank = Literal["rank_seed", "rank_sprout", "rank_blade", "rank_flame", "rank_star"]`; `rank_do_nivel(nivel: int) -> Rank`; `Progresso.rank: Rank`; `ProgressRead.rank: Rank`.
- Produces (front): `Progress.rank?: string`; `rankName(rank: string | undefined, t: Translate): string | null`; chaves `progression.rank.label` (com `{name}`) e `progression.rank.rank_seed|rank_sprout|rank_blade|rank_flame|rank_star`.

- [ ] **Step 1: Teste da regra pura, falhando.** Em `test_progression_domain.py`, `test_rank_do_nivel_nas_bordas`, parametrizado: `(1, rank_seed)`, `(4, rank_seed)`, `(5, rank_sprout)`, `(9, rank_sprout)`, `(10, rank_blade)`, `(19, rank_blade)`, `(20, rank_flame)`, `(34, rank_flame)`, `(35, rank_star)`, `(36, rank_star)`, `(10**9, rank_star)`. Mais `test_rank_do_nivel_recusa_nivel_menor_que_1` com `0` e `-1` (`ValueError`, `match="nivel"`, como `xp_para_o_nivel`). Mais `test_rank_nos_pisos_de_xp`: para cada fronteira, `rank_do_nivel(nivel_do_saldo(xp))` com `xp_para_o_nivel(n) - 1` (off point) e `xp_para_o_nivel(n)` (on point), `n` em 5, 10, 20, 35 — ou seja, saldos 999/1000, 4499/4500, 18999/19000 e 59499/59500, com os ranks esperados escritos como literais.
- [ ] **Step 2: Rodar e ver falhar.** `uv run pytest tests/unit/test_progression_domain.py -q` → falha por `ImportError` de `rank_do_nivel`.
- [ ] **Step 3: Implementar** `Rank` e `rank_do_nivel(nivel: int) -> Rank` em `domain.py`, junto da curva de nível: tabela ordenada de pisos (35, 20, 10, 5) e o primeiro que couber, com `ValueError` para `nivel < 1`. Não renomear nem mexer em `faixa_do_nivel(xp)` (R1).
- [ ] **Step 4: Teste de fiação, falhando.** Em `test_progression_api.py`: `test_progress_sem_conclusoes` ganha `"rank": "rank_seed"` no dicionário esperado; `test_progress_depois_de_concluir` (220 XP, nível 2) afirma `corpo["rank"] == "rank_seed"`; em `test_openapi_publica_reward_e_progress`, o schema de `ProgressRead` tem `rank` em `required` e o `enum` igual aos cinco códigos.
- [ ] **Step 5: Implementar a fiação.** `Progresso.rank: Rank` preenchido em `ler_progresso` com `rank_do_nivel(faixa.nivel)`; `ProgressRead.rank: Rank` preenchido em `do_progresso`. Rodar `uv run pytest tests/unit/test_progression_domain.py tests/integration/test_progression_api.py tests/integration/test_progression_service.py -q` → passam; `uv run mypy src tests` limpo.
- [ ] **Step 6: Catálogo e teste de ética, falhando.** `gamificationCopy.test.ts` varre as chaves de `ptBR` e `en` com prefixo `progression.rank.`, `progression.achievement.` ou `campaigns.lantern.` e reprova texto que case `/perd(e|er|eu|a|ida)|quebr|zer(a|ou|ado)|última chance|restam|contagem/i` (pt-BR) ou `/\b(lose|lost|loses|break|broke|broken)\b|last chance|expires? in/i` (en). Rodar: passa vazio, e passará a valer nas Tasks 5.2 e 5.3. Acrescentar nele um teste de sanidade: a regex acusa `'Você vai perder a sequência'` e `'You will lose your streak'`.
- [ ] **Step 7: Textos.** Em `pt-BR.ts` e `en.ts`:

  | Chave | pt-BR | en |
  |---|---|---|
  | `progression.rank.label` | `Faixa: {name}` | `Rank: {name}` |
  | `progression.rank.rank_seed` | `Semente` | `Seed` |
  | `progression.rank.rank_sprout` | `Broto` | `Sprout` |
  | `progression.rank.rank_blade` | `Lâmina` | `Blade` |
  | `progression.rank.rank_flame` | `Chama` | `Flame` |
  | `progression.rank.rank_star` | `Estrela` | `Star` |

- [ ] **Step 8: Teste do leitor, falhando.** `rankText.test.ts`: cada um dos cinco códigos devolve o nome nos dois idiomas (valores literais da tabela); `'rank_novo'` devolve `null`; `undefined` devolve `null`.
- [ ] **Step 9: Implementar** `rankName(rank: string | undefined, t: Translate): string | null` em `features/progression/rankText.ts`, no desenho de `achievementText` (lista `KNOWN_RANKS`, guarda de tipo, `t(\`progression.rank.${rank}\`)`), e `rank?: string` em `Progress` (comentário: opcional de propósito, deploy defasado, R12).
- [ ] **Step 10: Teste do painel, falhando; depois implementar.** Em `ProgressPanel.test.tsx`: com `rank: 'rank_sprout'`, existe `data-testid="progress-rank"` com o texto `Faixa: Broto` (pt-BR) e `Rank: Sprout` (en); sem `rank` e com `rank: 'rank_novo'`, o elemento não existe e o resto do painel renderiza. Em `ProgressPanel.tsx`, mostrar `<Badge tone="neutral" data-testid="progress-rank">` do `shared/ui` ao lado de `progress-level`, só quando `rankName` não for `null`.
- [ ] **Step 11: Verificar.** `cd frontend && npx vitest run src/features/progression src/shared/i18n` → passa; `npm run typecheck && npm run lint`.
- [ ] **Step 12: Handoff e gate.** Escrever `docs/handoff/AAAA-MM-DD-f5-faixas.md` (objetivo, R1 e R12, delta de contrato: só `rank`, zero dependência, zero endpoint, zero migração). `make check` → verde. Commit `feat(progression): faixas por nível no GET /api/progress (F5 Tarefa 5.1)` com a linha `Co-Authored-By` exigida.

---

### Task 5.2: As três conquistas novas (PR `wt/f5-conquistas`)

**Files:**
- Modify: `src/focusquest/modules/progression/{domain.py,service.py,schemas.py}`
- Test: `tests/unit/test_progression_domain.py`, `tests/integration/test_progression_service.py`, `tests/integration/test_progression_api.py`, `tests/integration/test_progression_consistency.py`, `tests/integration/test_evaluation_api.py`
- Modify: `frontend/src/shared/i18n/{achievementText.ts,achievementText.test.ts}`, `frontend/src/shared/i18n/messages/{pt-BR,en}.ts`, `frontend/src/features/progression/ProgressPanel.test.tsx`, `frontend/src/features/missions/RewardAnnouncement.test.tsx`
- Create: `docs/handoff/AAAA-MM-DD-f5-conquistas.md`

**Interfaces:**
- Consumes: `Rank`/`Progresso` da 5.1; `carregar_historico(session, user_id) -> dict[date, DiaDoPlano]` e `dia_de(instante) -> date` (`missions.cycle_domain`); `Mission.completed_at`, `Mission.mission_type`, `MissionEvaluation.finished_at/verdict/state`.
- Produces (back):
  - `class CodigoDerivado(StrEnum)`: `FIRST_PASS = "first_pass"`, `WEEKLY_TRIAL = "weekly_trial"`, `COMEBACK = "comeback"`.
  - `@dataclass(frozen=True) class ConquistaDerivada`: `codigo: CodigoDerivado`, `titulo: str`, `descricao: str`.
  - `CATALOGO_DERIVADO: tuple[ConquistaDerivada, ...]`; `ConquistaDoPainel = Conquista | ConquistaDerivada`; `PAINEL: tuple[ConquistaDoPainel, ...]` (7 + 3, R3).
  - `DIAS_SEM_CONCLUSAO_DA_VOLTA = 3`.
  - `indice_da_volta(dias_de_conclusao: Sequence[date], dias_planejados: AbstractSet[date]) -> int | None`: `dias_de_conclusao` é uma data por diária concluída, em ordem não decrescente (`ValueError` se não estiver); devolve o índice da primeira conclusão `i >= 1` com ao menos 3 dias de `dias_planejados` estritamente entre `dias_de_conclusao[i-1]` e `dias_de_conclusao[i]`, ou `None`.
  - `@dataclass(frozen=True) class DesbloqueioDerivado`: `unlocked_at: datetime`, `mission_id: int`; `_desbloqueios_derivados(session, user_id) -> dict[CodigoDerivado, DesbloqueioDerivado]` em `service.py`.
  - `ConquistaNoPainel.conquista` e `Recompensa.achievements_unlocked` passam a usar `ConquistaDoPainel`; `UnlockedAchievementRead.da_conquista` aceita `ConquistaDoPainel`.
- Produces (front): chaves `progression.achievement.{first_pass,weekly_trial,comeback}.{title,description}` e os três códigos em `KNOWN_CODES`.

- [ ] **Step 1: Testes da regra pura, falhando.** Em `test_progression_domain.py`, com um dia 0 qualquer e `planejados = {dia0 + i dias}` cobrindo o intervalo:
  - `test_o_painel_tem_dez_codigos_na_ordem`: `[c.codigo.value for c in PAINEL]` = os 7 atuais + `first_pass`, `weekly_trial`, `comeback`; e `CATALOGO` continua com 7 (o teste atual de 7 códigos não muda).
  - `test_volta_com_tres_dias_sem_conclusao_ganha`: conclusões `[d0, d4]`, planejados d0..d4 → `1`.
  - `test_volta_com_dois_dias_sem_conclusao_nao_ganha`: `[d0, d3]` → `None`.
  - `test_volta_com_quatro_dias_ganha`: `[d0, d5]` → `1`.
  - `test_dia_sem_plano_nao_conta_como_dia_sem_conclusao`: `[d0, d4]` com `d2` fora de `planejados` → `None`; com só `d0` e `d4` planejados (semana sem plano no meio) → `None`.
  - `test_sem_conclusao_anterior_nao_ha_volta`: `[d4]` com d0..d3 planejados → `None`; `[]` → `None`.
  - `test_vale_a_primeira_volta`: `[d0, d4, d8]` → `1`; `[d0, d1, d5]` → `2`.
  - `test_duas_conclusoes_no_mesmo_dia_nao_formam_volta`: `[d0, d0]` e `[d0, d4, d4]` → `None` e `1`.
  - `test_conclusao_posterior_nao_muda_a_volta`: `indice_da_volta([d0, d4], p) == indice_da_volta([d0, d4, d4], p)`.
  - `test_conclusoes_fora_de_ordem_sao_recusadas`: `[d4, d0]` → `ValueError`.
- [ ] **Step 2: Rodar e ver falhar.** `uv run pytest tests/unit/test_progression_domain.py -q`.
- [ ] **Step 3: Implementar em `domain.py`** os tipos da seção Interfaces e `indice_da_volta` (varre os pares consecutivos; conta com `sum` sobre os dias do intervalo aberto). Os três `ConquistaDerivada` com texto em português:
  - `first_pass`: "Primeira aprovação" — "Receba da Kairya uma avaliação “atende” numa entrega."
  - `weekly_trial`: "Prova da semana vencida" — "Conclua a sua primeira missão especial."
  - `comeback`: "A volta" — "Conclua uma diária depois de 3 dias ou mais sem nenhuma concluída."
  Não alterar `Codigo`, `CATALOGO`, `conquistas_satisfeitas` nem `FatosDoUsuario`.
- [ ] **Step 4: Testes de serviço, falhando.** Em `test_progression_service.py`, reaproveitando `_plano`, `_diaria`, `_concluir`, `relogio`, `ao_meio_dia`, `_registrar_outro_usuario` e o jeito de `test_evaluation_service.py` de gravar uma avaliação `concluida` com veredito (criar o `MissionEvaluation` direto na sessão, com `state=CONCLUIDA`, `verdict`, `feedback`, `finished_at`):
  - `test_weekly_trial_destrava_na_primeira_especial`: concluir a especial → `ler_progresso` traz `weekly_trial` com `unlocked_at == completed_at` dela; `recompensa_da_missao(especial)` inclui `weekly_trial`; a especial de outra semana concluída depois não repete (`achievements_unlocked` sem `weekly_trial`), e `ler_progresso` mantém o primeiro instante.
  - `test_comeback_com_tres_dias_sem_conclusao`: plano criado na segunda; diária de segunda concluída na segunda; terça, quarta e quinta sem conclusão; diária de sexta concluída na sexta → `comeback` com `unlocked_at` da sexta, anunciado em `recompensa_da_missao` da diária de sexta. Controle: concluir a de quinta em vez da de sexta (2 dias sem) → sem `comeback`.
  - `test_comeback_nao_e_revogado_pela_conclusao_tardia_de_ontem` (**Review Focus 1**): como acima, mas a diária de quinta foi iniciada na quinta (`iniciar_missao`); na sexta às 10 h conclui-se a de sexta (volta ganha); na sexta às 18 h conclui-se a de quinta com atraso. Esperado: `comeback` continua em `ler_progresso` com `unlocked_at` das 10 h, e `recompensa_da_missao` da diária de sexta devolve o mesmo resultado de antes da conclusão tardia.
  - `test_dia_sem_plano_nao_conta_como_dia_sem_conclusao` (**Review Focus 2**, integração): diária concluída numa sexta; a semana seguinte sem plano; plano criado numa quinta e diária de quinta concluída → sem `comeback`.
  - `test_sem_conclusao_anterior_nao_ha_volta`: plano criado na segunda, nada concluído terça a quinta, primeira diária concluída na sexta → sem `comeback`.
  - `test_first_pass_na_primeira_avaliacao_atende`: avaliação `parcial` → sem `first_pass`; avaliação `atende` → `first_pass` com `unlocked_at == finished_at`; `recompensa_do_bonus` dessa missão inclui `first_pass`.
  - `test_derivadas_so_anunciam_a_primeira_vez` (**Review Focus 3**): segunda avaliação `atende` e segunda especial → `recompensa_do_bonus` com `achievements_unlocked == ()` e `recompensa_da_missao` sem `weekly_trial`.
  - `test_derivadas_contam_so_o_usuario` (**Review Focus 3**): especial concluída, avaliação `atende` e diárias de `OUTRO` não destravam nada para `ESTUDANTE`.
  - `test_as_derivadas_nunca_sao_gravadas`: depois dos cenários acima, `user_achievements` não tem linha com `first_pass`, `weekly_trial` nem `comeback`, e concluir a especial não levanta erro de CHECK.
- [ ] **Step 5: Implementar em `service.py`.** `_desbloqueios_derivados` faz uma consulta por regra (R4–R6): avaliação `concluida/atende` mais cedo do usuário (join com `Mission` pelo `user_id`); especial `concluida` mais cedo; diárias `concluidas` do usuário em ordem de `completed_at` e `id`, passadas por `dia_de` a `indice_da_volta` junto dos dias planejados de `carregar_historico` (`dia >= plano_criado_em`). `ler_progresso` percorre `PAINEL` (datas persistidas para `Codigo`, derivadas para `CodigoDerivado`). `recompensa_da_missao` soma `weekly_trial` e `comeback` cujo `mission_id` é o da missão; `recompensa_do_bonus` soma `first_pass` cujo `mission_id` é o da missão. Atualizar o comentário de `registrar_bonus` (E15: nenhum fato do catálogo **persistido** muda com o bônus).
- [ ] **Step 6: Ajustar os testes existentes, com justificativa no handoff.** `test_progression_consistency.py`: as comparações `== list(CATALOGO)` e `[None] * len(CATALOGO)` passam a `PAINEL` (o painel tem 10 itens); `test_progression_api.py`: `_ACHIEVEMENTS_TRAVADOS` sai de `PAINEL`; `test_evaluation_api.py` (linha com `"achievements_unlocked": []`): o corpo do bônus da primeira avaliação `atende` agora traz `first_pass` com `code`, `title` e `description` do catálogo derivado. `test_o_bonus_nao_destrava_conquista` e `test_recompensa_do_bonus_e_o_saldo_daquele_momento` continuam como estão (falam da tabela e de bônus sem avaliação gravada). Os testes de migração e de paridade de esquema não mudam — se algum reprovar, o código errou (R2).
- [ ] **Step 7: Rodar.** `uv run pytest tests/unit/test_progression_domain.py tests/integration/test_progression_service.py tests/integration/test_progression_api.py tests/integration/test_progression_consistency.py tests/integration/test_evaluation_api.py tests/integration/test_evaluation_service.py tests/integration/test_progression_migration.py tests/integration/test_progression_schema_parity.py tests/unit/test_fronteira_dos_modulos.py -q` → passam; `uv run mypy src tests alembic` limpo.
- [ ] **Step 8: Catálogo e leitor do front, falhando.** Em `achievementText.test.ts`: cada código novo devolve o texto do catálogo nos dois idiomas (valores da tabela abaixo), e o código desconhecido continua devolvendo o texto do back. Em `RewardAnnouncement.test.tsx`: uma recompensa com `achievements_unlocked: [{code: 'comeback', ...}]` mostra `Conquista: A volta` (pt-BR) e `Achievement: Comeback` (en). Em `ProgressPanel.test.tsx`: o painel com 10 conquistas, as três novas bloqueadas, mostra `Bloqueada: {descrição}` e a data quando `unlocked_at` vem preenchido.

  | Chave | pt-BR | en |
  |---|---|---|
  | `...first_pass.title` | `Primeira aprovação` | `First Pass` |
  | `...first_pass.description` | `Receba da Kairya uma avaliação “atende” numa entrega.` | `Get a “meets” evaluation from Kairya on a delivery.` |
  | `...weekly_trial.title` | `Prova da semana vencida` | `Weekly Trial Cleared` |
  | `...weekly_trial.description` | `Conclua a sua primeira missão especial.` | `Complete your first special mission.` |
  | `...comeback.title` | `A volta` | `Comeback` |
  | `...comeback.description` | `Conclua uma diária depois de 3 dias ou mais sem nenhuma concluída.` | `Complete a daily after 3 or more days without completing one.` |

  (prefixo das chaves: `progression.achievement.<code>.`)
- [ ] **Step 9: Implementar o front.** Acrescentar os três códigos a `KNOWN_CODES` e as seis chaves aos dois catálogos; atualizar o comentário de `achievementText`. O `gamificationCopy.test.ts` da 5.1 já cobre esses textos.
- [ ] **Step 10: Verificar, handoff e gate.** `cd frontend && npx vitest run src/shared/i18n src/features/progression src/features/missions` passa. Handoff `docs/handoff/AAAA-MM-DD-f5-conquistas.md` (R2–R8, R13, delta de contrato, quais testes existentes mudaram e por quê, pendência: Fase 8 liga a fala da Kairya a `achievements_unlocked`). `make check` verde. Commit `feat(progression): conquistas first_pass, weekly_trial e comeback derivadas na leitura (F5 Tarefa 5.2)`.

---

### Task 5.3: Trilha de lanternas (PR `wt/f5-lanternas`)

**Files:**
- Create: `frontend/src/features/campaigns/{lanterns.ts,lanterns.test.ts,LanternGlyph.tsx,LanternGlyph.test.tsx,LanternTrail.tsx,LanternTrail.test.tsx}`
- Delete: `frontend/src/features/campaigns/{CampaignTrail.tsx,CampaignTrail.test.tsx,availability.ts,availability.test.ts}`
- Modify: `frontend/src/pages/Campaigns.tsx`, `frontend/src/pages/Campaigns.test.tsx`, `frontend/src/shared/ui/designLint.test.ts` (tirar `CampaignTrail.tsx` de `PENDING_MIGRATION`), `frontend/src/shared/ui/tokens/contrastPairs.ts` (se o `tokens.test.ts` exigir os pares novos), `frontend/src/shared/i18n/messages/{pt-BR,en}.ts`, `frontend/tests/e2e/cycle.spec.ts`, `docs/ARCHITECTURE.md` (parágrafos de `campaigns` e da página Campanhas)
- Create: `docs/handoff/AAAA-MM-DD-f5-lanternas.md`

**Interfaces:**
- Consumes: `useCurrentPlan(): { state: CurrentPlanState; reload; refresh }` e os tipos `Plan`, `PlanDay`, `PlanSpecial` (`features/campaigns/types.ts`, inalterados); `Availability` (`shared/types/mission`); `civilWeekday(day, locale)` e `formatCivilDate` (`shared/lib/civilDate`); `Button`, `Panel`, `Skeleton`, `StatusLine` de `shared/ui`.
- Produces:
  - `type LanternState = 'lit' | 'out' | 'future'`; `LANTERN_STATE: Record<Availability, LanternState>` (R11).
  - `interface Lantern { key: string; kind: 'day' | 'special'; state: LanternState; availability: Availability; day: string | null }`; `lanternsOf(plan: Plan): Lantern[]` (7 diárias na ordem da API e a especial por último); `todayIndexOf(plan: Plan): number` (índice do último dia com `mission !== null`, ou `-1`).
  - `LanternGlyph({ state, size }: { state: LanternState; size: 'small' | 'grand' })`: SVG `aria-hidden`, com `data-state`; formas distintas por estado (acesa: contorno e chama preenchidos; apagada: contorno sem chama; futura: contorno tracejado), nunca só cor.
  - `LanternTrail({ onOpenHeadquarters }: { onOpenHeadquarters?: () => void } = {})`: troca direta de `CampaignTrail` na página, com os mesmos `data-testid` de container e estado (`campaign-trail`, `trail-loading`, `trail-error`, `trail-retry`, `trail-no-plan`, `trail-week`, `trail-stale`, `trail-refresh`).
  - `data-testid` novos ou mantidos: `trail-day` (cada diária, com `data-day`, `data-availability`, `data-state`), `trail-today`, `trail-special` (com `data-availability`, `data-state`), `trail-special-progress`, `lantern-status` (o texto visível do estado), `lantern-summary`, `trail-go-headquarters`.

- [ ] **Step 1: Teste da tabela de estados, falhando.** `lanterns.test.ts`: `LANTERN_STATE` com os seis valores de `Availability` e os estados da R11 como literais (percorrer `Object.keys` não basta; listar os seis). `lanternsOf` de um plano de exemplo devolve 8 itens, os sete `kind: 'day'` na ordem e o `special` por último, com `day` nulo na especial. `todayIndexOf`: plano com a quinta como último dia revelado → `3`; nenhum dia revelado → `-1`.
- [ ] **Step 2: Implementar `lanterns.ts`** (funções puras, sem React) e rodar `npx vitest run src/features/campaigns/lanterns.test.ts`.
- [ ] **Step 3: Teste do glifo, falhando.** `LanternGlyph.test.tsx`: para cada estado e cada tamanho, o `svg` existe, tem `aria-hidden="true"` e `data-state`; a chama (`[data-part="flame"]`) só existe no `lit`; o contorno do `future` tem `stroke-dasharray`; o `grand` é maior que o `small` (atributo `width`).
- [ ] **Step 4: Implementar `LanternGlyph.tsx`** com classes de token (`fill-action-primary`, `stroke-text-muted` etc.), sem paleta padrão do Tailwind, sem valor arbitrário, sem animação (o brilho `shadow-glow-lantern`, único efeito permitido, vai no `li` da lanterna acesa). Se o `tokens.test.ts` exigir, registrar os pares glifo/superfície em `contrastPairs.ts` com contraste mínimo de 3:1.
- [ ] **Step 5: Textos.** Em `pt-BR.ts` e `en.ts`, adicionar (e remover depois as chaves do `CampaignTrail` sem uso: conferir cada uma com `grep -rn` antes de apagar, e rodar `catalog.test.ts`):

  | Chave | pt-BR | en |
  |---|---|---|
  | `campaigns.lantern.day.concluida` | `Acesa: diária concluída` | `Lit: daily completed` |
  | `campaigns.lantern.day.perdida` (e `.expirada`) | `Apagada: sem diária neste dia` | `Unlit: no daily this day` |
  | `campaigns.lantern.day.disponivel` | `Pronta: dá tempo hoje` | `Ready: there is time today` |
  | `campaigns.lantern.day.bloqueada` | `Ainda por vir` | `Still ahead` |
  | `campaigns.lantern.day.fora_do_plano` | `Sem plano neste dia` | `No plan this day` |
  | `campaigns.lantern.special.concluida` | `Lanterna grande acesa: especial concluída` | `Great lantern lit: special completed` |
  | `campaigns.lantern.special.disponivel` | `Lanterna grande pronta: a especial está aberta` | `Great lantern ready: the special is open` |
  | `campaigns.lantern.special.bloqueada` | `Lanterna grande: acende com 7 dias seguidos` | `Great lantern: lights after 7 days in a row` |
  | `campaigns.lantern.special.expirada` (e `.perdida`, `.fora_do_plano`) | `Lanterna grande apagada: a especial desta semana passou` | `Great lantern unlit: this week’s special has passed` |
  | `campaigns.lantern.summary` | `{lit} de {total} lanternas acesas nesta semana` | `{lit} of {total} lanterns lit this week` |
  | `campaigns.lantern.title` | `Trilha de lanternas da semana` | `This week’s lantern trail` |

  Reaproveitar `campaigns.trail.title`, `.week`, `.today`, `.loading`, `.loadFailed`, `.unexpectedFailure`, `.retry`, `.noPlan`, `.refreshFailed`, `.refresh`, `.special.progress`, `campaigns.headquarters.go` e `.hint`. Os textos da tabela entram na varredura de `gamificationCopy.test.ts`.
- [ ] **Step 6: Teste do componente, falhando.** `LanternTrail.test.tsx`, no mesmo desenho de mock/fetch do `CampaignTrail.test.tsx` que ele substitui (portar os casos de loading, erro com "Tentar novamente", `no-plan`, `refreshFailed` com "Atualizar" e refresh ao voltar a aba):
  - semana carregada `[concluida, concluida, perdida, concluida, disponivel, bloqueada, bloqueada]` com especial `bloqueada` e progresso 1: 7 `trail-day` com os `data-state` `lit, lit, out, lit, future, future, future`; `lantern-status` com os textos pt-BR exatos da tabela; `trail-today` só no quinto dia, com o texto `Hoje`; `lantern-summary` = `3 de 7 lanternas acesas nesta semana`; `trail-special` com `data-state="future"` e `trail-special-progress` = `Progresso até a especial: 1 de 7`.
  - especial `concluida` → `data-state="lit"` e o texto da lanterna grande acesa; `expirada` → `out`.
  - **Review Focus 5:** plano criado na quarta, com segunda e terça `fora_do_plano` → `data-state="future"`, texto `Sem plano neste dia`, e nenhum `lantern-status` da semana contém `Apagada`; semana sem nenhuma lanterna acesa → `lantern-summary` = `0 de 7 lanternas acesas nesta semana` e nenhuma outra mensagem de falta.
  - Todo `lantern-status` é texto visível (não só `title`/`aria-label`), e o `svg` do glifo continua `aria-hidden`.
  - Em `en`: os mesmos casos com os textos em inglês.
  - Botão: com `onOpenHeadquarters` e alguma lanterna `disponivel`, existe `trail-go-headquarters` como botão `Ir ao Quartel-General` e o clique chama o callback; sem o callback, o mesmo `testid` é um texto (`campaigns.headquarters.hint`); sem lanterna `disponivel`, não existe.
- [ ] **Step 7: Implementar `LanternTrail.tsx`.** Container com os estados de `useCurrentPlan` (`loading`, `error`, `no-plan`, `loaded` com `refreshFailed`), copiados do `CampaignTrail` no que não muda. O corpo carregado é um `<ol>` com uma `<li>` por lanterna (glifo + dia da semana com `civilWeekday` + marcador de hoje + `lantern-status`) e a `lantern-summary` acima dela; a especial, a última `<li>`, com glifo `grand`. Usar `Panel`/`Skeleton`/`StatusLine`/`Button` do `shared/ui` onde o `CampaignTrail` usava markup cru. Sem lista de missões (R10).
- [ ] **Step 8: Trocar na página.** `Campaigns.tsx` importa `LanternTrail`; `Campaigns.test.tsx` acompanha. Apagar os quatro arquivos do `CampaignTrail` e do `availability`, tirar a linha de `PENDING_MIGRATION` e conferir com `grep -rn "CampaignTrail\|AVAILABILITY_DISPLAY" frontend/src docs` que nada sobrou além de históricos de handoff.
- [ ] **Step 9: E2E.** Em `frontend/tests/e2e/cycle.spec.ts` (linhas por volta de 220–350), trocar as asserções do `CampaignTrail`: continuam os 7 `trail-day`, o `trail-today` com `Hoje` e o `trail-special`; o texto de hoje concluído passa a conter `Acesa`, o dos dias futuros `Ainda por vir`, o da especial bloqueada `acende com 7 dias seguidos`, e `trail-special-progress` continua `1 de 7`. Remover as de `trail-chest` e `trail-availability`.
- [ ] **Step 10: Verificar.** `cd frontend && npx vitest run --coverage` → 100% nos quatro eixos, sem arquivo novo abaixo de 100; `npm run typecheck && npm run lint && npm run format:check`.
- [ ] **Step 11: Documentação, handoff e gate.** Atualizar em `docs/ARCHITECTURE.md` os trechos sobre `campaigns` e a página Campanhas (a trilha agora é `LanternTrail`; `AVAILABILITY_DISPLAY` saiu; a fonte continua `GET /api/plans/current`). Handoff `docs/handoff/AAAA-MM-DD-f5-lanternas.md` com R9, R10 e R11 em destaque, a lista do que foi removido, delta de contrato vazio e zero dependência. `make check` (inclui `check-e2e` e a varredura de acessibilidade com axe) verde. Commit `feat(campaigns): trilha de lanternas no lugar do CampaignTrail (F5 Tarefa 5.3)`.

---

## Self-Review

- **Cobertura da spec.** 5.1 (`rank` no `GET /api/progress`, nome pelo catálogo, 9 fronteiras on/off) → Task 5.1. 5.2 (três conquistas, `comeback` com 3 e 2 dias, dia sem plano com teste explícito) → Task 5.2. 5.3 (`LanternTrail` em SVG, quatro estados com texto, sem endpoint novo, substitui `CampaignTrail`) → Task 5.3. A fala da Kairya (item 4 da spec) é da Fase 8 e está fora, com o ganho de `achievements_unlocked` já preparado (R7). As regras de ética entram como teste (`gamificationCopy.test.ts`).
- **Consistência de tipos.** `rank_do_nivel`, `Rank`, `PAINEL`, `CodigoDerivado`, `ConquistaDoPainel`, `DesbloqueioDerivado`, `indice_da_volta`, `LanternState`, `LANTERN_STATE`, `lanternsOf` e `todayIndexOf` têm uma definição na Interfaces da tarefa dona e são usados com a mesma assinatura nas seguintes.
- **Desvio da letra da spec, para decisão do dono.** R9: a trilha lê `GET /api/plans/current`, porque o `GET /api/cycle` não traz o estado dos sete dias. R1: `rank_do_nivel` em vez de `faixa_do_nivel`, por colisão de nome.
