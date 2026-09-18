# Spec de design — Ciclo diário de missões

**Data:** 2026-09-18
**Estado:** escrita durante uma ausência do dono e revisada por um revisor
adversarial. **Nada foi implementado.** Antes do plano de implementação, o dono
precisa tomar **três decisões bloqueantes** (seção "Decisões do dono"). Todas
as outras decisões desta spec foram tomadas por autorização dele e estão
marcadas com o motivo. As que **interpretam** o que ele disse também estão
listadas no fim, em "Interpretações a confirmar".

## O que o dono disse

Na primeira mensagem de 2026-09-18, sobre o que fazer depois do Incremento 1a:

> "missoes diarias (24h) reveladas semanalmente, streak de 7 dias leva a uma
> missão especial com bonus de xp"

Na segunda, respondendo às perguntas que ficaram abertas:

> "a cada dia explicitamente, mas o usuario pode visualizar as missoes restantes
> da semana numa area no menu, como uma trilha, as missoes das semanas seguintes
> permanecem ocultas. nao realizar a missao diaria zera a sequencia. o bonus vale
> o triplo das missoes dificeis, a dificuldade da missao tambem aumenta, a cada
> 7 dias, se o usuario manter a sequencia, ele tem acesso a essa missao bonus."

A pendência 26 do `docs/HANDOFF.md` registrou o resumo da primeira mensagem,
"reveladas semanalmente". Esta spec lê as duas mensagens juntas. **A semana
aparece inteira na trilha, e cada missão é apresentada explicitamente no seu
dia.** Ver B3.

## Decisões do dono (bloqueiam o plano)

### B1. A regra da sequência conflita com o README §5

O README §5, linha 118, diz: "Permita ajustar intensidade, frequência e horários
das cobranças, **incluindo pausa**. Não use culpa, ameaças, vigilância fictícia
ou **perda destrutiva de progresso por faltar um dia**."

"Não realizar a missão diária zera a sequência" é, na leitura mais direta,
perder progresso por faltar um dia. O README é a autoridade final do produto, e
o dono escreveu os dois textos. Então só ele decide qual prevalece. Esta spec
não resolve o conflito por ele.

Em qualquer uma das saídas, **XP e conclusões nunca se perdem**. O que está em
jogo é só o contador da sequência e o acesso à missão especial.

- **(a) Emendar o README §5.** Declarar que a sequência é um **contador de
  hábito**, e não progresso: zerá-la não tira XP, conclusões nem nada que o
  usuário conquistou. A regra fica como o dono a disse. *Custo:* o produto passa
  a ter uma mecânica de perda, embora limitada, onde o README pedia nenhuma.
