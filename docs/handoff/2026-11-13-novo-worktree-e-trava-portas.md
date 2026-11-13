# novo-worktree.sh: lógica da origin/main, desfazer no bootstrap e trava de portas dos testes

**Objetivo.** Resolver as issues #194, #196 e #169: o `scripts/novo-worktree.sh`
roda só com a lógica da `origin/main` e não deixa registro órfão quando o
`make bootstrap` falha; a fixture dos testes libera a trava da janela de portas
também quando a construção falha; os limites da limpeza ficam documentados.

**Revisão-base.** `origin/main` em `0067e2f`.

**Decisões e porquê.**

- **Conferência da própria cópia depois do fetch** (#194). O script compara o
  conteúdo de `scripts/novo-worktree.sh` e `scripts/push-env.sh` do checkout que
  roda com os da `origin/main` e recusa, sem criar nada, se divergirem ou
  faltarem. Conteúdo, e não commit: chamar de uma branch antiga com a cópia
  igual continua funcionando. Fica depois do fetch porque antes não há
  `origin/main` confiável.
- **Desfazer só na falha do `make bootstrap`, e sem apagar trabalho** (#194).
  `git worktree remove` sem `--force` (recusa se houver não rastreado ou
  alteração), `git branch -D` só se o worktree saiu, `rmdir` no ledger (só
  vazio). O que não sai fica, com os comandos na mensagem. Opção conservadora:
  as falhas anteriores ao ledger (`.env` existente, `.env` não escrito, scratch
  trazido pelo checkout) continuam mantendo o worktree, porque num deles há
  dados que o script não escreveu.
- **Sem detecção de trava órfã pelo PID** (#169). PID reutilizado faria o
  script apagar a trava de uma execução viva; a mensagem atual já diz como
  apagar. Os limites (SIGKILL, Ctrl-C no bootstrap, ignorados de terceiros)
  estão no `docs/QUALITY.md` §6.
- **Fixture** (#196). A construção do `Repositorio` depois da reserva roda num
  `try` que fecha a trava em qualquer exceção. A mensagem de esgotamento passou
  a dizer quantas janelas foram tentadas e onde estão as travas.

**Alterações.**

- `scripts/novo-worktree.sh`: conferência da própria cópia contra a
  `origin/main`; função `desfazer_apos_bootstrap`; cabeçalho atualizado.
- `tests/integration/test_novo_worktree.py`: o script e a biblioteca entram
  versionados no repositório temporário; `make` falso que pode falhar
  (`falhar_o_bootstrap`); testes novos para branch antiga, cópia divergente
  (dos dois arquivos), script ausente na `origin/main`, desfazer no bootstrap,
  preservação de trabalho, teardown, falha na construção e esgotamento das
  janelas; construção do `Repositorio` protegida.
- `docs/QUALITY.md` §6: lógica da `origin/main`, o que é desfeito em cada falha
  e os limites.

**Comandos.**

```bash
uv run pytest tests/integration/test_novo_worktree.py -q --no-cov
uv run ruff check tests/integration/test_novo_worktree.py
uv run mypy tests/integration/test_novo_worktree.py
make check   # pelo hook do commit
```

**Resultados.** Os testes novos foram vistos reprovando antes da correção
(7 vermelhos: cópia divergente ×2, script ausente, desfazer ×2, falha na
construção, mensagem de esgotamento). O do teardown já passava; foi visto
reprovando com `liberar_portas` sabotado (no-op). Depois da correção, o arquivo
inteiro passa. O resultado do `make check` está no PR.

**Pendências.** Nenhuma nova. Os limites de limpeza documentados (SIGKILL,
Ctrl-C no bootstrap, ignorados de terceiros) continuam sem automação, por
decisão registrada acima.
