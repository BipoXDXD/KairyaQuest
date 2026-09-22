# Spec de design — Incremento 1b: a Tifa, propor e confirmar uma missão, e o chat

**Data:** 2026-09-18
**Estado:** desenhada com o dono, seção por seção, e aprovada por ele em cada
uma. **Nada foi implementado.** Entrega em duas partes, cada uma com o seu PR
verde: **1b-1** (backend) e **1b-2** (frontend, E2E e a chamada real).

## O que o README pede

- §14: "Com credenciais, Tifa propõe uma missão e a cria após confirmação. Sem
  elas, teste o contrato e mostre indisponibilidade; não simule tutoria real
  com dados fixos."
- §6: o provedor é configurável; chamadas e credenciais ficam no backend, com
  limites, timeouts e modelo configuráveis; o modelo **solicita** e o backend
  **autoriza e executa**; novos compromissos exigem confirmação; mensagens e
  ações são persistidas com estados de proposta, confirmação, execução e
  falha; o raciocínio interno do modelo não é armazenado; o adaptador
  determinístico é para testes, não para tutoria real; a integração é testada
  sem chamadas pagas nem segredos reais.
- §5: a personalidade é acolhedora, enérgica e assertiva, sem culpa nem
  ameaças, com falas originais, sem inventar fontes, e com pistas graduais
  antes da solução.
- §7: no desktop, um painel expansível da Tifa; no celular, a conversa não
  cobre botões, não prende o teclado e não exige rolagem horizontal; o texto
  digitado é preservado depois de falhas; o reenvio não duplica; o retrato é
  um placeholder até haver assets autorizados.

## Decisões do dono (2026-09-18)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Credencial | O dono **tem uma chave da API da Anthropic** para o produto, separada da assinatura do Claude Code. Ela fica só no `.env` local dele: nunca no repositório, nunca no CI. |
| D2 | Como confirmar uma proposta | **Cartão com botões Confirmar e Recusar.** O clique vai direto ao backend, sem passar pelo modelo: o "sim" é determinístico e testável. |
| D3 | Forma da conversa | **Uma conversa contínua**, persistida. Só as últimas N mensagens vão ao modelo. |
| D4 | Como a resposta chega | **Streaming no 1b.** O dono escolheu isso sabendo que o incremento cresce. |
| D5 | Transporte do streaming | **Abordagem 1:** um POST que responde em `text/event-stream`, com a geração presa à requisição. As alternativas (turno em segundo plano com reconexão; WebSocket) foram recusadas. |
| D6 | Divisão | **1b-1** backend, **1b-2** frontend. |
| D7 | Histórico enviado ao modelo | **Configurável**, com padrão 20 mensagens. |
| D8 | O servidor falso dos testes | Tem de emitir **o formato exato que a versão fixada do SDK entende**, garantido pelas três camadas da seção "O servidor falso". |

Já decidido antes, na spec do 1a: **provedor Anthropic**, modelo padrão
**`claude-opus-5`**, configurável; o módulo `tutoring` nasce no 1b.

## Contexto que morde

- **A missão não tem título.** Os campos do `MissionCreate` são
  `instructions`, `completion_criterion`, `difficulty` (1 a
  `DIFICULDADE_MAXIMA` = 5), `estimated_minutes` e `deadline`, que é
  **obrigatório**. A Tifa precisa propor um prazo, então recebe o "agora" do
  relógio injetável do Incremento A.
- **O `Settings` recusa variável desconhecida** (pendência 12). Cada campo
  novo entra também no `.env.example`, com prefixo `FOCUSQUEST_`.
- **Exceção deliberada à docstring do `Settings`**, que diz que nenhuma
  credencial tem valor padrão, "esquecer de configurar precisa falhar na
  partida". A chave da Anthropic é **opcional**: o README §6 manda mostrar
  indisponibilidade sem credencial, então a ausência dela é um **estado do
  produto**, não uma configuração esquecida. A docstring passa a registrar a
  exceção e o motivo. As URLs de banco continuam obrigatórias.
- **O backend é síncrono** (SQLAlchemy 2 e psycopg 3 síncronos). O streaming
  segue o mesmo modelo, e o módulo não abre um segundo modelo de concorrência.
- **Erros** seguem o formato do A, `{"detail", "code"}`, com os códigos no
  `CodigoDeErro` de `main.py`. Os valores são contrato e ficam em português,
  como os do A. O cliente nunca lê o `detail`.

## Modelo de dados (1b-1, migração `0002`)

No padrão das tabelas existentes: `CheckConstraint` para estado,
`UniqueConstraint` e índices únicos para idempotência, chave estrangeira para o
usuário único semeado pela `0001`.

### `tutor_messages`

| Coluna | Tipo e regra |
|---|---|
| `id` | `Integer`, PK |
| `user_id` | FK `users.id`, não nulo |
| `role` | `Text`, `CHECK role IN ('user', 'tutor')` |
| `content` | `Text`, não nulo. Numa resposta `interrompida` ou `falhou`, o texto parcial, que pode ser vazio |
| `status` | `Text`, `CHECK status IN ('gerando', 'completa', 'interrompida', 'falhou')`. A mensagem do usuário nasce `completa` |
| `client_message_id` | `Text`, nulo nas mensagens da Tifa. **Único** entre as mensagens do usuário |
| `reply_to_id` | FK `tutor_messages.id`, nulo nas mensagens do usuário. Na resposta da Tifa, aponta para a pergunta |
| `error_code` | `Text`, nulo. Preenchido quando `falhou` |
| `created_at` | `timestamptz`, não nulo |