- **(b) Pausa voluntária.** Um dia perdido continua zerando a sequência, mas o
  usuário pode **pausar** o ciclo antes, e um dia pausado nem conta nem quebra.
  Isto **estende** o README, não o aplica. A pausa que o §5 prevê é das
  **cobranças** ("intensidade, frequência e horários das cobranças, incluindo
  pausa"), não da sequência. *Custo:* o conflito **não desaparece**, porque
  faltar um dia sem ter pausado ainda zera. A pausa também exige um endpoint
  (`code`, testes e motivo no HANDOFF), um estado a mais para o dia e um limite
  de uso.
- **(c) Congelar em vez de zerar.** Faltar um dia não soma à sequência, mas
  também não a zera. É a saída fiel ao README §5, e **contraria a frase do
  dono** ("não realizar a missão diária zera a sequência"). *Custo:* sem perda,
  a sequência deixa de medir consistência. Uma sequência de 30 dias pode ter 30
  dias de falta no meio.

**Esta spec funciona com as três saídas.** Mudam só a regra da sequência em
"Regras do ciclo" e, com (b), um endpoint e um estado, que entrariam no
Incremento B. Veja também a C6: um dia **sem plano** já nem conta nem quebra,
então deixar de criar planos congela a sequência sem limite. Isso pesa na
escolha entre (a) e (b).

### B2. A ordem dos incrementos contraria o README §14

O README decide a ordem, e uma versão anterior desta spec não citou o trecho que
a decide:

- §14, linha 258: a primeira fatia inclui "Com credenciais, Tifa propõe uma
  missão e a cria após confirmação" — isso ainda não existe. Sem credenciais, o
  README manda testar o contrato e mostrar indisponibilidade;
- §14, linha 264: "**Próximo incremento: missão completa, da delegação à
  recompensa.**";
- §8, linha 167: "Implemente só entidades do primeiro fluxo." O plano semanal não
  é do primeiro fluxo.

O argumento anterior para fazer o ciclo antes da Tifa dizia que o `propose_plan`
dela precisaria de um plano semanal onde escrever. **Esse argumento não se
sustenta.** O primeiro fluxo da Tifa é criar **uma** missão (§14), e o §6, linha
130, manda implementar "apenas ferramentas do primeiro fluxo". Os outros dois
argumentos (determinismo e relógio injetável) valem para qualquer ordem.

**O que as duas ordens têm em comum.** O plano semanal é criado **só pela API**
no Incremento B nas duas ordens, porque a Tifa escrever a semana
(`propose_plan`) está fora deste recorte e o primeiro fluxo dela cria uma
missão só. Então nenhuma ordem faz "o plano nascer com um autor de verdade".
Isso fica para um incremento posterior, que ligue o `propose_plan` ao plano. O
§8 ("implemente só entidades do primeiro fluxo") também vale igual para as duas:
o plano entra no Incremento B de qualquer jeito. E nenhuma das duas entrega a
**recompensa** que o §14 põe no próximo incremento ("da delegação à
recompensa"): XP total e avaliação da entrega ficam fora deste recorte.

**O que as diferencia** é uma coisa só: se o incremento que vem depois do A é o
da Tifa, como o §14 diz literalmente, ou o do ciclo.

O trabalho se divide em três incrementos, que qualquer ordem aproveita:

- **A — conclusão na tela.** Relógio injetável (pendência 7), `code` nos erros
  (pendência 1), e o botão **Concluir** para as missões que já existem, com o
  `operation_id` preservado entre tentativas. É pequeno, fecha duas pendências,
  tira o risco do fluxo de conclusão, e é um pedaço literal de "missão completa,
  da delegação à recompensa".
- **B — o ciclo.** Plano semanal, diárias, sequência, `/api/cycle` e o cartão
  "Missão de hoje".
- **C — a campanha.** Trilha, missão especial e navegação lateral.

As duas ordens possíveis:

| Ordem | Sequência | O que ganha | O que custa |
|---|---|---|---|
| **1 — a do README** | A → 1b (Tifa) → B → C | Segue o §14 como está: a Tifa, que é "central no produto" (README, abertura), chega antes. Quando o ciclo vier, ela já existe, e ligar o `propose_plan` ao plano fica a um incremento de distância. | O ciclo, que é o que o dono está desenhando agora, espera o 1b inteiro. |
| **2 — ciclo antes** | A → B → C → 1b | O ciclo chega antes, e ele é determinístico: não depende de credencial nem de modelo. | Exige **emendar o §14**, que nomeia o próximo incremento. Até o 1b, só a API cria missões, e as semanas ocultas não surpreendem ninguém. |

**Recomendação: Ordem 1**, porque segue a autoridade do projeto sem emenda. É
uma recomendação fraca: a diferença real entre as duas é só qual incremento vem
primeiro, e o dono pode preferir o ciclo por motivo de produto que esta spec não
conhece. O Incremento A vale nas duas ordens e pode começar assim que o dono
aprovar esta spec.

### B3. O que a trilha mostra dos dias futuros

O dono escreveu "a cada dia explicitamente, mas o usuario pode visualizar as
missoes restantes da semana numa area no menu, como uma trilha". Há duas
leituras:

- **(a) Conteúdo visível, missão bloqueada.** A trilha mostra a missão de cada
  dia futuro da semana, que só pode ser feita no próprio dia. "Revelada a cada
  dia" significa que a missão é apresentada no Quartel-General no seu dia.
  **Esta spec assume (a)**, porque "visualizar as missões" é ver as missões, e
  porque a primeira mensagem dizia "reveladas semanalmente".
- **(b) Só marcadores.** A trilha mostra que existe uma missão em cada dia, sem
  o conteúdo, como faz com a missão especial bloqueada. O conteúdo aparece no
  dia.

Se o dono escolher (b), mudam só o `GET /api/plans/current` e a tela.

## Contexto

- O Incremento 1a entregou missões avulsas: o usuário cria uma pela API
  (`POST /api/missions`), a lista aparece no Quartel-General, e a conclusão é
  idempotente e segura sob concorrência. A tela lista, mas ainda não conclui.
- O README §6, linha 130, lista as ferramentas da Tifa: `get_study_context`,
  `propose_plan`, `create_mission`, `submit_activity`, `reschedule_mission` e
  `request_reward_evaluation`. O §5 manda "propor retomar, dividir ou
  reagendar", e o §8 manda "preservar histórico de replanejamento".
- O README §7 planeja a área "**Campanhas:** planos, objetivos, disponibilidade
  e etapas" (linha 151), e sugere nomes como "Campanhas — planos de estudo"
  (linha 157), com navegação lateral no desktop. A trilha do dono é essa área.
- A pendência 1 do HANDOFF (os 409 sem `code` legível por máquina) foi adiada
  porque nenhum 409 era alcançável pela tela, que só listava. O Incremento A
  torna os 409 alcançáveis.

## Decisões técnicas

| # | Decisão | Motivo |
|---|---|---|
| C1 | O **dia** é a data civil em `America/Sao_Paulo`, como o intervalo semiaberto [00:00 de D, 00:00 de D+1). A **semana** vai de segunda a domingo | A3 e README §8 já fixam São Paulo para apresentar, e o limite do dia precisa ser o que o usuário vê. O intervalo semiaberto dá um único dono para cada instante: a meia-noite pertence ao dia seguinte. A semana ISO é a do `date.isocalendar()`. |
| C2 | O estado do ciclo é **derivado do relógio**, sem job agendado | "Liberada", "perdida", "sequência" e "especial desbloqueada" são calculados a cada leitura a partir do plano, das conclusões e do instante atual. Um job à meia-noite exigiria um agendador e ainda teria de recuperar os dias perdidos enquanto o servidor estivesse fora. O custo é ler o histórico a cada cálculo da sequência. Com usuário único isso não pesa, e a leitura se limita ao intervalo coberto por planos. |
| C3 | Uma entidade nova, o **plano semanal**: 7 diárias, uma por dia, mais 1 missão especial | O README §8 lista "plano" entre as entidades, e o §7 põe planos em "Campanhas". Exigir os 7 dias evita uma semana com buracos. |
| C4 | A missão ganha um **tipo** (`mission_type`): `avulsa`, `diaria` ou `especial` | As missões do 1a viram `avulsa` e mantêm o contrato. Removê-las quebraria o 1a, e o README ainda prevê missões fora da semana ("divida esta missão"). O nome é `mission_type`, e não `kind`, porque `mission_operations.kind` já existe com outro sentido. |
| C5 | A diária **só pode ser concluída no próprio dia** | É o sentido de "diárias (24 h)". Antes do dia ela está bloqueada; depois, sem conclusão, está perdida. |
| C6 | A **sequência** conta os dias consecutivos com a diária concluída, até hoje, ou até ontem se a diária de hoje ainda está em aberto. **Um dia sem plano não conta e não quebra** | "Não realizar a missão diária zera a sequência." Sem missão, o usuário não deixou de fazer nada, e quebrar a sequência por isso seria a perda destrutiva que o README §5 proíbe. Isso vale para uma semana sem plano e para os dias anteriores a um plano criado no meio da semana. **Custo declarado:** deixar de criar planos **congela** a sequência sem limite, o que funciona como uma pausa sem limite. Enquanto o plano for criado só pela API, quem cria o plano controla isso. Pesa na escolha de B1. |
| C7 | A especial é **desbloqueada** quando a sequência chega a um múltiplo de 7, pela conclusão da diária que completa o 7º dia | Dois marcos da mesma sequência ficam exatamente 7 dias um do outro. Depois de uma quebra, a nova sequência só chega a 7 pelo menos 7 dias depois do marco anterior. Então **cada semana tem no máximo um marco**. |
| C8 | A especial fica disponível **do desbloqueio até o fim do dia seguinte** | O dono não fixou janela. O fim do dia seguinte garante pelo menos 24 h e evita que um marco no domingo dê só algumas horas. Perder a especial não quebra a sequência, porque a sequência é das diárias. |
| C9 | A especial tem sempre a **dificuldade máxima** (5), e seu XP é **3 × XP(5) = 660** | "O triplo das missões difíceis", lido como três vezes o XP da dificuldade máxima. O XP continua **derivado** (A4), agora da dificuldade e do tipo, e nunca é gravado. |
| C10 | `estimated_minutes` ≤ **1440** para a diária e a especial. O prazo delas **não é entrada nem coluna**: é calculado | O teto de 1440 min (24 h) interpreta "diárias (24 h)" como limite também da estimativa, e não só da janela. O prazo da diária é o fim do seu dia; o da especial, o fim do dia seguinte ao desbloqueio. Os dois são **derivados**, como o XP e a duração real, para não haver dois lugares que possam discordar. Isso **reduz** a pendência 26 às diárias e especiais. Para a avulsa ela continua aberta. |
| C11 | **Semanas futuras e especial bloqueada são inexistentes para a API**: o mesmo 404, com o mesmo corpo, de "missão inexistente" | "As missões das semanas seguintes permanecem ocultas." Um status diferente revelaria que existem. As diárias da **semana atual** são visíveis, então concluir uma antes do dia dá **409**. |
| C12 | O corpo de erro ganha **`code`**: `{"detail": ..., "code": ...}` | Fecha a pendência 1. O frontend decide pelo `code` e mostra a sua própria mensagem em pt-BR. As mensagens do backend não têm acento, e a de transição expõe o valor cru do enum. |
| C13 | **Relógio injetável**, por dependência do FastAPI, lido **depois** da trava da linha | Fecha a pendência 7. Viagem no tempo fica nos testes de integração, sem gancho de teste no código de produção. |
| C14 | O plano é criado **só pela API** neste recorte, nas duas ordens; a tela lê, conclui e mostra a campanha | É o mesmo recorte do 1a, em que a tela listava e a criação era pela API. A Tifa escrever a semana (`propose_plan`) é um incremento posterior, em qualquer ordem (B2). Uma tela de "planejar a semana" não é o produto: o produto é a Tifa propor a semana. |
| C15 | Navegação **lateral**, por estado local e sem biblioteca de rotas | O README §7 pede navegação lateral, e o §3 manda preferir estado local. São duas áreas, Quartel-General e Campanhas; a rota por URL entra quando houver a terceira. |
| C16 | Depende da correção do fuso da sessão (`fix/sessao-em-utc`) | As regras comparam instantes lidos do banco, e a correção garante que eles voltem em UTC em qualquer servidor. |
| C17 | O `check-e2e` passa a **começar de esquema limpo**, com a **mesma** guarda do banco de teste | O plano é único por semana, então um segundo plano igual dá **409**, e o `check-e2e` repetido reprovaria na segunda execução. A guarda `exigir_banco_de_teste` sai do `tests/integration/conftest.py` para um módulo compartilhado entre a suíte e esse passo. Hoje o `scripts/e2e-env.sh` **já duplica** a segunda condição dela num heredoc Python. Essa cópia é substituída pelo módulo compartilhado, e não multiplicada. A semeadura continua pela API. O critério de aceite é **`make check-e2e` duas vezes seguidas**, porque o `make check` roda o `check-api` antes e o `DROP SCHEMA` do pytest mascararia a falha. Efeito nas pendências: a **20** (o E2E acumula linhas) fecha, e a **19** (não rodar `check-api` e `check-e2e` ao mesmo tempo) continua, agora com dois `DROP SCHEMA` disputando o mesmo banco. |

## Regras do ciclo

`hoje` é a data em São Paulo do instante devolvido pelo relógio injetado.

**Estado de disponibilidade** (`availability`) da diária do dia `D`, derivado e
nunca gravado. Ele é diferente do `state` gravado (`pendente`, `em_andamento`,
`concluida`), que continua existindo:

| Condição | `availability` | Concluir? |
|---|---|---|
| `D` anterior à data em que o plano foi criado | `fora_do_plano` | não — 409 `missao_expirada` |
| `D > hoje` | `bloqueada` | não — 409 `missao_bloqueada` |
| `D == hoje`, não concluída | `disponivel` | sim |
| concluída | `concluida` | reenvio idempotente devolve o mesmo 200 |
| `D < hoje`, não concluída | `perdida` | não — 409 `missao_expirada` |

**Ordem da conclusão**, fixada:
1. trava da linha;
2. leitura do relógio;
3. **ocultação**: missão de semana futura ou especial bloqueada responde o 404
   idêntico, **antes de qualquer outra checagem**;
4. **reenvio**: se o `operation_id` já concluiu esta missão, devolve o mesmo 200
   **a qualquer hora**. Uma conclusão às 23:59:59 reenviada às 00:00:01 não
   pode receber 409;
5. regra do dia, **só para missão ainda não concluída**;
6. transição.

O passo 3 vem antes do reenvio por um motivo de ocultação. Depois dele, um
`operation_id` já gasto em outra missão, enviado ao `id` de uma missão oculta,
cairia na checagem de reuso do 1a e receberia 409 `operacao_reutilizada`,
enquanto um `id` inexistente recebe 404. A diferença entre as duas respostas
revelaria que a missão existe.

Uma operação **nova** sobre uma diária já concluída recebe `transicao_ilegal`,
em qualquer dia. A regra do dia não se aplica a ela (passo 5), e `concluida` é
terminal (A5). "Já foi feita" informa o cliente melhor do que "expirou". Em
relação ao 1a mudam dois pontos: a ocultação entra antes do reenvio, e a regra
do dia entra entre o reenvio e a transição.

**Sequência** `s`: começa em hoje, se a diária de hoje foi concluída, ou em
ontem, se não foi. A contagem anda para trás, dia a dia:

- dia com a diária concluída no próprio dia: soma 1;
- dia sem plano, ou dia `fora_do_plano`: é pulado, sem somar e sem parar;
- qualquer outro dia: para a contagem.

A sequência atravessa semanas. A regra "qualquer outro dia para a contagem" é a
que B1 decide. Com B1(c), a diária perdida passa a ser pulada como o dia sem
plano.

**Progresso até a especial**, na tela: `s mod 7`, exibido como "N de 7".
`days_to_milestone = 7 − (s mod 7)`, e vale 7 quando `s == 0`.

**A especial no Quartel-General.** O `GET /api/cycle` devolve em `special` a
especial do **marco mais recente**, enquanto o instante atual estiver dentro da
janela dela, e com `availability` `disponivel` ou `concluida`. Fora da janela,
`special` é `null`. A tela mostra o cartão da especial enquanto `special` não
for nulo, com **Concluir** se estiver disponível e o selo de concluída se já foi
feita, e o contador "N de 7" quando for nulo.

Um caso concreto que a tela precisa tratar: marco no domingo de `S`. Na segunda
de `S+1`, o Quartel-General mostra a especial de `S`, ainda na janela. Ao mesmo
tempo, a trilha de `S+1` mostra o marcador da especial de `S+1` com "0 de 7",
porque esse marcador conta o **próximo** marco. As duas coisas são verdadeiras
ao mesmo tempo, e a tela não pode tratá-las como contradição.

**Missão especial de um plano da semana `S`:**

| Condição | `availability` | O que a API mostra |
|---|---|---|
| nenhum marco num dia de `S` | `bloqueada` | na trilha, um marcador **sem `id`, sem conteúdo e sem dificuldade**, com o progresso "N de 7" |
| marco no dia `M` de `S`, agora antes do fim de `M+1` | `disponivel` | a missão completa |
| concluída | `concluida` | a missão completa |
| marco em `M`, agora depois do fim de `M+1`, não concluída | `expirada` | a missão completa; concluir → 409 `missao_expirada` |

Concluir uma especial bloqueada pelo `id` → **404 idêntico** (C11). O marcador
não carrega `id`, então nenhum endpoint afirma a existência dela enquanto outro
a nega.

## Modelo de dados

- **`weekly_plans`**: `id`, `user_id` → `users`, `week_start` (DATE),
  `created_at`. Restrições:
  - `UNIQUE(user_id, week_start)`;
  - `CHECK` de que `week_start` é uma segunda-feira;
  - `UNIQUE(id, user_id)`, para a FK composta abaixo.
- **`missions`** ganha:
  - `mission_type` (TEXT **`NOT NULL`** + `CHECK` em `avulsa`, `diaria`,
    `especial`, seguindo a A6). As linhas existentes migram para `avulsa`, e o
    `server_default` usado no preenchimento sai depois. O `NOT NULL` não é
    detalhe: um `CHECK` aprova quando o resultado é desconhecido, então sem ele
    um `mission_type` nulo passaria por todas as restrições de igualdade abaixo;
  - `plan_id`, com **FK composta `(plan_id, user_id)` → `weekly_plans(id,
    user_id)`**, para que o banco impeça missão de um usuário em plano de outro.
    A FK é **`MATCH SIMPLE`**, o padrão, e é isso que deixa a avulsa passar com
    `plan_id` nulo: com uma coluna da composta nula, a FK não é verificada. Com
    `MATCH FULL`, toda avulsa seria recusada. Um teste prova as duas metades: a
    avulsa com `plan_id` nulo entra, e a diária com o `user_id` de outro usuário
    é recusada. `(mission_type = 'avulsa') = (plan_id IS NULL)`;
  - `day` (DATE). `(mission_type = 'diaria') = (day IS NOT NULL)`;
  - `UNIQUE(plan_id, day)`, que convive com o `day` nulo da especial, porque
    nulos não colidem;
  - índice único parcial `ON missions(plan_id) WHERE mission_type = 'especial'`;
  - `CHECK (mission_type <> 'especial' OR difficulty = 5)`;
  - `CHECK (mission_type = 'avulsa' OR estimated_minutes <= 1440)`;
  - `deadline` passa a aceitar nulo, com
    `CHECK ((mission_type = 'avulsa') = (deadline IS NOT NULL))`.
- **Garantidos só pelo serviço**, e declarados como tais: que o plano tem os 7
  dias, e que `day` cai dentro da semana do plano.
- **O downgrade é destrutivo**: diárias e especiais não têm como voltar ao
  esquema do 1a, porque o `deadline` delas é nulo. O downgrade falha alto se
  houver alguma, em vez de inventar um prazo.
- **A pendência 9 cresce.** O teste de divergência do 1a compara só os `CHECK`
  (`contype = 'c'`). Os `UNIQUE`, o índice parcial e a FK composta ficam fora
  dele, a menos que o incremento o estenda. O plano de implementação decide
  estender ou registrar.
- **Replanejamento** (README §5 e §8, `reschedule_mission`): o modelo o comporta
  sem migração destrutiva. Mover a missão de um dia vira uma missão **nova** que
  substitui a antiga, ligada a ela por uma coluna `replaces_mission_id`, e a
  antiga continua no histórico. Para isso, o `UNIQUE(plan_id, day)` terá de
  virar índice parcial sobre as missões não substituídas. Essa migração é do
  incremento do replanejamento, não deste.

## Endpoints

| Método e rota | Papel | Sucesso | Erros |
|---|---|---|---|
| `POST /api/plans` | cria o plano de uma semana: `week_start`, `days` (7 missões, de segunda a domingo) e `bonus` (1 missão, sem `difficulty`) | 201 com o plano | 422 de validação (Pydantic); 409 `plano_existente`; 409 `semana_encerrada` se a semana já terminou; 409 `semana_distante` se `week_start` fica além da semana seguinte |
| `GET /api/cycle` | o dia: `today`, a missão de hoje (ou `null`), `streak`, `days_to_milestone`, e a especial se estiver `disponivel` | 200 | — |
| `GET /api/plans/current` | a **trilha** da semana atual: os 7 dias com `availability` e conteúdo, e a especial com `availability` (conteúdo só se desbloqueada) | 200; `{"plan": null}` se não há plano na semana | — |
| `POST /api/missions/{id}/complete` | o endpoint do 1a, com as regras do ciclo | 200 | 404 (inexistente, alheia, semana futura, especial bloqueada — corpo idêntico); 409 com `code` |
| `POST /api/missions`, `GET /api/missions` | as avulsas do 1a. A listagem passa a devolver **só avulsas** e ganha os campos novos do `MissionRead` | como no 1a | como no 1a |

- **"Sem plano" é um estado, não um erro.** Por isso `GET /api/plans/current`
  devolve 200 com `null`, como o 1a devolve `[]` para a coleção vazia. A
  docstring de `listar`, no `router.py`, diz: a tela precisa distinguir
  "nenhuma missao" de "deu erro".
- **O 201 do `POST /api/plans`** devolve os 7 dias com conteúdo e a especial
  **como marcador**, sem `id`, conteúdo nem dificuldade, na mesma forma do
  `GET /api/plans/current`. Assim o 201 não afirma a existência de uma especial
  que a conclusão por `id` nega com 404.
- **Limite de `week_start`:** no máximo a semana seguinte à atual. Isso impede o
  500 de uma semana no ano 9999, em que o fim do domingo estouraria o
  `datetime` (a mesma classe de defeito que a onda final do 1a fechou), e reduz o
  que dá para esconder.
- **O contrato do `MissionRead` muda**, e a mudança é aditiva. Ele é usado na
  listagem de avulsas e no `POST /complete`, e ganha:
  - `mission_type`;
  - `day` (nulo fora das diárias);
  - `availability`.
  O `deadline` **continua obrigatório na resposta**. Ele é nulo só na
  **coluna**: para a avulsa vem da coluna, e para a diária e a especial é
  calculado. A especial bloqueada nunca é serializada como `MissionRead`, então
  a resposta nunca tem prazo nulo, e anular o campo no contrato só o afrouxaria
  sem motivo. A listagem também passa a **filtrar** só as avulsas. Hoje isso não
  muda nada, porque só existem avulsas, mas é mudança de comportamento, e fica
  declarada.
- **Ocultação:** nenhum endpoint lista semanas futuras. Há três vazamentos
  teóricos, que ficam declarados:
  - o 201 do `POST /api/plans` devolve a semana futura a quem acabou de criá-la;
  - o 409 `plano_existente` confirma que uma semana futura existe;
  - os ids são sequenciais, então uma avulsa criada depois de um plano mostra
    um salto de 8.
  Com usuário único e criação pela API, quem vê qualquer um deles é o próprio
  autor.
- **Idempotência do plano:** a restrição única transforma um reenvio num **409**
  `plano_existente`, e não num plano duplicado. O README §6, linha 128, diz:
  "Falhas não podem duplicar missões ou recompensas." O cliente que recebe 409
  confirma com `GET /api/plans/current`.

## Erros

- **Formato:** todo erro de domínio responde `{"detail": <prosa pt-BR>, "code":
  <código>}`.
- **Códigos:** `missao_nao_encontrada`, `transicao_ilegal`,
  `operacao_reutilizada`, `missao_bloqueada`, `missao_expirada`,
  `plano_existente`, `semana_encerrada` e `semana_distante`.
- **Validação:** o 422 do Pydantic mantém o formato padrão do FastAPI. Regras
  que dependem do relógio não são validação Pydantic, e por isso respondem 409
  com `code`.
- **Frontend:** nunca mostra o `detail`. Ele mapeia o `code` para uma mensagem
  própria, num mapa exaustivo sobre o tipo, e um `code` desconhecido cai numa
  mensagem genérica.
- **Comentário a corrigir:** o `frontend/src/shared/api/client.ts` diz que a
  prosa do `detail` "pode ir direto para a tela". Isso deixa de ser verdade.
- **Sem 500 por omissão:** nenhum caminho de erro das missões e dos planos
  responde 500 por omissão.

## Relógio e fusos

- **`core/clock.py`** expõe uma dependência que devolve o instante atual, com
  fuso. O serviço deixa de chamar `datetime.now(UTC)` diretamente.
- **Base de fusos do Python.** Dia e semana são calculados com `zoneinfo`. O
  pacote **`tzdata`** entra para garantir que **exista** uma base de fusos IANA
  em qualquer máquina. A base do sistema continua tendo precedência: o `zoneinfo`
  procura primeiro no `TZPATH` e só usa o `tzdata` quando não acha nada lá.
- **As três bases do sistema:**
  - a do Python, para o dia e a semana;
  - a do PostgreSQL, que a correção da sessão tira do caminho ao fixar UTC;
  - a do navegador, pelo ICU, para exibir.
  Nenhuma regra do ciclo depende da base do navegador.
- **Datas civis versus instantes.** `day`, `today` e `week_start` são **datas
  civis** e são exibidas **sem conversão de fuso**. Formatar
  `new Date("2026-09-21")` em São Paulo mostra 20/09, que é a armadilha a
  evitar. Só instantes (`completed_at`, prazo calculado) são convertidos para
  `America/Sao_Paulo`. Um teste de unidade roda com o processo em `Asia/Tokyo`
  para provar isso.
- **Horário de verão:** São Paulo não tem desde 2019, mas o código não supõe
  deslocamento fixo. Ele usa a base de fusos.

## Frontend

- **Navegação lateral** com Quartel-General e **Campanhas**, com `nav` e
  `aria-current` (C15).
- **Quartel-General** (Incrementos A e B):
  - o cartão **Missão de hoje**, com o botão **Concluir**;
  - a sequência, com "N de 7" até a especial, ou o cartão da especial quando
    ela está disponível;
  - "Outras missões", com as avulsas, que também ganham **Concluir** no
    Incremento A.
  - Estados cobertos: carregando; sem plano nesta semana; erro; missão de hoje
    disponível; missão de hoje concluída; especial disponível; especial
    concluída ainda dentro da janela.
- **Concluir:** o `operation_id` é gerado uma vez (`crypto.randomUUID`) e
  **mantido entre as tentativas**. Uma falha de rede permite reenviar sem
  duplicar (README §7).
- **Campanhas — a trilha** (Incremento C):
  - os 7 dias, com `availability` em **texto e ícone**, nunca só cor;
  - o conteúdo dos dias futuros, bloqueado (B3a);
  - a especial como marcador com "N de 7" e, quando desbloqueada, com o
    conteúdo;
  - **nenhuma semana futura**.

## Testes

- **Domínio puro.** Disponibilidade, sequência, marco e janela da especial,
  como funções de (plano, conclusões, instante). Casos em tabela:
  - a virada do dia em São Paulo, inclusive a meia-noite exata;
  - a sequência atravessando semanas;
  - a quebra por dia perdido;
  - o dia sem plano e o dia `fora_do_plano`, que não quebram;
  - o dia de hoje em aberto;
  - o marco no domingo;
  - a expiração da especial;
  - a sequência de 14, com duas especiais em semanas diferentes;
  - `days_to_milestone` com `s` = 0, 6, 7 e 8.
- **Integração, com relógio injetado.**
  - A criação do plano e cada recusa, inclusive a semana encerrada e a distante.
  - A conclusão no dia, antes (409) e depois (409).
  - O **reenvio depois da meia-noite**, que devolve o mesmo 200.
  - O 404 idêntico da semana futura e da especial bloqueada, comparando o
    **corpo inteiro** com o de "inexistente".
  - O `code` em cada erro.
  - A conclusão concorrente perto da meia-noite.
  - As restrições novas rejeitando no banco, inclusive a FK composta.
  - A ida e volta da migração, e o downgrade falhando alto quando existe uma
    diária.
- **Frontend.**
  - Cada estado de tela.
  - O mapa de `code` para mensagem, exaustivo.
  - O `operation_id` preservado entre tentativas.
  - A trilha sem semana futura.
  - As datas civis sem conversão de fuso.
- **E2E.**
  - Semear, pela API, o plano da semana que o `GET /api/cycle` diz ser a atual,
    abrir o Quartel-General, concluir a missão de hoje e ver a sequência. Abrir
    Campanhas e rodar o axe nas duas áreas.
  - As asserções usam o `today` que a API devolve, e não a data do navegador.
  - A virada de dia fica na integração.
- **Regra da casa:** toda guarda nova tem um teste que a faz dizer não, e cada
  teste novo é visto reprovando por mutação antes de valer.

## Fora deste recorte

- A Tifa escrever o plano (`propose_plan`) e replanejar (`reschedule_mission`).
- A tela de criar ou editar plano.
- XP total, nível, conquistas e cobranças.
- Autenticação (A2 continua valendo).
- A pausa voluntária, **a menos que** o dono escolha B1(b). Se escolher, ela
  entra no Incremento B, com endpoint, `code`, testes e motivo no HANDOFF.

## Riscos

| Risco | Mitigação |
|---|---|
| Regras de tempo erram por um dia | Domínio puro, que recebe o instante; limites em tabela de testes; dia como intervalo semiaberto; nenhum deslocamento fixo |
| Uma conclusão às 23:59:59 e o reenvio às 00:00:01 | O reenvio é avaliado antes da regra do dia (ordem fixada em "Regras do ciclo") |
| **O E2E com relógio real perto da meia-noite de São Paulo** | Se a semeadura e a conclusão caírem em lados diferentes da meia-noite, o cenário falha. A mitigação é semear a partir do `today` da API e afirmar sobre ele, o que estreita a janela, mas não a fecha. **Fica declarado como limitação conhecida**, sem nova tentativa automática e sem teste pulado |
| A migração mexe numa tabela com dados | A migração não depende do conteúdo. As linhas existentes viram `avulsa` com valores válidos, a ida e volta é testada, e o downgrade falha alto quando não pode voltar |
| O escopo, junto, é do tamanho do 1a | Dividido em A, B e C (B2). Cada um tem gate e revisão próprios |

## Entregas de documentação

O `AGENTS.md` §4 exige motivo escrito no `docs/HANDOFF.md` para cada dependência
e endpoint novos:
- o `tzdata`;
- os três endpoints novos (`POST /api/plans`, `GET /api/cycle`,
  `GET /api/plans/current`).

Também vão para o HANDOFF: a correção da pendência 26 para o texto das duas
mensagens do dono; as pendências fechadas (1, 7, 20 e a parte da 26 que toca
diárias e especiais); e a 9, que cresce.

## Interpretações a confirmar

Cada uma foi decidida para o trabalho não parar. Mudar qualquer uma custa editar
esta spec, porque nada foi implementado.

1. **O que a trilha mostra dos dias futuros:** conteúdo, com a missão bloqueada
   (B3).
2. **"A dificuldade também aumenta":** a especial está sempre na dificuldade
   máxima (5). Há outras leituras:
   - a dificuldade cresce a cada marco, o que exigiria uma escala acima de 5;
   - as diárias ficam limitadas a 1–4 e a especial é a única com 5, o que
     garante que ela seja sempre mais difícil que qualquer diária da semana.
3. **"O triplo das missões difíceis":** 3 × o XP da dificuldade máxima (660).
   Outras leituras: o triplo da diária mais difícil da semana, ou de "difíceis"
   como 4 e 5.
4. **Teto de 1440 min na estimativa:** o dono falou de missões de 24 h, o que
   descreve a janela. Aplicar o limite também à estimativa é interpretação.
5. **Janela da especial:** do desbloqueio até o fim do dia seguinte.
6. **Perder a especial não quebra a sequência.**
7. **Dia sem plano não conta nem quebra** (C6). Isso também vale para os dias
   anteriores a um plano criado no meio da semana. O custo é que deixar de
   criar planos congela a sequência sem limite.
8. **As missões avulsas continuam existindo.**
9. **A semana começa na segunda-feira.**
