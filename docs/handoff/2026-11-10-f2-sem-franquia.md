# Fitness function sem franquia de terceiros — 2026-11-10

Base: `c0a5eb4` (migração 0008). Objetivo: barrar no build qualquer citação à
franquia de terceiros em código, frontend e documentação corrente.

`tests/unit/test_sem_franquia.py` varre `src`, `frontend/src`, `docs/` e o
`README.md` (conteúdo) e `frontend/public` (só nomes de arquivo), sem
diferenciar maiúsculas, e lista `arquivo:linha: trecho` de cada ocorrência,
ordenado. Decisões:

- README §1 e §7 reescritos com sentido equivalente e neutro ("interface
  inspirada em RPGs de fantasia", "Não exija conhecer nenhum jogo específico");
  nenhum outro requisito mudou.
- `docs/HANDOFF.md` e `docs/superpowers/` ficam fora da varredura: são
  registro histórico, e o histórico não é reescrito. `tests/` também fica fora,
  porque o teste precisa escrever os termos.
- `docs/ARCHITECTURE.md` passou a descrever `origin = 'kairya'`, o valor atual.
- O tolerant reader da 0008 (`missions/models.py` e `progression/models.py`)
  entra numa allowlist temporária de `(caminho, trecho literal)`. O teste
  `test_allowlist_de_franquia_nao_tem_entrada_morta` falha se uma entrada não
  casar mais com nenhuma linha.
- O termo só conta no início de palavra (`(?<![a-z])`, com `_` fora das
  letras), para não acusar "artifacts". A sigla curta do jogo exige limite alfanumérico, para
  não casar com cor hexadecimal. O nome do jogo aceita espaço, `_`, `-` ou
  nada entre as palavras e também é procurado quebrado entre duas linhas
  (reportado na primeira). O predicado tem testes de borda próprios.
- Arquivos binários (imagem, fonte, áudio, PDF) nas pastas varridas têm só o
  nome checado, nunca o conteúdo.

Comandos: `UV_PYTHON=3.14.10 uv run pytest tests/unit/test_sem_franquia.py -v`
(18 aprovados), `UV_PYTHON=3.14.10 uv run ruff check .`,
`UV_PYTHON=3.14.10 uv run ruff format --check .` e
`UV_PYTHON=3.14.10 uv run mypy src tests alembic`, todos aprovados. Sabotagem
manual: arquivos temporários em `docs/` (inclusive o nome do jogo quebrado
entre duas linhas) e um nome em `frontend/public` fizeram o teste falhar com o
caminho (e a linha, no conteúdo); todos foram apagados. `make check` não foi
rodado nesta tarefa.

Pendência: a Tarefa 2.2 (migração 0010, a fase contract) remove o tolerant
reader e, junto, a allowlist temporária.

**Movido para cá.** Esta seção ficava no `docs/HANDOFF.md`; saiu de lá na
atualização com a `main` que trouxe a regra do `docs/handoff/` (#81). Os
nomes literais da franquia e da migração 0010 foram trocados por descrições,
por regra do projeto.
