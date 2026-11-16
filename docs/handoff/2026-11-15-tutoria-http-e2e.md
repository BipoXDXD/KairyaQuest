# Falhas HTTP 429 e 529 do provedor da tutoria no navegador

Fatia de cobertura da #208, sobre `bfaca21a77c964ef87f3f53d9e685324ef45a759`.
Os dois cenários usam Chromium, API e PostgreSQL locais e o provedor falso
já mantido pela suíte.

- O roteiro do falso injeta HTTP 429 ou 529. O POST real do navegador
  retorna HTTP 200 com `text/event-stream`. A falha aparece como alerta e o
  histórico guarda uma resposta `falhou` com `provedor_indisponivel`, sem
  texto parcial nem ações. O falso registra uma única chamada antes do retry.
- O clique em “Tentar de novo” repete o corpo do POST, inclusive o identificador
  original da pergunta. A conversa preserva a pergunta e a resposta falha
  e registra uma resposta completa vinculada, com duas chamadas totais ao falso.

No worktree `tutoria-http-e2e`, com o banco de teste preparado, rodei em
`frontend/`:

```sh
FOCUSQUEST_E2E_PORT_OFFSET=6 npx playwright test --project=chromium --grep 'falha HTTP (429|529) do provedor' --repeat-each=3
```

As seis execuções passaram. Logs da API confirmaram o 429 `RateLimitError`
e o 529 `OverloadedError`. Com `http_status: 200` temporário, ambos os testes
falharam pela ausência do alerta. Restaurei o roteiro e conferi Prettier,
ESLint e `git diff --check`.
