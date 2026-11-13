# ADR 0001: tetos de sessão do banco e 503 para falha transitória

- **Status:** Aceito (2026-11-12).

## Contexto

Nenhuma espera do banco tinha teto. Uma trava presa (`SELECT ... FOR UPDATE`
de outra transação), um comando lento ou uma transação esquecida aberta
seguravam a requisição sem limite, e o pool esgotado ou o erro de trava
acabavam em `500` sem `code`. O navegador desiste antes: `READ_TIMEOUT_MS` e
`MUTATION_TIMEOUT_MS` valem 20 s (`frontend/src/shared/api/client.ts:246` e
`:273`). Quando o servidor responde depois disso, a tela mostra um
`ApiTimeoutError` sem `code`, e o usuário não sabe se deve tentar de novo.

Regra adotada: **teto do servidor < timeout do cliente.** Todo teto do backend
que pode cortar uma rota de leitura ou mutação vence antes dos 20 s do
navegador, para que a resposta com `code` chegue à tela.

Alternativas avaliadas para aplicar os tetos:

1. **`set_config` no listener `connect` da engine da aplicação.** Roda depois
   de `postgresql.conf`, `ALTER DATABASE`, `ALTER ROLE` e `PGOPTIONS`, no mesmo
   bloco em `autocommit` que já fixa a sessão em UTC (o rollback do pool não o
   desfaz). Os valores vêm do `Settings`, e só a engine de `get_engine` os
   recebe.
2. **`options=-c ...` no pacote de partida.** Funciona, mas cria um segundo
   mecanismo ao lado do listener, obriga a montar e escapar a string, e o
   próprio projeto já mediu que a `libpq` aplica variáveis do ambiente depois
   das `options` (docstring de `_configurar_sessao`).
3. **`ALTER ROLE` numa migração.** O papel é um só para aplicação, testes e
   Alembic: o backfill das migrações herdaria o `statement_timeout`. Vale para
   o cluster inteiro (todos os worktrees e o E2E) e congela o número no
   histórico de migrações.
4. **`ALTER DATABASE` ou `postgresql.conf`.** O nome do banco muda por
   ambiente, e o valor sairia do código versionado e testado.

## Decisão

Alternativa 1. `core/database.py` define `LimitesDaSessao`;
`create_engine_from_url(..., limites=None)` só aplica tetos quando recebe
`limites`, e só `get_engine` os passa, lidos de `Settings`:

| Campo do `Settings` | Variável | Padrão | Por quê |
|---|---|---|---|
| `db_lock_timeout_ms` | `FOCUSQUEST_DB_LOCK_TIMEOUT_MS` | 5 s | Trava + fila do pool (4 s) cabem nos 20 s da mutação. |
| `db_statement_timeout_ms` | `FOCUSQUEST_DB_STATEMENT_TIMEOUT_MS` | 15 s | Somado à fila do pool (4 s), dá 19 s: para um comando por requisição, o servidor desiste antes dos 20 s do navegador. |
| `db_idle_in_transaction_timeout_ms` | `FOCUSQUEST_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | 60 s | Uma transação esquecida aberta não segura travas para sempre. |

Os três exigem `>= 1`: zero desliga o teto no PostgreSQL. O erro de validação
nomeia o campo e não imprime o valor (`hide_input_in_errors`).

`main.py` traduz as falhas transitórias em `503` com
`{"code": "banco_ocupado"}` e `Retry-After: 2`:

- erro do banco com SQLSTATE `55P03` (trava), `57014` (comando cancelado
  pelo `statement_timeout`), `40P01` (deadlock) ou `25P03` (transação ociosa
  encerrada). O psycopg segue a classe do SQLSTATE: os três primeiros chegam
  como `OperationalError` e o `25P03` como `InternalError` (medido no teste de
  integração), então o handler cobre as duas classes;
- `sqlalchemy.exc.TimeoutError` (pool esgotado), que não é `DBAPIError` e tem
  handler próprio.

O `25P03` também responde `503`, mas é diferente dos outros: repetir **não**
resolve a causa. Numa rota, ele só aparece se a própria requisição deixou a
transação ociosa por mais de 60 s, o que indica defeito no código (uma espera
fora do banco com a transação aberta). Por isso o log dele sai em nível
`error`, com a mensagem "transação ociosa encerrada pelo teto", e os demais em
`warning`.

Qualquer outro `OperationalError` ou `InternalError` é relançado e continua `500`: um erro
desconhecido não vira "tente de novo". O log registra só SQLSTATE, método e
caminho, nunca SQL ou parâmetros.

## Consequências

- O Alembic (`alembic/env.py`) e as engines da suíte continuam sem tetos, de
  propósito: uma migração longa não pode ser cortada no meio.
- O E2E sobe o app por `get_engine` e recebe os tetos. Nenhuma chamada ao
  modelo roda dentro de transação, então os 60 s de transação ociosa não a
  alcançam.
- Repetir é seguro nas rotas idempotentes pelo `operation_id` (conclusão,
  início, reagendamento, confirmação). Nas demais, o erro reverte a transação
  e nada é gravado; o `POST /api/missions` só ganha chave de idempotência num
  lote seguinte.
- A fila do pool caiu de 10 s para 4 s (`POOL_TIMEOUT_SEGUNDOS`) para que a
  pior requisição de **um** comando (pool + `statement_timeout` = 19 s) ainda
  receba o `503` antes dos 20 s do navegador.
- **Risco aceito:** uma requisição com vários comandos lentos pode somar mais
  que 20 s, porque cada `statement_timeout` vale por comando, não pela
  requisição. O navegador desiste antes e mostra um `ApiTimeoutError` sem
  `code`. Hoje nenhuma rota de leitura ou mutação encadeia comandos que se
  aproximem do teto; um teto por requisição só entra com um caso medido.
- O stream SSE da tutoria, depois de aberto, não passa pelos handlers. A
  gravação final dele (`transmitir`) usa a mesma classificação
  (`e_falha_transitoria_do_banco`, em `core/database.py`): o corte vira o
  evento `error` com `banco_ocupado`, e a resposta vai a `falhou` numa única
  segunda tentativa, best-effort (#177).
- O frontend não muda: um `code` desconhecido cai na mensagem genérica.

## Compliance

- `tests/unit/test_prazos_coerentes.py`:
  `test_o_teto_do_comando_no_banco_vence_antes_do_navegador` (statement <
  20 s), `test_trava_e_pool_cabem_na_rota_de_mutacao` (trava + pool < 20 s),
  `test_pool_e_comando_juntos_vencem_antes_do_navegador` (pool + statement <
  20 s) e `test_o_alembic_cria_a_engine_sem_tetos_de_sessao` (o `env.py` não
  passa `limites`).
- `tests/unit/test_config.py`: padrões e recusa de zero e negativo sem
  imprimir o valor.
- `tests/unit/test_banco_ocupado.py`: classificação dos SQLSTATEs, `500` para
  o resto, `25P03` logado em `error` sem SQL nem valores e trava em `warning`.
- `tests/integration/test_tetos_do_banco.py` (PostgreSQL real): os três `SHOW`
  na conexão da aplicação, inclusive depois da devolução ao pool; engine sem
  limites sem tetos; trava presa, `pg_sleep` acima do teto e pool esgotado
  viram `503` com `Retry-After`; deadlock real (`FOR UPDATE` cruzado, uma
  ponta dentro da rota) vira `503`; `57P01` continua `500`; transação ociosa
  encerrada pelo teto chega com SQLSTATE `25P03` e, numa rota, vira `503` com
  log `error`.
