# Orçamento de tempo de ponta a ponta — 2026-11-11

Revisão-base: `8847935` (main). Branch `wt/orcamento-tempo`.

Resolve em parte a **P-prazo-medido-1** (`2026-11-11-prazo-medido.md`) e o resíduo
das rotas de 20 s sobre a espera do pool: o **caminho 1** (retries do SDK) e o
**pool** ficam fechados e conferidos pelo gate. O **caminho 2** (parada no meio do
stream) continua aberto, ver P-orcamento-tempo-1.

## Decisão da coordenação

**Opção escolhida: `max_retries=0` no cliente do SDK e fases do timeout nomeadas,
somando um teto de 60 s por chamada; `pool_timeout=10 s` no engine.**

- Pior caso de UMA chamada ao provedor = `connect 3 + write 2 + read 54 + pool 1 =
  60 s`, sem backoff (zero retentativas) = `proxy_read_timeout (90 s) -
  FOLGA_DO_ORFAO (30 s)`. Antes: 3 chamadas × 4 fases × 60 s + backoff = 721,5 s
  pelo cálculo do teste (as quatro fases com 60 s cada; o 181 s do handoff
  anterior contava só a espera pelos cabeçalhos).
- `Settings.tutor_timeout_seconds` passa de 60 para **54**: ele é a espera por
  leitura; as 6 s das outras fases (constantes `CONEXAO_SEGUNDOS`,
  `ESCRITA_SEGUNDOS`, `FILA_DO_POOL_SEGUNDOS` em `anthropic_provider.py`) entram
  por cima para fechar 60 s. Efeito colateral: o limite do orfão passa de 90 s
  para 84 s (54 + 30), ainda abaixo do nginx; o texto do `client.ts` foi ajustado
  (só comentário).
- `POOL_TIMEOUT_SEGUNDOS = 10` em `core/database.py`, aplicado só quando o pool
  é o padrão (o `NullPool` do Alembic recusa o argumento). Metade da janela de 20
  s das rotas de leitura e mutação: sobra o resto para a consulta e a volta. A
  fração (0,5) é julgamento, nomeada no teste.

Recusadas:

- *(b) dividir o orçamento entre as três chamadas* (19,5 s por tentativa, mantendo
  os retries): encurtaria a tolerância a pausas do modelo no meio do stream de 60
  s para ~13 s, risco real para a ferramenta da avaliação, e **não** fecha o teto,
  porque o SDK 1.11 obedece ao `Retry-After` da resposta sem limite
  (`_calculate_retry_timeout`, lido do código instalado): um 429 com `Retry-After`
  longo dormiria além do nginx com retries ligados.
- *(a') `max_retries=1`*: mesmo problema do `Retry-After`.
- *(c)/(d) do handoff anterior*: (c) exige mexer em `tutoring/service.py`, fora do
  escopo; (d) faz o estudante esperar mais de 3 min.
- *Subir o nginx*: a decisão da coordenação é o orçamento caber no prazo atual.

**Trade-off visível ao usuário:** sem retentativa, um 429, 5xx ou erro de conexão
passageiro do provedor aparece na primeira ocorrência como
`provedor_indisponivel` (antes, até duas chamadas escondiam parte deles). O
estudante reenvia; o reenvio é o caminho já previsto. Quanto isso pesa na
prática não foi medido (precisa de produção).

## Alterações

- `src/focusquest/modules/tutoring/anthropic_provider.py`: `TENTATIVAS = 0`,
  fases do timeout nomeadas e `anthropic.Timeout(...)`.
- `src/focusquest/core/config.py` e `.env.example`: `tutor_timeout_seconds` 54.
- `src/focusquest/core/database.py`: `POOL_TIMEOUT_SEGUNDOS`.
- `tests/unit/test_prazos_coerentes.py`: 4 testes novos (pior caso calculado do
  cliente real e das constantes do SDK; `max_retries == 0`; `pool_timeout` ≤
  metade da rota mais curta; `NullPool` do Alembic continua aceito).
- `tests/integration/provedor_falso.py`: `Roteiro.retry_after`.
- `tests/integration/test_anthropic_provider.py`: teste do 429 com `Retry-After`
  (uma chamada, resposta em menos de 1 s); dois testes renomeados (o nome falava
  em tentativas), assertivas `1 + TENTATIVAS` intactas.
- `tests/integration/test_tutoring_max_tokens.py`: **removida a parametrização
  `500-inicial`** (7 casos) e o `TratadorComFalhaInicial`. Eles exercitavam o
  corte por `max_tokens` DEPOIS de uma retentativa do SDK depois de um 500, caminho
  que deixou de existir por decisão (`max_retries=0`): o primeiro `make check`
  reprovou esses 7 com `InternalServerError`, a expectativa descrevia o
  comportamento antigo. `_uma_geracao` agora exige exatamente `1 + TENTATIVAS`
  chamada, com `x-stainless-retry-count` `0`. Os casos `sem-retentativa` (o
  caminho que sobra) continuam.
- `tests/unit/test_config.py`: padrão esperado 54 (mudança intencional do padrão).
- `frontend/src/shared/api/client.ts`: só comentário (54 s, 84 s).
- Sem tocar `main.py`, `tutoring/service.py` nem `docs/ARCHITECTURE.md`
  (a linha 951 do ARCHITECTURE ainda cita `TENTATIVAS = 2`: fica para quem
  coordena a documentação).

## Verificação

- **Vermelho primeiro** (antes de qualquer linha de produção):
  `pytest tests/unit/test_prazos_coerentes.py` reprovou 3 dos 4 testes novos
  (`assert 721500 <= (90000 - 30000)`; `assert 2 == 0`; `assert (30.0 * 1000) <=
  (20000 * 0.5)`); o do `NullPool` passa de propósito (guarda de regressão). O
  teste do 429 reprovou com 3 chamadas recebidas.
- **Verde:** os mesmos testes, mais `test_config.py` e
  `test_anthropic_provider.py` (integração), todos passando.
- **Mutações** (cada uma desfeita): `CONEXAO_SEGUNDOS` 3 → 4, `TENTATIVAS` 0 → 1,
  `POOL_TIMEOUT_SEGUNDOS` 10 → 11 e `tutor_timeout_seconds` 54 → 55 reprovam o
  teste correspondente.
- `make check` (sob a trava, depois de corrigir os 8 testes do primeiro gate):
  EXIT 0, sem vazamentos no Gitleaks e wheel construído com os prompts.

## Pendências

- **P-orcamento-tempo-1 — parada no meio do stream (caminho 2 do
  P-prazo-medido-1).** O timeout do SDK é por leitura (54 s desde o último
  chunk) e o total só é conferido quando um evento chega
  (`tutoring/service.py`, `evaluation/service.py`). Uma parada que começa depois
  de ~36 s do pedido sai depois dos 90 s do nginx, sem `code`. Só um limite TOTAL
  de parede, conferido sem depender de evento (por exemplo `deadline` no laço de
  leitura ou um timer que feche o stream), cobre. Exige mexer em `service.py`,
  fora do escopo; decisão do dono.
- **Mesma pendência, aviso:** um 5xx lento em cabeçalhos e a parada em stream já
  eram o pior caso; o que mudou é que não há mais segunda chamada paga.
