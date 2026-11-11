# Pendência 49: code SSE desconhecido — 2026-11-11

Branch `wt/sse-code-desconhecido`, base `origin/main` f7a02d4. A linha 49 da
tabela do `docs/HANDOFF.md` fica resolvida por este arquivo.

## O que mudou

- `describeStreamFailure` (`frontend/src/features/tutoring/messageFailure.ts`)
  devolvia `UNKNOWN_RESULT` para um evento SSE `error` com `code` fora do
  mapa. O evento `error` só chega com a falha já gravada pelo backend, então o
  texto "não deu para saber se a resposta chegou" estava errado. Agora devolve
  `UNRECOGNIZED_FAILURE`: ação `retry` (mesmo `client_message_id`),
  `recovery` `tutoring.messageFailure.safeRetry`, e a mensagem nova.
- `UNKNOWN_RESULT` continua para o caso realmente desconhecido: stream sem
  `done` nem `error`, queda depois do `user_message`, erro de transporte sem
  `code` conhecido antes do stream.
- Chave nova nos dois catálogos (pt-BR e en); nenhuma chave existente
  alterada ou renomeada:
  - `tutoring.messageFailure.unrecognizedFailure.message`
    - pt-BR: "A Kairya não conseguiu responder a esta pergunta."
    - en: "Kairya couldn't answer this question. The reply wasn't completed."
  - Em inglês, com o `safeRetry`, o texto soma 16 palavras (contrato 12 a 18,
    medido por `errorTextLength.test.ts`).

## Decisão da coordenação

Não havia opção recomendada nos handoffs. Adotada a conservadora do brief:

- Escolhida: texto genérico de falha ("a pergunta não foi respondida") +
  "Tentar de novo é seguro", sem inventar causa.
- Recusadas: (a) manter "resultado desconhecido" (afirma incerteza que o
  servidor já resolveu); (b) mapear por prefixo ou adivinhar a causa a partir
  do code cru (inventa causa, e o code cru nunca vai para a tela); (c) ação
  `edit` ou bloqueio do campo (não há evidência de que repetir seja inútil).

## Testes (vermelho antes)

- `messageFailure.test.ts`: code desconhecido (`code_novo`, `constructor`)
  → `UNRECOGNIZED_FAILURE`, não `UNKNOWN_RESULT`; chaves no catálogo.
- `useTutorConversation.test.tsx`: `error` com code desconhecido depois do
  `user_message` → `send.status === 'failed'` com a mensagem nova e
  `retryTarget` com o mesmo id.
- `errorTextLength.test.ts`: o texto em inglês do caso novo, e o
  `UNKNOWN_RESULT` passa a ser medido direto (antes só entrava via code
  desconhecido).

Backend e `modules/tutoring/service.py` não foram tocados.

## Comandos e resultados lidos

- Vermelho: `npx vitest run` nos três arquivos de teste: 5 falhas pelo motivo
  esperado (`UNRECOGNIZED_FAILURE` inexistente; texto antigo).
- Verde: `npx vitest run src/features/tutoring src/shared/i18n`: 26 arquivos,
  533 testes passando.
- `make check` sob `lote-off9.lock` (deslocamento 9): EXIT 0. Linhas lidas:
  vitest 100 arquivos / 2147 testes; pytest 1930 passed, cobertura 100,00%;
  Playwright 123 passed; gitleaks sem vazamentos; `check-wheel` ok.
- `git diff origin/main -- docs/HANDOFF.md` vazio.
