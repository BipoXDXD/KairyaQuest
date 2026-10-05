# Composição das fases autônomas #7–#24

Base: main `5ba81c3`, branch `wt/composicao-autonoma`. Escopo autorizado por
delegação do dono: reunir fases publicadas para uma verificação conjunta e
abrir PR; merge e decisões críticas ficam pendentes. Nenhuma ref existente
é reescrita, nenhum worktree existente é apagado, nenhum PR individual fechado.

1. Baseline limpo com hooks instalados, banco/offset exclusivos e make check.
   Executado: EXIT 0, 341,40 s, 1436/990/59, cobertura 100%; 349 fontes estáveis.
2. Aplicar patches dos heads #7–#24 em ordem; #17 delta #7 e #20 delta #8.
   Executado: 22 arquivos runtime/testes byte a byte iguais aos heads finais,
   13 planos exclusivos preservados, sem dependência/gate/contrato novo.
3. Conciliar documentação sem perder os registros e o checkpoint #20.
   Executado: fragmentos e resoluções registrados no ledger; dois títulos
   vazios removidos após revisão; descrição 91 alinhada à amostra histórica.
   Envelope atual distingue gates isolados, baseline e conjunto ainda pendente.
4. Revisão independente de runtime, concorrência e documentação; congelar
   fontes+HEAD+índice e executar make check completo. Qualquer correção invalida
   o congelamento anterior; preservar erro e executar novamente o gate necessário.
5. Após aprovação e cobertura 100%, commit assinado com hook normal, push
   de uma ref com pre-push normal, PR para main e conferência dos cinco jobs
   de push e pull_request no head exato. Não mesclar.

Comandos e resultados reais da etapa conjunta, assinatura, hooks, SHA, PR e
CI serão registrados no ledger ignorado
`.superpowers/sdd/2026-10-05-composicao-fases/` e no PR. Nunca tratar uma etapa
planejada como aprovada. Limites das evidências e decisões críticas estão no
estado corrente de `docs/HANDOFF.md` e permanecem explícitos nos registros.
