# wt/ci-espelho-apt: espelho do apt fora de *.ubuntu.com no check-e2e — 2026-11-11

Objetivo: destravar o job `check-e2e`, que falha no `npx playwright install
--with-deps chromium` porque o runner não resolve os hosts `*.ubuntu.com`.
Revisão-base: `162fc1f` (main).

## Revisão de decisão

A decisão "sem cache e sem ajuste de rede no passo do Playwright" (registrada no
`docs/HANDOFF.md`) passa a ter uma exceção: da 2ª tentativa em diante, o apt
troca o espelho para `http://mirrors.edge.kernel.org/ubuntu/`. O cache continua
fora, pelos mesmos motivos.

- Evidência: em 11/11, o runner `ubuntu-24.04` passou horas sem DNS para
  `*.ubuntu.com` (azure.archive e archive). O resto da rede respondia.
  Reexecuções às 11:44, 11:57, ~12:20 e ~13:04 BRT falharam do mesmo jeito. Em
  outro repositório, a mesma troca baixou do kernel.org às 16:12Z e passou.
- A troca vem antes do `--with-deps`, que é quem chama o apt.
- A 1ª tentativa usa o espelho padrão: com o DNS normal, nada muda.
- Há no máximo 3 tentativas, com espera de 30 s e 60 s entre elas. O
  `Acquire::Retries "5"` cobre falhas de pacote isoladas.

## Alterações

- `.github/workflows/quality.yml`: o passo "Instalar o Chromium do
  Playwright" ganhou o laço de tentativas e o comentário com o porquê.

## Declarações

- Zero dependência nova, zero endpoint novo e zero mudança de código do app.
- O Makefile não muda: o `make check-e2e` local não usa apt (no macOS o
  `--with-deps` é no-op).

## Pendências

- P-ci-espelho-apt-1: quando o DNS de `*.ubuntu.com` voltar a ser estável no
  runner, avaliar se o laço fica, porque ele não custa nada no caminho feliz.
