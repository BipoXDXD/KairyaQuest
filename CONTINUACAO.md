# Retomar o FocusQuest

Resumo para retomar o projeto num clone novo (por exemplo, em outra máquina), com um agente que não tem a memória
das sessões anteriores. Escrito em 2026-09-26, depois do merge do Incremento D; estado atualizado em 2026-09-28, com o Incremento E implementado.

**Este arquivo é um ponto de partida, não a fonte de verdade.** Se algo aqui divergir do repositório, valem o
`AGENTS.md` e o `docs/HANDOFF.md`.

## O projeto

FocusQuest: plataforma de estudos gamificada, com a tutora Tifa. Backend em Python/FastAPI/PostgreSQL; frontend em
React/TypeScript/Tailwind. A `main` é protegida: o merge é por PR, com o `quality-gate` verde.

**Antes de agir, leia:** `AGENTS.md` (regras), `docs/HANDOFF.md` (seções "Revisão-base" e "Próximo incremento", e a
lista de Pendências), `docs/ARCHITECTURE.md` e `docs/QUALITY.md`.

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
