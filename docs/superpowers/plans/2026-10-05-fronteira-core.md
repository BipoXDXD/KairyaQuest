# Fronteira de core — restos da pendência 103

**Objetivo:** rejeitar achados espúrios do verificador AST sem modificar o detector, o produto ou seus contratos.

**Base:** `5ba81c3`, branch `wt/fronteira-core`; banco exclusivo e offset 7. Um implementador neste worktree. Hooks instalados; nenhum compose fora do principal.

**Contrato existente:** `imports_proibidos` examina imports estáticos, expande os candidatos de `from`, resolve imports relativos e a regra percorre subpastas. Imports dinâmicos ficam fora dessa prova. Design de teste existente aprovado pelo coordenador; sem novo design de produto.

**Arquivos:** `tests/unit/test_core_sem_modulos.py`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md` e este plano. Produção, dependências, contratos e gate preservados.

**Foco da revisão:** expectativas literais exatas, expansão de `from` preservada, aliases/misturas/prefixos, prova causal da asserção fortalecida e documentação sem alegar testes ainda não executados.

## Task 1: Fortalecer a prova da fronteira

- Conferir isolamento e hooks; executar o módulo original.
  Comando: `uv run pytest tests/unit/test_core_sem_modulos.py`.
  Esperado: EXIT 0, 13 testes.
- Em cópia isolada, acrescentar um achado espúrio somente aos resultados positivos.
  Executar somente os casos parametrizados originais.
  Esperado: os 11 casos passam, demonstrando a tolerância indevida do oráculo anterior.
- Corrigir as expectativas de `from` para todos os candidatos previstos pelo contrato, usar igualdade exata e adicionar casos de aliases/misturas/prefixos semelhantes. Delimitar imports dinâmicos no comentário.
- Executar a mesma mutação em cópia da versão fortalecida.
  Esperado: os casos positivos falham por achado extra, EXIT 1; nenhuma fonte versionada alterada pela mutação (SHA-256).
- Executar o módulo real restaurado.
  Esperado: todos os casos passam, EXIT 0.
- Atualizar arquitetura e pendência 103 com escopo, evidências e limite aceito.
- Executar `make check` completo no banco exclusivo e `git diff --check`.
  Esperado: EXIT 0 e cobertura 100%; contagens/resultados reais no ledger. Revisão independente coordenada pelo root.

Commit, push e PR são coordenados pelo root após revisão e gate; nenhum merge nesta tarefa. Evidências preservadas em `.superpowers/sdd/2026-10-05-fronteira-core/`.
