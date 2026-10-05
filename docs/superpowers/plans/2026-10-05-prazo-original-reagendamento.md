# Preservar prazo original no reagendamento — 163(d)

> Executar com superpowers:executing-plans e test-driven-development.

**Objetivo:** salvar sem editar a hora envia o ISO original e recebe a recusa
real `409 prazo_inalterado`, sem mudar prazo, estado ou histórico. A chave de
retry representa o payload efetivo, inclusive precisão original distinta.

**Design aprovado pelo root por delegação do dono:** snapshot interno opcional
`originalDeadline` no rascunho; `deadlineForDraft` conserva o literal quando o
civil não mudou e usa o conversor existente quando editado. `sameDraft`
compara civil, motivo e prazo efetivo. Nenhuma chave interna nova sai no JSON,
sem editor de segundos, step novo, dependência ou política nova de DST.

**Base/isolamento:** `wt/prazo-original-reagendamento` sobre composição
`b9c73f24e2297ba92a96d0685a979258175ca7c1`; futura PR contra
`wt/composicao-autonoma`. Reutilização exclusiva do ambiente offset 22, banco
próprio e hooks reinstalados explicitamente pelo root. Branch #24 e ledgers
preservados. Sem compose, merge, force, deleção ou escrita em outra árvore.

- [x] Ler instruções/base e executar baseline isolado: 1477/992/59, 100%,
  EXIT 0/325,20 s, 369 fontes+HEAD/índice estáveis.
- [x] RED antes de produção: 10 falhas/145 controles focados; navegador/API
  real 1 falha/59 controles com HTTP 200, prazo truncado e histórico indevido.
- [x] Implementar somente types, rescheduleDraft, RescheduleForm e hook;
  preservar conversores, textos visíveis, campos HTTP, guardas e recuperação.
- [x] GREEN: 155 focados, TypeScript EXIT 0 e 60 E2E/66,43 s. Units usam
  expectativas literais com seis casas, offset, segundo instante DST,
  edição, retry e nova chave; navegador confirma HTTP/GET/estado/erro reais.
- [x] Dois mutantes válidos, com TypeScript aprovado: converter sempre falha
  no payload; ignorar precisão falha na chave. Restauração finally/SHA igual.
- [ ] Revisão final independente, fontes congeladas, make check completo
  100% e leitura do resultado; atualização pós-gate somente em ledger/PR.
- [ ] Commit assinado com hooks normais, push de uma ref e PR stack autorizados
  somente após gate e revisão. Confirmar head/base/assinatura e CI por SHA.

**Escopo:** quatro arquivos de produção, três módulos unitários existentes,
tracking.spec.ts, HANDOFF, ARCHITECTURE e este plano. As quatro expectativas
produtoras do formulário agora exigem o snapshot interno; isso é parte do
comportamento corrigido, sustentado pelo POST integrado e API real, e não
redução da expectativa para acomodar erro.

**Documentação:** corpo da fotografia de composição preservado e heading
rotulado Histórico; resolução d no topo novo e item atual. 163(c/e), leitor
real, precisão editável e limites globais da composição permanecem pendentes.

**Referências Context7 consultadas nesta sessão:** MDN `/mdn/content` confirma
step default 60 de datetime-local; Playwright `/microsoft/playwright/v1.63.0`
confirma waitForResponse antes do clique e leitura de resposta. Não se altera
API da biblioteca. Plano pré-revisado somente leitura: C0/I0/M0.

**Evidências:** `.superpowers/sdd/2026-10-05-prazo-original-reagendamento/`.
Gate final, revisão final, hooks, commit, push e PR permanecem pendentes nesta
fotografia; resultados posteriores nesse ledger e no PR. Nenhum merge.
