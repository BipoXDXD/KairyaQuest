# axe-core nos estados transitórios e de falha, segunda parte — 2026-11-11

Revisão-base: `8847935` (main). Branch `wt/axe-transitorios-2`.

Continua `2026-11-11-axe-transitorios.md` (PR #113). Resolvem-se aqui as
pendências **P-axe-transitorios-1** (reagendar em voo e falha do
reagendamento), **P-axe-transitorios-2** (falhas de decisão com `refresh`) e
**P-axe-transitorios-3** (`trail-stale`), mais o limite diário da Kairya, o
resultado desconhecido e o viewport de celular, que a primeira parte listava em
"Ficou de fora". A linha 21/61 do `docs/HANDOFF.md` continua rebaixada, não
riscada: ver "Limitação medida" abaixo.

**Nenhum componente mudou.** O axe (conjunto de regras padrão) não achou
violação em nenhum dos estados novos nem em nenhum dos 15 antigos no celular.
Só o spec `frontend/tests/e2e/axe-transitorios.spec.ts` foi alterado.

## Decisão da coordenação

**Opção escolhida: estender o mesmo spec, com cada cenário registrado uma vez
e repetido em dois ambientes (desktop e celular de 390 px).** Os mecanismos são
os da primeira parte (pedido segurado numa promessa, `route.abort()` /
`route.fulfill`, servidor falso), sem `sleep`, e o estado é confirmado na tela
(testid e texto) antes de cada axe.

Recusadas e por quê:

- *Um spec separado só para o celular, copiando os cenários*: duplicaria 24
  cenários e deixaria os dois desencontrarem. O laço `AMBIENTES` registra cada
  cenário nos dois.
- *Auditar só desktop*: a folha da Kairya no celular cobre o quadro, e é onde o
  layout muda de verdade.
- *Provocar a falha pelo servidor real quando ela é gravada no banco*: mesma
  regra do achado da primeira parte. Os cenários novos de falha são simulados
  no navegador (`rota.fulfill` com o `code` que a API usa), e os que deixariam
  um cartão aberto no banco compartilhado (proposta, avaliação) terminam
  resolvendo-o de verdade (recusar a proposta; avaliar com o falso).

## Estados novos (9 cenários × 2 ambientes)

| Estado | Mecanismo |
|---|---|
| Reagendando em voo (`reschedule-submit` desabilitado) | POST segurado, API real |
| Reagendamento recusado (`reschedule-error`, 422 `prazo_expirado`) | `route.fulfill` |
| Decisão recusada por já decidida (`proposal-failure` + `proposal-refresh`, 409 `transicao_ilegal`) | `route.fulfill`; depois atualiza e recusa de verdade |
| Decisão que falha, variantes rede e servidor (`proposal-failure`, botão vira "Tentar de novo") | `route.abort()` e 503; depois recusa de verdade |
| Avaliação com missão fora do ar (`evaluation-error` + `evaluation-reload`, 404 `missao_nao_encontrada`) | `route.fulfill`; depois recarrega e avalia de verdade |
| `trail-stale` (recarga silenciosa que falha, com a trilha mantida) | rota que passa a responder 503 depois de a trilha carregar, e `focus` da janela |
| Limite diário da Kairya (429 `limite_diario_da_tutoria` + `Retry-After`, campo desabilitado) | `route.fulfill`; só observado, a tela não foi tocada |
| Resultado desconhecido (`tutor-failure` com "Não deu para saber…") | POST da conversa com `route.abort()` |

Os 15 cenários antigos rodam agora também no celular. Nos de leitura, a conversa
da Kairya só existe com a folha aberta; o spec audita o quadro, abre a folha,
espera os estados da Kairya e audita de novo (`abrirFolha`). Para recuperar, a
Kairya é tentada de novo com a folha aberta e o quadro depois de fechá-la (pelo
botão "Fechar a conversa": depois de um "Tentar novamente" o foco vai ao corpo
da página e o Escape não fecha a folha).

Total: 48 cenários (24 × 2).

## Limitação medida: o axe não audita o contraste dentro do cartão de missão

O cartão de missão (`<li>`) tem `background-image: linear-gradient(...)`. Sobre
gradiente o axe não decide contraste: devolve a regra `color-contrast` em
`incomplete`, nunca em `violations`. Medido num cenário descartável (não está
na branch): com a cor do `reschedule-error` trocada por `#0f172a` (quase preto,
sobre fundo escuro), `violations` continuou `[]` e `incomplete` trouxe
`color-contrast`. Troca de classe de cor em `RescheduleForm` e `EvaluationPanel`
(`text-slate-900`) também passou nos 48 cenários.

Consequência: **todo texto dentro do cartão de missão, inclusive os alertas
`reschedule-error`, `evaluation-error` e `proposal-*` que moram ali, tem o resto
das regras do axe auditado, mas o contraste não**. É a mesma ressalva "contraste
em gradientes (`incomplete`)" da linha 21/61, agora com o alcance medido. Não
foi corrigida: exigiria decidir o fundo do cartão (um tom sólido por trás do
texto) ou um cálculo de contraste fora do axe, decisão de UX/arte.
**Pendência P-axe-transitorios-2-1.** Opções: (A) fundo sólido atrás de cada
alerta do cartão, o axe passa a decidir; (B) teste que calcula o contraste dos
tokens do alerta contra a cor do gradiente nos dois extremos; (C) aceitar e
manter o registro. Recomendo B (não muda a arte e é determinístico).

O contraste do `trail-stale` (painel de cor sólida) **é** auditado: a sabotagem
abaixo o provou.

## Ficou de fora (registrado)

- **`missions-reload-status`**: é `sr-only` e só tem texto enquanto a recarga do
  quadro espera uma conclusão em voo; já é afirmado em testes de componente, e o
  axe sobre texto fora da tela não acrescenta nada.
- **Cenário de resposta interrompida depois do `user_message`** (stream cortado
  com a pergunta gravada): o texto é o mesmo do desconhecido auditado aqui, e
  provocá-lo pelo servidor real grava a pergunta no banco compartilhado.
- Os itens da primeira parte que continuam como estavam: certificação WCAG AA
  manual, aprovação humana da arte.

## Verificação

Comandos executados e resultados lidos nesta sessão, no worktree, sob
`lote-off9.lock`, deslocamento 9:

- `npx prettier --write`, `npx eslint` e `npx tsc -p tsconfig.e2e.json
  --noEmit` sobre o spec: sem saída (limpos).
- Primeira execução do spec ampliado: **48 passed (34.4 s)**; antes disso, os 30
  cenários (15 × 2, antes de acrescentar os novos) deram 3 reprovações, todas por
  `tutor-history-*` não existir no celular com a folha fechada (defeito do spec,
  corrigido com `abrirFolha`); nenhuma por violação de axe.
- **Repetição (intermitência).** Cinco execuções seguidas, servidores novos em
  cada uma, banco zerado só antes da primeira: **48 passed** em todas (37,5 s,
  1,5 min, 1,3 min, 1,1 min e 1,4 min; as demais rodavam gates de outros
  worktrees na mesma máquina). Nenhuma reprovação nem `flaky`; sem `sleep` no
  spec.
- **Sabotagem 1 (sensibilidade do `semViolacoes`).** Um `<img>` sem `alt`
  injetado no `body` antes do `AxeBuilder`: **48 failed**. Restaurado.
- **Sabotagem 2 (sensibilidade por estado, no componente).** Três quebras
  temporárias, banco zerado e build refeito: (a) `aria-controls="inexistente"`
  no botão de reagendar, (b) cor `text-slate-900` no aviso do `trail-stale`,
  (c) texto vazio no botão "Atualizar a conversa". Reprovaram exatamente os
  quatro cenários que exibem esses estados, nos dois ambientes (8 failed, 40
  passed): `trail-stale`, decisão recusada por já decidida, reagendando em voo e
  reagendamento recusado. Restaurado, `git diff` dos fontes vazio.
- Aprendizado de operação: uma rodada que **reprova no meio** deixa propostas
  pendentes no banco compartilhado, e a rodada seguinte, sem
  `make reset-test-db`, reprova por colisão de seletor (strict mode), com
  aparência de defeito de outro cenário. O `make check` zera o banco no começo;
  rodando o spec à mão depois de uma falha, zere antes.
- `make check`: ver a linha lida no corpo do PR.

## Limitações

- O spec depende dos textos pt-BR dos estados (ver a primeira parte) e dos
  novos: "Esta proposta já foi decidida.", "Você chegou ao limite de conversas de
  hoje.", "A Kairya volta à meia-noite.", "Não deu para saber se a resposta
  chegou inteira." e o aviso de prazo no passado. Uma mudança de redação quebra o
  cenário de propósito.
- O limite diário e o desconhecido são simulados no navegador: provam a interface
  diante da resposta, não o servidor sob o limite (a pendência 206, sobre
  destravar à meia-noite, é do dono e não foi tocada).
