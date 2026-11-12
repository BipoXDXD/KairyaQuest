# Teto de parede da avaliação — 2026-11-11

Revisão-base: `23cc6f0` (main, #129). Branch `wt/teto-avaliar`.

Resolve a **P-teto-stream-1** (`2026-11-11-teto-stream.md`): a avaliação da
tutoria (`avaliar`) não tinha o teto de parede que o chat ganhou nos #127/#129.

## Análise: ainda faz sentido? Sim — a premissa do brief estava errada

O brief supunha que `avaliar` é uma chamada **não** streaming, em que o
`read` de 54 s do httpx (silêncio entre bytes) bastaria e só um servidor que
goteja bytes quebraria o orçamento. **Não é não streaming.**
`ProvedorAnthropic.avaliar` abre `self._cliente.messages.stream(...)` e consome os
eventos por dentro (`anthropic_provider.py`, o `for evento in ...`). Logo:

- **O pior caso não estava limitado.** O timeout do SDK (`read = 54 s`) é o
  `read` do httpx: conta o silêncio entre **bytes**, não o total. Um `ping`
  (que o SDK descarta, `anthropic/_streaming.py:129`, e que o teste da premissa
  confirma: três `ping` viram zero eventos) e um evento a cada 50 s
  reiniciam o relógio. Medido pelo código, não por medição de produção: o tempo
  de parede de `avaliar` é **ilimitado pelo cliente**; só o fim do stream pelo
  servidor (no máximo 2048 tokens, `MAX_TOKENS_DA_AVALIACAO`) ou 54 s de
  silêncio o encerra. Sem `ping`, uma parada que começa depois de t s sai em
  `t + 54 s`; qualquer `t > 6 s` já passa dos 60 s do orçamento.
- **O orçamento:** nginx 90 s − `FOLGA_DO_ORFAO` 30 s = **60 s**. A conferência
  do serviço (`clock() - inicio > tutoria.limite`, `evaluation/service.py`) só
  roda quando a chamada **volta**: ela marca `tempo_esgotado` tarde, não corta
  cedo. Resultado: o navegador via o 504 do nginx, sem `code`, enquanto o backend
  seguia pago.
- **Pior caso depois:** `decorrido = tutor_timeout_seconds = 54 s` contado do
  início da chamada (inclui conexão 3 s, escrita 2 s e fila do pool 1 s, que o
  teste soma de novo por conservadorismo): 54 + 6 = 60 ≤ 60, folga zero, a mesma
  conta do stream da tutoria.

## Decisão da coordenação

**Opção escolhida: o teto fica DENTRO do adaptador Anthropic
(`ProvedorAnthropic.avaliar`), reusando `ler_com_prazo` de `leitura.py`;
estouro levanta `TempoEsgotadoError`, que o serviço já grava como
`tempo_esgotado`, sem bônus.**

- O corpo do `with ... messages.stream(...)` virou o gerador privado
  `_eventos_da_avaliacao`, **aberto e fechado pela thread leitora** (a mesma regra
  do stream do chat: `close()` de outra thread não acorda a leitura). Os erros do
  SDK e do transporte são traduzidos (`_traduzir_erros`) dentro da thread e
  chegam ao consumidor já como `TempoEsgotadoError`/`ProvedorIndisponivelError`.
- Nenhum código novo, contrato novo ou migração: o estouro usa o código que o
  serviço já usa para tempo esgotado na avaliação; nada de XP; o tempo vai para
  o log (`stream da avaliacao passou do teto: decorrido_ms=… teto_ms=… eventos=…`,
  só números).
- **Reuso, sem duplicar:** mesma `Espera` injetável, mesmo gauge `LEITORES_VIVOS`
  (teto de 40 leitores vivos, **compartilhado** com o chat: os dois consomem a
  mesma thread/socket/FD do processo) e mesma recusa. Gauge cheio: a avaliação
  falha com `ProvedorIndisponivelError` (`provedor_indisponivel`), sem abrir a
  chamada paga. Única mudança em `leitura.py`: o parâmetro `rotulo` do log
  (padrão = o texto de antes; a avaliação passa `stream da avaliacao`).
- `ProvedorAnthropic` ganhou o parâmetro `espera` (padrão `ESPERA_REAL`), só para
  os testes. `dependencies.py` e `main.py` não mudam. O teto é o
  `timeout_segundos` do construtor (o mesmo `tutor_timeout_seconds` de
  `Tutoria.limite`).

Recusadas:

- *Teto no `evaluation/service.py` (thread em volta de `provedor.avaliar`):*
  valeria para qualquer provedor, mas abre um segundo mecanismo de thread e
  duplica o ciclo de vaga; o adaptador já é quem consome o stream.
- *Teto no caminho do provedor abandonado:* a coordenação pediu o teto só no
  caminho Anthropic (ver inventário abaixo: não há outro caminho hoje).
- *Diminuir o `read` do SDK:* não limita o total e encurta a tolerância a
  pausas do modelo (mesma razão do #127).

**Trade-off visível (o mesmo do #127):** o consumidor sai no teto, mas o stream do
provedor só fecha quando a thread leitora volta da leitura (próximo evento real
ou fim do stream). Mantém uma thread/conexão viva por chamada cortada, contada
no gauge. Não medido em produção.

## Inventário: caminhos do provedor abandonado na avaliação (só inventário)

Resultado: **nenhum**. `git grep -il` (sem distinção de maiúsculas) pelo nome do
provedor abandonado em `src`, `tests`, `docs`, `.env.example`, `Makefile`,
`pyproject.toml` e `.github` só acha o teste de fitness que o proíbe
(`tests/unit/test_sem_*.py`, escrito de propósito com o nome) e `docs/HANDOFF.md`
(histórico, fora da varredura do teste). Não resta variável de ambiente, campo de
`Settings` nem classe de provedor. O único caminho da avaliação é:

- `src/focusquest/modules/evaluation/service.py:101` →
  `tutoria.provedor.avaliar(...)` (o `Protocol` em
  `tutoring/provider.py:159`);
- implementado só por `ProvedorAnthropic.avaliar`
  (`tutoring/anthropic_provider.py:346`), montado em
  `tutoring/dependencies.py:30`;
- config: `Settings.tutor_timeout_seconds` (`core/config.py:103`) e
  `Settings.evaluation_effort` (`core/config.py:117`).

## Alterações

- `src/focusquest/modules/tutoring/anthropic_provider.py`: `avaliar` lê por
  `ler_com_prazo`; `_eventos_da_avaliacao`; `espera` no construtor.
- `src/focusquest/modules/tutoring/leitura.py`: `rotulo` (e as constantes
  `ROTULO_DO_STREAM`/`ROTULO_DA_AVALIACAO`) no log; docstring.
- `tests/unit/test_anthropic_teto_da_avaliacao.py` (novo, 8 testes): premissa do
  SDK (`ping` não vira evento), corte no teto com gotejo e com silêncio total,
  fim normal, erro do transporte traduzido na thread, gauge cheio e vaga devolvida.
- `tests/integration/test_evaluation_service.py`: ponta a ponta com o adaptador
  real: `tempo_esgotado` gravado, sem bônus.
- `tests/unit/test_prazos_coerentes.py`: teto da avaliação = `tutor_timeout` e
  cabe em `proxy − folga`; helper `_fases_fora_da_leitura_ms`; docstring atualizada.
- `docs/ARCHITECTURE.md`: só as passagens do órfão (~951) e do teto do stream
  (Retentativas HTTP).
- `docs/handoff/2026-11-11-teto-stream.md`: P-teto-stream-1 riscada, com ponteiro.

Nada em `main.py`, `service.py` da tutoria ou da avaliação, frontend, `.env`,
banco ou contrato de API.

## Verificação

- **Vermelho primeiro:** o arquivo novo reprovou por `TypeError` (o parâmetro
  `espera` não existia); com só a costura (parâmetro aceito e ignorado),
  reprovaram por comportamento o gotejo, o silêncio total e o gauge cheio.
- **Sem `sleep` real:** o relógio e a espera pela fila são o falso de `Espera`;
  o leitor e a fila são reais. (O teste de integração usa o servidor falso com
  cabeçalhos atrasados em 0,9 s, atraso do falso, e o relógio do teto é falso.)
- **Sabotagens** (cada uma desfeita): `avaliar` sem `ler_com_prazo` reprova os 4
  testes de comportamento; teto do adaptador × 2 reprova o teste de prazos e o
  de corte.
- Os testes novos e `test_prazos_coerentes.py` rodaram 5 vezes seguidas: 5
  verdes.
- `ruff check`, `ruff format --check` e mypy: limpos. Demais testes relacionados
  (unit inteira, provider, teto do stream, leitores vivos, serviço e camada 3 da
  avaliação): verdes. O resultado do `make check` completo está no PR.