**Restrições que o banco garante:**

- `CHECK`: `role = 'user'` exige `client_message_id` não nulo, `reply_to_id`
  nulo e `status = 'completa'`; `role = 'tutor'` exige `client_message_id`
  nulo e `reply_to_id` não nulo.
- **Uma resposta viva por pergunta:** índice único parcial em `reply_to_id`
  `WHERE status = 'completa'`. "Tentar de novo" cria outra resposta; as
  tentativas `interrompida` e `falhou` ficam como histórico.
- **Uma resposta sendo gerada por vez:** índice único parcial em `user_id`
  `WHERE status = 'gerando'`. A conversa é uma só: duas perguntas em paralelo
  intercalariam as respostas.

### `tutor_actions`

| Coluna | Tipo e regra |
|---|---|
| `id` | `Integer`, PK |
| `message_id` | FK `tutor_messages.id`, não nulo: a resposta da Tifa que propôs |
| `kind` | `Text`, `CHECK kind IN ('create_mission')` |
| `payload` | `JSONB`, não nulo. **Validado pelo `MissionCreate` antes de ser gravado**: uma proposta inválida nunca vira linha |
| `state` | `Text`, `CHECK state IN ('proposta', 'executada', 'recusada', 'falhou')` |
| `mission_id` | FK `missions.id`, nulo; `CHECK (state = 'executada') = (mission_id IS NOT NULL)` |
| `operation_id` | `Text`, nulo; **único**. Gravado na confirmação |
| `error_code` | `Text`, nulo; preenchido quando `falhou` |
| `created_at`, `decided_at` | `timestamptz`; `decided_at` nulo enquanto `proposta` |

**Confirmação e execução são um passo só no 1b.** O §6 lista os estados
proposta, confirmação, execução e falha. Aqui, confirmar cria a missão, grava
`state = 'executada'` e o `mission_id` **na mesma transação**, com
`SELECT … FOR UPDATE` na ação. Não existe um estado "confirmada e ainda não
executada" que alguém pudesse observar, e por isso ele não tem valor no
`CHECK`. Se um fluxo futuro separar os dois passos, o estado entra junto.

**O raciocínio interno do modelo não é pedido nem gravado** (§6). O
_extended thinking_ fica desligado; só o texto final e a chamada de ferramenta,
já convertida em ação, chegam ao banco.

## Contrato HTTP (1b-1)

| Método e rota | Entrada | Saída |
|---|---|---|
| `GET /api/tutoring/status` | — | `{"available": bool}`. `false` quando não há chave |
| `GET /api/tutoring/messages` | — | as últimas 50 mensagens, em ordem cronológica, cada resposta da Tifa com as suas ações embutidas. **Sem paginação no 1b** (declarado em "Fora") |
| `POST /api/tutoring/messages` | `{"client_message_id", "content"}` | `text/event-stream` (ver abaixo) |
| `POST /api/tutoring/actions/{id}/confirm` | `{"operation_id"}` | `{"action", "mission"}` |
| `POST /api/tutoring/actions/{id}/reject` | — | `{"action"}` |

Os nomes de campo ficam em inglês: payload de API é contrato externo (README
§3, decisão B do dono).

### O stream do `POST /api/tutoring/messages`

Eventos SSE, nesta ordem:

1. `user_message`: a pergunta, **já gravada**, com o `id` do banco.
2. `delta`, zero ou mais vezes: `{"text": "…"}`.
3. Um final, e só um:
   - `done`: a resposta `completa` e as ações dela, emitido **depois do
     commit**;
   - `error`: `{"code": "…"}`, emitido **depois de a falha estar gravada** como
     `falhou`.

Um stream que termina sem `done` nem `error` é **resultado desconhecido**,
como a resposta perdida do Incremento A: o cliente oferece "Tentar de novo", e
o reenvio é seguro.

### Reenvio: o mesmo POST, o mesmo `client_message_id`

"Tentar de novo" não é um endpoint próprio. O mesmo `client_message_id`
resolve três casos:

| O estado da pergunta | O que o POST faz |
|---|---|
| Já tem resposta `completa` | Emite `user_message` e um `done` com essa resposta, **sem chamar o modelo** |
| A última resposta está `interrompida` ou `falhou` | Gera uma resposta nova |
| Há uma resposta `gerando` | `409 mensagem_em_andamento` |

Um `client_message_id` já gravado com **outro** `content` responde
`409 operacao_reutilizada`, o código do A, com o mesmo sentido: gere um
identificador novo.

### A resposta `gerando` e o órfão

A resposta nasce gravada como `gerando`, num commit próprio, antes de chamar
o provedor. Isso evita segurar uma transação aberta durante o stream, e o
índice parcial garante uma só por usuário.

