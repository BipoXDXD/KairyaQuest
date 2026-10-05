# GeneratorExit atravessa o tradutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Medir se um novo oráculo de erro real detecta supressão de GeneratorExit que a suíte antiga deixa passar; adotar somente se houver ganho.

**Architecture:** Teste puro no tradutor de exceções existente, sem produção permanente. Caracterização da mutação ocorre em worktree/banco exclusivos; o novo caso fica fora de `tests/` até o controle completo antigo.

**Tech Stack:** Python/pytest e bibliotecas existentes; sem dependência nova.

**Spec:** Autorização desta sessão: preservar ValueError, medir foco e toda suíte antiga sem exclusões/skips, RED novo sob mutante, restauração/GREEN, revisão/gate100% e hooks normais antes da publicação.

## Global Constraints

- Base `5ba81c3`; um implementador nesta árvore, offset19 e banco próprio; não compose.
- Nenhuma alteração permanente em `src/`, contrato, infraestrutura ou dependências.
- Suíte antiga inteira por `pytest tests`: novo caso permanece em `/tmp`, sem filtros ou teste ignorado.
- Mutante `except GeneratorExit: return` temporário, byte restore em finally e SHA conferido.
- Se antigo detectar mutante, não publicar fatia redundante; registrar o resultado real.
- Merge não autorizado; commit-S/push1ref/PR dependem revisão e gate completos100%.

## Review Focus

- ValueError continua atravessando sem tradução; teste original preservado.
- GeneratorExit conserva a mesma instância e causa None, não só classe ou chamada.
- Contagem/coleção de todos os1436 testes antigos prova controle sem caso novo.
- Cancelamentos/provider reais e testes unit antigos permanecem verdes no mutante.
- Ganho mede contrato fino do tradutor; não alegar correção de produto ou matriz de cancelamento.

### Task1: Controle, adoção condicional e publicação

**Files:** Modify `tests/unit/test_traducao_de_erros.py`, `docs/HANDOFF.md`; create este plano; evidências em ledger ignorado e caso provisório em `/tmp`.

- [x] Step1: Guardar manifestos/hash dos testes antigos, coletar suíte1436 e verificar que o teste novo existe somente fora de `tests/`.
- [x] Step2: Aplicar temporariamente except GeneratorExit:return; rodar unit antigos+provider/service/desconexão. Se falham, restaurar e encerrar proposta.
- [x] Step3: Se foco passa, rodar `uv run pytest tests -v` inteiro, sem filtro/exclusão/skip; ler resultado e comprovar testes antigos intactos.
- [x] Step4: Se suíte antiga passa, adicionar exatamente o teste provisório ao arquivo unit (ValueError intacto) e executar novo caso sob mutante: deve falhar por exceção suprimida.
- [x] Step5: Restaurar fonte original em finally/SHA, executar módulo com novo caso: todos devem passar; atualizar HANDOFF somente após ganho medido.
- [ ] Step6: Revisão independente, gate completo da árvore final congelada100%; registrar comandos/resultados/limites.
- [ ] Step7: Commit-S/hook normal, push1ref/pre-push e PR contra main; sem merge.

## Evidência medida nesta sessão

- Coleção antiga1436; hashes dos arquivos de teste intactos durante controle.
- Mutante: foco482pass45,80s; suíte antiga inteira1436pass208,51s, novo caso só/tmp.
- Só então caso novo no unitfile: RED1fail1,80s, GeneratorExit suprimido.
- Produção restaurada finally/SHA `9a17020a4b558fdfc0cac872e24f86c2ac403633c3b873b2eee2229541cb0fcb`; GREEN8pass1,98s, diffsrc vazio.
- Ruff/mypy aprovados. Revisão/gate/publicação posteriores no ledger, com estado real.
- Contrato fino do tradutor; não prova matriz de cancelamento/recursos SDK nem mudança de produto. Suíte mutante foi caracterização, não gate oficial ou aprovação de produção.
