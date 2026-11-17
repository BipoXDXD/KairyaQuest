# #208 · Rota e expiração do stream no provedor falso

Base `eaceec93ee429ebbee3423b46367a3e3ca439200` (#232). Este lote reúne as duas pendências de protocolo no falso Python, usado pelo pytest e pelo E2E.

- O handler aceita POST em `/v1/messages`, inclusive o endpoint beta com query. O registro `Recebida` guarda o caminho. Outra rota recebe `404` antes de ler o corpo e fica fora do registro de chamadas.
- A espera do stream conserva o evento de liberação capturado ao receber a requisição. Se o evento expirar, o falso registra o erro, envia `event: error` com `api_error` e fecha a conexão. O teste de fio confere o delta já entregue e a ausência dos quadros seguintes. O teste com o SDK confere a exceção do cliente. Os testes substituem somente a espera do evento por um resultado determinístico.
- A fixture de Unicode usa a mesma recepção de mensagens e mantém sua serialização ASCII com escapes.

Validação planejada na reserva central. Recorte `python -m pytest -q tests/integration/test_provedor_falso.py tests/integration/test_falso_do_e2e.py tests/integration/test_anthropic_provider.py` para cobrir o handler, o controle E2E e o adaptador. O ciclo autorizado de commit e push usa os hooks obrigatórios, com o gate completo e a auditoria de limpeza.
