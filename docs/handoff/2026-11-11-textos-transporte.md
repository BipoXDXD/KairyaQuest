# Textos de falha de transporte em português — 2026-11-11

Objetivo: resolver a pendência 211 do `docs/HANDOFF.md`. Revisão-base:
`846c47b` (`origin/main`). A linha 211 da tabela fica **resolvida por este
arquivo**; a consolidação a risca lá.

## Estado encontrado

A linha 211 está desatualizada na primeira metade: a abertura já
nomeia a ação e a causa ("Não foi possível concluir a missão: sem conexão com o
servidor."), e o de recusar já tem 16 e 17 palavras. O que restava era a outra
metade da seção "Pendência 211" do `docs/HANDOFF.md`: os doze textos de
concluir, iniciar, reagendar, pedir a avaliação, confirmar a missão e confirmar
o reagendamento tinham de 22 a 24 palavras, contra 12 a 18 do contrato de
ux-writing (que o inglês já cumpre e o `errorTextLength.test.ts` impõe). Nenhum
handoff nem revisão de ux-writing trouxe recomendação além disso.

## Decisão da coordenação

Opção escolhida: manter o padrão `[ação que falhou]: [causa]. [o que fazer]`,
manter a abertura "Não foi possível <ação>." e o início "Tentar de novo é
seguro", e caber em 12–18 palavras encurtando **a causa e o complemento do
fim**. Alteração só no catálogo `pt-BR` (o `en` já cumpria).

| Parte | Antes | Depois |
|---|---|---|
| Causa, rede | sem conexão com o servidor | sem conexão |
| Causa, prazo | o servidor demorou demais para responder | o servidor demorou demais |
| Fim (6 ações) | Tentar de novo é seguro: a missão não será concluída duas vezes (e variantes por ação) | Tentar de novo é seguro: nada será duplicado. |
| Fim (recusar) | Tentar de novo é seguro. | igual |

Palavras (mensagem mais fim), antes -> depois, rede / prazo: concluir, iniciar,
avaliar e confirmar a missão 23 -> 16 e 24 -> 18; reagendar e confirmar o
reagendamento 22 -> 16 e 23 -> 18; recusar 16 -> 13 e 17 -> 15 (alinhado às
mesmas causas, por coerência, embora já coubesse). Exemplo final:
"Não foi possível concluir a missão: sem conexão. Tentar de novo é seguro: nada
será duplicado." (16).

Recusadas:

- **Tirar o objeto da ação** ("Não foi possível concluir: sem conexão."): volta
  a não dizer o que falhou, que era o ponto da primeira metade da 211, e mesmo
  assim passa de 18 no prazo (19 palavras) com o fim específico.
- **Manter o fim específico** ("a missão não será concluída duas vezes"): 11
  palavras só nele; com ação e a causa mais curta (rede) o total é 19.
- **Chaves novas só para o transporte**: o `recovery` é compartilhado com o
  texto de 5xx e `code` desconhecido; duplicar chaves divergiria os dois.

Custo: o fim deixa de dizer *o que* não duplica (a missão, o prazo, o bônus).
"Nada será duplicado" cobre os três e o E2E do QG continua conferindo o início
"Tentar de novo é seguro". O texto de 5xx também encurta (17-18 -> 14 palavras)
porque usa o mesmo fim. A causa "sem conexão" não diz de quem é a conexão, e
isso é intencional: o servidor fora também deixa o pedido sem conexão, e o que
a pessoa faz é o mesmo.

## Alterações

- `frontend/src/shared/i18n/messages/pt-BR.ts`: seis chaves `*.recovery`, seis
  `*.timeout` e sete `*.network`.
- `frontend/src/shared/i18n/errorTextLength.test.ts`: o contrato de 12–18
  palavras e o formato "Não foi possível <ação>: <causa>. Tentar de novo é
  seguro" passam a valer em português para as sete ações nas duas causas
  (14 textos). Vermelho antes: 12 reprovados, só os que a decisão muda.
- Expectativas de texto atualizadas, sem mudar o que verificam, nos testes dos
  tradutores, nos cartões e no E2E `headquarters.spec.ts`; o comentário de
  `transportFailure.ts` acompanha o texto.

## Pendências e limites

- Os demais textos em português ainda não são medidos pelo contrato de palavras.
  Um já fica abaixo da faixa e não foi alterado: o 5xx de recusar
  ("Não foi possível recusar a proposta. Tentar de novo é seguro.", 11 palavras).
- `shared.apiError.*` (falhas de leitura, sem `leadFor`) segue com
  "Não foi possível falar com o servidor." / "demorou demais para responder.":
  texto de outro fluxo, fora desta pendência.
- Os PRs abertos de i18n (#60, #62) tocam o mesmo catálogo: conflito de merge
  possível em `pt-BR.ts`, resolvido a favor destas linhas.
