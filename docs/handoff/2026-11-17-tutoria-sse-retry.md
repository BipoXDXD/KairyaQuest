# #208 · Retentativa da tutoria após erro SSE

Base `a3818436e601a2baabf66c6a55dd91dbafdfe3f4` (#233). O #231 entregou o
roteiro de sobrecarga e a prova do quadro `error` no fio e no SDK beta.
Este lote cobre as camadas seguintes do mesmo cenário.

- No adaptador, o primeiro delta chega e a sobrecarga vira
  `ProvedorIndisponivelError`. A causa é `APIStatusError` com status 200
  e tipo `overloaded_error`. O teste exige uma única chamada ao provedor.
- No navegador, a API responde com SSE. A primeira tentativa conserva o
  trecho parcial marcado como falho, com o ID registrado no histórico.
  “Tentar de novo” reenvia o mesmo corpo, incluindo `client_message_id`.
  O histórico preserva a pergunta e a resposta falha e ganha uma única
  resposta completa. O falso recebe uma chamada por tentativa.

Ruff lint e formatação do teste Python, Prettier e análise sintática do
spec TypeScript passaram. Os hooks do Git foram conferidos com
`make check-hooks`, sem executá-los.

Validação pendente na reserva central. Primeiro rodar
`tests/integration/test_anthropic_provider.py::test_erro_sse_apos_delta_vira_indisponivel_com_http_200`
com pytest. Depois preparar as dependências e o banco exclusivo do worktree
e rodar o cenário Playwright em Chromium com um worker e
`--grep 'erro SSE do provedor após HTTP 200'`. O gate completo, o commit
e o push seguem o fluxo com os hooks obrigatórios.
