# Prazos coerentes com o backend — 2026-11-11

Revisão-base: `f7a02d4` (main). Branch `wt/prazo-medido`.

Resíduo da pendência 193 do `docs/HANDOFF.md` ("Prazo de 20 s sem medida real
de rede"): **medição de rede real exige a produção, fora de alcance, e continua
impossível aqui.** O que era derivável e mensurável localmente foi feito (abaixo)
e a premissa virou teste de coerência no gate. O resíduo "sem medida real de
rede" fica rebaixado de "pendente" para "limitação declarada": os números são
julgamento, justificado pela relação com o backend, e essa relação agora é
conferida. A consolidação ajusta a linha 193 de acordo.

## Decisão da coordenação

**Opção escolhida: teste de coerência no gate, sem mudar nenhum número.**
`tests/unit/test_prazos_coerentes.py` lê `READ_TIMEOUT_MS`,
`MUTATION_TIMEOUT_MS`, `EVALUATION_TIMEOUT_MS` e `ERROR_BODY_TIMEOUT_MS` de
`frontend/src/shared/api/client.ts`, o `proxy_read_timeout` do `location /api`
de `docker/nginx.conf`, o padrão de `tutor_timeout_seconds` (`core/config.py`) e
`FOLGA_DO_ORFAO` (`tutoring/service.py`, só lido), e exige:

1. `proxy_read_timeout >= tutor_timeout_seconds + FOLGA_DO_ORFAO` (90 >= 60 + 30):
   o `504 tempo_esgotado` do backend, com `code`, vem antes do 504 do nginx,
   sem `code`.
2. `EVALUATION_TIMEOUT_MS >= proxy_read_timeout + MARGEM_DE_VOLTA_MS`
   (105 >= 90 + 15): o navegador não aborta antes de o nginx responder. A
   margem é a constante nomeada do teste, os 15 s que o comentário já
   justificava, e continua julgamento.
3. `READ_TIMEOUT_MS` e `MUTATION_TIMEOUT_MS` menores que o da avaliação (só ela
   espera o modelo), e `ERROR_BODY_TIMEOUT_MS` menor que o de leitura.
4. Guarda: os leitores acham números (regex que não casa reprova, não passa
   vazio).

Recusadas:

- *Medir rede real*: recusada por impossibilidade (produção inacessível, sem
  token de deploy nem chamada a provedor pago; localhost não tem latência de
  rede).
- *Teste temporal de latência no gate (p95 de N chamadas)*: recusada. Seria
  frágil sob carga de CPU, com a máquina disputada por várias sessões, e
  mediria o computador, não a rede. A medida foi feita uma vez, à mão (abaixo),
  e registrada aqui; não entra no gate.
- *Mudar os números (20 s, 5 s, 105 s)*: recusada. As relações valem, então não
  há frontend menor que backend a corrigir nos caminhos cobertos.

## O que foi medido e lido

- **Rotas sem modelo, em processo** (`TestClient` contra o banco de teste, banco
  vazio, 300 chamadas após 20 de aquecimento, teste descartável apagado depois):
  `GET /api/missions` p95 1,5 ms; `/api/cycle` p95 1,2 ms;
  `/api/tutoring/status` p95 1,2 ms; `/api/tutoring/messages` p95 1,3 ms (máximo
  2,7 ms). Sem rede, sem dados volumosos: **mostra que o servidor não é o
  gargalo; não mede o navegador, o proxy nem o banco real**.
- **Prazos de servidor e proxy**: uvicorn sem timeout configurado (`api.Dockerfile`);
  nginx `proxy_read_timeout 90s` só no `location ^~ /api`; `tutor_timeout_seconds`
  60 s (SDK, por leitura; total conferido depois do retorno em
  `evaluation/service.py`); `FOLGA_DO_ORFAO` 30 s. Pool do SQLAlchemy sem
  `pool_timeout` explícito (padrão 30 s): numa piscina esgotada uma rota sem modelo
  esperaria até 30 s e responderia 500 sem `code`, depois dos 20 s do navegador;
  nas duas saídas a tela mostra falha, e nenhum `code` se perde.

## Alterações

- `tests/unit/test_prazos_coerentes.py` (novo, 4 testes).
- `frontend/src/shared/api/client.ts`: só comentários de `READ_TIMEOUT_MS`,
  `EVALUATION_TIMEOUT_MS` e `ERROR_BODY_TIMEOUT_MS`, que passam a apontar o teste
  e a dizer o que está medido e o que é julgamento. Nenhuma linha de código.
- Sem tocar `main.py`, `tutoring/service.py` nem `docs/ARCHITECTURE.md`.

## Verificação

- **Vermelho por mutação** (o teste já nasce verde, porque os números de hoje são
  coerentes; a prova de que ele pega é quebrar a relação e ver reprovar, cada
  mutação desfeita com `git checkout`): `EVALUATION_TIMEOUT_MS` 105_000 → 95_000
  reprova o teste 2 (`95000 >= 90000 + 15000`); `proxy_read_timeout` 90 s → 70 s
  reprova o teste 1 (`70000 >= 60000 + 30000`); padrão de `tutor_timeout_seconds`
  60 → 70 reprova o teste 1 (`90000 >= 70000 + 30000`); `READ_TIMEOUT_MS` 20_000
  → 120_000 reprova o teste 3 (`120000 < 105000`); renomear
  `EVALUATION_TIMEOUT_MS` reprova a guarda.
- `pytest tests/unit/test_prazos_coerentes.py`: 4 passed. `ruff check`, `ruff
  format --check` e `mypy` no arquivo: limpos.
- `make check`: ver o corpo do PR.

## Pendências

- **P-prazo-medido-1 — a retentativa do SDK passa do corte do proxy (decisão do
  dono).** Com demora nos cabeçalhos o SDK chama de novo até `TENTATIVAS` (2)
  vezes (`tests/integration/test_anthropic_provider.py`, "depois das tentativas",
  medido: 1 + `TENTATIVAS` chamadas). O pior caso até o `tempo_esgotado` do
  backend é `(1 + 2) * 60 s` mais o backoff (~1,5 s), cerca de 181 s, contra
  90 s do nginx e 105 s do navegador. Nesse caminho a avaliação que o usuário
  vê é o 504 do nginx, **sem `code`** (texto genérico, reenvio seguro), enquanto
  o backend segue até gravar a falha; o reenvio depois do corte do órfão (90 s)
  pode abrir uma segunda chamada paga com a primeira ainda viva (inferido da
  leitura de `evaluation_records.py`, não reproduzido). A parada no meio do
  stream (sem retentativa) fica em 60 s e entrega o `code` normalmente. Subir o
  prazo do navegador não resolve (o nginx corta antes, em produção); a saída é
  de backend ou infra e tem custo de produto, por isso não foi adivinhada:
  (a) `max_retries=0` na avaliação, trocando resiliência por previsibilidade;
  (b) dividir o orçamento (timeout por tentativa = `tutor_timeout_seconds /
  (1 + TENTATIVAS)`), mantendo as três; (c) subir o nginx e o navegador para
  ~190 s e ~205 s, com o usuário esperando mais de 3 min. Recomendação: (b),
  porque preserva a retentativa e faz o `tempo_esgotado` caber nos 90 s. Toca
  `anthropic_provider.py` e `core/config.py`, fora do escopo mínimo deste PR.
- **Rede real:** continua exigindo a produção (telemetria de latência real, por
  exemplo `Server-Timing`/RUM). Sem isso os 20 s, 5 s e 15 s ficam como
  julgamento justificado pela relação com o backend.
