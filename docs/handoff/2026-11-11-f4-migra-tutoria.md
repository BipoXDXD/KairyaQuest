# Fase 4, Tarefa 4.7: painel da Kairya no design system — 2026-11-10

Objetivo: migrar a tutoria (painel, conversa, cartões de proposta e controles
de decisão) para tokens e componentes da F4, sobre a tutoria da F3.
Base: `wt/f4-migra-shell` (`5a3b014`) com merge de `origin/wt/f3-tutoring`
(`4cbdd7f`) no commit `34081a3`.

Decisões:

- Desktop: o `aside` é um `Panel as="aside"` com `glow` quando aberto (luz
  da lanterna), dentro de uma coluna `sticky` de altura `h-dvh`. Celular:
  `aside` sem moldura, porque o botão e a folha são fixos e uma caixa com
  borda ficaria vazia no fluxo. A troca de layout passa a remontar o `aside`
  inteiro (região viva inclusive); antes só o conteúdo remontava.
- `Panel` ganhou `ref` e `aria-label` só na variante landmark (o `div`
  continua sem nome); `IconButton` ganhou `ref`, `expanded`, `controls` e
  `title`; `Button` ganhou `ref` no tipo. Cada extensão tem teste.
- Retrato (`ART.kairya.portrait`) e avatar (`ART.kairya.avatar`) são
  decorativos (`alt=""`, moldura `aria-hidden`): o nome vem do painel, do
  título da folha e do botão. O P26 mudou de "tem nome acessível" para
  "é decorativo", como pede o brief.
- Mensagens da Kairya são `SpeechBubble` (`figure` nomeada "Kairya"); a da
  pessoa, caixa simples com "Você". O carregamento é o `Skeleton`, com o
  mesmo `data-testid` e o mesmo status `sr-only`.
- Botões: Enviar e Confirmar `primary`; Recusar, Atualizar, Tentar de novo e
  Fechar a conversa `secondary`; recolher/abrir é `IconButton` com seta.
- As falhas continuam `role="alert"` (como a F3 as deixou), agora em
  `text-feedback-danger`; não viraram `StatusLine` (`role="status"`) para não
  trocar o papel que os testes e o leitor de tela esperam.
- `.rpg-tutor` e `.tutor-*` saíram do `index.css`; os cinco arquivos da
  tutoria saíram de `PENDING_MIGRATION`. No `layout.spec.ts`, o texto longo
  da resposta é lido por `tutor-message-content`, e não mais pelo segundo
  `p` da bolha (a autoria da Kairya agora é `figcaption`).

# i18n: tutoria no catálogo pt-BR/en — 2026-11-10

Tarefa 7 do plano de i18n (PR 6). Os textos fixos de `TutorConversation`,
`TutorPanel`, `ProposalCard`, `RescheduleProposalCard`, `DecisionControls`,
`answerOutcome` e `questionLimit` viraram chaves `tutoring.*` nos dois
catálogos. Os textos PT são os de antes, sem reescrita; os EN seguem o padrão
de erro [o que falhou]. [causa]. [o que fazer]. nas duas falhas de carga e nas
notas de reenvio (12 a 18 palavras).

Contrato: `QuestionLength.counter` passou de `string | null` para
`Counter | null`, com `type Counter = { kind: 'remaining'; n } | { kind:
'over'; n }` em `shared/types/counter.ts` (as missões também o usarão, e uma
feature não importa da outra). O `TutorConversation` monta o texto com
`plural(locale, n, …)` e as chaves `tutoring.counter.remaining.{zero,one,other}`
e `tutoring.counter.over.{one,other}`; o `{max}` vem de `MAX_QUESTION_LENGTH`,
cuja linha `export const` não mudou. Os asserts de `questionLimit.test.ts`
passaram a afirmar o objeto (mudança de teste justificada pela troca de
contrato, AGENTS.md §3, a registrar na descrição do PR); as frases PT do
contador migraram para `TutorPanel.test.tsx` (P18b), inclusive o "Restam 0
caracteres." que prova a forma `zero`. `announceAnswer` e `unansweredNote`
devolvem `MessageKey`. O aviso de indisponível usa a chave
`tutoring.messageFailure.providerNotConfigured.message`, que já tinha o mesmo
texto.

A regra `no-restricted-syntax` do ESLint passa a valer em
`src/features/tutoring/**/*.tsx`, com caso em `tests/unit/no-literal-jsx.test.ts`.
Cada arquivo de teste de componente da área ganhou casos em `en` que leem o
esperado do catálogo `en`. O P7d (teto diário em inglês) passou a achar o
campo pelo rótulo EN, que agora existe.

Pendências:

- `formatDeadline` (`shared/lib/deadline.ts`) ainda formata em `pt-BR` nos
  dois idiomas; fica para quem migrar `shared/lib`.
- Números interpolados (`{count}`, `{max}`, `{value}`, `{minutes}`) saem sem
  `Intl.NumberFormat`; em `en` o contador mostra 4000, não 4,000.

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

# Sincronização com wt/f4-migra-shell (0b93cd5) — 2026-11-11

A base andou 33 commits (merge da main d8c8b54, com o prazo de rede, o
rascunho do Reagendar no registro e os limites da avulsa). O merge conciliou
as duas pontas sem remover comportamento nem teste:

- `ApiTimeoutError` (base) passa a carregar `kind: 'timeout'` (#89): a tela
  distingue o prazo pelo tipo e o texto vem do catálogo pelo `kind`.
- `leadFor` (base) agora devolve a CHAVE da abertura (`shared.transport.timeout.lead`
  e `shared.transport.network.lead`, nos dois idiomas); os módulos de falha
  trocam a `message` do "sem resposta" por ela e mantêm a `recovery`.
- Limites da avulsa (`estimativa_fora_do_limite`, `prazo_fora_do_limite`):
  nova ação `out-of-bounds` em `DecisionAction`, chaves
  `tutoring.actionFailure.{estimate,deadline}OutOfBounds.message` e
  `recordedErrorCode` no lugar do mapa `RECORDED_FAILURE`.
- `prazo_fora_do_limite` do Reagendar: chaves
  `missions.rescheduleFailure.beyondLimit.{message,recovery}`.
- `RescheduleForm` e `MissionCard` seguem a base (rascunho no registro,
  `pendingRetry`), com `useT`, `FailureMessage` e `failure.action` do #89.
- `docs/HANDOFF.md` fica igual ao da base; o texto que o #89 acrescentava a
  ele está neste arquivo, salvo a seção sobre a volta da tutoria à API da
  Anthropic, que a base já traz idêntica (a fitness function do provedor
  antigo só admite o histórico no HANDOFF).
