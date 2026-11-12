# wt/proposta-nao-dict: payload que não é objeto vira `proposta_invalida` — 2026-11-12

Objetivo: fechar o achado da revisão do #153. No reagendamento, um `payload`
JSONB que não é objeto (lista, texto, número) quebrava em `AttributeError` no
`.items()`, antes do `model_validate`, e a rota respondia 500. É o mesmo defeito
da pendência 47 por outro caminho. Revisão-base: `daae7a2` (main).

## Declarações

- Zero dependência, endpoint, migração ou mudança de contrato. Nenhum teste
  pulado, limiar intacto, nenhum hook tocado.

## Decisão

O `payload` é lido como `object`: só um `dict` passa pelo filtro do retrato; o
resto segue inteiro para o `RescheduleProposal.model_validate`, que o recusa com
`ValidationError`. Assim há um único caminho de falha (`_falhar_por_proposta_invalida`,
422 `proposta_invalida` com a falha já gravada), sem um `if` próprio para tipo.
A criação de missão já recusava payload não-objeto pelo `MissionCreate`; o teste
agora prende isso.

## Alterações

- `src/focusquest/modules/tutoring/service.py`: `_confirmar_reagendamento`
  aceita payload que não é objeto e o entrega ao `model_validate`.
- `tests/integration/test_tutoring_reagendamento.py`: lista vazia, lista,
  texto e número gravam `falhou`/`proposta_invalida`, sem histórico, com
  reenvio idempotente. Vermelho antes da correção (`AttributeError`).
- `tests/integration/test_tutoring_acoes.py`: os mesmos casos na criação, e o
  teste de API que faltava: proposta de missão fora do esquema → 422
  `proposta_invalida`, falha commitada, reenvio igual, nenhuma missão.

## Pendência

- O nome do caso `retrato` no teste parametrizado da 47 continua enganoso
  (fica para depois, por decisão da coordenação).
