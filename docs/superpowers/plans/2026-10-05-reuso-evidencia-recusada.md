# Reuso sequencial com evidência recusada

Objetivo: fortalecer dois cenários existentes de recusa de chave com conteúdo
real de evidência e oráculos de efeitos SQL anteriores ao rollback.

Base `main` em `5ba81c3`; branch `wt/reuso-evidencia-recusada`, banco e portas
próprios. Root é o único implementador. O dono delegou decisões não críticas
e autorizou commit assinado, push de uma ref e PR após gate completo a 100%.
Merge e decisões críticas seguem pendentes.

1. Executar baseline dos três módulos relacionados.
2. Caracterizar a cobertura antiga sob mutação temporária que atribui evidência
   no caminho `OperacaoReutilizadaError` de `_exigir_mesma_operacao` e relança
   o erro real. Restaurar os bytes do serviço no `finally` e conferir SHA.
3. Fortalecer os dois testes existentes: chave start na mesma missão em
   andamento e chave complete noutra missão pendente, com origem concluída
   e entrega própria. SQL/autoflush antes do rollback verifica todos os efeitos.
4. Medir falhas causais sob o mesmo mutante e sucesso dos módulos restaurados.
5. Atualizar handoff e arquitetura, revisar fontes congeladas e executar
   `make check`; exigir cobertura de 100% nos limiares existentes.
6. Commit `-S`, hooks normais, push único, PR `main` e CI por SHA/evento.

Critério de aceitação: erro real de reuso acompanhado de ausência de evidência
ou XP novos, operações e estado intactos, entrega e progressão da origem
preservadas. Nenhuma mudança permanente em produção ou migrações.

Limites: somente reuso sequencial com evidência; não promete pós-rollback
noutra sessão, `_mesma_evidencia`, corrida UNIQUE, HTTP ou T-M1 inteiro.
Caracterização do mutante não é aprovação do gate nem diagnóstico de bug atual.
