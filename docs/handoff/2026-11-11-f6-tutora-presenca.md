# wt/f6-tutora-presenca: a Kairya reage ao chat (F6 Tarefa 6.3g) — 2026-11-11

Objetivo: o rosto e a bolha da Kairya acompanham a conversa: ouvindo ao digitar,
pensando ao enviar, serena ao responder, preocupada na falha, e a bolha confirma
a proposta aceita. Revisão-base: `fdbc781`.

## Declarações

- Zero dependência nova (nem de runtime, nem de dev).
- Zero endpoint novo.

## Decisões

- **R7, o que é "falha de conexão da tutora".** `tutorFailed({ offline: true })`
  quando o envio termina em `unknown` (stream cortado) ou em `failed` com ação
  `unavailable` ou `retry`. `edit`, `daily-limit` e `retry-with-new-id` deixam o
  rosto preocupado, mas sem fala (`offline: false`): não são problema de
  conexão. Falhas de avaliação não disparam nada. A regra mora em `isOffline`
  (`tutorPresence.ts`).
- **R8, tutora indisponível ao abrir.** `useTutorStatus` em `unavailable` não
  despacha evento: seria uma preocupação espontânea competindo com a saudação do
  dia, e o painel já tem texto próprio para o estado. Teste dedicado.
- `presenceEvents(prev, next)` é pura; `useTutorPresence` guarda a entrada
  anterior num `ref` e despacha num efeito por render. Na montagem a anterior é a
  atual (nenhum evento espúrio, também sob StrictMode).
- `TutorPanel` embrulha `onMissionCreated` para despachar
  `{ type: 'say', topic: 'proposalAccepted' }` antes de avisar a página.
- `KairyaEvent` passou a ser exportado por `features/kairya/index.ts`, para a
  tutoria tipar sem importar detalhe interno.
- O retrato de cena já usava `KairyaFace` (R12 feito em tarefa anterior).

## Estado

Testes de `tutoring`, `kairya` e `pages` verdes, com 100% nos arquivos tocados.
Sem mudança de texto ou `alt` verificado por E2E.
