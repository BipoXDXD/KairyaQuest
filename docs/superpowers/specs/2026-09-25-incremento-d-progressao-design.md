# Spec de design — Incremento D: progressão de RPG

**Data:** 2026-09-25
**Estado:** desenho aprovado pelo dono em conversa, seção por seção, em
2026-09-25. **Nada foi implementado.** Esta spec escreve o que foi aprovado e
fixa os detalhes que a conversa não fixou; cada um desses está marcado como
**escolha desta spec**, com o motivo, para o dono conferir na revisão.

## O que o dono disse

O README §14 manda: "**Próximo incremento: missão completa, da delegação à
recompensa.**" A delegação (1b) e a conclusão (A, B) já existem. Para o que
falta, o dono respondeu, em 2026-09-25:

- **Centro da experiência:** "**Progressão de RPG**" — sentir a evolução: XP
  acumulado num saldo, nível e conquistas visíveis no Quartel-General. A entrega
  pode ser simples, autodeclarada pelo "Concluir" que já existe.
- **Entrega com evidência e avaliação:** "**fora do D**" — viram o
  Incremento E.
- **Escopo:** "**Saldo + nível + conquistas**"; itens cosméticos ficam fora.
- **Missões já concluídas:** "**Sim, retroativo**".
- **Ritmo dos níveis:** "**Rápido no início, depois desacelera**" — subir do
  nível n para o n+1 custa 100·n XP.
- **Conquistas:** as quatro famílias oferecidas — "Primeiros passos", "Marcos
  de sequência" (7 e 30 dias), "Veterano" (10, 50 e 100 missões) e "Parceria
  com a Tifa".
- **XP de conquista:** "**Não, só emblema**".
- **Momento da recompensa:** "**Anúncio no cartão**".
- **A Tifa:** "**Só sabe o progresso**" — lê nível, saldo e conquistas; nenhuma
  ferramenta nova.
- **Persistência:** "**Livro-razão**".
- As três seções do desenho (arquitetura e dados; idempotência, concorrência e
  bordas; interface e testes) foram aprovadas como apresentadas.

