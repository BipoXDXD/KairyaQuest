# wt/lote23-check-hooks: `make check-hooks` com regra exata (lote 23) — 2026-11-12

Objetivo: o `scripts/verificar-hooks.sh` só reprovava `INSTALL_PYTHON` inexistente ou
dentro de worktree. Um `pre-commit install` rodado de um worktree **vivo**, do Python do
sistema ou do venv de outro projeto grava um interpretador que existe e fica fora de
`.claude/worktrees/`, e passava despercebido. Agora os três hooks (`pre-commit`,
`pre-merge-commit`, `pre-push`) precisam ter `INSTALL_PYTHON` **exatamente igual** a
`<pai do git-common-dir>/.hooks-venv/bin/python`. Revisão-base: `e3236c6` (main).

## Declarações

- Zero dependência, endpoint, migração ou contrato. Só scripts, testes, Makefile
  (comentário e texto do `help`) e documentação.
- **Nenhum hook real foi lido, tocado, instalado ou desinstalado**, e o
  `instalar-hooks.sh` não foi executado contra o `.git` real: tudo foi medido em
  repositórios git temporários. Depois do merge, rodar `make check-hooks` na máquina
  mostra o estado real; se reprovar, o conserto (`scripts/instalar-hooks.sh`) exige a
  autorização do responsável.

## Decisões

- **Um só cálculo do caminho**: `scripts/hooks-venv-lib.sh` (só `source`, sem bit de
  execução) define `hooks_git_comum`, `hooks_venv_dir` e `hooks_venv_python`. O
  instalador e o verificador a carregam, então o que um grava é o que o outro exige.
  O teste copia a biblioteca junto dos dois scripts para o repositório temporário.
- **Mensagem**: `hook X aponta para Y; esperado Z; a causa provavel e 'pre-commit
  install' rodado a mao`, mais `conserto: scripts/instalar-hooks.sh ... que precisa da
  autorizacao do responsavel`. ASCII, como o resto dos scripts. Quando o valor errado
  fica dentro de um worktree, a mensagem acrescenta o motivo (remover o worktree
  quebra o hook de todos).
- Valor igual ao esperado mas inexistente/não executável continua reprovando (mensagem
  própria): sem o venv, o hook cairia no `pre-commit` do PATH.

## Testes (`tests/integration/test_instalar_hooks.py`)

Novos: `pre-commit install` simulado de um worktree que existe (reescrevendo o
`INSTALL_PYTHON` dos hooks instalados de verdade pelo instalador), Python existente fora
de worktrees mas diferente (parametrizado nos três hooks), Python do sistema,
`.hooks-venv` de outro repositório, esperado inexistente. Os casos antigos continuam,
com o Python correto agora sendo o do `.hooks-venv`.

## Pendências

- **`docs/HANDOFF.md` não foi editado** (o `check-handoff` recusa fora de
  `wt/consolidar-handoff*`). Na próxima consolidação:
  - a linha da tabela de Comandos de `make check-hooks` ("Conferir que os hooks apontam
    para um Python existente fora de `.claude/worktrees`") deve virar "o
    `INSTALL_PYTHON` dos três hooks é exatamente `<principal>/.hooks-venv/bin/python`";
  - a linha da tabela de Comandos que mandava `uv run pre-commit install
    --install-hooks` (pendência `P-hooks-venv-1` do lote 20) já aparece como
    `scripts/instalar-hooks.sh` no `HANDOFF.md` da `main` em `e3236c6`; se alguma
    cópia ainda trouxer a forma antiga, ela deve virar `scripts/instalar-hooks.sh`.
- `make check-hooks` continua fora do `make check` e não roda a cada commit
  (`P-hooks-venv-2`): quem rodar `pre-commit install` à mão reaponta os hooks sem aviso
  até alguém rodar o check.
- Textos vivos revisados com `git grep` (`pre-commit install`, `install-hooks`): os que
  mandam instalar já apontam para o script (`AGENTS.md`, `docs/QUALITY.md`,
  `scripts/novo-worktree.sh`); ficaram só o histórico (`docs/superpowers/specs/...`,
  `docs/handoff/2026-11-12-hooks-fora-do-worktree.md`) e o `HANDOFF.md`.
