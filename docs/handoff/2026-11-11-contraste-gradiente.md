# Contraste sobre os painéis com gradiente, medido no Vitest — 2026-11-11

Revisão-base: `939f8ff` (main). Branch `wt/contraste-gradiente`.

Resolve a pendência **P-axe-transitorios-2-1** (seção "Limitação medida" de
`2026-11-11-axe-transitorios-2.md`, PR #124): o axe não decide contraste sobre
`linear-gradient` (devolve `color-contrast` em `incomplete`), e quatro painéis
têm fundo em gradiente. A linha 21/61 do `docs/HANDOFF.md` continua como está
(esta frente não a risca; a consolidação decide).

## Decisão da coordenação

**Opção escolhida: (B) teste de Vitest que calcula o contraste das cores do
texto e dos controles contra os DOIS extremos de cada gradiente.** Técnica e
reversível, não muda a arte, determinística, roda no gate (`check-web`).

Recusadas e por quê:

- **(A) Fundo sólido atrás do texto dos alertas.** Muda a aparência dos
  painéis: decisão de UX/arte, não de quem implementa. Não foi necessária: o
  ajuste de cor de um token bastou (abaixo).
- **(C) Aceitar e manter o registro.** Deixaria uma regra do WCAG sem nenhuma
  prova, em quatro painéis.

## O que mudou

- `frontend/src/styles/gradientContrast.test.ts` (novo): o teste. Por painel
  (`.rpg-mission-card`, `.rpg-cycle`, `.rpg-progress`, `.rpg-tutor`), lê os
  componentes que escrevem sobre o gradiente e mede **toda** cor de texto
  (4,5:1, WCAG 1.4.3), de borda opaca e de anel de foco (3:1, WCAG 1.4.11)
  contra os dois extremos. Mede também as cores declaradas no CSS que moram
  sobre os gradientes (valor do nível, `summary` das conquistas e seu foco,
  nome da Kairya). Guardas: toda classe de gradiente usada por algum `.tsx` está
  na tabela, com os mesmos componentes; a lista de bordas decorativas não guarda
  classe que saiu do arquivo; o app só tem o tema escuro.
- `frontend/src/shared/ui/tokens/gradientPanels.ts` (novo) e o teste dele:
  leitura dos extremos do `index.css`, resolução de cor (hex, `var()` em
  cadeia, `oklch()` do tema do Tailwind v4), extração das classes de cor, e a
  medição. Reusa `contrastRatio`/`parseTokens`/`resolveToken` de `contrast.ts`
  (só ganhou um `export` em `truncateToHundredths`).
- **Ajuste de token (o único):** a borda dos campos de texto sobre os
  gradientes, `border-slate-600` → `border-slate-500`, em
  `EvidenceForm.tsx`, `RescheduleForm.tsx` e `TutorConversation.tsx`. Só a
  cor da borda; a espessura, o fundo e o foco não mudaram.
- `docs/QUALITY.md`: um parágrafo, depois do bullet do axe, dizendo que o
  contraste sobre os gradientes é do Vitest, com os limites.

Nenhum valor foi copiado para o teste: extremos do `index.css`, tokens de
`tokens.css`, paleta de `node_modules/tailwindcss/theme.css`.

## Pares medidos (o pior dos dois extremos de cada gradiente)

Gradientes: cartão, ciclo e progresso `#172433` → `#111d2b`; Kairya
`#142231` → `#0d1825`. O extremo mais claro é o pior caso em todos os pares.
Texto: mínimo 4,5. Controle e foco: mínimo 3.

| Classe / cor                                                                                                            | Razão mínima                           | Usos                                     |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `text-slate-400`                                                                                                        | 5,98                                   | rótulos secundários, em todos os painéis |
| `text-slate-300` / `-200` / `-100` / `-50`                                                                              | 10,58 / 12,75 / 14,33 / 15,01          | corpo e títulos                          |
| `text-amber-300` / `-200` / `-100`                                                                                      | 10,86 / 12,60 / 14,11                  | avisos                                   |
| `text-emerald-300` / `-200` / `-100`                                                                                    | 10,35 / 12,27 / 13,84                  | sucesso                                  |
| `text-red-300` / `-200` / `-100`                                                                                        | 8,18 / 10,84 / 12,87                   | erros                                    |
| `text-sky-300` / `-200` / `-100`                                                                                        | 9,43 / 11,83 / 13,68                   | avaliação                                |
| tokens `text-muted`, `success`, `danger`, `action` (Badge)                                                              | medidos pelo teste, todos acima de 4,5 | rank do progresso                        |
| `#f1dcbb` (valor do nível), `#f0dfc4` (nome da Kairya)                                                                  | 11,74 / 12,01                          |                                          |
| `summary` das conquistas (`lantern-600` `#c98b22`)                                                                      | 5,39                                   |                                          |
| anéis `ring-emerald-300`, `-400`, `ring-amber-200`, `ring-red-300`, `ring-sky-300`, `ring-slate-300`; foco do `summary` | de 8,13 a 12,60                        |                                          |

Eram valores de texto com folga grande (mínimo 5,98): nenhum texto reprovou.

**O que reprovou, e o ajuste.**

| Par (borda de campo de texto)                                                           | Antes                 | Depois                                        |
| --------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------- |
| `border-slate-600` `#45556c` sobre `#172433` / `#111d2b` (EvidenceForm, RescheduleForm) | **2,07 / 2,24** (< 3) | `border-slate-500` `#62748e`: **3,30 / 3,57** |
| `border-slate-600` sobre `#142231` / `#0d1825` (TutorConversation)                      | **2,12 / 2,35** (< 3) | `border-slate-500`: **3,38 / 3,75**           |

`slate-500` é o passo mais próximo da paleta que atinge 3:1 (o seguinte,
`slate-600`, é o que reprovava); a borda também mede 3,74 contra o fundo do
próprio campo (`slate-900`). Nenhum fundo sólido foi necessário.

## Bordas fora da medição (decisão escrita no teste)

Entram em `DECORATIVE_BORDERS` por arquivo, com o porquê: a divisória
`lg:border-slate-800` e as bordas `border-slate-600` dos dois botões de texto do
`TutorPanel.tsx` (o texto e o ícone identificam o botão; a borda não), e a
moldura `border-slate-700` do aviso de rank do `ProgressPanel.tsx` (o texto
dentro é o que informa). Bordas translúcidas (`border-red-400/60` etc.) não são
medidas: emolduram avisos que se identificam pelo texto. **Texto com
opacidade (`text-x/60`) reprova** o teste, porque a razão não seria a medida.

## Limites

- Mede os **dois extremos**. Vale para os pontos intermediários porque os três
  canais de ambos os gradientes descem juntos (`#172433` → `#111d2b`,
  `#142231` → `#0d1825`), então a luminância é monótona; um gradiente futuro
  que não tenha essa propriedade pede outro cálculo.
- Conservador: mede toda cor de texto dos arquivos listados, inclusive a que
  fica dentro de um fundo opaco próprio. Se um dia isso reprovar um par que o
  axe decide (fundo sólido), o par sai da lista com justificativa.
- Todo texto é medido em 4,5:1, sem a exceção de 3:1 do texto grande (mais
  rigoroso do que o WCAG exige; nada reprovou por isso).
- **Só existe o tema escuro.** A pedido eram os temas claro e escuro; não há
  tema claro no app (`index.css`, `tokens.css` e `base.css` não têm
  `prefers-color-scheme` nem seletor de tema). Um teste reprova se algum
  aparecer, para forçar a medição por tema.
- As cores com `oklch()` do tema do Tailwind v4 são convertidas para sRGB por
  `oklchToHex` (testado contra os hex publicados da paleta); o que sai da gama
  é limitado ao canal.
- **Acoplamento com a migração de design tokens (F4).** Os componentes ainda
  usam a paleta padrão do Tailwind (`PENDING_MIGRATION` do `designLint`). O teste
  resolve também os tokens semânticos (`text-text-muted`,
  `border-border-strong`), então a migração não o quebra por si; mas as bordas
  da lista decorativa e os arquivos da tabela `PANELS` precisam acompanhar o
  que a migração mexer (o teste reprova com a mensagem do par, ou da classe que
  saiu).
- A linha de `rpg-trail-card` não é medida: a classe tem o mesmo gradiente, mas
  nenhum `.tsx` a usa; o guarda reprova no dia em que algum usar sem a tabela.

## Verificação

Comandos executados e resultados lidos nesta sessão, no worktree:

- RED: `gradientPanels.test.ts` sem o módulo, falha de import; depois, com o
  módulo, só a razão esperada de um teste estava errada (um placeholder meu,
  corrigido para 1,51, conferido à mão: 1,517). Dois testes do módulo foram
  escritos antes do código que os satisfez (comentário antes da regra, hex curto
  `#fff` do tema).
- RED do teste principal com o código antigo: `.rpg-mission-card` e `.rpg-tutor`
  reprovaram exatamente nas bordas `border-slate-600` dos campos (valores da
  tabela acima); os outros painéis e o CSS passaram.
- GREEN após o ajuste: `npx vitest run src/styles/gradientContrast.test.ts
src/shared/ui` com 0 falhas.
- **Sabotagens** (cada uma restaurada com `git checkout` do arquivo, `git status`
  limpo depois): (1) `text-slate-400` → `text-slate-700` no `ProposalCard`:
  reprovou `.rpg-tutor` (1,55 / 1,72); (2) extremo do gradiente do cartão
  trocado por `#90a1b9`: reprovaram os painéis de cartão, ciclo e progresso,
  texto, anéis e CSS; (3) `--ink-300` (`text-muted`) escurecido em
  `tokens.css`: reprovou `.rpg-progress`, no Badge (2,99 / 3,24); (4) cor do
  valor do nível no `index.css` para `#2a3b50`: reprovou o teste das cores do
  CSS (1,37 / 1,49); (5) `ring-emerald-300` → `ring-slate-700` no
  `RescheduleHistory`: reprovou o cartão (1,51 / 1,64); (6) `border-slate-500`
  de volta a `600` no `TutorConversation`: reprovou `.rpg-tutor` (2,12 / 2,35).
- `make check` completo, sob `lote-off9.lock`, deslocamento 9: **EXIT 0**.
  Linhas lidas: Vitest `116 passed` (arquivos) e `2392 passed` (testes) com os
  limiares de 100% de cobertura do frontend satisfeitos; Ruff
  `All checks passed!`; pytest `2106 passed, 32 subtests passed`; Playwright
  `144 passed`; `check-wheel: 4 prompts presentes no wheel`. O gate roda de novo
  no hook de commit e no de push (resultado no corpo do PR).
