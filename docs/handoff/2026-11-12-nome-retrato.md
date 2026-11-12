# wt/nome-retrato: nome do parâmetro de teste `retrato` → `sobrescritas` — 2026-11-12

Objetivo: renomear sem mudar a lógica. Em `tests/integration/test_tutoring_reagendamento.py`,
o helper `_proposta` tinha o parâmetro `retrato`, mas ele mescla **qualquer** campo
no payload gravado. O caso `{"retrato": {"mission_id": "12"}}` da pendência 47
sobrescreve o `mission_id`, que não é campo do retrato (`CAMPOS_DO_RETRATO` =
`instructions` e `previous_deadline`), e o nome enganava. Agora o parâmetro se chama
`sobrescritas` e a docstring explica o que ele faz. Os ids dos casos e as asserções
não mudam.

Declarações: só teste; zero dependência, endpoint, migração ou mudança de contrato.
Resolve o achado menor do nome do caso `retrato`, registrado no fragmento
`2026-11-12-proposta-nao-dict.md`.