**Suposições desta spec** (não ditas pelo dono): o usuário continua único
(A2); as conquistas contam missões de **qualquer** tipo (avulsa, diária e
especial); os títulos em português das conquistas são desta spec (D9).

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | Um módulo novo, `progression`, no backend (`src/focusquest/modules/progression/`) e no frontend (`frontend/src/features/progression/`), dono único de saldo, nível e conquistas | Separa recompensa de missão (Seção 1 aprovada); o E acrescenta fontes de XP sem tocar em `missions` |
| D2 | O XP é gravado num **livro-razão** (`xp_entries`), um lançamento por missão concluída, com o valor **congelado** no momento do crédito | Aprovado ("Livro-razão"). Mudar a curva de XP depois não reescreve o passado; o E vira uma nova `source` |
| D3 | O crédito acontece **na mesma transação** da conclusão: `concluir_missao` chama `progression.registrar_conclusao` antes do `flush` final | Aprovado (Seção 1). Nunca existe missão concluída sem XP, nem XP sem conclusão |
| D4 | Nível é **função pura** do saldo: custo de n→n+1 = 100·n; XP acumulado para estar no nível L = 50·L·(L−1) | Aprovado ("rápido no início, depois desacelera") |
| D5 | Conquistas são **só emblema** e ficam em `user_achievements`, uma linha por (usuário, código), com a data e o lançamento que as destravou | Aprovado ("só emblema"). Uma fonte de XP só = saldo auditável |
| D6 | **Escolha desta spec:** toda conquista aponta para o lançamento que a destravou (`xp_entry_id` **NOT NULL**), inclusive as retroativas | Na Seção 2, as retroativas teriam `xp_entry_id` nulo. Como o backfill cria um lançamento para **cada** missão já concluída (D7), toda conquista retroativa também tem o seu lançamento de origem, e a reconstrução da recompensa (D10) vale sem caso especial |
| D7 | **Retroativo:** a migração `0004` lança o XP de toda missão já concluída, pela regra atual, com a data real da conclusão, e destrava as conquistas já cumpridas com a data em que a condição foi cumprida pela primeira vez | Aprovado ("Sim, retroativo"); README §5: nunca remover o que o usuário conquistou |
| D8 | **Escolha desta spec:** a migração usa **cópias congeladas** das regras (fórmula de XP, sequência, catálogo), não imports de `focusquest` | É a regra da casa ("Cópia congelada, NÃO import… migração é histórico", `alembic/versions/0003_ciclo_diario.py`). Um teste de equivalência amarra a cópia à regra viva de hoje (ver Testes) |
| D9 | **Escolha desta spec:** os títulos das conquistas são os da tabela "Catálogo"; os códigos são estáveis e em inglês de contrato (`snake_case`) | O dono escolheu as famílias, não os nomes; títulos são texto de interface e trocá-los não mexe no banco |
| D10 | O **reenvio** da conclusão devolve a **mesma** recompensa, reconstruída do banco a partir do lançamento da missão: nada é recalculado "de novo" | Aprovado (Seção 2). É a promessa de idempotência do README §8 estendida à recompensa |
| D11 | Duas travas contra crédito duplo: a missão concluída é terminal (A5) **e** `xp_entries.mission_id` é UNIQUE | Aprovado (Seção 2) |
| D12 | O crédito trava a linha do **usuário** (`SELECT … FOR UPDATE`), sempre **depois** da trava da missão | Aprovado (Seção 2). Serializa a avaliação de conquistas entre conclusões simultâneas de missões diferentes; ordem fixa = sem deadlock |
| D13 | Os marcos de 7 e 30 dias usam a **maior sequência já atingida**, calculada com `sequencia_ate` de `cycle_domain` sobre o histórico de `carregar_historico` | Aprovado (Seção 2); reaproveita a regra do ciclo (dia sem plano não quebra) em vez de duplicá-la |
| D14 | `GET /api/progress` é o único endpoint novo; a resposta do `POST /api/missions/{id}/complete` ganha o campo `reward` | Aprovado (Seção 1). O `GET /api/missions` e as leituras do ciclo **não** mudam |
| D15 | A Tifa recebe uma linha de progresso no contexto do turno, só leitura; nenhuma ferramenta nova | Aprovado ("Só sabe o progresso"); README §6: "pedir pontos no chat não altera saldo" |
| D16 | O painel de progresso fica no topo do Quartel-General; o anúncio da recompensa, no próprio cartão concluído (avulsa, diária e especial); a trilha de Campanhas não muda | Aprovado (Seção 3 e "Anúncio no cartão"); K8 do C: a trilha só mostra |

## Fora deste recorte

- **Entrega com evidência** (`submit_activity`) e **avaliação**
  (`request_reward_evaluation`): Incremento E.
- **Itens cosméticos** (títulos, molduras).
- **Iniciar missão** (pendência 3): `started_at` continua sem rota.
- **Autenticação** (A2 continua valendo; o usuário é `USUARIO_UNICO`).
- **Conquistas com XP**, conquistas configuráveis e conquistas "secretas".
- **A Tifa ver as diárias e a especial** (pendência 55) e o painel da Tifa em
  Campanhas (pendência 59).

## Modelo de dados

Migração `alembic/versions/0004_progressao.py` (`revision = "0004"`,
`down_revision = "0003"`).

**`xp_entries`** — o livro-razão.

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `INTEGER` | PK |
| `user_id` | `INTEGER` | NOT NULL, FK → `users.id` `ON DELETE CASCADE` |
| `mission_id` | `INTEGER` | NOT NULL, FK → `missions.id` `ON DELETE CASCADE`, **`UNIQUE`** (`uq_xp_entries_mission_id`) |
| `amount` | `INTEGER` | NOT NULL, `CHECK (amount > 0)` (`ck_xp_entries_amount`) |
| `source` | `TEXT` | NOT NULL, `CHECK (source IN ('mission_completed'))` (`ck_xp_entries_source`) |
| `credited_at` | `TIMESTAMPTZ` | NOT NULL |

Índice `ix_xp_entries_user_id_id` em (`user_id`, `id`): o saldo e o "saldo
antes" (D10) são somas por usuário na ordem do `id`.

A `UNIQUE(mission_id)` vale hoje porque a única fonte é a conclusão. Quando o E
trouxer outra fonte, a unicidade passa a ser (`mission_id`, `source`) — mudança
do E, registrada aqui para não surpreender.

**`user_achievements`**

