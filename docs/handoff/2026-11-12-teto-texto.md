# wt/teto-texto: teto de 500 caracteres nos textos do plano da semana, também no back (follow-up da #142) — 2026-11-12

Objetivo: o formulário do plano (#142, PR #147) já impunha 500 caracteres por texto,
mas o servidor aceitava qualquer tamanho. A validação passa a valer na fronteira: o
`POST /api/plans` responde 422 acima do teto e um teste de concordância prende o valor
do front ao do back. Revisão-base: `dcf598a` (main).

## Declarações

- Zero dependência nova, zero endpoint, zero migração. Nenhum teste pulado, limiar
  intacto, nenhum hook tocado.
- **Mudança de contrato:** `instructions` e `completion_criterion` de cada dia e do
  bônus em `POST /api/plans` passam a ter `maxLength` 500; acima disso, 422 e nada é
  gravado. O único cliente (o front) já não enviava mais que isso.

## Alterações

- `src/focusquest/modules/missions/cycle_schemas.py`: constante
  `TAMANHO_MAXIMO_DO_TEXTO_DO_PLANO = 500` e `max_length` nos quatro campos de texto
  de `DailyCreate` e `BonusCreate`.
- `frontend/src/features/campaigns/weekPlanDraft.ts`: só o comentário de
  `MAX_TEXT_LENGTH`, que dizia que o servidor não tinha teto.
- `tests/unit/test_limite_do_texto_do_plano.py`: concordância front × back no molde de
  `test_limite_da_pergunta.py` (lê o TS como texto, falha com `arquivo:linha`), mais
  os testes do próprio leitor.
- `tests/integration/test_cycle_api.py`: on point e off point em cada um dos quatro
  campos (500 → 201; 501 → 422 sem `WeeklyPlan` nem `Mission` gravados) e o valor
  decidido (500).

## Decisão: contagem de caracteres

O Pydantic conta pontos de código; o front conta unidades UTF-16 (`String.length`,
mesma conta do `maxLength` do campo). Mantidas as duas: fora do BMP o front é mais
estrito (um emoji vale 2 lá e 1 aqui), então o front nunca envia o que o back recusa.

## Observação: `check-handoff` intermitente

No merge de `origin/main` no #147 (após o #148, que só tocou `docs/HANDOFF.md`), o
hook `pre-merge-commit` reprovou uma vez no `check-handoff`. Rodado à mão logo depois,
passou, e o `git commit --no-edit` com o hook também passou. Não reproduzido; se
repetir, vira issue.
