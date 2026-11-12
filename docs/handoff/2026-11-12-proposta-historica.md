# wt/proposta-historica: proposta histórica fora do esquema não vira 500 (pendência 47) — 2026-11-12

Objetivo: confirmar uma proposta da tutora (`create_mission` ou `reschedule_mission`)
gravada antes do endurecimento do esquema levantava `ValidationError` no
`POST /api/tutoring/actions/{id}/confirm`, e a API respondia 500. Agora a
confirmação grava a ação como `falhou` com `error_code = proposta_invalida` e responde
422 com `code` `proposta_invalida`. Revisão-base: `e3236c6` (main). Resolve a
pendência 47.

## Declarações

- Zero dependência nova, zero endpoint, zero migração. Nenhum teste pulado, limiar
  intacto, nenhum hook tocado.
- **Mudança de contrato (aditiva):** novo `code` `proposta_invalida` (422) na
  confirmação. Antes o mesmo caso era 500 sem corpo útil. O valor é o mesmo do
  `CodigoDoStream.PROPOSTA_INVALIDA`, e um teste prende a paridade entre HTTP, stream
  e a constante gravada na ação.

## Decisão: recusar em vez de tolerant reader

Ler a proposta antiga com tolerância criaria ou alteraria uma missão com valores que a
tela atual já não aceita (instruções acima do teto, dificuldade 6, prazo sem fuso,
motivo aposentado). A confirmação recusa: grava a falha na própria ação, no mesmo
molde de `prazo_expirado` e `reagendamento_invalido` (`_gravar_falha`), e o reenvio
com a mesma chave devolve o mesmo resultado (idempotente). O usuário pede outra
proposta.

## Alterações

- `src/focusquest/modules/tutoring/domain.py`: constante `PROPOSTA_INVALIDA`.
- `src/focusquest/modules/tutoring/service.py`: resultado `PropostaInvalida`; a
  validação de `MissionCreate` e de `RescheduleProposal` captura `ValidationError` e
  grava a falha; `_resultado_anterior` reconhece o código no reenvio.
- `src/focusquest/core/errors.py`, `router.py`, `main.py`: `PropostaInvalidaError`,
  `CodigoDeErro.PROPOSTA_INVALIDA` e o handler 422.
- `frontend/src/features/tutoring/{types.ts,actionFailure.ts}`: o código entra no
  mapa de falhas com saída `invalidated` (o cartão passa a "falhou" sem nova
  chamada) e o texto genérico já existente; nenhuma string nova no catálogo.
- Testes: `tests/integration/test_tutoring_acoes.py` e
  `test_tutoring_reagendamento.py` (serviço e API, com reenvio), e no front
  `actionFailure.test.ts` e `useDecideAction.test.tsx`.