| Coluna | Tipo | Restrição |
|---|---|---|
| `user_id` | `INTEGER` | NOT NULL, FK → `users.id` `ON DELETE CASCADE` |
| `code` | `TEXT` | NOT NULL, `CHECK (code IN (…os sete códigos do catálogo…))` (`ck_user_achievements_code`) |
| `unlocked_at` | `TIMESTAMPTZ` | NOT NULL |
| `xp_entry_id` | `INTEGER` | NOT NULL, FK → `xp_entries.id` `ON DELETE CASCADE` (D6) |

PK (`user_id`, `code`) — a chave única que é a última rede contra conquista
duplicada (D12). Índice `ix_user_achievements_xp_entry_id` em `xp_entry_id`
(a reconstrução da recompensa busca por ele).

**Ordem dos lançamentos.** "Antes" e "depois" de um lançamento são definidos
pelo `id`. O backfill insere os lançamentos em ordem de (`completed_at`,
`missions.id`), então os `id` retroativos seguem a ordem histórica; os novos
nascem depois deles.

**Backfill (upgrade), dentro da migração, com cópias congeladas (D8):**

1. Para cada missão `concluida`, em ordem de (`completed_at`, `id`), inserir
   um lançamento: `amount` pela fórmula congelada `20 + 10·d·(d−1)`, vezes 3
   se `mission_type = 'especial'`; `source = 'mission_completed'`;
   `credited_at = completed_at`.
2. Para cada usuário, percorrer as missões concluídas na mesma ordem,
   mantendo os fatos acumulados (D13 e "Catálogo"), e, na primeira vez em que
   a regra de uma conquista passa a valer, inserir a conquista com
   `unlocked_at = completed_at` daquela missão e `xp_entry_id` = o lançamento
   dela.

Uma missão `concluida` sem `completed_at` não deveria existir (o `CHECK` do
0001 amarraria os dois) **(corrigido na execução: essa restrição não existe
em nenhuma migração — conferido por leitura direta de `0001_esquema_inicial.py`,
`0002_tutoria.py` e `0003_ciclo_diario.py`, Task 2 do plano; só existem
`ck_missions_state`, `ck_missions_difficulty` e `ck_missions_estimated_minutes`
em 0001, mais as restrições de tipo/dia/prazo do 0003. A migração `0004`
falha alto do mesmo jeito — ver abaixo —, mas por uma guarda própria no
código do backfill, não porque o banco impeça o estado. Ver
`docs/HANDOFF.md`, "Decisões tomadas", Incremento D)**; a migração falha alto
se encontrar uma, em vez de inventar data.

**Downgrade:** remove `user_achievements` e depois `xp_entries`. Não há perda
de dado de origem: missões e conclusões continuam intactas, e um novo
`upgrade` recompõe tudo.

## Domínio puro (`progression/domain.py`)

Nenhuma função daqui toca o banco nem lê o relógio.

**Curva de nível (D4).** `xp_para_o_nivel(L) = 50·L·(L−1)` é o XP acumulado
para estar no nível L. `nivel_do_saldo(xp)` é o maior L com
`xp_para_o_nivel(L) ≤ xp`, com L ≥ 1, calculado com aritmética **inteira**
(`math.isqrt`), sem ponto flutuante. Sem teto de nível.

| Nível | XP acumulado para chegar | Custo para o próximo |
|---|---|---|
| 1 | 0 | 100 |
| 2 | 100 | 200 |
| 3 | 300 | 300 |
| 4 | 600 | 400 |
| 5 | 1.000 | 500 |
| 6 | 1.500 | 600 |
| 10 | 4.500 | 1.000 |
| 20 | 19.000 | 2.000 |

`faixa_do_nivel(xp)` devolve (nível, piso do nível, piso do próximo), que é o
que o painel mostra ("340 / 500 XP até o nível 6").

**Fatos** (`FatosDoUsuario`): `missoes_concluidas: int`,
`maior_sequencia: int`, `concluiu_missao_da_tifa: bool`.

**Catálogo** (D9), na ordem em que o painel mostra:

