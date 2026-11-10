# Handoff por PR

Cada PR registra o próprio handoff num arquivo novo nesta pasta, em vez de
editar `docs/HANDOFF.md`. Dois PRs nunca tocam o mesmo arquivo, então o
registro deixa de gerar conflito de merge a cada PR que entra na `main`.

- Nome: `AAAA-MM-DD-<branch-sem-o-prefixo-wt>.md`, por exemplo
  `2026-11-10-f3-tutoring.md`.
- Conteúdo: o mesmo que uma seção do `docs/HANDOFF.md` (objetivo,
  revisão-base, decisões, alterações, comandos, resultados e pendências), sem
  segredos e sem caminhos pessoais.
- Um PR que resolve ou cria uma pendência do `docs/HANDOFF.md` descreve isso
  no seu arquivo. O próximo PR de consolidação aplica a mudança lá.
- Consolidação: um PR próprio, só de documentação, move os arquivos desta
  pasta para o `docs/HANDOFF.md` (o mais recente no topo) e os apaga daqui.

Leitura do estado corrente: `docs/HANDOFF.md` mais os arquivos desta pasta.
