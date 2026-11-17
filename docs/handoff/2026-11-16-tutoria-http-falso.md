# #208 · Erros HTTP do provedor simulado

A extensão cobre o contrato do provedor falso usado nos testes de tutoria e avaliação. Revisão-base `e2b168a23a81b745ba71cfc22d9f8b27c80d3a40` (#231).

- O erro HTTP 429 traz `rate_limit_error` e o 529 traz `overloaded_error`. O envelope JSON de erro continua o mesmo, com `api_error` para os demais status já roteirizados. [Contrato da API](https://platform.claude.com/docs/en/api/errors)
- O controle `PUT /_control/script` aceita `retry_after` opcional em segundos, como número finito e não negativo associado a um `http_status` de erro (400 a 599). O falso envia o cabeçalho `Retry-After` quando o roteiro o define.
- Os testes exercitam o `PUT` e a resposta HTTP do falso para 429, 529 e 500, incluindo cabeçalho ausente e valores zero e fracionário. A validação do controle cobre valores inválidos. O cenário de navegador já existente para 429 passa a enviar 30 segundos e continua exigindo uma única chamada automática antes do retry manual.

Validação pendente na vaga de execução. O recorte é `python -m pytest -q tests/integration/test_falso_do_e2e.py tests/integration/test_anthropic_provider.py`. O hook oficial do commit executará `make check`, incluindo os cenários HTTP e SSE de tutoria. O pre-push verificará a ref em seu worktree temporário.