| Código | Título | Descrição / como destravar | Regra sobre os fatos |
|---|---|---|---|
| `first_steps` | Primeiros passos | Conclua a sua primeira missão. | `missoes_concluidas ≥ 1` |
| `streak_7` | Uma semana inteira | Complete a diária 7 dias seguidos. | `maior_sequencia ≥ 7` |
| `streak_30` | Um mês de hábito | Complete a diária 30 dias seguidos. | `maior_sequencia ≥ 30` |
| `veteran_10` | Veterano I | Conclua 10 missões. | `missoes_concluidas ≥ 10` |
| `veteran_50` | Veterano II | Conclua 50 missões. | `missoes_concluidas ≥ 50` |
| `veteran_100` | Veterano III | Conclua 100 missões. | `missoes_concluidas ≥ 100` |
| `tifa_partnership` | Parceria com a Tifa | Conclua uma missão proposta pela Tifa. | `concluiu_missao_da_tifa` |

`conquistas_satisfeitas(fatos) -> frozenset[Codigo]` é a regra única, usada
pelo serviço; a migração tem a sua cópia congelada (D8).

## Serviço (`progression/service.py`)

**`registrar_conclusao(session, missao, agora) -> Recompensa`**, chamada por
`concluir_missao` (`missions/service.py`) depois de mudar o estado e antes do
`flush`, com a missão **já travada**:

1. Trava a linha do usuário: `session.get(User, missao.user_id,
   with_for_update=True)` (D12). Ordem fixa em todo caminho: missão → usuário.
2. `saldo_antes` = soma de `xp_entries.amount` do usuário.
3. Insere o lançamento: `amount = xp_da_missao(missao.mission_type,
   missao.difficulty)`, `credited_at = agora`, e faz `flush` para ter o `id`.
4. Lê os fatos, **com esta conclusão já incluída**:
   - `missoes_concluidas`: `COUNT` de missões `concluida` do usuário;
   - `maior_sequencia`: `max(sequencia_ate(historico, dia) for dia in
     historico)` sobre `carregar_historico(session, user_id)` (D13; zero com
     histórico vazio). `sequencia_ate` conta para trás a partir de um dia e é
     exatamente a regra da sequência atual, então o máximo sobre todos os dias
     é a maior sequência já atingida. O custo é quadrático no número de dias
     planejados; com usuário único e 7 dias por semana, é desprezível (o mesmo
     custo declarado da C2 do ciclo);
   - `concluiu_missao_da_tifa`: existe `tutor_actions` com `kind =
     'create_mission'`, `state = 'executada'` e `mission_id` de uma missão
     `concluida` do usuário.
5. Novas = `conquistas_satisfeitas(fatos)` − as já destravadas; insere cada uma
   com `unlocked_at = agora` e `xp_entry_id` = o lançamento do passo 3.
`registrar_conclusao` não devolve a recompensa: quem a monta é a leitura
abaixo, nos dois casos.

**A recompensa, no primeiro envio e no reenvio (D10):** a rota de concluir,
depois do `commit`, chama **sempre** `recompensa_da_missao(session, missao)`,
que monta a `Recompensa(xp_awarded, xp_total, level_before, level_after,
achievements_unlocked)` a partir do banco: o lançamento da missão;
`xp_total_antes` = soma dos lançamentos do usuário com `id` menor; `xp_total`
= antes + valor; os níveis pela curva; as conquistas com `xp_entry_id` = esse
lançamento, na ordem do catálogo. Um caminho só para os dois casos faz o corpo
do reenvio ser idêntico ao original **por construção**. O `xp_total` devolvido
é o saldo **daquele momento**, não o atual.

**Direção das dependências:** `missions.service` → `progression.service`;
`progression.service` lê `missions.models`, `missions.cycle_service`
(`carregar_historico`), `missions.cycle_domain` (`sequencia_ate`),
`missions.domain` (`xp_da_missao`) e `tutoring.models` (`TutorAction`), sem
importar `missions.service` nem nada de `tutoring` além do modelo. Não há ciclo
de import entre arquivos.

**`ler_progresso(session, user_id) -> Progresso`**: saldo, faixa do nível e o
catálogo inteiro com `unlocked_at` ou nulo. Só leitura, sem trava.

## API

**`GET /api/progress`** (router novo em `progression/router.py`, prefixo
`/api/progress`, `USUARIO_UNICO`), 200:

```json
{
  "xp_total": 1340,
  "level": 5,
  "level_floor_xp": 1000,
  "next_level_xp": 1500,
  "achievements": [
    {
      "code": "first_steps",
      "title": "Primeiros passos",
      "description": "Conclua a sua primeira missão.",
      "unlocked_at": "2026-09-21T13:02:11Z"
    },
    {
      "code": "streak_30",
      "title": "Um mês de hábito",
      "description": "Complete a diária 30 dias seguidos.",
      "unlocked_at": null
    }
  ]
}
```