Se o processo morrer no meio, a linha ficaria `gerando` para sempre e
travaria a conversa. Por isso toda nova pergunta primeiro marca como
`interrompida` qualquer resposta `gerando` cujo `created_at` seja mais antigo
que `tutor_timeout_seconds` mais uma folga de 30 segundos, medidos pelo
relógio injetável.

### Erros antes do stream

Respondem JSON comum, e **a pergunta não é gravada**:

| Situação | Resposta |
|---|---|
| Sem chave | `503 provedor_nao_configurado` |
| Resposta `gerando` em andamento | `409 mensagem_em_andamento` |
| `client_message_id` reusado com outro conteúdo | `409 operacao_reutilizada` |
| Corpo inválido (vazio, campo faltando) | `422` do Pydantic, sem `code`, como no A |

### Erros dentro do stream (`event: error`)

| `code` | Quando |
|---|---|
| `provedor_indisponivel` | o provedor recusou ou falhou depois das tentativas do SDK |
| `tempo_esgotado` | estourou `tutor_timeout_seconds` |
| `proposta_invalida` | o modelo chamou `create_mission` com entrada que o `MissionCreate` recusa |

### Confirmar e recusar

| Situação | Resposta |
|---|---|
| Confirmar uma `proposta` | `200`; a missão nasce e a ação vira `executada`, na mesma transação |
| Confirmar de novo com o mesmo `operation_id` | `200`, igual ao anterior |
| `operation_id` já usado em outra ação | `409 operacao_reutilizada` |
| Confirmar uma `executada` com um `operation_id` **novo** | `409 transicao_ilegal`, como concluir de novo uma missão concluída no A |
| Confirmar uma `recusada` ou `falhou`; recusar uma `executada` ou `falhou` | `409 transicao_ilegal` |
| Recusar uma `recusada` | `200`, idempotente |
| O prazo já passou na hora de confirmar | `422 prazo_expirado`; a ação vira `falhou` com esse código |
| Ação inexistente | `404 acao_nao_encontrada` |

O `prazo_expirado` é a única pré-condição nova: o prazo proposto era futuro
quando a Tifa o escreveu e pode ter passado quando você clica.

## O provedor (1b-1)

### A interface

O serviço de tutoria depende de um `Protocol`, não do SDK. O provedor recebe o
contexto do turno e devolve uma sequência de eventos: `Delta(texto)`,
`Proposta(payload)` e `Fim`. O serviço grava e emite, e não sabe que existe
Anthropic.

### O adaptador Anthropic

- **SDK oficial `anthropic`**, uma dependência nova com o motivo escrito no
  `docs/HANDOFF.md`, como o `AGENTS.md` §4 exige. O README §6 permite "SDK
  oficial ou HTTPX"; o SDK traz os tipos do stream, o que o servidor falso usa.
- **Síncrono.** O `StreamingResponse` roda o gerador numa thread. Quando o
  cliente desconecta, o Starlette para de consumir o gerador; o `finally`
  fecha o stream do SDK e grava a resposta como `interrompida`, com o texto
  parcial e **sem ação**.
- **Tentativas:** no máximo 2, do próprio SDK, e só antes do primeiro evento.
  Depois do primeiro `delta` não há nova tentativa.

### A ferramenta `create_mission` só propõe

- O `input_schema` é gerado do `MissionCreate`, a mesma fonte do
  `POST /api/missions`, para as duas não divergirem.
- Quando o modelo a chama, o backend **não a executa e não devolve
  `tool_result`**. Ele valida a entrada pelo `MissionCreate` e grava uma
  `tutor_action` com `state = 'proposta'`. O turno termina.
- `tool_choice` com `disable_parallel_tool_use`: **uma proposta por resposta**,
  como o §14 pede.
- Se a entrada for inválida, nenhuma ação é gravada. A resposta vira `falhou`
  com `proposta_invalida`, mantendo o texto já escrito, e **não há nova chamada
  automática** (§6: "não repita chamadas indefinidamente").

### O contexto de cada turno

- As últimas `tutor_history_messages` mensagens com `status = 'completa'`. As
  `interrompida` e `falhou` ficam fora, porque meio texto confunde o modelo.
- **As ações antigas entram como texto**, com o estado real, por exemplo
  "Proposta de missão #12 — executada". A API da Anthropic exige um
  `tool_result` depois de cada `tool_use`, e o backend não devolve resultado;
  representar a proposta como texto mantém o histórico bem formado e diz ao
  modelo o que foi confirmado ou recusado.
- As missões pendentes do usuário, só leitura. É o `get_study_context` do
  §6, e não vira ferramenta no 1b: vai no prompt.
- O "agora", pelo relógio injetável, em UTC.

**Injeção de prompt.** O que o usuário escreve é dado não confiável (§6). O
pior que uma injeção consegue é uma **proposta**, que a pessoa vê no cartão e
pode recusar. A ferramenta não tem outro poder, e o backend nunca executa
código, SQL ou shell vindos do modelo.

### A persona

