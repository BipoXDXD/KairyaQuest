# Handoff em um arquivo por PR (wt/handoff-fragmentos)

**Objetivo.** Acabar com o conflito de merge no `docs/HANDOFF.md`: com
vários PRs abertos, cada um acrescentava uma seção ao mesmo arquivo, e todo
merge na `main` deixava os outros em conflito.

**Revisão-base.** `6335edb` (main com o #77).

**Decisões.**

- Cada PR escreve o handoff em `docs/handoff/AAAA-MM-DD-<branch>.md`. Só o
  PR de consolidação, numa branch `wt/consolidar-handoff*`, edita o
  `docs/HANDOFF.md`. Regras em `docs/handoff/README.md`.
- Pendência nova usa rótulo provisório `P-<branch>-<n>`; a consolidação
  atribui o número definitivo.
- Recusado: `merge=union` no `.gitattributes` para o `docs/HANDOFF.md`. A
  união concatena em silêncio as linhas em conflito, inclusive versões
  diferentes da mesma linha, e o atributo é lido da branch atual, então nem
  vale igual para todos os merges.
- A regra tem guarda no gate: `scripts/check-handoff.sh`, alvo
  `make check-handoff` (primeiro do `make check`) e job `check-handoff` no
  CI, agregado pelo `quality-gate`. Reprova quando
  `git diff --name-only origin/main...HEAD -- docs/HANDOFF.md` não é vazio.

**Alterações.** `scripts/check-handoff.sh`, `Makefile`,
`.github/workflows/quality.yml`, `docs/handoff/README.md`, `AGENTS.md`,
`README.md`, `CONTINUACAO.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md` e
o teste `tests/integration/test_check_handoff.py`.

**Comandos.** `make check-handoff`; `make check`.

**Pendências.** Os PRs abertos que editam o `docs/HANDOFF.md` precisam
trazer o arquivo da `main` de volta (`git checkout origin/main --
docs/HANDOFF.md`) e mover a própria seção para `docs/handoff/` antes do
próximo merge.
