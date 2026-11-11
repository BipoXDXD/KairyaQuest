# Leitores vivos do stream da tutoria — 2026-11-11

Revisão-base: `6d9b6b3` (main, #127). Branch `wt/leitores-vivos`.

Resolve a **P-teto-stream-2** (`2026-11-11-teto-stream.md`): sem métrica nem
limite dos leitores (`tutoria-leitor`) que sobrevivem ao teto de 54 s quando o
provedor manda `ping`.

## Decisão da coordenação

**Opção escolhida: gauge de leitores vivos em processo + teto de 40; acima do
teto, o stream NOVO é recusado antes de abrir a chamada ao provedor.**

- **Gauge:** `LeitoresVivos` (`tutoring/leitura.py`), contador sob `Lock`.
  `reservar()` confere e incrementa sob o mesmo lock (sem check-then-act) e
  devolve `False` sem tomar nada se cheio; `liberar()` devolve a vaga (e
  levanta se não havia reserva, para um decremento a mais não esconder
  vazamento). `vivos` é consultável pelo código; o do processo é
  `LEITORES_VIVOS`. Sem dependência, sem endpoint: o projeto não tem registro
  de métricas (`grep` por prometheus/gauge/metrics em `src`: nada), então é
  gauge em processo + log.
- **Ciclo da vaga:** `Queue`/`Event`/`Thread` nascem antes da reserva; a vaga
  (`_Vaga`, por leitor) é reservada imediatamente antes do `try` que envolve
  `leitor.start()` (a vaga existe desde antes de a thread nascer: sem janela em
  que o leitor vive e não é contado); devolvida no `finally` externo de `_ler`,
  depois de `eventos.close()`, por qualquer saída. Se `start()` falhar, o
  consumidor cancela o leitor e devolve a vaga. A liberação é idempotente por
  vaga (flag sob lock): mesmo que `start()` lance depois de a thread ter
  iniciado e as duas saídas liberem, o gauge decrementa uma vez só, sem
  depender do guard de zero (testado).
- **Teto 40 = `TETO_DE_LEITORES_VIVOS`.** O recurso protegido é o do processo:
  cada leitor órfão ocupa uma thread, um socket/FD e uma conexão ao provedor. O
  leitor é `threading.Thread` daemon e **não** consome ficha do limiter do
  anyio; só o `next()` do consumidor consome (e é liberado no teto de 54 s). O
  40 é escolha de dimensionamento: igual ao limiter padrão do anyio (que atende
  a `transmitir` síncrona), para que consumidores ativos + leitores órfãos
  fiquem na mesma ordem de grandeza do que o servidor já admite por processo.
  **Não** é prova de esgotamento do limiter. Um teste amarra o NÚMERO, não a
  premissa: `anyio.run` lê `current_default_thread_limiter().total_tokens` e
  compara com a constante (anyio 4.15.1: 40).
- **Código de falha reaproveitado: `provedor_indisponivel`.** A recusa levanta
  `ProvedorIndisponivelError`, que `transmitir` já traduz em
  `RespostaFalhou(provedor_indisponivel)` e na mensagem `falhou` sem texto e sem
  ação — exatamente o estado de uma falha de provedor hoje. Sobrecarga do lado
  do provedor e saturação dos leitores do provedor significam o mesmo para o
  cliente: "a resposta não pôde ser obtida agora; tente de novo". Nenhum código
  novo, migração ou mudança de contrato; `tempo_esgotado` seria mentira (nada
  esperou), e os demais (`proposta_invalida`, `resposta_recusada`) não cabem.
- **Logs (sem texto do usuário):** `WARNING` na recusa
  (`stream da tutoria recusado: leitores_vivos=… teto=…`) e `INFO` quando um
  leitor termina depois de o consumidor ter saído
  (`leitor da tutoria encerrou depois do consumidor: vida_ms=… leitores_vivos=…`):
  é a medida que a pendência pedia — quanto tempo o leitor sobreviveu e quantos
  restaram. Leitor que termina com o consumidor presente não gera linha.

### Recusar em vez de cancelar

Recusada: **cancelar/derrubar leitores presos** quando o teto enche. Não há como
interromper uma thread bloqueada numa leitura de socket de forma portável
(`close()` de outra thread no gerador em execução levanta `ValueError`; fechar o
socket por fora não acorda a leitura — as mesmas razões do #127). Tentar seria
complexidade frágil sobre um mecanismo que não existe. Recusar o que ainda não
começou é seguro: o estado é o de uma falha de provedor, nenhuma chamada paga é
aberta, e os leitores presos se aliviam sozinhos quando o provedor emite o
próximo evento real ou fecha o stream.

**Trade-off visível:** no pior caso (40 leitores presos por `ping` lento) os
streams novos falham com `provedor_indisponivel` até alguma vaga voltar, em vez
de disputar threads do servidor. O limite é por processo (o gauge não é
compartilhado entre réplicas, como o limiter do anyio). O 40 é por processo
mesmo com o threadpool servindo também outras rotas síncronas: o teto não
reserva fichas para elas, só impede que os leitores sozinhos as esgotem
(não medido em produção).

## Alterações

- `src/focusquest/modules/tutoring/leitura.py`: `LeitoresVivos`,
  `TETO_DE_LEITORES_VIVOS`, `LEITORES_VIVOS`; `ler_com_prazo(..., leitores=)`
  reserva, recusa e fecha o gerador não usado; `_ler` devolve a vaga e loga.
- `tests/unit/test_tutoring_leitores_vivos.py` (novo): contador, teto, recusa,
  disputa, vaga devolvida em fim normal/exceção/cancelado/`start()` falho, logs,
  premissa do anyio.
- `tests/integration/test_tutoring_leitores_vivos.py` (novo): pelo `transmitir`,
  41º turno com 40 vivos → `falhou`/`provedor_indisponivel`, sem chamar o
  provedor; turno normal devolve a vaga.
- `docs/ARCHITECTURE.md`: só a passagem do teto do stream (Retentativas HTTP).
- `docs/handoff/2026-11-11-teto-stream.md`: P-teto-stream-2 riscada, com ponteiro.

Nada em `service.py`, `main.py`, frontend, `.env`, banco ou contrato de API.

## Verificação

- **Vermelho primeiro:** o arquivo de testes unitários novo reprovou na coleta
  (`ImportError: cannot import name 'TETO_DE_LEITORES_VIVOS'`) antes de a
  implementação existir.
- **Sem `sleep` real:** `Event`, `Barrier` e `join` das threads; o relógio do
  leitor é o falso de `Espera`.
- **Concorrência:** 64 threads disputando a última vaga (largada por `Barrier`)
  → exatamente uma vence; 160 threads para 40 vagas → exatamente 40. Os 20 testes
  novos (18 unitários + 2 de integração) rodaram 5 vezes seguidas: 5 verdes
  (e o unitário mais 6 vezes antes).
- **Sabotagens** (cada uma desfeita): sem `liberar()` no fim do leitor; `>=`
  trocado por `>` na reserva; sem devolver a vaga quando `start()` falha. Cada
  uma reprova os testes correspondentes.
- `ruff check`, `ruff format --check` e mypy dos arquivos tocados: limpos.
- A primeira rodada do `make check` falhou só no teste que proíbe citar o
  provedor abandonado em código e docs (este handoff o citava); corrigido, o
  teste passa isolado. O resultado do `make check` completo está no PR.
