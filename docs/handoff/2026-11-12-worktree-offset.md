# wt/worktree-offset: `novo-worktree.sh` aloca o primeiro deslocamento livre de verdade (lote 19b) — 2026-11-12

Objetivo: `scripts/novo-worktree.sh <nome>` escolhia o deslocamento das portas do E2E
só pelos `.env` dos worktrees, numa faixa fixa de 1 a 24, e recusou com 25 worktrees,
a maioria de PRs já mesclados. Passa a alocar o **primeiro** deslocamento livre,
conferindo (a) que nenhum outro worktree o reivindica no `.env` e (b) que as quatro
portas que ele implica não têm ninguém escutando. Revisão-base: `eb9953d` (main).

## Declarações

- Zero dependência nova, zero endpoint, zero migração, zero contrato do produto. Só
  script, teste e documentação.
- Nenhum teste pulado, limiar de cobertura intacto, nenhum hook tocado.
- A recusa por reivindicação **continua**, de propósito (dois worktrees parados não
  podem levar o mesmo valor). O que muda é o que mais conta como ocupado e a mensagem.

## Alterações

- `scripts/novo-worktree.sh`:
  - sondagem `sonda_porta` por `connect` em `/dev/tcp/127.0.0.1/<porta>` (bash puro,
    macOS e Linux; sem `lsof`, sem Python); só `Connection refused` (com `LC_ALL=C`)
    é "livre", qualquer outro resultado recusa;
  - `motivo_de_ocupacao`: reivindicação no `.env` primeiro, depois as quatro portas
    (API, frontend, falso, galeria = base + deslocamento);
  - alocação automática pega o primeiro de 1 ao teto que passa; a saída lista os
    pulados e o motivo; a recusa lista cada deslocamento e como sair
    (`git worktree remove`);
  - o deslocamento pedido passa pelas mesmas conferências;
  - o resumo final imprime as portas a partir das mesmas bases sondadas.
- `tests/integration/test_novo_worktree.py`: janela de portas própria por teste
  (`FQ_PORTAS_BASE_E2E`), sockets reais, 19 casos novos e 1 ajuste (a asserção `8101`
  passou a usar as bases do teste).
- `docs/QUALITY.md`: novo item na §6 ("O que é um deslocamento livre") e a faixa
  "de 0 a 24" do "Primeiro uso após clonar" agora diz "ao teto".
- `.env.example`: comentário do deslocamento.

## Teto (derivado e documentado)

O teto é o **menor** de dois limites, nenhum escrito à mão:

1. reserva do pre-push: `FQ_RESERVA_DO_PUSH - 1` = 24 (25 a 49 é do push; 49 é o vão
   do `servers.ts`);
2. fim do espaço de portas: `65535 - maior base` (hoje 8150 → 57385, folga enorme).

Faixas para 0 a 24: API 8100–8124, falso 8150–8174, frontend 5273–5297, galeria
5373–5397; disjuntas entre si e de 8000/5173 (desenvolvimento), e a porta do PostgreSQL fica fora delas.
As portas do push (deslocamento + 25) não são sondadas.

## Decisões

- **D1, `/dev/tcp` em vez de `lsof`/bind.** Funciona igual no macOS (bash 3.2 e 5) e no
  Ubuntu do CI sem depender de binário extra; o custo é só enxergar listeners em
  127.0.0.1/0.0.0.0, que é onde os servidores do E2E sobem. Medido em `/bin/bash`
  3.2.57 e em bash 5.3.
- **D2, falha fechada.** Resultado diferente de "recusada" (timeout, `/dev/tcp`
  ausente) recusa com a porta nomeada, em vez de alocar no escuro.
- **D3, `FQ_PORTAS_BASE_E2E`.** Gancho de teste para apontar a sondagem a uma janela
  livre; o padrão (8100 5273 8150 5373) é cópia do `servers.ts` e um teste confere.
- **D4, mensagem de reivindicação mantém "em uso"** (`em uso por outro worktree:
  reivindicado no .env de <caminho>`), para o teste antigo da trava seguir válido sem
  edição.

## Testes e sabotagem

Vermelho antes da mudança (script antigo, testes novos): 20 reprovações. Depois: 75
passam em `test_novo_worktree.py`. Sabotagens do script, cada uma reprovada:

| sabotagem | testes reprovados |
|---|---|
| sondagem sempre "livre" | 8 (pula-porta x4, combinado, liberada, sem-lugar, pedido) |
| ignora reivindicação | 8 |
| teto só pela reserva (sem o das portas) | 2 |
| sonda só a porta da API | 5 (frontend, falso, galeria, combinado, pedido) |

Os testes não dependem da máquina: a janela de portas é escolhida por `bind` e fica
em 20000–30000; o teste do teto usa reivindicações e não encosta no topo da faixa.

## Resultados dos comandos

- `uv run pytest tests/integration/test_novo_worktree.py`: 75 passam (20 vermelhas
  antes da mudança, 19 novas + 1 ajustada).
- Uma primeira rodada do `make check` reprovou em `tests/unit/test_porta_do_banco.py`
  (o comentário do script citava a porta literal do PostgreSQL, e a varredura recusa
  arquivo fora da lista que a repita): corrigido tirando o literal do comentário (e do próprio handoff, que a mesma varredura
  também lê quando está no índice). Um commit reprovou no hook por isso, antes de eu repetir
  o teste isolado — erro meu, sem contornar nada.
  Uma segunda reprovou no `ruff` (linha de 90 colunas): `ruff format`.
- `make check` final, sob a trava, `EXIT=0`: pytest 2192 passed, 32 subtests, cobertura
  Python 100%; Vitest 129 arquivos / 2658 testes, cobertura 100%; ruff, mypy, E2E,
  check-wheel verdes. Rodado neste worktree, com `FOCUSQUEST_E2E_PORT_OFFSET=9`.

## Pendências e riscos

- Worktrees de PRs mesclados continuam reivindicando o deslocamento até serem
  removidos (`git worktree remove`); a nova mensagem lista quais. Limpá-los é
  operação do dono, fora do escopo.
- A sondagem é uma foto: servidor que sobe depois do script e antes do gate ainda
  colide (falha alta, não silenciosa).
