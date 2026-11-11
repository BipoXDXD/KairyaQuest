# Prazo próprio para o corpo de erro — 2026-11-11

Revisão-base: `846c47b` (main). Branch `wt/prazo-corpo-erro`.

Pendência 193 do `docs/HANDOFF.md` ("Prazo de 20 s sem medida real de rede.
Corpo de erro que não chega no prazo preserva o status e perde o code"):
**a parte do `code` perdido fica resolvida por este arquivo; a parte "20 s
sem medida real de rede" continua pendente** (resíduo abaixo). A consolidação
risca/rebaixa a linha 193 de acordo.

## Decisão da coordenação

**Opção escolhida: prazo próprio e explícito para o corpo de erro.** Nova
constante `ERROR_BODY_TIMEOUT_MS = 5_000` em `frontend/src/shared/api/client.ts`.
Quando os cabeçalhos de uma resposta de erro chegam, o `sendWithin` descarta o
prazo global e rearma o timer com esse prazo curto, só para a leitura do corpo.
O 200 não é tocado: o prazo global continua cobrindo cabeçalhos e corpo, e um
200 cujo corpo não chega segue sendo `ApiTimeoutError` (resultado desconhecido).
Mecanismo: `open` ganha o callback opcional `onErrorStatus`, chamado só quando
`!response.ok`, antes de ler o `code`; `send` o repassa; `sendWithin` o liga ao
rearme. Vale para `postJson`, `patchJson` e `requestJson`. `postStream` e os
POSTs sem `timeoutMs` não mudam (não têm timer).

Efeito: um 409 (`avaliacao_em_andamento`...) ou o 504 `tempo_esgotado` da
avaliação, cujos cabeçalhos chegam no limite do prazo, passam a entregar o
`code` se o corpo vier em até 5 s. Se o corpo não vier nem assim, sai
`ApiError(status, code nulo)`, como antes. O custo é o teto de um pedido que
falha com status passar de `timeoutMs` para `timeoutMs + 5 s`.

**Por que esta e não as outras (a mais conservadora que resolve 409 e 504):**

- *Mapear o 504 da avaliação para o texto de `tempo_esgotado` quando o `code`
  se perde*: recusada. Só cobriria o 504, não o 409; inventaria no cliente um
  `code` que o servidor não mandou (um 504 do nginx, sem `code`, passaria por
  `tempo_esgotado`); e a mudança seria por tela, não no cliente.
- *Prazo só até os cabeçalhos (desenho A da pendência 193, já recusado em
  2026-11-10)*: continua recusada. Deixaria sem prazo o corpo que não termina,
  e o botão voltaria a ficar preso. O desenho adotado mantém prazo em todo o
  percurso.
- *Dar ao corpo de erro o que sobrou do prazo global*: é o comportamento
  anterior e a origem do defeito (sobrava ~0).
- *Mudar os 20 s*: recusada; sem medida real de rede não se muda o número.
  Os 5 s também não têm medida real: o corpo de erro é um JSON de poucos bytes,
  então a folga é ampla, e o valor é uma constante nomeada, fácil de ajustar.

Sem mudança de contrato com o backend, nem em `main.py` ou
`tutoring/service.py`.

## Alterações

- `frontend/src/shared/api/client.ts`: `ERROR_BODY_TIMEOUT_MS`, `onErrorStatus`
  em `open`/`send`, rearme em `sendWithin`, docs do `postJson` e do
  `sendWithin`.
- `frontend/src/shared/api/client.test.ts`: bloco "corpo de erro com prazo
  próprio" (7 testes, fake timers): valor da constante; 409 no limite do prazo
  entrega o `code`; 504 `tempo_esgotado` no limite de `EVALUATION_TIMEOUT_MS`
  entrega o `code`; o mesmo para o GET; corpo de erro que nunca chega acaba 5 s
  depois dos cabeçalhos com status e sem `code`; 200 com corpo além de 5 s mas
  dentro do prazo chega intacto (caminho feliz); 200 sem corpo falha no prazo
  global como `ApiTimeoutError`. Os testes anteriores de "corpo de erro que não
  chega" seguem passando sem alteração.

## Verificação

- Vermelho primeiro: 5 dos 7 testes falharam antes da implementação (constante
  indefinida; `code` nulo no 409, no 504 e no GET; timer inexistente depois do
  prazo), pelos motivos esperados. Os outros dois descrevem o que não pode mudar.
- Mutação: chamar `onErrorStatus` também para o 200 derruba o teste "200 sem
  corpo falha no prazo global".
- `make check`: ver o corpo do PR (resultado lido da saída).

## Pendências

- **20 s sem medida real de rede (resíduo da 193):** `READ_TIMEOUT_MS`,
  `MUTATION_TIMEOUT_MS` e agora também `ERROR_BODY_TIMEOUT_MS` são julgamento,
  não medida. Fica aberta até haver telemetria de latência real.
