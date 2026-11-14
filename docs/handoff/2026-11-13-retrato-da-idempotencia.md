# Retrato de idempotency_keys e ajustes da paridade da estimativa

## Objetivo
Resolver #185 (tamanho de `idempotency_keys` visível, guarda-chuva #205) e
fechar três ajustes de revisão do PR #214 (itens #187 e #191 da #206).

Revisão-base: o head do PR #214 (`2782c2d`), trazida para a `main` depois do
merge dele.

## Decisões e porquê
- **#185 é um log, não uma métrica.** O repositório não tem sistema de
  métricas, e o `core/log.py` adia o JSON até haver quem o consuma. Cada
  criação com `Idempotency-Key` registra em INFO
  `reservas de idempotencia: total=N mais_antiga_s=S`, com os mesmos números
  nos campos `idempotency_keys_total` e `idempotency_keys_oldest_age_s` do
  registro.
  - O retrato é tirado depois da limpeza das vencidas do próprio usuário e
    antes da reserva nova: assim `S` acima de 24 h aponta exatamente a
    reserva que a limpeza no POST não alcança.
  - Só tamanho e idade. Chave, impressão do corpo e usuário nunca entram no
    registro, e um teste confere isso nos campos do `LogRecord`.
  - Uma consulta de `count(*)` e `min(created_at)` por criação com chave. A
    tabela tem teto de 24 h por usuário; não houve medição de custo.
- **Ajustes do PR #214:** `MIN_ESTIMATE_MINUTES = 1` em
  `shared/types/mission.ts`, presa a `ESTIMATIVA_MINIMA_DA_AVULSA` pela
  paridade; o texto `estimateOutOfBounds` interpola `{min}` e `{max}`; o
  `portugueseText` do teste de comprimento repassa `vars`.

## Alterações
- `src/focusquest/modules/missions/idempotency.py`: `_registrar_retrato`.
- `tests/integration/test_idempotencia_da_criacao.py`: dois testes do
  retrato (com reserva envelhecida de outro usuário, e com a tabela vazia).
- `docs/ARCHITECTURE.md`, seção de logging: onde ler o retrato e o valor
  esperado.
- Front: `shared/types/mission.ts`, `tutoring/actionFailure.ts`, catálogos
  `pt-BR` e `en`, com os testes; `tests/unit/test_paridade_dos_limites.py`.

## Resultados
- Os dois testes do retrato reprovaram antes da implementação (nenhum
  registro) e passam depois.
- A guarda dos segredos reprovou com a chave sabotada no registro, tanto
  numa linha extra quanto num campo do retrato.

## Pendências
- Nenhuma limpeza fora do POST: se o retrato mostrar `S` acima de 24 h com
  frequência, a limpeza global vira um item próprio.