`achievements` traz **sempre** os sete, na ordem do catálogo. Sem conclusões:
`xp_total` 0, `level` 1, `level_floor_xp` 0, `next_level_xp` 100, todas com
`unlocked_at` nulo.

**`POST /api/missions/{id}/complete`**: o corpo continua sendo o `MissionRead`,
com um campo a mais, `reward` (schema `MissionCompletionRead`, que estende
`MissionRead`):

```json
{
  "id": 42,
  "state": "concluida",
  "xp": 220,
  "reward": {
    "xp_awarded": 220,
    "xp_total": 1340,
    "level_before": 4,
    "level_after": 5,
    "achievements_unlocked": [
      {
        "code": "veteran_10",
        "title": "Veterano I",
        "description": "Conclua 10 missões."
      }
    ]
  }
}
```

(os demais campos do `MissionRead` omitidos no exemplo). O reenvio devolve o
mesmo corpo, `reward` incluído (D10). O `GET /api/missions`, o
`GET /api/cycle` e o `GET /api/plans/current` não mudam.

## Erros

Nenhum `code` novo. A conclusão continua com os erros de hoje, na mesma ordem
(ocultação, reenvio, regra do dia, transição). Uma falha no crédito (erro de
banco) desfaz a transação inteira: a missão **não** fica concluída, o cliente
recebe o erro genérico de hoje, e o reenvio com o mesmo `operation_id`
funciona. `GET /api/progress` não tem caminho de erro de negócio; falha de
banco segue o tratamento genérico.

## Frontend

**`features/progression/`:**

- `types.ts`: o contrato do `GET /api/progress`.
- `useProgress.ts`: `{ state, reload, refresh }` no mesmo desenho do
  `useCycle` e do `useCurrentPlan` (carregando / erro / carregado com
  `refreshFailed`; `refresh` silencioso; guarda de sequência contra resposta
  fora de ordem; `useRefreshOnReturn`).
- `ProgressPanel.tsx`: `<section aria-labelledby="progress-heading">` no topo
  do Quartel-General, com:
  - "Nível 5" e o saldo total;
  - a barra: `role="progressbar"`, `aria-valuemin=0`,
    `aria-valuemax={next_level_xp − level_floor_xp}`,
    `aria-valuenow={xp_total − level_floor_xp}`,
    `aria-valuetext="340 de 500 XP até o nível 6"`, e o mesmo texto visível;
  - a lista de conquistas (`<ul>`): destravada = ícone, título e data (data
    civil de São Paulo, sem conversão de fuso do navegador); bloqueada =
    cadeado, título e "como destravar" — sempre em texto, nunca só cor;
  - estados: carregando (`role="status"`), erro com "Tentar novamente",
    carregado, e o aviso de desatualizado quando `refreshFailed`.
- A página `Headquarters.tsx` compõe `<ProgressPanel />` acima do
  `<CycleSection />` e, como já faz com o quadro, passa um `reload` do painel
  por `ref` aos dois lugares de conclusão: o `onCompleted` do `CycleSection` e
  um `onCompleted` novo do `MissionList`, repassado aos cartões de avulsa.

**O anúncio no cartão (D16):**

- O contrato do `reward` mora em `shared/types/reward.ts` (é da resposta da
  conclusão, que `missions` consome).
- `useCompleteMission` guarda o `reward` no estado `completed`.
- `features/missions/RewardAnnouncement.tsx`, renderizado pelo cartão
  concluído (avulsa, diária e especial): "+220 XP"; "Subiu para o nível 5!"
  quando `level_after > level_before`; e cada conquista destravada com título.
  `role="status"` (anunciado ao leitor de tela sem roubar o foco). A animação
  de entrada usa só classes `motion-safe:`, então não acontece com
  `prefers-reduced-motion`.

## A Tifa

`tutoring/context.py` ganha uma linha no bloco "Contexto desta conversa",
montada a partir de `ler_progresso`: "Progresso do estudante: nível 5, 1.340
XP; conquistas: Primeiros passos, Veterano I." (sem conquistas: "nenhuma
conquista ainda"). A lista de ferramentas do provedor continua só com
`create_mission`: não existe caminho do chat até o saldo. Um teste prova que
uma mensagem pedindo XP não altera `xp_entries`.

