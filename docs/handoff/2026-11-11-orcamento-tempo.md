# Orçamento de tempo de ponta a ponta — 2026-11-11

Revisão-base: `8847935` (main). Branch `wt/orcamento-tempo`.

Resolve em parte a **P-prazo-medido-1** (`2026-11-11-prazo-medido.md`) e o resíduo
das rotas de 20 s sobre a espera do pool: o **caminho 1** (retries do SDK) e o
**pool** ficam fechados e conferidos pelo gate. O **caminho 2** (parada no meio do
stream) foi fechado depois, para o chat da tutoria: ver `2026-11-11-teto-stream.md`
(P-orcamento-tempo-1 resolvida).

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

## Reavaliação: `max_retries=1`? (decisão da coordenação, 2ª rodada)

A coordenação pediu preferir `max_retries=1` (um 429/5xx passageiro não chegar
ao estudante), com timeout por tentativa = (orçamento − backoff)/2, e voltar a 0
só se a conta não fechar. **Resultado: a conta não fecha; fica 0.**

**O que o SDK instalado faz (lido em `anthropic/_base_client.py`, SDK 1.11.0):**
`_calculate_retry_timeout` devolve `min(retry_after, 4_294_967.0)` quando há
`retry-after-ms`, `retry-after` (segundos) ou `retry-after` (data) com valor > 0.
**Não existe o teto de 60 s** de versões antigas: o único limite é o de
plataforma do `time.sleep` (~49 dias); o backoff exponencial
(`MAX_RETRY_DELAY = 8 s`) só vale sem o cabeçalho. Medido, não só lido: o teste
novo `test_premissa_o_sdk_dorme_o_retry_after_inteiro_se_houver_retentativa`
faz 429 com `Retry-After: 120` contra o falso, com `max_retries=1`, e vê o SDK
dormir exatamente `[120.0]` e chamar duas vezes.

**A conta, com as constantes reais** (nginx 90 s − folga do órfão 30 s = 60 s;
P = soma das quatro fases de uma tentativa; backoff da 1ª retentativa =
`INITIAL_RETRY_DELAY` 0,5 s no máximo; D = atraso do `Retry-After`):

- `2·P + 0,5 + D ≤ 60`.
- Sem `Retry-After` (D = 0): P ≤ 29,75 s, ou seja, read ≤ 23,75 s (hoje 54 s).
  Fecharia, ao custo de mais que dobrar a chance de falso timeout no meio do
  stream (a retentativa só existe antes do primeiro evento, mas o read de 23,75 s
  vale também entre chunks).
- Com `Retry-After` de 60 s (o teto antigo, e valor plausível de um 429 de
  limite de taxa): `2·P ≤ −0,5`, **impossível**. Com 30 s: read ≤ 8,75 s. Com 120 s
  (medido acima): estoura o nginx sozinho. O pior caso real é, portanto,
  ilimitado.

**Limitar o atraso de forma suportada?** Não há opção do SDK além de
`max_retries`, `timeout` e `http_client`. O único jeito seria um hook de
resposta do httpx reescrevendo `retry-after`, `retry-after-ms` e a forma em data
antes de o SDK lê-los: depende de como o SDK interpreta os cabeçalhos
(detalhe interno, que já mudou entre versões), mexe numa resposta HTTP para
enganar o chamador, e a conta ainda custaria read ≤ 23,75 s. Recusado como
gambiarra; sem subclasse de `_calculate_retry_timeout` pela mesma razão (método
privado).

**Mantido `max_retries=0`.** O teste da premissa vira o gatilho de revisão: se uma
atualização do SDK passar a limitar o atraso, ele reprova e a conta acima deve
ser refeita (então `max_retries=1` com read ≤ 23,75 s e o teto fixado pelo teste
do pior caso, que já inclui o backoff). Os casos `500-inicial` de
`test_tutoring_max_tokens.py` **não voltam**: o comportamento não voltou.

## Revisão do #121 (ressalvas aprovadas pela coordenação)

- `docs/ARCHITECTURE.md`, **só duas passagens**, autorizadas pela coordenação: (1)
  a da linha ~951 (corte do órfão, que citava `TENTATIVAS = 2`) e (2) a seção
  "Retentativas HTTP e geração nos testes de encerramento" (~1782), reescrita:
  descrevia o oráculo `500-inicial`, `1 + TENTATIVAS`, "pelo menos duas
  requisições" e "nenhuma política de retentativa foi alterada", todos
  falsos depois deste PR. Agora registram `max_retries=0` e o motivo (o SDK 1.11
  dorme o `Retry-After` sem teto) e apontam o teste da premissa.
- **O teto de 60 s é ligeiramente otimista:** `connect = 3 s` não cobre a
  resolução de DNS (`getaddrinfo` não tem prazo no httpx) e vale por endereço
  resolvido. Comentado junto das constantes das fases em `anthropic_provider.py`.
  Só a produção diria o quanto.
- `useRequestEvaluation.test.tsx`: o comentário do E7 dizia "60 s + 30 s"; agora
  "proxy de 90 s mais 15 s de margem" (só comentário; o valor 105_000 é o mesmo).
- `_uma_geracao` exige `== 1` literal.
- `poolclass is None` mantido, com o motivo em comentário.

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
  (uma chamada, resposta em menos de 1 s); teste da premissa do SDK (acima); dois testes renomeados (o nome falava
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
  Repetido depois do teste da premissa do SDK: a primeira tentativa foi
  encerrada por SIGTERM (exit 143, sem falha de teste no log) e a segunda saiu
  com EXIT 0 (pytest, mypy, E2E com 138 passed).

## Pendências

- ~~**P-orcamento-tempo-1 — parada no meio do stream (caminho 2 do
  P-prazo-medido-1).** O timeout do SDK é por leitura (54 s desde o último
  chunk) e o total só é conferido quando um evento chega
  (`tutoring/service.py`, `evaluation/service.py`). Uma parada que começa depois
  de ~36 s do pedido sai depois dos 90 s do nginx, sem `code`. Só um limite TOTAL
  de parede, conferido sem depender de evento (por exemplo `deadline` no laço de
  leitura ou um timer que feche o stream), cobre. Exige mexer em `service.py`,
  fora do escopo; decisão do dono.~~ **Resolvida** para o chat da tutoria em
  `2026-11-11-teto-stream.md` (teto de parede por thread leitora); a avaliação
  segue aberta como P-teto-stream-1 lá.
- **Mesma pendência, aviso:** um 5xx lento em cabeçalhos e a parada em stream já
  eram o pior caso; o que mudou é que não há mais segunda chamada paga.
