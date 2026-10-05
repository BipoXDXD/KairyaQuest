# Foco após reagendamento sem rolagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar esta única fatia, com revisão independente ao final.

**Goal:** voltar o foco ao disclosure após o sucesso sem desfazer a rolagem escolhida durante o pedido.

**Architecture:** preservar o efeito e sua guarda existente em RescheduleForm; acrescentar somente preventScroll. Dois testes Chromium do app real controlam o HTTP e medem scroll/foco/estado, sem mockar DOM ou foco.

**Tech Stack:** React 19, TypeScript, Playwright 1.63/Chromium, Vitest existente.

**Spec:** README §7 e docs/HANDOFF.md pendência 163(c), com o desenho de navegador descrito neste plano. Design aprovado pelo responsável por delegação em 2026-10-05.

## Global Constraints

- Base é o commit da composição aprovado b9c73f24e2297ba92a96d0685a979258175ca7c1; árvore exclusiva criada pelo controlador, wt/foco-reagendamento-conjunto, offset24. PR de integração para wt/composicao-autonoma; nenhum merge.
- Somente sucesso do reagendamento; não alterar Iniciar, Concluir ou foco do ciclo, políticas, contratos, dependências, config ou limiares.
- Hooks explícitos, nenhum db-up/compose fora do principal, nenhum API/E2E simultâneo no próprio DB; 100% nos gates.
- Um implementador por worktree; preservar fontes alheias. Commit-S, push de uma ref e PR autorizados somente após review/gate100; nenhum merge.

## Review Focus

- Toggle fora da área rolada: sucesso deve focá-lo sem alterar scrollTop/window.scrollY.
- Fechamento do formulário: altura mínima e fillers mantêm geometria e scrollMax; desativar scroll anchoring apenas na fixture.
- Erro real422: prazo/rascunho/disclosure/alert preservados, sem elo novo ou transferência de foco da Tifa.
- Pedido pendente: reter POST com Route exata; fotografar scroll após qualquer interação que possa rolar.
- Oráculo causal: payload/prazo/histórico/status/foco aprovados antes de comparar scroll; nenhuma asserção só sobre argumento de focus.

### Task 1: corrigir e provar 163(c)

**Files:** modificar frontend/src/features/missions/RescheduleForm.tsx; criar frontend/tests/e2e/reschedule-focus-scroll.spec.ts; modificar docs/HANDOFF.md e docs/ARCHITECTURE.md; criar docs/superpowers/plans/2026-10-05-foco-reagendamento.md. Ledger ignorado .superpowers/sdd/2026-10-05-foco-reagendamento/.

**Interfaces:** nenhum contrato novo. RescheduleForm continua recebendo mission/disabled/failure/onSubmit/describedBy; cliente envia operation_id/new_deadline/reason ao endpoint existente. Fixture HTTP contém todos os campos de Mission e respostas GET reais do app, sem rota inesperada silenciosa.

- [x] Receber tree/head; ler AGENTS e README→ARCHITECTURE→HANDOFF→QUALITY nessa árvore. Instalar hooks e conferir banco offset24 sem imprimir env. Baseline make check congelado antes de copiar plano/fontes; erro pré-existente preservado, nunca chamado aprovação.
- [x] Copiar plano para localização do repositório e escrever dois casos, sem mudar produção: sucesso com prazo/histórico/Pendente/disclosure fechado/foco retornado e scroll preservado; erro422 prazo_expirado com prazo antigo/rascunho/Pendente/alert/focoTifa/scroll preservados. Na fixture, guardar Routes do POST até o controlador liberar a esperada, e abortar todas pendentes no finally. Usar listheight320, cartões minheight700 e fillers, scrollTop800, toggle comprovadamente fora viewport; comparar só scrollTop/window.scrollY e usar scrollMax como precondição antes/depois.
- [x] RED no navegador: código atual reprova sucesso somente pela rolagem; erro422 é controle aprovado. Construir artefato Vite antes de cada execução; não usar jsdom para alegar scroll.
- [x] Implementar exatamente esta mudança no efeito existente:

```tsx
if (closedBySuccess && document.activeElement === document.body) {
  toggleRef.current?.focus({ preventScroll: true })
}
```

- [x] GREEN nos dois casos. Mutação temporária retira somente preventScroll, preserva a guarda; reconstruir e observar sucesso RED/erro GREEN. Restaurar bytes em finally, verificar SHA; reconstruir e GREEN final. Nenhum resultado fingido se geometria não distingue a mutação.
- [x] Relacionados: Vitest MissionList/CycleSection/EvaluationPanel, depois check-e2e completo próprio. Lint/formato/tipos dentro das ferramentas normais. Atualizar docs com comandos/saídas reais e limites antes de congelar o gate final.
- [ ] Review verify_mcps somente leitura, make check completo congelado100% com manifestos antes/depois. Revisão pós-gate; stage somente ownership, cached diff check, commit-S/hooks normais, assinatura G/árvore limpa, push uma ref/hooks normais, PR base wt/composicao-autonoma/body-file. CI de push e PR no head exato via monitor; nenhum merge.

## Comandos após receber a árvore

```bash
make bootstrap
uv run pre-commit install --install-hooks
make reset-test-db
make migrate-test
make check
npm --prefix frontend run test -- src/features/missions/MissionList.test.tsx src/features/missions/CycleSection.test.tsx src/features/missions/EvaluationPanel.test.tsx
VITE_API_URL=/api npm --prefix frontend run build
(cd frontend && FOCUSQUEST_E2E_PORT_OFFSET=24 npx playwright test tests/e2e/reschedule-focus-scroll.spec.ts)
make check-e2e
make check
```

Cada comando é sequencial no banco próprio. O build e o teste focal repetem para RED, GREEN e mutação/restauração; nenhum teste focal substitui gate full. Resultados, hashes, commit/PR/CI pertencem ao ledger ignorado da sessão. Só marcar execução depois de ler saída real.

Resultados executados antes do gate final: baseline1477/992/59/100% estável; RED navegador1fail/1pass por scroll800→174; GREEN2; mutação1fail/1pass/restauraçãoSHA/GREEN2; relacionados198 componentes e61 E2E aprovados. Review/gate/hooks/PR/CI finais no ledger ignorado.

Retomada autorizada 2026-10-05: terceiro cenário de sucesso preserva foco e
rascunho já na Tifa, prazo/histórico e scroll reais. GREEN 3; mutação retirando
somente a guarda body causou 1 falha no foco/2 controles aprovados; restauração
exata com SHA conferido, build e GREEN 3. Gate fresco e publicação pelos hooks
normais seguem registrados em `resume-2026-10-05/`, sem merge desta feature.