## Testes

**Regra da casa:** todo teste novo é visto reprovando antes do código (RED) e
por mutação depois dele; toda guarda nova tem um teste que a faz dizer não.

- **Domínio puro:**
  - a curva nas bordas: 0, 99, 100, 299, 300, 999, 1.000 e 19.000 XP;
  - `faixa_do_nivel` nos pisos;
  - cada regra do catálogo no limite (0/1, 6/7, 29/30, 9/10, 49/50, 99/100 e
    o booleano da Tifa).
- **Serviço e banco (integração):**
  - a conclusão de avulsa, diária e especial credita `xp_da_missao` (a especial
    com ×3);
  - o reenvio devolve a recompensa **idêntica**, inclusive o `xp_total`
    daquele momento, depois de outras conclusões;
  - duas conclusões concorrentes de missões diferentes que cruzam o mesmo
    limiar geram **uma** conquista, e as duas ganham XP;
  - uma falha injetada no crédito desfaz a conclusão (a missão continua
    pendente) e o reenvio funciona;
  - a maior sequência: uma sequência de 7 quebrada e depois recomeçada mantém
    `streak_7`; faltar um dia nunca remove XP nem conquista;
  - `tifa_partnership` só com ação `create_mission` executada;
  - as restrições novas dizendo não no banco (`amount` 0, `source` e `code`
    inválidos, `mission_id` duplicado, conquista duplicada).
- **Migração:**
  - ida e volta;
  - o backfill num banco populado (avulsas, diárias com uma sequência, uma
    especial, uma missão da Tifa): lançamentos, datas e conquistas esperados;
  - **equivalência** (D8): para o mesmo banco populado, as conquistas e os
    valores que o backfill grava são os mesmos que o serviço calcularia
    concluindo as mesmas missões na mesma ordem.
- **API:** o contrato do `GET /api/progress` (vazio e populado, a ordem do
  catálogo) e o `reward` no 200 da conclusão e no do reenvio.
- **Frontend:** os estados do painel; o `progressbar` e o `aria-valuetext`; a
  conquista bloqueada com texto; o anúncio com e sem subida de nível; o
  `motion-safe`; o painel recarregado depois das duas formas de conclusão.
- **Tifa:** o contexto traz a linha de progresso; pedir XP no chat não altera o
  saldo.
- **E2E** (`cycle.spec.ts`, em série): concluir a diária semeada mostra o
  anúncio no cartão e o painel atualizado; o axe roda com o painel carregado.
  As asserções usam os números da API, não constantes.

## Riscos

| Risco | Mitigação |
|---|---|
| A reconstrução do reenvio divergir do original | Um teste compara o corpo do reenvio com o original **depois** de outras conclusões no meio |
| Deadlock entre conclusões | Ordem fixa missão → usuário em todo caminho (D12); teste de concorrência |
| A cópia congelada da migração divergir da regra viva | Teste de equivalência (Testes, "Migração"); depois do D, a cópia é histórico e pode divergir de propósito |
| O cálculo da maior sequência pesar | Quadrático no número de dias planejados; usuário único; mesmo custo declarado da C2 |
| O `xp_total` do painel e o do anúncio parecerem contraditórios num reenvio antigo | O anúncio mostra o saldo do momento da conclusão (D10); o painel mostra o atual. É a semântica certa e fica documentada |
| O E mudar a unicidade do livro-razão | Registrado em "Modelo de dados": (`mission_id`, `source`) |

## Entregas de documentação

- `docs/HANDOFF.md`: o motivo do endpoint novo `GET /api/progress` (AGENTS.md
  §4); as decisões D1–D16; nenhuma dependência nova.
- `docs/ARCHITECTURE.md`: o módulo `progression` e a direção das dependências.

## Questões que o plano deve fixar

Detalhes de execução, sem efeito de produto:

- a divisão em tarefas e o que roda em paralelo entre worktrees (com o gate
  paralelo da Frente 0);
- os nomes exatos dos arquivos de teste e das funções auxiliares;
- os `data-testid` do painel e do anúncio;
- o texto exato do aviso de desatualizado do painel, no padrão do
  `cycle-stale`.
