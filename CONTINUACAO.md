# Retomar o FocusQuest

## Retomada da estabilização em 2026-10-04

Para retomar a manutenção local atual, leia `README.md`,
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
das sessões anteriores. Escrito em 2026-09-26, depois do merge do Incremento D.

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
- **Próximo: Incremento E**, entrega com evidência e avaliação (ferramentas `submit_activity` e
  `request_reward_evaluation`, README §5 e §6). Começar pelo desenho com o dono (perguntas uma por vez, depois a
  spec, depois o plano), sem código antes da aprovação.

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
