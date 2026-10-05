# Checkpoint autônomo — plano de implementação

> **Para execução:** usar superpowers:executing-plans. Design documental aprovado pelo root por delegação do dono; execução direta com revisão independente verify_mcps, sem nova rodada de produto.

**Objetivo:** tornar a próxima retomada inequívoca, distinguindo main integrada, PRs publicados, limites parciais e decisões críticas.

**Arquitetura:** atualizar somente os topos de CONTINUACAO, HANDOFF e RETOMADA, preservando os blocos antigos como histórico. HANDOFF concentra a tabela de heads/base/CI; os demais dão orientação curta e o link. A branch documental parte do PR8, sem produção de outras features.

**Stack:** Markdown e Git/GitHub existentes, sem dependência nova.

**Design:** instrução root desta sessão: branch própria inicialmente vazia na main em 5ba81c3, retarget seguro para 009d9f7d (PR8); PR base docs/estado-pos-pr6, sem duplicar PR8 nem executar merge.

## Restrições

- Um implementador nesta árvore; bancos/portas próprios, offset 16; hooks ativos e nenhum compose.
- Autoridade README/AGENTS; fontes de outras fases e principal preservadas.
- Produção, contrato, dependência e gate intactos; cobertura de 100% exigida.
- Não chamar geração paga, ler senha/chave ou afirmar gate combinado de features.
- Congelar só após heads/publicação/CI das fases correntes estabilizados; comandos/resultados desta fase distinguidos dos relatos de outros implementadores.

## Foco da revisão

Heads/base/CI por SHA, pausa revogada, não repetir entregas, histórico preservado, limites 103/104/160/161/100 explícitos e merge/decisões críticas pendentes. Revisão documental sem teste espelho; make check integral obrigatório.

O estado posterior de cada passo fica no ledger ignorado; não repetir uma
publicação ou gate concluído por causa destas caixas de planejamento.

## Task 1: Registrar e publicar o estado corrente

**Arquivos:** modificar CONTINUACAO.md, docs/HANDOFF.md, docs/RETOMADA-2026-10-04.md; criar este plano. Evidências/ledger ignorados em .superpowers/sdd/2026-10-05-checkpoint-autonomo/.

- [x] Criar worktree pelo script; validar branch vazia/limpa e retarget autorizado para PR8; instalar hooks e ler documentos correntes.
- [x] Confrontar ledger central/root, ledgers por fase e gh pr/run list read-only; registrar inventário sem segredos.
- [x] Atualizar topos com estado confirmado; apontar PRs/heads/base e resultados atribuídos; preservar história e pendências parciais.
- [ ] git diff --check; revisão independente verify_mcps; congelar fontes por SHA.
- [ ] make check completo isolado, EXIT 0 e cobertura de 100%; ler saída e comparar fontes, HEAD e índice antes/depois. Resultado próprio do checkpoint não aprova combinação de features.
- [ ] Stage somente quatro arquivos; git diff --cached --check/stat; commit -S normal, assinatura G e árvore limpa; push de uma ref com pre-push ativo.
- [ ] gh pr create com --base docs/estado-pos-pr6 --head wt/checkpoint-autonomo --title/--body-file exatos; confirmar SHA/PR/run e avisar root/monitor_ci. Nenhum merge.
