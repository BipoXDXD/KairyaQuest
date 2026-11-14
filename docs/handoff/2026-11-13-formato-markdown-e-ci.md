# Markdown fora do gate de formato e rótulos internos nas notas

## Objetivo
Resolver #170 (Markdown de `docs/` sem verificação de formato) e #175
(numeração interna de trabalho em notas de handoff, scripts e testes), itens
da guarda-chuva #206.

Revisão-base: `f25b930` (origin/main).

## Decisões e porquê
- **#170, opção (b):** Markdown fica declarado fora do gate de formato, no
  `docs/QUALITY.md` §6. Medido com o Prettier que o front já usa: a maioria
  dos `.md` versionados (`docs/**/*.md`, `README.md`, `AGENTS.md`) reprova no
  `prettier --check`, e o `--write` mexe em mais de mil linhas, a maior parte
  em realinhar tabelas (números no `docs/QUALITY.md`). O maior deles é o
  `docs/HANDOFF.md`, que só muda na consolidação. A opção (a) exigiria
  reformatar tudo de uma vez, inclusive o `HANDOFF.md`, ou nascer com
  exceção. A (b) é só documentação: nada muda no gate e é reversível com um
  alvo novo no `Makefile` e depois um job (paridade do `AGENTS.md`), passos
  escritos no mesmo item.
- **#175:** os títulos das notas trocaram a numeração interna e o nome da
  branch de trabalho pela descrição da nota com o número do PR; nos
  comentários de `scripts/` e `tests/`, a numeração virou o PR correspondente
  (#143, #146, #149, #155). O conteúdo técnico não mudou. A nota de
  isolamento de 2026-11-12 manteve o nome do arquivo: o `docs/HANDOFF.md`
  aponta para ela e só muda na consolidação.
- O ajuste do passo do Chromium no CI (#192), que nasceu junto destas
  mudanças, foi mesclado no PR #212.

## Alterações
- `docs/QUALITY.md` §6: item sobre Markdown fora do gate.
- 12 notas em `docs/handoff/` (só a linha de título, e mais uma linha em duas).
- Comentários e docstrings em `scripts/instalar-hooks.sh`,
  `scripts/verificar-hooks.sh`, `tests/integration/test_instalar_hooks.py` e
  `tests/integration/test_novo_worktree.py`. O `scripts/novo-worktree.sh` já
  chegou limpo da `main`.

## Comandos
- O `git grep` do critério da #175 (o padrão está na issue), com `-P` porque
  o ERE do `git grep` não reconhece `\b`, sobre `docs/handoff`, `scripts` e
  `tests`.
- Medição do #170: `prettier --list-different` do `frontend/` sobre os `.md`
  versionados, e `--write` numa cópia fora do repositório para contar as
  linhas.

## Resultados
- `git grep` do critério: nenhuma ocorrência.
- O resultado do `make check` está no PR (rodado pelo hook do commit).

## Pendências
- `docs/QUALITY.md` e `docs/HANDOFF.md` ainda usam a numeração interna (fora
  do critério da #175; o `HANDOFF.md` só muda na consolidação).
- Avaliar, na próxima consolidação, se as notas já absorvidas pelo
  `docs/HANDOFF.md` podem ser removidas (proposta da #175).
- Várias notas mais antigas ainda têm o nome da branch de trabalho no título;
  fora do critério da #175.
