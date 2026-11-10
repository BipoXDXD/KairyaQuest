# Kairya com Groq Free

A conversa e a avaliação usam exclusivamente `openai/gpt-oss-20b` na API
Groq. A aplicação não usa Anthropic nem troca automaticamente de modelo ou
provedor quando ocorre erro. Nenhuma assinatura dos agentes de programação
é usada para atender a tutora.

## Configurar

1. Mantenha sua organização no **plano Free**, sem ativar cobrança.
2. Crie uma chave em [Groq API Keys](https://console.groq.com/keys).
3. Preencha `FOCUSQUEST_GROQ_API_KEY` no `.env` local ou no arquivo privado de
   ambiente da API em produção. Não versione a chave, não a coloque no
   frontend nem em variáveis `VITE_*`.
4. Reinicie a API para carregar a configuração. Confirme `/api/tutoring/status`
   e depois faça uma conversa e uma avaliação reais, com acesso autenticado.
   O status só comprova configuração; não comprova validade da chave ou cota.

O endpoint é fixo em `https://api.groq.com/openai/v1/chat/completions`.
O modelo também é fixo; variáveis antigas `FOCUSQUEST_TUTOR_MODEL`,
`FOCUSQUEST_ANTHROPIC_*` e `FOCUSQUEST_TUTOR_FALLBACK` são aceitas para
compatibilidade, mas **não selecionam** provedor/modelo/fallback em produção.
Mesmo `FOCUSQUEST_TUTOR_FALLBACK=true` não habilita fallback.

`FOCUSQUEST_TUTOR_MAX_TOKENS` limita a saída do chat (padrão 2048); avaliação
usa 2048. `FOCUSQUEST_TUTOR_TIMEOUT_SECONDS` limita a espera (60 segundos) e
`FOCUSQUEST_TUTOR_HISTORY_MESSAGES` limita o histórico (20 mensagens).
O modelo usa esforço de raciocínio baixo e transmite texto em SSE. As
ferramentas são apenas as locais do produto; não habilitamos busca, execução
de código ou outras ferramentas hospedadas.

## Gratuidade e falhas

**A chave e o nome do modelo não comprovam o plano da conta.** A API de
completions não permite exigir uma conta Free por parâmetro. Se o titular
migrar a organização para um plano pago, o mesmo endpoint pode gerar custos.
A garantia operacional de custo zero exige manter a organização no Free;
a aplicação não altera plano, compra cota ou inclui método de pagamento.
Veja [Billing FAQs](https://console.groq.com/docs/billing-faqs).

Sem chave, Kairya fica indisponível e os demais recursos continuam funcionando.
Chave inválida, cota esgotada (429), falha de rede ou servidor são mostradas
pelos erros existentes do produto. Não há tentativa automática, redirect,
proxy herdado do ambiente ou fallback pago. Um reenvio manual continua
sujeito às regras de idempotência e nunca duplica recompensas.
Para diagnosticar, o log da API registra o status HTTP e os cabeçalhos de
limite do Groq (`retry-after`, `x-ratelimit-*`) de cada falha, sem corpo nem
chave: um 401 indica chave recusada; um 429 com `retry-after`, cota Free.

Os limites Free variam por organização/modelo; consulte sua conta em
[Rate Limits](https://console.groq.com/docs/rate-limits). Uma conversa longa
pode atingir a cota de tokens antes da quantidade de perguntas. Falhar por
limite não autoriza upgrade. Histórico/evidências são enviados ao Groq para
interpretar o pedido; não são enviados à Anthropic.

## Validação

Os testes automáticos usam transporte HTTP em memória com chave fictícia;
o gate bloqueia acesso ao Groq real. O adaptador histórico Anthropic fica
somente em testes explícitos e roteiros históricos. O E2E usa uma entrada
exclusiva em `tests/`, ausente do pacote de produção, com servidor loopback.

O adaptador só entrega uma proposta após o fim completo do stream e JSON
válido; o domínio valida o esquema e exige confirmação. Avaliações continuam
submetidas à rubrica e ao controle de recompensa existente. Fim ausente,
saída cortada/recusada ou ferramenta inválida nunca viram uma recompensa.
