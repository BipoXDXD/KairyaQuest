# wt/hooks-venv: hooks de git com Python fora de qualquer worktree (lote 20) — 2026-11-12

Objetivo: cada `pre-commit install --install-hooks` rodado num worktree reescrevia os
hooks do `.git` comum com `INSTALL_PYTHON` apontando para o `.venv` **daquele**
worktree; remover o worktree quebrava os hooks de todos (falha fechada: `pre-commit not
found`, todo commit e push bloqueado). Os hooks reais, ao abrir o lote, apontavam para
`.claude/worktrees/worktree-offset/.venv`. Revisão-base: `072c5d0` (main).

## Declarações

- Zero dependência nova no produto, zero endpoint, zero migração, zero contrato. Só
  scripts, testes, Makefile (um alvo) e documentação.
- Nenhum teste pulado, limiar de cobertura intacto. **Nenhum hook real foi lido, tocado,
  instalado ou desinstalado, e nenhum script novo foi executado contra o `.git` real**:
  tudo foi medido em repositórios git temporários. A reinstalação real fica para a
  sessão coordenadora, depois da aprovação do PR (abaixo).

## Decisão: venv dedicado com `uv`, ao lado do repositório comum

Opção escolhida: **`<pai do git-common-dir>/.hooks-venv`**, gitignored, criado e
atualizado por `scripts/instalar-hooks.sh`.

| Opção | Prós | Contras |
|---|---|---|
| **`.hooks-venv` ao lado do `.git` comum** (escolhida) | Sem sudo; versão do `pre-commit` e dependências vêm do `uv.lock` do projeto (`uv export --locked` + constraints), a mesma do `pyproject.toml`; vive junto do repositório, então some com ele e não com um worktree; `uv` já é pré-requisito do projeto | Mais um diretório a conhecer; o caminho absoluto fica gravado (mover o clone exige reinstalar, como o `.venv` já exigia) |
| `pre-commit` como ferramenta do usuário (`uv tool install` / `pipx`) | Nada dentro do repositório | A versão sai do lock: `uv tool install pre-commit==X` é uma segunda fonte da versão, que apodrece; dependências não travadas; estado global da máquina, fora do repositório e invisível a quem o clona |
| Reapontar para o `.venv` do principal | Zero ambiente novo | O principal é um dos worktrees do `uv sync`, rebuilds e `rm -rf .venv` o derrubam; continua acoplando os hooks ao ciclo de vida de um checkout |

Bottom line: o venv dedicado, porque mantém **uma só fonte da versão** (o lock) e ligado
ao ciclo de vida do repositório, não de um worktree. Custo: um diretório a mais e o
caminho absoluto gravado.

## Alterações

- `scripts/instalar-hooks.sh` (novo): recusa se o venv cairia em `.claude/worktrees/` ou
  sem `uv`; pega a trava `<git-common-dir>/instalar-hooks.lock` (`mkdir`, como o
  `novo-worktree.sh`); lê o pin do `pre-commit` em `uv export --locked --no-emit-project
  --no-hashes` e usa o export inteiro como `--constraint`; cria o venv **só se faltar ou
  estiver quebrado** (um venv saudável não é recriado: há hooks em uso por outras
  sessões); `uv pip install` da versão travada (no-op se já está); `python -m pre_commit
  install --install-hooks` a partir do worktree de onde roda; termina rodando o verificador.
  Compatível com bash 3.2 (testado com `/bin/bash`).
- `scripts/verificar-hooks.sh` (novo) e `make check-hooks` (novo alvo, **fora** do `check`
  — o estado dos hooks é da máquina e o CI não tem hooks): reprova hook ausente, sem
  `INSTALL_PYTHON`, apontando para `.claude/worktrees/` ou para qualquer worktree
  registrado que não seja o principal, ou para Python inexistente. Só lê.
- `scripts/novo-worktree.sh`: comentário e mensagem final agora mandam usar
  `scripts/instalar-hooks.sh` (uma vez por clone) e dizem para **não** rodar
  `pre-commit install` no worktree (ele nunca rodou; a mensagem só deixa explícito).
- `.gitignore`: `.hooks-venv/`.
- `AGENTS.md` §1 e §4, `docs/QUALITY.md` (Primeiro uso, §2, §6): procedimento novo,
  explicação do problema, e o arbitro "nenhum alvo invoca `pre-commit`" agora cita a
  exceção (o instalador, que **nenhum alvo chama**).
- `tests/integration/test_instalar_hooks.py` (novo, 22 testes) e +1 em
  `test_novo_worktree.py`.

## O gate continua rodando no worktree do commit (conferido)

