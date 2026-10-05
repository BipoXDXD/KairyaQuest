# Rótulo do Iniciar com chave retida — 163(e)

Base b9c73f24, branch wt/iniciar-rotulo-retido, ambiente próprio offset21.
Design aprovado por delegação: observar somente a existência da chave start
no registro, sem criar UUID/mutar Map no render. Submitting continua Iniciando…;
failed ou slot start retido oferece Tentar de novo, demais continuam Iniciar.
Envio, release, reconcile, timeout, payloads e contratos não mudam.

1. Baseline completo congelado make check antes de fontes novas.
2. Fortalecer teste existente de retry/remount com nome exato, nó desconectado,
   erro local apagado, prioridade submitting/disabled, corpos K1/K1, efeito
   em_andamento/started_at e total UUID2; controles release e tipo reschedule.
3. Ver RED causal nome pós-remount, controles verdes; getter Map.has interno,
   boolean privado em StartControls, mudança mínima startLabel. GREEN módulo.
4. Mutação reverte regra para ignorar flag, RED causal; restauração finally/SHA,
   GREEN. Revisão independente e docs com resultados e limites reais.
5. Gate completo100 fonte congelada; commit-S e push1ref com hooks normais;
   PR base wt/composicao-autonoma, conferir cinco jobs próprios push/PR.
   Merge e demais decisões críticas ficam pendentes.
