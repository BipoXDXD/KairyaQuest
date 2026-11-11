# Handoff por PR

Cada PR registra o próprio handoff num arquivo novo nesta pasta, em vez de
editar `docs/HANDOFF.md`. Dois PRs nunca tocam o mesmo arquivo, então o
registro deixa de gerar conflito de merge a cada PR que entra na `main`.

- Nome: `AAAA-MM-DD-<branch-sem-o-prefixo-wt>.md`, por exemplo
  `2026-11-10-f3-tutoring.md`.
- Conteúdo: o mesmo que uma seção do `docs/HANDOFF.md` (objetivo,
  revisão-base, decisões, alterações, comandos, resultados e pendências), sem
  segredos e sem caminhos pessoais.
- Pendência nova recebe um rótulo provisório `P-<branch>-<n>`, por exemplo
  `P-f3-tutoring-1`, porque dois PRs em paralelo não sabem qual é o próximo
  número. A consolidação troca o rótulo pelo número definitivo.
- Um PR que resolve uma pendência do `docs/HANDOFF.md` diz isso no seu
  arquivo, citando o número. A consolidação a risca lá.
- O gate garante a regra: `make check-handoff` (job `check-handoff` do CI)
  reprova a branch cujo diff contra a `main` toca `docs/HANDOFF.md`.
- Consolidação: um PR próprio, só de documentação, numa branch
  `wt/consolidar-handoff-<data>` (a única que o `check-handoff` libera).
- O nome da branch vem de `FQ_HANDOFF_BRANCH`; sem ele, de `GITHUB_HEAD_REF`,
  `GITHUB_REF_NAME` ou do `HEAD`. No `pre-push`, o `scripts/check-push.sh`
  passa o nome da ref enviada, porque o gate roda num worktree destacado.
  Ele move os arquivos desta pasta para o `docs/HANDOFF.md` (o mais recente
  no topo), renumera as pendências provisórias e apaga os arquivos movidos.
  Este `README.md` fica.

Leitura do estado corrente: `docs/HANDOFF.md` mais os arquivos desta pasta.
