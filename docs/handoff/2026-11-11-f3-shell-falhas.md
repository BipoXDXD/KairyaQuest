# i18n: shell, erros de API e módulos de falha no catálogo — 2026-11-10

Tarefa 6 do plano de i18n (PR 5). `ApiError` ganha `kind` (`network`,
`timeout`, `http`, `format`, `interrupted`), `retryAfterSeconds` e
`receivedAt` (o instante em que o cliente recebeu o erro, lido antes do
corpo). `parseRetryAfterSeconds` é a única leitura do `Retry-After` e aceita só
inteiro decimal não negativo. O `message` do `ApiError` continua em PT, só para
depuração. `shared/i18n/failureText.ts` traz `FailureText`, `apiErrorText` e
`dailyLimitText`; `FailureMessage.tsx` renderiza `t(message) + ' ' +
t(recovery)`.

Os seis módulos `*Failure.ts` passaram a devolver chaves do catálogo: o antigo
campo `recovery` (o enum que decide o botão) virou `action`, e `recovery` agora
é a chave do texto "o que fazer". Os mapas são exportados para o teste conferir
as chaves. O texto PT dos módulos de falha não mudou (cada texto foi cortado na
fronteira da frase), salvo os recoveries novos, para conferência:
reagendamento `prazo_expirado` ("Escolha uma data e um horário futuros."),
`prazo_derivado` (passa a usar "Atualize para ver o estado atual.") e
`provedor_nao_configurado` na avaliação e na tutoria ("Configure o provedor e
tente de novo."). O teto diário da tutoria usa o `Retry-After`: com ele,
"A Kairya volta à meia-noite." (EN: "Kairya is back at midnight (Brasília time).");
sem ele, "Tente de novo amanhã.". Os rótulos de estado e de motivo em
`shared/types/mission.ts` viraram `MessageKey`.

Shell (`SideNav`, `areas.ts`) e o cabeçalho do `Headquarters` passam pelo
`t()`. Fitness function: `no-restricted-syntax` em `eslint.config.js` contra
literal com letra no JSX e em `aria-label`/`title`/`placeholder`/`alt`, só em
`src/app/**` e `src/pages/Headquarters.tsx`. A prova está em
`tests/unit/no-literal-jsx.test.ts`, inclusive o `\p{L}` com acento. Cada PR de
área acrescenta a sua pasta ao `files`.

`renderWithI18n` ganhou `strict`, que liga o StrictMode pela opção
`reactStrictMode` do Testing Library. Um `<StrictMode>` dentro da árvore fica
abaixo do `wrapper` do provider, e ali o React 19 não repete os efeitos da
montagem. O teste do `Headquarters` que conta dois pedidos sob StrictMode
reprovou assim, e os testes de StrictMode de `CycleSection`, `MissionList` e
`TutorPanel` passaram a usar a opção.

As cargas de tela (`useMissions`, `useCycle`, `useProgress`,
`useCurrentPlan`) deixaram de exibir `ApiError.message`: o estado de erro
carrega um `LoadFailure` (`loadFailureFor` em `failureText.ts`), que é o texto
do catálogo pelo `kind` para o `ApiError` e a mensagem fixa da área ("Falha
inesperada ao carregar …") para o defeito. `LoadFailureMessage.tsx` exibe os
dois. Na tela, "O servidor respondeu 503." virou "O servidor não conseguiu
atender o pedido. Tente de novo em instantes.". Nenhuma tela exibe mais o
`message` do `ApiError`.

Mensagens de erro em inglês: [o que falhou]. [causa]. [o que fazer]. em 12 a
18 palavras, `message` e `recovery` somados. `errorTextLength.test.ts`
enumera os textos pelas funções públicas de cada módulo de falha, com cada
`code` e as falhas sem `code`. Cinco passavam de 18 palavras (os "Trying again
is safe: …" viraram "Retrying is safe: …", e o da tutoria virou "your question
won't repeat") e o `shell.locale.saveFailed` tinha 11 (ganhou "to the server").

Pendências:
- ~~`useMissions`, `useCycle`, `useProgress` e `useCurrentPlan` ainda exibem
  `ApiError.message`.~~ Resolvida neste PR (`LoadFailure`, acima). O fallback
  "Falha inesperada ao carregar …" continua literal e vira chave no PR de cada
  área.
- Os demais literais dos componentes que exibem falha migram no PR da área.
- PR da área da tutoria: com `action: 'unavailable'`, o `TutorConversation`
  mostra a constante literal `UNAVAILABLE_TEXT`, e o recovery
  `tutoring.messageFailure.providerNotConfigured.recovery` nunca aparece. Trocar
  por `<FailureMessage failure={PRE_STREAM_FAILURE_BY_CODE.provedor_nao_configurado} />`
  ou por uma chave própria.
- Tarefa 9: a fitness function só olha `JSXText` e `JSXAttribute > Literal`, e
  deixa passar `<p>{'Olá'}</p>`, `aria-label={'Fechar'}` e template literal com
  letra. Acrescentar seletores de `Literal` e `TemplateLiteral` dentro de
  `JSXExpressionContainer`, cada um com caso em `no-literal-jsx.test.ts`.

