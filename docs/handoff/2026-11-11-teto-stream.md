# Teto de parede do stream da tutoria — 2026-11-11

Revisão-base: `279cd0c` (main). Branch `wt/teto-stream`.

Resolve a **P-orcamento-tempo-1** (`2026-11-11-orcamento-tempo.md`) **para o chat
da tutoria**. A avaliação continua sem o teto (ver Pendências).

## Decisão da coordenação

**Opção escolhida: um teto TOTAL de parede para o stream da tutoria, igual a
`Tutoria.limite` (`tutor_timeout_seconds`, 54 s), conferido sem depender de
evento. Estourou: o stream encerra com `RespostaFalhou(tempo_esgotado)`, o
código que já existia para essa falha.**

- A leitura bloqueante do SDK roda numa thread própria (`tutoring/leitura.py`,
  `ler_com_prazo`); `transmitir` espera pela fila só até o teto e levanta
  `TempoEsgotadoError`. Nenhum contrato novo: mesmo código, mesmo estado
  gravado (`falhou`, texto parcial, `error_code=tempo_esgotado`) de um
  timeout do SDK.
- **A conta.** O teto conta do início da chamada, então já inclui conexão
  (3 s), escrita (2 s) e fila do pool (1 s). Pior caso do stream = 54 s ≤
  `proxy_read_timeout (90 s) − FOLGA_DO_ORFAO (30 s)` = 60 s. O teste soma as
  três fases de novo, por conservadorismo: 54 + 6 = 60 ≤ 60, folga zero,
  exatamente o orçamento do #121.
- **Tempo usado registrado:** log `WARNING` estruturado, sem conteúdo do
  usuário: `stream da tutoria passou do teto: decorrido_ms=… teto_ms=…
  eventos=…`. Não há coluna para o tempo: nenhum campo novo no banco.
- **Relógio:** `time.monotonic` (duração, imune a ajuste de relógio de parede),
  injetado com a espera pela fila num `Espera`; `transmitir(..., espera=)` tem
  o padrão real. O `Clock` do serviço continua conferindo o limite por evento
  (o teste do relógio que anda 61 s segue intacto).

Recusadas:

- *Diminuir o timeout por leitura do SDK:* encurta a tolerância a pausas do
  modelo (risco já apontado no #121) e mesmo assim não limita o total.
- *Timer que fecha o stream por fora:* `close()` de outra thread num gerador em
  execução levanta `ValueError`, e fechar o socket não acorda uma leitura
  bloqueada de forma portável.
- *Mudar a mutação do `httpx` por leitura (`request.extensions["timeout"]`):*
  depende de detalhe interno do transporte.

**Trade-off visível:** estourado o teto, o consumidor sai na hora, mas o stream
do provedor só fecha quando a thread leitora volta da leitura: no próximo
evento real ou no fim do stream pelo servidor. O timeout por leitura do SDK
**não** limita essa espera: o SDK descarta os `ping` e eles reiniciam o timer de
leitura do socket, então um modelo lento que manda pings mantém a thread
(daemon, nomeada `tutoria-leitor`) e a conexão vivas. Também vale na
desconexão do cliente: antes o `close()` fechava o SDK na hora; agora fecha no
próximo evento (ms, com o modelo emitindo). Não medido em produção.

**Evento já enfileirado.** Com o tempo esgotado, o serviço ainda drena o que o
leitor já enfileirou (`get_nowait`) antes de estourar: uma resposta completa
não vira `falhou` porque o relógio passou entre dois itens. Fila vazia e tempo
esgotado: estouro sem nenhuma espera.

## Alterações

- `src/focusquest/modules/tutoring/leitura.py` (novo): `ler_com_prazo`, `Espera`.
- `src/focusquest/modules/tutoring/service.py`: `transmitir` lê por
  `ler_com_prazo` (parâmetro `espera`); comentário de `FOLGA_DO_ORFAO`.
- `tests/integration/test_tutoring_teto_do_stream.py` (novo, 9 testes: inclui a
  espera real com provedor travado e a drenagem do evento já enfileirado).
- `tests/unit/test_prazos_coerentes.py`: docstring e o teste do teto contra
  `proxy_read_timeout − FOLGA_DO_ORFAO`, das constantes reais.
- `docs/ARCHITECTURE.md`: só a passagem do órfão (~951) e um parágrafo em
  "Retentativas HTTP".

## Verificação

- **Vermelho primeiro:** o teste novo reprovou por `TypeError` (o parâmetro
  `espera` não existia); com só a costura ignorando o parâmetro, reprovou por
  comportamento: o provedor calado travou até o limite do falso (5 s de relógio
  real, o análogo do timeout do SDK) e o gotejo (evento a cada 50 s) concluiu a
  resposta inteira.
- **Sem `sleep` real:** o falso decide quanto tempo cada evento levou
  (`atrasos`); o que não chega, a fila reporta `queue.Empty`, como o
  `Queue.get(timeout)` real. O leitor e a fila são reais.
- **Sabotagens** (cada uma desfeita): sem a checagem de `restante <= 0`; sem
  `cancelado.set()`; teto multiplicado por 10; texto do log alterado. Cada uma
  reprova o teste correspondente.
- Teste novo repetido 7 vezes seguidas: 7 verdes.
- `tests/unit/test_prazos_coerentes.py`: com `tutor_timeout_seconds` 55 reprova
  o teste do teto e o do pior caso.
- `pytest tests/integration tests/unit -k "tutoring or camada3 or provedor or
  evaluation or prazos or anthropic or sse"`: exit 0.

## Pendências

- **P-teto-stream-1 — avaliação.** `avaliar` lê o stream inteiro por dentro do
  adaptador e o serviço só confere o total quando a chamada volta
  (`evaluation/service.py`): uma parada no meio ainda sai em `t + 54 s`. Fechar
  exige o mesmo mecanismo numa chamada, não num gerador, e mexer no serviço de
  avaliação; fora do escopo deste item.
- **P-teto-stream-2 — leitores vivos além do teto.** Com `ping` o leitor e a
  conexão do provedor podem passar do teto e do limiter de 40 threads do anyio
  (que atende a `transmitir` síncrona) até o próximo evento real ou o fim do
  stream pelo servidor. Falta uma métrica ou log de leitores vivos
  (`tutoria-leitor`) para medir; não implementada.