O prompt de sistema fica num arquivo versionado do módulo `tutoring`, com o
que o §5 exige: acolhedora, enérgica e assertiva; sem culpa, ameaça nem
vigilância fictícia; falas originais; não inventar fontes nem tratar incerteza
como verificada; pistas graduais antes da solução, respeitando o pedido da
pessoa.

### `Settings`

Cada campo com a linha correspondente no `.env.example`:

| Campo | Variável | Padrão |
|---|---|---|
| `anthropic_api_key` | `FOCUSQUEST_ANTHROPIC_API_KEY` | `SecretStr \| None = None`. Ausente: `available: false` |
| `anthropic_base_url` | `FOCUSQUEST_ANTHROPIC_BASE_URL` | `None`, que usa o endereço do SDK. Só os testes o apontam para o servidor falso |
| `tutor_model` | `FOCUSQUEST_TUTOR_MODEL` | `claude-opus-5` |
| `tutor_max_tokens` | `FOCUSQUEST_TUTOR_MAX_TOKENS` | `1024` |
| `tutor_timeout_seconds` | `FOCUSQUEST_TUTOR_TIMEOUT_SECONDS` | `60` |
| `tutor_history_messages` | `FOCUSQUEST_TUTOR_HISTORY_MESSAGES` | `20` |

## O servidor falso

Um servidor HTTP que fala o formato SSE da API de Mensagens da Anthropic e
mora em `tests/`. O `anthropic_base_url` aponta o SDK real para ele no pytest
e no E2E. Assim, os testes exercitam **o adaptador de produção inteiro**,
incluindo a leitura que o SDK faz do stream, e não existe um "modo falso"
dentro de `src/` que alguém pudesse ligar por engano.

O falso é roteirizado por teste: texto em pedaços, uma chamada de
`create_mission` com uma entrada dada, uma entrada inválida, uma falha HTTP,
um corte no meio do stream, uma demora maior que o timeout. Ele conta as
chamadas recebidas, para os testes provarem que o reenvio de uma pergunta já
respondida não chama o modelo.

**O formato exato (decisão D8), em três camadas:**

1. **Construído com os tipos do SDK fixado.** Cada evento é um objeto do
   próprio SDK (`RawMessageStartEvent`, `RawContentBlockStartEvent`,
   `RawContentBlockDeltaEvent`, `RawContentBlockStopEvent`,
   `RawMessageDeltaEvent`, `RawMessageStopEvent`), serializado pelo modelo
   Pydantic dele. Não há JSON escrito à mão; um campo errado não passa no
   mypy.
2. **Teste de contrato.** O SDK real consome o stream do falso por
   `client.messages.stream(...)`, e o teste confere que a `Message` final
   montada pelo SDK tem o texto e o bloco `tool_use` com a entrada esperada. Se
   a versão do SDK no `uv.lock` mudar e deixar de entender o falso, este teste
   reprova no gate. A guarda é vista reprovando por mutação (trocar um tipo de
   evento) antes de valer.
3. **Referência gravada de uma chamada real.** A chamada real que o dono faz
   uma vez no 1b-2 grava a **sequência de tipos de evento** de uma resposta
   com texto e proposta, sem o conteúdo, num arquivo em `tests/`. Um teste
   confere que o falso emite a mesma sequência. Isso cobre o que as camadas 1
   e 2 não veem: o falso poderia ser válido para o SDK e ainda assim diferente
   do que a API manda.

A camada 3 só existe depois da chamada real. Até lá, o 1b-1 a registra como
pendência no HANDOFF, sem afirmar mais do que foi medido.

## A tela (1b-2)

- **O painel da Tifa.** No desktop, fica à direita do Quartel-General,
  expansível, com o estado aberto ou fechado lembrado no `localStorage`. No
  celular, abre por um botão fixo como folha sobre a tela, com o campo de texto
  acima do teclado, sem esconder o enviar e sem rolagem horizontal. A
  navegação lateral fica para o Incremento C.
- **Retrato:** placeholder original, com as iniciais e a cor verde-mako.
  Nenhum asset dos jogos (§7).
- A feature nova é `frontend/src/features/tutoring/`, que não importa nada de
  fora de `shared/`. A recarga do quadro depois de uma confirmação passa pela
  página, que compõe as duas features.

### Estados

| Estado | O que a pessoa vê |
|---|---|
| Carregando o histórico | esqueleto das mensagens |
| Indisponível (`available: false` ou `503 provedor_nao_configurado`) | "A Tifa está fora do ar: falta configurar o provedor." O campo fica desabilitado e o Quartel-General continua funcionando |
| Vazio | uma saudação fixa **da interface**, não uma fala inventada da Tifa |
| Escrevendo | o texto chega pelos `delta`. "Tifa está escrevendo…" numa região viva que **existe desde o primeiro render**; o leitor de tela anuncia o início e o fim, não cada palavra |
| Interrompida ou falhou | o texto parcial fica visível e marcado; "Tentar de novo" reenvia o mesmo `client_message_id` |
| Proposta | cartão com instruções, critério, dificuldade, minutos e prazo, e os botões Confirmar e Recusar |
| Executada | "Missão criada" e um link para o Quartel-General; a lista do quadro recarrega, respeitando a espera do Incremento A se houver uma conclusão em voo |
| Recusada | o cartão fica marcado como recusado, sem botões |
| Falhou (`prazo_expirado`) | a explicação, e a sugestão de pedir outra proposta à Tifa |