Os hooks locais são `entry: make check` (`language: system`) e `scripts/check-push.sh`;
o hook gerado usa `--config=.pre-commit-config.yaml` (relativo) e roda no cwd do git.
Medido com `uv` real num repositório temporário: num worktree em `.claude/worktrees/w2`
o `make check` do hook imprimiu o cwd **do worktree**, `VIRTUAL_ENV` vazio e nenhum
`pre-commit` no `PATH`. O venv dos hooks só sobe o próprio `pre-commit`; o `.venv` do
projeto (`uv run`) continua por worktree.

## Testes (TDD: vistos falhar antes)

Primeiro vermelho: os 22 testes falharam com `FileNotFoundError` (scripts ausentes);
depois dos scripts, passaram. O `uv` do PATH é falso (sem rede); o `venv` dele cria um
venv de verdade com a stdlib ligado por `.pth` ao site-packages do ambiente de teste,
então o `pre_commit install` é o **real** e o `INSTALL_PYTHON` gravado é o
`sys.executable` de um venv de verdade. Cobertura do instalador: três hooks apontando
para o venv dedicado; rodado de dentro de um worktree o Python continua fora de
worktrees; remover o worktree não quebra os hooks; idempotência (hooks idênticos, venv
não recriado); versão travada + constraints; recria venv quebrado; recusas (sem `uv`, sem
pin no lock, caminho em `.claude/worktrees/`, trava ocupada); trava liberada; propaga a
recusa do `pre-commit` (`core.hooksPath`). Cobertura do verificador: aprova Python fora
de worktrees; reprova (um caso por hook) dentro de `.claude/worktrees/`; worktree fora de
`.claude`; hook ausente; Python inexistente; hook sem `INSTALL_PYTHON`; caminho aspado
com espaço; rodado de dentro de um worktree.

Sabotagens (cada uma reprovou o teste esperado e foi desfeita):

1. verificador sem o casamento com `.claude/worktrees` e worktrees registrados →
   `test_verificador_reprova_python_dentro_de_claude_worktrees[pre-commit]`;
2. venv em `${ROOT}/.hooks-venv` (dentro do worktree) →
   `test_rodado_de_dentro_de_um_worktree_o_python_continua_fora_de_worktrees`;
3. venv recriado sempre → `test_e_idempotente`;
4. `novo-worktree.sh` sem o aviso → `test_nao_instala_hooks_e_aponta_para_o_script_unico`.

Também medido: `instalar-hooks.sh` com `uv` e `pre-commit` reais num repositório
temporário (venv criado com Python 3.14.10, `pre-commit 4.6.2`, hooks apontando para
`<repo>/.hooks-venv/bin/python`, verificador aprovando **depois** de remover o worktree
de onde rodou, segunda execução idempotente).

## Resultado do gate

`make check` (sob a trava do offset 9, worktree `hooks-venv`): **EXIT=0** — frontend
129 arquivos / 2677 testes, Ruff, mypy estrito, pytest 2224 passed (com os 23 novos) e
cobertura em 100%, E2E 194 passed, Gitleaks, check-handoff e check-wheel aprovados.

## Reinstalação real (para a sessão coordenadora, depois da aprovação do PR)

Depois do merge, de um worktree com `make bootstrap` feito e **atualizado na `main`**
(o script usa o `uv.lock` do worktree de onde roda):

```bash
scripts/instalar-hooks.sh && make check-hooks
```

Isto troca o `INSTALL_PYTHON` dos três hooks reais para `<principal>/.hooks-venv/bin/python`.
Os hooks continuam usando o `.venv` do worktree-offset até lá, então esse worktree não
pode ser removido antes.

## Pendências e riscos

- **`docs/HANDOFF.md` não foi editado** (o `check-handoff` recusa): a linha 1077 (tabela de
  Comandos) ainda lista `uv run pre-commit install --install-hooks`, e a linha do
  `novo-worktree.sh` diz "nem instalação de hooks". A consolidação deve trocá-las por
  `scripts/instalar-hooks.sh` (uma vez por clone) e acrescentar `make check-hooks`.
  Rótulo: `P-hooks-venv-1`.
- **`make check-hooks` não roda a cada commit**: só no fim do instalador e quando alguém o
  chama. Quem rodar `pre-commit install` à mão de novo reaponta os hooks sem aviso
  (`P-hooks-venv-2`; mitigação possível: chamá-lo no `check-push.sh`, não feito por não
  ser pedido e por mexer no gate do push).
- Um `uv.lock` defasado no worktree de onde se roda o instalador faz `uv export --locked`
  falhar (mensagem pede `uv lock --check`); rodar de um worktree em dia resolve.
- O instalador não valida a versão do Python do venv contra o `requires-python`; o `uv`
  escolhe pelo `.python-version` do worktree de onde roda. Se o Python gerenciado pelo
  `uv` for removido, o venv quebra e o próximo `instalar-hooks.sh` o recria.
- O `.hooks-venv` guarda o caminho absoluto: mover o clone exige `scripts/instalar-hooks.sh`
  de novo (documentado em `docs/QUALITY.md` §6).
