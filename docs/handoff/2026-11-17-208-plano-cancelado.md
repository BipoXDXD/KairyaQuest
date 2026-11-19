# #208 · Resposta de um plano cancelado

Base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a`.
Cancelar enquanto o POST está em voo desmonta o formulário. Uma
resposta posterior da abertura anterior podia causar atualização da
trilha, fala de confirmação ou fechamento da abertura atual.

O formulário identifica o envio em um token local. Cancelar e desmontar
invalidam o token. A resposta só produz estado, foco ou callbacks se
o token ainda corresponder ao envio. Uma leitura posterior pode
encontrar o plano que o servidor já gravou.

A regressão adia a resposta anterior no fluxo normal da Trilha de
Lanternas. Ela cobre 201 da semana atual ou seguinte, e 409 de plano
existente da atual. Cada caso verifica que o formulário, o conteúdo e o
foco novos continuam presentes e que o novo envio funciona. Durante o
envio, o teste verifica `aria-busy`, `aria-disabled`, o bloqueio de novo
POST e o Cancelar habilitado.

O Vitest dirigido a `WeekPlanForm.test.tsx`, `WeekPlanEntry.test.tsx` e
`LanternTrail.createPlan.test.tsx` aprovou 63 de 63 testes com um worker.
O pre-commit executa o gate integral na reserva de commit.