**O texto digitado nunca se perde** (§7). O campo só é limpo quando o evento
`user_message` confirma a gravação. Um `503` ou `409` antes do stream deixa o
texto lá.

### Reuso do Incremento A

- O Confirmar segue o desenho do Concluir: `operation_id` criado no primeiro
  clique, mantido entre tentativas de resultado desconhecido e trocado só
  depois de `operacao_reutilizada`.
- Um mapa exaustivo `code → {message, recovery}` sobre o tipo, com
  `Object.hasOwn`, como o `completionFailure.ts`.
- O `postJson` para confirmar e recusar. Uma função nova, `postStream`, no
  `shared/api/client.ts`, com `fetch` e `ReadableStream`, porque o
  `EventSource` só faz GET.

## Testes

Cobertura de 100% nos dois lados, e toda guarda nova vista reprovando por
mutação antes de valer.

### Backend (1b-1): PostgreSQL real e o servidor falso

- O stream: a ordem dos eventos; o `done` só depois do commit, provado lendo o
  banco no instante do `done`; o `error` só depois de a falha estar gravada.
- A desconexão no meio: a resposta fica `interrompida`, com o texto parcial e
  sem ação.
- O reenvio, nos três casos: `done` imediato sem chamar o falso (o contador de
  chamadas mede zero); resposta nova depois de uma `interrompida`; `409`
  enquanto está `gerando`. E `operacao_reutilizada` com o mesmo id e outro
  conteúdo.
- Concorrência, com threads, como o teste de concorrência atual: duas
  perguntas ao mesmo tempo resultam em exatamente uma `gerando` e um `409`;
  dois Confirmar com o mesmo `operation_id` resultam em **uma** missão.
- O órfão `gerando` é recolhido depois do prazo, com o relógio injetável
  avançado, sem `sleep`.
- A proposta inválida: nenhuma linha em `tutor_actions` e a resposta `falhou`
  com `proposta_invalida`.
- O `prazo_expirado` na confirmação, com o relógio injetável.
- Sem chave: `available: false` e `503` antes de gravar qualquer coisa.
- As três camadas do servidor falso.
- O segredo: um teste procura o valor da chave na resposta HTTP e no log
  capturado, e não o encontra. O `SecretStr` a esconde do `repr`.
- As restrições do banco, cada uma provada por um `INSERT` direto que o banco
  recusa.

### Frontend (1b-2)

O Vitest cobre cada estado da tabela da tela e o `postStream`, inclusive um
stream cortado sem `done`, um `503` e um `409` antes do stream, com o texto
preservado.

### E2E (1b-2), com o servidor falso

- Perguntar, ver o texto chegar, confirmar a proposta e ver a missão no
  quadro.
- Recusar uma proposta.
- A resposta cortada no meio, seguida de "Tentar de novo", sem duplicar.
- O estado indisponível.

O axe roda nos estados escrevendo, proposta e indisponível. O servidor falso
usa uma porta própria, acrescentada às pendências 19 e 20, que continuam
valendo.

### A chamada real (1b-2)

O dono faz uma vez, localmente, com a chave dele, seguindo um roteiro curto no
HANDOFF: pedir uma missão, confirmar, ver no quadro. Essa chamada grava a
referência da camada 3. **O CI nunca chama a Anthropic** e nunca recebe a
chave.

## Fora do 1b, documentado sem endpoint

- As ferramentas `propose_plan`, `submit_activity`, `reschedule_mission` e
  `request_reward_evaluation` (§6).
- O ajuste de intensidade, frequência e horários das cobranças, e a pausa (§5).
- Várias conversas; paginação do histórico além das últimas 50 mensagens.
- Retomar um stream depois de recarregar a página: a Abordagem 2 da decisão
  D5, que pode vir depois sem mudar o contrato das mensagens. Até lá,
  recarregar no meio de uma resposta a deixa `interrompida`, e a tela oferece
  "Tentar de novo".
- O retrato definitivo e as expressões da Tifa.
- Concessão de XP pela Tifa: continua determinística, pela conclusão (§6).

## Riscos

- **Custo por mensagem.** Cada turno envia até 20 mensagens mais o contexto ao
  `claude-opus-5`. O número e o modelo são configuráveis; nenhum teto de gasto
  é imposto pelo produto no 1b.
- **O formato do stream mudar numa versão futura do SDK.** As camadas 2 e 3
  fazem o gate reprovar em vez de a tela quebrar em silêncio.
- **O corte do stream no celular** (troca de rede, aba em segundo plano) vira
  `interrompida` com mais frequência que no desktop. O reenvio é seguro e não
  custa uma chamada se a resposta tiver chegado a `completa`.

## Emendas (2026-09-19, execução do 1b-1)

