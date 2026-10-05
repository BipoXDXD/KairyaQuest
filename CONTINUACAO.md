# Retomar o FocusQuest

## Continuação corrente — redesign desktop de estudos

Base main `52d7fbf` (PR #29 integrado); branch `feat/desktop-medieval` no
worktree existente da composição. Redesign autorizado: cenários medievais,
Tifa no visual clássico, navegação e superfícies refinadas para desktop,
conquistas em disclosure com nível/XP sempre visíveis. Mobile e os contratos
existentes foram preservados. Esta fatia permanece no redesign de estudos;
não altera os fluxos de criação de missões.

Revisão visual técnica e gate completo fresco aprovados: 1500 Python,
1002 frontend e 66 E2E, cobertura 100%. Os hooks,
commit assinado, push de uma ref, PR, CI e merge com base atualizada têm sua
própria evidência no ledger `.superpowers/sdd/desktop-medieval/` conforme
executados. Não usar aprovação de outra revisão para publicar esta. Ler
[docs/HANDOFF.md](docs/HANDOFF.md) e [docs/ART.md](docs/ART.md) antes de continuar.
A correção de worktrees e sua história foram preservadas abaixo.

## Histórico — publicação concluída e prevenção de novas pastas irmãs

Revisão-base deste incremento: main `769e02d` (PR #25), com os PRs #7–#28 mesclados e
nenhum PR aberto na conclusão da publicação. Não repetir essas fases.
O gate executado nessa main aprovou 1477 testes Python, 1001 frontend e
63 E2E, cobertura 100%; cinco jobs aprovados no
[CI da main](https://github.com/BipoXDXD/FocusQuest/actions/runs/37273721725).
Evidência local: `.superpowers/sdd/2026-10-05-publicacao-final/final-result.json`.

A continuação corrige o destino de `scripts/novo-worktree.sh` para
`.claude/worktrees/<nome>` no principal e centraliza somente o scratch
`sdd` dos novos worktrees. Os 24 worktrees já organizados e os cinco
snapshots antigos com alterações permanecem preservados. A validação desta
correção é própria; os números da main acima não a aprovam.

Manter quatro auxiliares GPT 6.1 Sol High; preferência do responsável para
a coordenação: GPT 6 Astra Medium, sem presumir a seleção efetiva a partir
deste arquivo. Commit, push de uma ref, PR e merge foram autorizados nesta etapa; merge
exige testes reforçados, gate completo e CI verde com base atualizada.
Gastos e decisões críticas continuam fora dessa autorização.
Leia o estado corrente de [docs/HANDOFF.md](docs/HANDOFF.md); os relatos
abaixo são históricos e não reabrem fases já concluídas.

## Histórico — fotografia da composição #7–#24

Fotografia: 2026-10-05T01:46:22-03:00. Branch `wt/composicao-autonoma` sobre main `5ba81c3`.
As PRs #7–#24 estão publicadas; cada gate isolado tem cobertura 100% e cada
push/PR tem cinco jobs verdes nos heads indicados no estado corrente de
[docs/HANDOFF.md](docs/HANDOFF.md). Nenhum merge foi realizado.
A combinação está preparada e aguarda seu próprio gate, hooks, publicação e
CI: não atribuir os resultados isolados ao conjunto. Baseline limpo desta
árvore aprovado: 1436 Python, 990 frontend, 59 E2E e cobertura 100%.

Não repetir fases ou mutações já encerradas. Confrontar o head, os logs e o
ledger `.superpowers/sdd/2026-10-05-composicao-fases/` antes de continuar.
Manter cinco agentes GPT 6.1 Sol High, um implementador por árvore, banco e
portas próprios; nunca concorrência de API/E2E no mesmo banco. O dono autorizou
commit assinado, push de uma ref e PR após gate completo 100%, com hooks;
merge, gastos, credenciais e mudanças de contratos/custo/timeout aguardam o dono.

Os registros de #20 abaixo preservam a fotografia histórica de 00:39:33.
As pendências atuais e limites parciais 97/100/104/160/161/163 estão no topo do
handoff, inclusive S-M6 sem definição recuperada. Rodin não foi executado nem
houve nova chamada paga. Histórico de pausa não significa pausa vigente.

## Histórico — checkpoint autônomo de 2026-10-05

Snapshot: 2026-10-05T00:39:33-03:00 (`America/Sao_Paulo`); atualizações posteriores
ficam nos ledgers por fase e no próximo checkpoint.

A pausa está encerrada. A main consultada permanece em `5ba81c3` (PR #6);
as fases autônomas estão publicadas nas PRs #7–17, com heads, bases, gates e
CI no topo de [docs/HANDOFF.md](docs/HANDOFF.md). As features ainda não foram
mescladas. Não repetir implementações, mutações ou pushes já concluídos;
confrontar o head e seu ledger antes de continuar. Esta atualização documental
parte do PR #8 (`009d9f7`) e sua PR usa base `docs/estado-pos-pr6`.

O dono autorizou decisões não críticas e commit assinado, push de uma ref e PR
por fase aprovada, sempre com hooks ativos, make check completo e cobertura de
100%. Merge, decisões críticas e gastos permanecem pendentes. Preservar cinco
agentes GPT 6.1 Sol, esforço High, um implementador por worktree e recursos
isolados. Os gates de cada feature não aprovam a combinação entre elas.

Context7 e Dometrain responderam nesta sessão; Rodin apenas expõe ferramentas,
sem execução funcional confirmada ou geração paga. Gate, revisão e publicação
próprios deste checkpoint ficam registrados em
`.superpowers/sdd/2026-10-05-checkpoint-autonomo/progress.md`. Os blocos abaixo
preservam a história, incluindo pausas já encerradas e ordens antigas.

## Histórico da publicação do PR #7 e da primeira continuação autônoma

O PR #6 foi integrado na `main` em `5ba81c3`, preservando E/F/G e as vinte
fatias de estabilização. A prova da pendência 167 está no commit assinado
`0cb4cc2`, branch `wt/tifa-conclusao`, no [PR #7](https://github.com/BipoXDXD/FocusQuest/pull/7);
a `main` consultada ainda não contém esse teste. O gate desta retomada da Tifa
passou: 1438 Python, 990 frontend, 59 E2E e cobertura de 100%.
Leia o topo de `docs/HANDOFF.md` e `docs/RETOMADA-2026-10-04.md` para o estado
corrente e os ledgers das fases. Não repetir a estabilização nem reaplicar E/F/G.

Durante sua ausência, o dono autorizou decisões não críticas e commit, push e
PR por fase, com gate completo e cobertura de 100%. Merge e decisões críticas
ficam pendentes. Usar cinco agentes GPT 6.1 Sol, esforço High, com tarefas
separadas. Preservar alterações, worktrees e checkpoints; os resultados de
outra branch não aprovam a revisão que será publicada.


## Histórico da retomada da estabilização em 2026-10-04

Naquela retomada, o roteiro era ler `README.md`,
`docs/ARCHITECTURE.md`, `docs/HANDOFF.md` e `docs/QUALITY.md`, nessa ordem,
e depois **`docs/RETOMADA-2026-10-04.md`**. Os deltas 18 e 19 já foram
integrados após revisão independente; gate conjunto aprovado (821 Python,
550 frontend, 47 E2E, 100%) e wheel/smoke aprovado, OpenAPI idêntico.
O checkpoint novo usa `evidence/retomada-20261004/` dentro dos registros
de estabilização; seus manifestos registram o gate e a recuperação finais.
O topo do HANDOFF descreve o estado corrente; o roteiro
também preserva a falha e os patches isolados da pausa como histórico.
Há trabalho não commitado; não recrie o ambiente nem descarte os worktrees.
Preferência atual: agentes GPT-6.1 High, concorrência conforme o limite da
nova sessão. O resumo histórico abaixo não define a preferência atual.

## Resumo histórico de 2026-09-26

Resumo para retomar o projeto num clone novo (por exemplo, em outra máquina), com um agente que não tem a memória
das sessões anteriores. Escrito em 2026-09-26, depois do merge do Incremento D; estado atualizado em 2026-09-28, com o Incremento E implementado.

**Este arquivo é um ponto de partida, não a fonte de verdade.** Se algo aqui divergir do repositório, valem o
`AGENTS.md` e o `docs/HANDOFF.md`.

## O projeto

FocusQuest: plataforma de estudos gamificada, com a tutora Tifa. Backend em Python/FastAPI/PostgreSQL; frontend em
React/TypeScript/Tailwind. A `main` é protegida: o merge é por PR, com o `quality-gate` verde.

**Antes de agir, leia:** `AGENTS.md` e depois `README.md`, `docs/ARCHITECTURE.md`,
`docs/HANDOFF.md` e `docs/QUALITY.md`, nessa ordem. Veja também a revisão-base,
o próximo incremento e a lista de pendências no HANDOFF.

## Primeiro uso num clone novo

Os comandos estão em `docs/QUALITY.md`, "Primeiro uso após clonar":

```bash
make bootstrap
uv run pre-commit install --install-hooks   # sem isto o gate NAO roda nos commits, e nada avisa
cp .env.example .env
make db-up
make migrate-test
make check
```

Não vêm no clone, de propósito:
- **O `.env`**, que é ignorado pelo git; recrie a partir do `.env.example`.
- **A chave da Anthropic**, que mora no Keychain do macOS e nunca no `.env`. Ela só é necessária para a Tifa real,
  porque os testes usam um servidor falso.
- **Os registros de trabalho dos agentes** (`.superpowers/`, ignorado pelo git). O que importa deles está no
  `docs/HANDOFF.md` e no histórico do git.

## Estado

- **Entregues e mesclados:**
  - os Incrementos 1a, A, 1b, B (ciclo diário), C (campanha/trilha) e D (progressão de RPG: saldo de XP em
    livro-razão, nível 100·n, 7 conquistas, painel no Quartel-General);
  - a "Frente 0" (gate paralelo por worktree) e uma onda de correções da revisão do repositório;
  - 17 PRs até o Incremento D (o do D é o #17); este arquivo entrou num PR seguinte. CI da `main` verde.
- **Incremento E: vai à `main` pelo PR #2** (`feat/incremento-e` -> `main`), com commit, push, PR e merge
  autorizados pelo dono em 2026-09-28. Entrega com evidência e avaliação da Tifa
  (`submit_activity` como conclusão com evidência; `POST /api/missions/{id}/evaluation`; bônus de metade do XP só no
  veredito `atende`; migração `0005`; módulo `evaluation`; E2E). Vive na branch `feat/incremento-e`, aberta a partir
  de `fe37820`; o gate passou no código final (`docs/HANDOFF.md`, "Resultados"). **Nenhuma dependência nova.**
- **O remoto foi recriado** (`BipoXDXD/FocusQuest`, privado), com a proteção da `main` reaplicada (`quality-gate`
  obrigatório, `enforce_admins`, sem force-push). A numeração dos PRs recomeçou em #1: os "PR #4" a "#18" dos
  documentos são do repositório antigo (pendência 98). O PR #1, de documentação ("retomada no clone movido e
  correções pós-incremento D"), vai à `main` junto com o #2, porque a branch do E parte dele (`fe37820`).

## Próximos passos

1. Conferir que o PR #2 foi mesclado com o `quality-gate` verde e que o CI da `main` ficou verde. Empurrar sempre
   **uma ref por vez** (`docs/QUALITY.md` §6).
2. O dono faz, uma vez, a **chamada real da avaliação** (pendência 91): a chave vem do Keychain, só para o processo da
   API. Sem ela, não se sabe se o modelo chama `record_evaluation` com `tool_choice: auto` e o esquema `strict`.
3. Ler a lista de pendências do `docs/HANDOFF.md` (90 a 108 são do E) e escolher o próximo incremento com o dono
   (README §14), começando pelo desenho, sem código antes da aprovação.

## Regras que não se negociam (AGENTS.md)

- `make check` verde antes de todo commit (o hook roda). Proibido `--no-verify`, `SKIP`, `|| true`, teste ignorado e
  limiar reduzido.
- Cobertura de 100% no backend e no frontend. Todo teste novo é visto reprovando (RED) e por mutação.
- Nunca afirmar "testado" sem ter rodado. Afirmação falsa em documentação é defeito grave.
- Commit, push, PR e merge só com autorização do dono.
- Comentários do código em português sem acento; interface em pt-BR com acento; contratos (JSON, rotas, colunas)
  em inglês.
- Responder sempre em português do Brasil.

## Como o dono gosta de trabalhar

- **Por subagentes** (superpowers: subagent-driven-development): um implementador e um revisor por tarefa, e uma
  revisão final da branch.
- **Paralelismo** de até cerca de 4 agentes, cada um no próprio worktree, criado com
  `scripts/novo-worktree.sh <nome> [deslocamento]` (banco `focusquest_<nome>_test` e portas do E2E próprios).
- **Modelos:** revisores no Sonnet; correções no agente `opus-medium`; revisão final no Opus.
- **Decisões:** cada decisão tomada pelo agente vai para um ledger (com motivo e custo) e depois para o HANDOFF.

## Cuidados aprendidos

- Nunca rode `make db-up` fora do checkout principal: ele recria o container e derruba os gates dos outros worktrees.
- Dois processos com testes de integração no MESMO banco colidem, porque a fixture faz `DROP SCHEMA`. O revisor só
  roda teste que não usa banco, ou no próprio worktree.
- Não use o Haiku como implementador (uma vez ele sobrescreveu um plano aprovado). O revisor confere o conteúdo de
  todo documento aprovado que for comitado.
- Para desfazer uma mutação, use backup + diff, nunca `git checkout -- arquivo`.
- Ao despachar um agente, diga o caminho absoluto do worktree dele, porque ele herda o diretório de quem o chamou.
- Se o clone mudou de pasta, refaça `.venv` e hooks antes de tudo (`rm -rf .venv`, `uv sync --locked`,
  `uv run pre-commit install --install-hooks`): os dois guardam o caminho antigo (`docs/QUALITY.md` §6).