Esta spec foi escrita antes da implementação, como a do 1a. O plano
(`docs/superpowers/plans/2026-09-19-incremento-1b-1.md`) fez nove medições
num projeto descartável antes de qualquer código de produção ("Medições que
corrigem a spec") e registrou quatro decisões que a spec não fixava
("Decisões que a spec não fixava"). A execução das oito tarefas, por sua
vez, corrigiu uma das nove medições do próprio plano (M1) e encontrou três
divergências que nem a spec nem o plano previam. Nos casos abaixo o texto
original permanece intocado; a emenda fica ao lado.

### As nove medições do plano (M1–M9)

| # | O que a spec supunha | O que foi medido | Consequência |
|---|---|---|---|
| M1 | "Quando o cliente desconecta, o Starlette para de consumir o gerador; o `finally` fecha o stream do SDK e grava `interrompida`" (seção "O adaptador Anthropic"). O plano mediu que, com um gerador **síncrono** cru, o `finally` **nunca roda** numa janela de observação de **2 segundos**, e por isso desenhou o invólucro `fechando_ao_cancelar`. | A Task 7 mediu de novo, no código real e com uma janela de **15 segundos**: sem as duas guardas (`fechando_ao_cancelar` e o `finally: eventos.close()` de `router._em_sse`), a cadeia **fecha mesmo assim** — só que **tarde** (3 a 11 s, em 4 amostras) e por um mecanismo diferente do desenhado: a escrita do próximo evento no socket já morto falha, e essa falha aciona a finalização automática de generator do CPython (refcounting, sem depender do coletor de ciclos — confirmado com `gc.disable()`). O "nunca" do plano era um artefato da janela curta de observação, não uma propriedade do Starlette. | As duas guardas **ficam**: dão fechamento **imediato** (~1 ms medido) e **portável** — não dependem de quanto tempo o SO leva para notar o socket morto, nem de um detalhe de implementação do CPython que a linguagem não promete como contrato. Nenhuma das duas é discriminada pelo teste de desconexão ponta a ponta (mutação isolada ou combinada das duas); cada uma tem prova unitária determinística própria: o invólucro em `tests/unit/test_tutoring_sse.py::test_cancelar_o_consumo_fecha_o_gerador`, o `finally` em `tests/unit/test_tutoring_router_sse.py::test_fechar_o_em_sse_fecha_o_gerador_de_eventos`. Detalhe completo em `docs/QUALITY.md` §9 e `docs/HANDOFF.md`. |
| M2 | (implícito) o stream poderia usar a sessão da requisição | Na desconexão, a dependência `get_session` sai **antes** do `finally` do gerador | Confirmado pela implementação: a transmissão abre sessões próprias pela engine (`get_engine`), nunca a da requisição. |
| M3 | "o provedor recusou ou falhou" cobre o stream cortado | Um corte da conexão no meio do stream não levanta nada no SDK: a iteração termina em silêncio com o texto parcial | Confirmado: o provedor só emite `Fim` ao ver `message_stop`; o serviço trata um stream sem `Fim` como `provedor_indisponivel` (`test_stream_cortado_sem_fim_vira_provedor_indisponivel`, com mutação provando a guarda). |
| M4 | `tempo_esgotado` vem do SDK | Demora antes dos cabeçalhos: `anthropic.APITimeoutError`. Demora no meio: `httpx2.ReadTimeout` cru, que não herda de `TimeoutError` nem é reexportado pelo SDK | Confirmado: o adaptador captura os dois; `httpx2` é dependência direta, fixada em `httpx2==2.13.0`. |
| M5 | `tutor_timeout_seconds` é o limite da resposta | O `timeout` do SDK é por espera (conexão, leitura entre pedaços), não total | Confirmado: o serviço impõe também um limite **total**, lido pelo relógio injetável entre eventos (`FOLGA_DO_ORFAO`, `service.py`). |
| M6 | `anthropic_base_url = None` "usa o endereço do SDK" | Com `None`, o SDK obedece a `ANTHROPIC_BASE_URL` do ambiente | Confirmado: o padrão em `Settings` é o literal `https://api.anthropic.com`. |
| M7 | (não previsto) | O construtor do SDK 1.7.0 aceita `config`, `profile` e `credentials`, e procura credencial sozinho | Confirmado: a chave é sempre passada explicitamente (`ProvedorAnthropic`), e só a do `Settings`. |
| M8 | O `input_schema` é "gerado do `MissionCreate`" | `MissionCreate.model_json_schema()` carrega a docstring de manutenção como `description` | Confirmado: `esquema_da_proposta()` remove `description` e `title` do topo do esquema (mutação provando a guarda em `test_a_requisicao_leva_o_que_a_spec_manda`). |
| M9 | (não previsto) | O `TestClient` bufferiza a resposta inteira: o gerador roda até o fim mesmo com a leitura interrompida | Confirmado: a desconexão é provada com uvicorn real numa thread (`tests/integration/test_tutoring_desconexao.py`); a ordem "`done` depois do commit" é provada consumindo o gerador do serviço direto (`tests/integration/test_tutoring_service.py::test_done_so_depois_do_commit`). |

### As quatro decisões que a spec não fixava

| Decisão | Motivo |
|---|---|
| `env_ignore_empty=True` no `Settings` | O `.env.example` traz `FOCUSQUEST_ANTHROPIC_API_KEY=` vazio. Sem a opção, a chave vazia viraria `SecretStr("")` — "configurada" — e a tela diria a Tifa disponível para, na primeira mensagem, receber 401. |
| `created_at` das mensagens da tutoria vem do **relógio injetável**, não do `now()` do banco | Aqui não é só auditoria: é entrada da regra do órfão. Misturar o `now()` do banco com o relógio dos testes faria a regra comparar dois relógios. |
| `anthropic_base_url` padrão é o **literal** `https://api.anthropic.com`, não `None` | Consequência direta de M6: `None` deixaria uma variável solta do ambiente do shell (`ANTHROPIC_BASE_URL`, sem o prefixo `FOCUSQUEST_`) desviar a conversa em produção. |
| Pergunta limitada a `TAMANHO_MAXIMO_DA_PERGUNTA = 4000` caracteres | Teto **técnico** de custo (cada caractere vai ao modelo, e volta nos turnos seguintes como histórico). Provisório; decisão de produto do dono (pendência em `docs/HANDOFF.md`). |

### Três divergências que a execução encontrou, além do que o plano previu

| Ponto | O que o plano ou a spec diziam | O que vale, e por quê |
|---|---|---|
| **Ordem de gravação em `confirmar_acao`** | O pseudocódigo do plano (Task 6) gravava `acao.operation_id` e `acao.decided_at` **antes** do `try`, mudando só `acao.state` dentro de cada ramo. | Isso viola `ck_tutor_actions_decisao_datada` (`(state = 'proposta') = (decided_at IS NULL)`): o `criar_missao` chamado dentro do `try` faz seu próprio `flush()` interno, que aconteceria com `operation_id`/`decided_at` já sujos e `state` ainda `'proposta'`. A implementação grava as quatro colunas (`state`, `mission_id`/`error_code`, `operation_id`, `decided_at`) **juntas**, uma vez por ramo, imediatamente antes do `flush()` daquele ramo — nunca antes do `try`. Descoberto pelos 9 dos 18 testes de `test_tutoring_acoes.py` que reprovaram na primeira rodada (RED real, não fabricado). |
| **`ck_tutor_messages_forma` é um `CASE ... ELSE true`, não o `OR` original** | A spec e o plano descreviam a restrição como `(role = 'user' AND ...) OR (role = 'tutor' AND ...)`. | Com o `OR`, um `role` inválido (por exemplo `'admin'`) viola **as duas** restrições ao mesmo tempo (`forma` e `role`), e o PostgreSQL relata só uma — pela ordem alfabética do **nome** da restrição, não da declaração, e `forma` vem antes de `role`. Isso tornava `ck_tutor_messages_role` estruturalmente impossível de isolar num teste próprio: qualquer `INSERT` que devesse violar só `role` também violava `forma`. O `CASE role WHEN 'user' THEN ... WHEN 'tutor' THEN ... ELSE true END` delega a legalidade do valor de `role` inteiramente a `ck_tutor_messages_role`; `forma` passa a descrever só a forma **dado um papel já válido**. Não muda quais linhas são aceitas (as duas restrições continuam valendo juntas); muda só qual restrição o Postgres cita no erro. Fix idêntico no modelo e na migração `0002`. |
| **A trava de `_buscar_acao` (`FOR UPDATE`) é provada pelo caminho recusar, não confirmar** | Nem a spec nem o plano anteciparam isto: a intuição natural seria que o teste-mecanismo do lado `confirmar_acao` bastasse para provar a trava. | Medido por mutação (Task 6): em `confirmar_acao`, o próprio `UPDATE` final grava `operation_id` — coluna com índice **único** — e o PostgreSQL escala esse `UPDATE` para uma trava `FOR UPDATE`, **com ou sem** o `with_for_update=True` do `SELECT` em `_buscar_acao`. Isso mascara a mutação no teste "mecanismo" do confirmar (`test_confirmar_trava_a_linha_da_acao`, que passa mesmo com a guarda removida). Em `rejeitar_acao` isso não acontece — nenhuma coluna única é escrita —, então a trava de `_buscar_acao` é a **única** coisa que serializa uma decisão ali. A guarda tem prova real, mas em dois lugares diferentes: `test_dois_confirmar_com_chaves_diferentes_um_vence` (o lado confirmar, por corrida real) e `test_confirmar_e_recusar_em_paralelo_uma_decisao_vence` (o lado recusar, por corrida real, 5/5 de detecção medida). |

## Emendas (2026-09-22, 1b-2)

Esta spec previa, na seção "A chamada real", que a chave ficaria "só no
`.env` local" do dono (decisão D1) e uma única chamada real gravando a
camada 3. O plano do 1b-2
(`docs/superpowers/plans/2026-09-22-incremento-1b-2.md`) mudou os dois, por
decisão do dono, e a execução acrescentou mais três pontos que a spec não
fixava. Nos casos abaixo o texto original permanece intocado; a emenda fica
ao lado. **A parte que depende da chave real (E2, E3) ficou para depois
desta rodada**, por decisão do dono de 2026-09-22: o texto abaixo descreve o
que vale, com o que já está provado e o que ainda falta.

| # | O que a spec dizia | O que vale | Motivo medido |
|---|---|---|---|
| E1 (D-a) | D1: a chave "fica só no `.env` local dele". | A chave mora no **Keychain do macOS** (item `focusquest-anthropic`, conta `$USER`). O dono a grava no próprio terminal com `security add-generic-password -s focusquest-anthropic -a "$USER" -w` (a chave é colada no prompt; o agente nunca a vê). Na chamada real, o processo a recebe só no comando: `FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" ...`. O `.env` continua **sem** chave real, e por isso o `scripts/push-env.sh` não tem o que exportar. **Provado:** `tests/unit/test_config.py::test_a_guarda_vale_com_a_chave_exportada_no_ambiente` (Task 8 Step 1) confere que a guarda de sessão de `tests/conftest.py` vale mesmo com a chave no ambiente do shell; `tests/integration/test_e2e_env.py::test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente` (Task 6) prova o mesmo para o E2E. | (1) O `check-secrets` roda `gitleaks dir .`, que varre também arquivos ignorados pelo git: medido em 2026-09-22 num repositório descartável, com `.env` no `.gitignore` e uma chave fictícia `sk-ant-api03-...` dentro dele, o Gitleaks 8.30.1 com o `.gitleaks.toml` do projeto deu `leaks found: 1`, EXIT 1 — com a chave no `.env`, todo commit reprovaria. (2) O `pre-push` exporta toda `FOCUSQUEST_*` do `.env` para o worktree do gate (`scripts/push-env.sh`, `docs/QUALITY.md` §6): a chave iria para o ambiente do gate inteiro a cada push. |
| E2 (D-b) | "A chamada real que o dono faz uma vez no 1b-2 grava a sequência de tipos de evento" — uma chamada. | **Duas chamadas reais:** a da tela (roteiro (a)–(c), pelo dono) e a da captura (script `tests/integration/camada3.py`). O script monta a requisição com as mesmas peças de produção (`PERSONA`, `esquema_da_proposta()`, `DESCRICAO_DA_FERRAMENTA`, modelo e `max_tokens` do `Settings`) e lê as linhas cruas pelo `with_streaming_response` (existe no `anthropic` 1.7.0, conferido). **Ainda não implementado:** `tests/integration/camada3.py`, o roteiro manual e a chamada real ficaram para depois desta rodada (Task 8, Steps 2–4, decisão do dono de 2026-09-22; `docs/HANDOFF.md` pendências 40 e 42). | Capturar a chamada da tela exigiria um "modo de captura" em `src/` (a D8 proíbe modo alternativo no código de produção) ou um proxy no `anthropic_base_url` (o roteiro manda "sem override"). |
| E3 | A camada 3 compara "a mesma sequência". | A referência guarda a sequência **bruta** (inclusive `ping`); a comparação retira **só** os eventos que o SDK fixado descarta — hoje `ping` — e um teste lê a fonte do SDK e reprova se ele deixar de descartar. **Ainda não implementado:** `comparavel()`, `DESCARTADOS_PELO_SDK` e `tests/integration/test_camada3.py` nascem com o resto da Task 8 (Steps 2–4), junto com a referência gravada. | Medido: o `anthropic` 1.7.0 descarta `ping` (`anthropic/_streaming.py`, `if sse.event == "ping": continue`, duas ocorrências); a API manda, o falso não. Comparar sem retirar reprovaria por um evento que o adaptador nunca vê; retirar tudo o que o falso não emite esconderia o que a camada 3 existe para ver. |
| E4 | E2E: "O estado indisponível". | O indisponível do E2E é produzido por `page.route` sobre `GET /api/tutoring/status` (`{"available": false}`), e não por uma segunda API sem chave. **Provado:** cenário (d) de `frontend/tests/e2e/tutoring.spec.ts` (Task 7); o caminho real "API sem chave" continua provado só no pytest, `tests/integration/test_tutoring_api.py::test_status_indisponivel_sem_chave` e `test_sem_chave_responde_503_e_nao_grava` (1b-1). | Uma segunda API pediria mais uma porta, outro `vite preview` e outro `webServer`, para um contrato já provado no pytest. O E2E prova a tela: campo desabilitado, texto literal, quadro funcionando, axe. |
| E5 | E2E: quatro cenários. | Um quinto, **(e) celular**: sem rolagem horizontal, Enviar visível na folha aberta, Esc devolve o foco. **Provado:** cenário (e) de `frontend/tests/e2e/tutoring.spec.ts` (Task 7). | O README §7 exige isso no celular, e o jsdom não tem layout: nenhum teste de unidade o mede. O teclado virtual continua não medido (`docs/HANDOFF.md`, pendência 50). |

## Entregas de documentação

- `docs/ARCHITECTURE.md`: o módulo `tutoring`, as tabelas, o contrato HTTP e o
  stream, movidos de "contrato" para "existente" à medida que existirem.
- `docs/HANDOFF.md`: o motivo do SDK `anthropic`; a exceção à docstring do
  `Settings`; a camada 3 pendente até a chamada real; o roteiro da chamada
  real; e o estado de publicação no formato que não envelhece ("publicado pelo
  PR #N; ver `gh pr view N`").
- `docs/QUALITY.md`: o servidor falso e o que ele garante.
