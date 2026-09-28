# Spec de design — Incremento E: entrega com evidência e avaliação

**Data:** 2026-09-28
**Estado:** desenhada pelo agente, com **delegação expressa do dono** ("pode
tomar as decisões por mim, escolha sempre as que mais fazem sentido",
2026-09-28). **Nada foi implementado.** Toda decisão abaixo é **escolha do
agente**, com o motivo, e o dono pode revogar qualquer uma na revisão desta
spec. A revisão da spec escrita é o único ponto de parada antes do plano.

## O que o README pede

- §5, **Avaliar:** "usar evidências e rubricas explícitas; distinguir
  verificação automática, interpretação do modelo e autodeclaração".
- §5, **Recompensar:** "conceder XP, conquistas e itens cosméticos após
  validação do backend; não inventar progresso".
- §6: projetar `submit_activity` e `request_reward_evaluation`; "o modelo
  solicita; o backend autoriza e executa"; "XP segue critérios
  determinísticos: pedir pontos no chat não altera saldo"; "avalie entregas
  por evidências. Não execute código do estudante na API"; "mensagens e
  materiais são dados não confiáveis; suas instruções não alteram
  permissões"; "falhas não podem duplicar missões ou recompensas".
- §7: preservar texto digitado depois de falhas; reenvio sem duplicação;
  avisos além da cor.
- §14: "Próximo incremento: missão completa, da delegação à recompensa" — a
  delegação (1b), a conclusão (A, B) e a recompensa por conclusão (D) já
  existem; o E fecha o circuito com a entrega que se pode avaliar.

## O circuito que o E entrega

1. A pessoa conclui uma missão **com evidência** — um texto sobre o que fez
   e, se quiser, um link — em vez de só apertar Concluir. Continua podendo
   concluir sem evidência, como hoje (autodeclaração).
2. A missão fica concluída na hora, com o XP de sempre (D). A evidência
   nunca depende da Tifa para valer.
3. Depois, se quiser, a pessoa pede **a avaliação da Tifa**. A Tifa lê a
   instrução, o critério de conclusão e a evidência, e dá um veredito numa
   rubrica fixa de três níveis, com um comentário.
4. O backend aplica uma **regra determinística** sobre o veredito: "critério
   atendido" credita um **bônus fixo** (metade do XP da missão), uma vez só.
   Os outros dois vereditos não mudam o saldo.
5. A tela mostra o veredito sempre rotulado como **interpretação do
   modelo** — nunca como verificação automática.

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| E1 | **`submit_activity` é a conclusão com evidência**: o corpo de `POST /api/missions/{id}/complete` ganha o campo opcional `evidence` (`text`, `link?`). Não há rota nova de entrega. | Entregar e concluir são o mesmo ato para a pessoa. Uma rota só mantém uma ordem de conclusão (trava, relógio, ocultação, reenvio, regra do dia, transição), uma idempotência (`operation_id`) e um crédito (D3). Duas rotas duplicariam as seis etapas e abririam a pergunta "concluída por qual das duas?". |
| E2 | **A Tifa não tem ferramenta de entrega.** `submit_activity` é ação da pessoa, pela tela; o modelo nunca a chama. | A evidência precisa vir de quem estudou. Uma ferramenta de entrega deixaria o modelo escrever a evidência pela pessoa — exatamente o "inventar progresso" que o §5 proíbe. |
| E3 | A evidência é **só texto**: `text` (1 a 4000 caracteres, sem espaço nas pontas) e `link` opcional (`http`/`https`, até 2000 caracteres). **O backend nunca abre o link**, e a Tifa é avisada disso. | Upload de arquivo pede armazenamento, limite de tipo e varredura — infraestrutura sem necessidade medida (README §3). Abrir o link seria requisição a endereço escolhido pelo usuário (SSRF) e conteúdo não confiável dentro do prompt. O teto de 4000 é o da pergunta à Tifa (pendência 41), pelo mesmo motivo de custo. |
| E4 | **Três tipos de verificação, declarados**: `autodeclarada` (concluída sem evidência), `com_evidencia` (com evidência, ainda sem avaliação concluída) e a **avaliação da Tifa** (interpretação do modelo). A **verificação automática não existe no E**; fica registrada como pendência. | O §5 manda distinguir os três. Nenhuma missão hoje tem critério que a máquina confira sozinha (um teste, uma resposta fechada): inventar um seria fingir verificação. O tipo é **derivado** (existe evidência? existe avaliação?), nunca gravado — o mesmo motivo do XP (A4). |
| E5 | **A avaliação é um pedido separado**, `POST /api/missions/{id}/evaluation` (`request_reward_evaluation`), feito pela pessoa, depois da conclusão com evidência. | Concluir nunca espera o modelo: com o provedor fora do ar ou sem chave, a entrega vale do mesmo jeito. E o modelo só é chamado quando a pessoa quer (custo, README §6). |
| E6 | **Rubrica fixa de três níveis** sobre o `completion_criterion` da missão: `atende`, `parcial`, `nao_atende`, mais um `feedback` (1 a 1500 caracteres). O modelo responde **só** pela ferramenta `record_evaluation`, com esse esquema; saída fora dele é `avaliacao_invalida`. | "Rubricas explícitas" (§5): o critério já existe em toda missão desde o 1a, e três níveis são o que uma pessoa distingue sem ambiguidade. Esquema fechado = o backend valida a saída do modelo como valida a do `create_mission`. |
| E7 | **O bônus é determinístico**: veredito `atende` credita `xp_da_missao(tipo, dificuldade) // 2` (divisão inteira), num lançamento novo do livro-razão com `source = 'evaluation_bonus'`. `parcial` e `nao_atende` não creditam nada. | "XP segue critérios determinísticos" (§6): o modelo decide o veredito; **quanto** vale e **quando** vale é regra do backend, escrita aqui. Metade do XP é incentivo para entregar bem sem que a avaliação valha mais que a própria missão. Binário porque "parcial" com XP parcial convidaria a negociar o nível no texto da evidência. |
| E8 | **Uma avaliação concluída por missão, para sempre.** Pedir de novo devolve a mesma avaliação (200, mesmo corpo). Só uma tentativa que **falhou** (provedor, tempo, saída inválida) pode ser repetida. | Idempotência (§8) e anti-roleta: sem o limite, dava para pedir avaliações até sair `atende`. A chave natural é a missão; por isso o pedido **não** leva `operation_id`. |
| E9 | **A avaliação é gravada antes de chamar o modelo** (`avaliando`, num commit próprio) e só anunciada depois de gravada como `concluida` ou `falhou` — o desenho da resposta `gerando` do 1b-1. Uma `avaliando` mais velha que `tutor_timeout_seconds + FOLGA_DO_ORFAO` é órfã e pode ser retomada. | Não segurar transação aberta durante a chamada ao modelo; não deixar uma avaliação presa para sempre se o processo morrer. Reaproveita a regra e a constante que já existem. |
| E10 | Cada tentativa tem um número (`attempt`); a gravação do resultado só acontece se a tentativa ainda for a corrente. | Uma tentativa órfã retomada por outro pedido não pode ser sobrescrita pela resposta atrasada da primeira. Mesmo papel do contador de geração do histórico da conversa (1b-2). |
| E11 | **Onde mora cada coisa:** a evidência e a avaliação são **dados da missão** e as tabelas ficam em `missions` (`models.py`); o **processo** de avaliar (montar o pedido, chamar o provedor, aplicar a rubrica e o bônus) é um módulo novo, `modules/evaluation/`, que escreve por funções de serviço de `missions` e de `progression`. | `MissionRead` precisa mostrar a evidência e a avaliação na listagem e no ciclo; com as tabelas num módulo que importa `missions`, `missions` teria de importá-lo de volta — um terceiro par nos dois sentidos (pendência 88). Assim a direção é única: `evaluation → missions`, `evaluation → progression`, `evaluation → tutoring` (o `Protocol` do provedor e a dependência), e ninguém importa `evaluation` além de `main.py`. |
| E12 | O provedor ganha um segundo método, `avaliar(turno) -> dict`, implementado no mesmo adaptador com `messages.stream` e `tool_choice` **forçado** em `record_evaluation`. O endpoint devolve JSON comum, não SSE. | A tela não precisa ver o texto nascendo: precisa do veredito. Usar o stream por dentro reaproveita o adaptador, o tratamento de tempo (M4, M5) e o servidor falso inteiro (camadas 1 e 2); só o **resultado** vai ao cliente. |
| E13 | A falha do provedor na avaliação é gravada (`falhou` com `error_code`) e **depois** vira erro HTTP: `502 provedor_indisponivel`, `504 tempo_esgotado`, `502 avaliacao_invalida`. | O mesmo desenho do `prazo_expirado` do 1b-1 (gravar, commitar, levantar). Um status de erro diz ao cliente "nada de bônus aconteceu" sem ele precisar ler o corpo. |
| E14 | `xp_entries` passa a ser único por (`mission_id`, `source`), e o `CHECK` de `source` aceita `'evaluation_bonus'`. `recompensa_da_missao` filtra `source = 'mission_completed'`. | É a mudança que o D registrou para o E (pendência 78). Sem o filtro, o `.one()` da recompensa quebraria em toda missão com bônus. |
| E15 | O bônus **não** avalia conquistas: nenhum fato do catálogo muda com ele (missões concluídas, maior sequência, missão da Tifa). | As conquistas continuam dependendo só de conclusões (D5); o bônus mexe no saldo e, portanto, pode subir o nível — e isso o anúncio mostra. |
| E16 | `USUARIO_UNICO` sai de `missions/router.py` para `core/` (`core/usuario_unico.py`), com o motivo da A2 na docstring. | O router novo seria o terceiro módulo a importar a constante da camada de transporte de `missions`; é o pedaço barato da pendência 88. Três usuários reais justificam o lugar comum. |
| E17 | Na tela, a evidência é **opcional e recolhida** no cartão ("Entregar com evidência"), com o rascunho guardado no registro por missão (`useCompletionRegistry`), não no cartão. | Concluir continua a um clique. O rascunho precisa sobreviver à remontagem dos cartões pelo recarregamento do quadro, pelo mesmo motivo da chave de operação (pendência 35), e nunca se perde numa falha (§7). |
| E18 | O botão "Pedir avaliação da Tifa" fica sempre habilitado numa missão com evidência e sem avaliação concluída; sem chave, a resposta `503 provedor_nao_configurado` vira a mensagem "A Tifa está fora do ar". | A disponibilidade da Tifa mora na feature `tutoring`, que `missions` não pode importar (§5, regra 1). Levar o estado da página até cada cartão por duas camadas de props custa mais que tratar o 503, que já tem texto e `code`. |

**Suposições desta spec** (não ditas pelo dono): o usuário continua único
(A2); a avaliação vale para os três tipos de missão (avulsa, diária e
especial), porque as três têm critério de conclusão; o comentário da Tifa é
texto de interface gerado pelo modelo e é mostrado como tal.

## Fora deste recorte

- **Verificação automática** (critério que a máquina confere) — pendência nova.
- **Upload de arquivo**, abrir o link, executar código do estudante (§6
  proíbe na API; a futura execução exige isolamento).
- **Reavaliar** uma avaliação concluída; contestar o veredito.
- **A Tifa propor entrega pelo chat** ou ver as avaliações no contexto da
  conversa; nenhuma ferramenta nova no chat (a conversa continua só com
  `create_mission`).
- Itens cosméticos; `propose_plan`, `reschedule_mission`,
  `get_study_context` como ferramenta; iniciar missão (pendência 3);
  autenticação (A2).

## Modelo de dados

Migração `alembic/versions/0005_entrega_avaliacao.py` (`revision = "0005"`,
`down_revision = "0004"`).

**`mission_evidence`** — a entrega (em `missions/models.py`).

| Coluna | Tipo | Restrição |
|---|---|---|
| `mission_id` | `INTEGER` | PK, FK → `missions.id` `ON DELETE CASCADE` |
| `text` | `TEXT` | NOT NULL, `CHECK (char_length(text) BETWEEN 1 AND 4000)` (`ck_mission_evidence_text`) |
| `link` | `TEXT` | nulo; `CHECK (link IS NULL OR (link ~* '^https?://' AND char_length(link) <= 2000))` (`ck_mission_evidence_link`) |
| `submitted_at` | `TIMESTAMPTZ` | NOT NULL — o mesmo instante do `completed_at` |

Uma por missão (a PK). **Garantido só pelo serviço, e declarado:** a
evidência só existe para missão `concluida`, e só é gravada na conclusão.

**`mission_evaluations`** — a avaliação (em `missions/models.py`).

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `INTEGER` | PK |
| `mission_id` | `INTEGER` | NOT NULL, FK → `missions.id` `ON DELETE CASCADE`, **`UNIQUE`** (`uq_mission_evaluations_mission_id`) |
| `state` | `TEXT` | NOT NULL, `CHECK (state IN ('avaliando', 'concluida', 'falhou'))` |
| `attempt` | `INTEGER` | NOT NULL, `CHECK (attempt >= 1)` |
| `verdict` | `TEXT` | nulo; `CHECK (verdict IN ('atende', 'parcial', 'nao_atende'))` |
| `feedback` | `TEXT` | nulo; `CHECK (char_length(feedback) BETWEEN 1 AND 1500)` |
| `error_code` | `TEXT` | nulo |
| `model` | `TEXT` | NOT NULL — o modelo que interpretou (transparência do §5) |
| `requested_at` | `TIMESTAMPTZ` | NOT NULL, do relógio injetável (é entrada da regra do órfão, como no 1b-1) |
| `finished_at` | `TIMESTAMPTZ` | nulo |

`CHECK`s de forma, cada um nomeado:
`(state = 'concluida') = (verdict IS NOT NULL AND feedback IS NOT NULL)`;
`(state = 'falhou') = (error_code IS NOT NULL)`;
`(state = 'avaliando') = (finished_at IS NULL)`.

**`xp_entries`** (E14): sai `uq_xp_entries_mission_id`, entra
`uq_xp_entries_mission_id_source` em (`mission_id`, `source`); o
`ck_xp_entries_source` passa a `source IN ('mission_completed',
'evaluation_bonus')`.

**Downgrade:** falha alto se existir lançamento `evaluation_bonus` (voltar à
unicidade só por missão o recusaria de todo jeito); sem bônus, remove as duas
tabelas e restaura a restrição e o `CHECK` antigos.

## Domínio

`missions/domain.py` — os enums novos, sem banco nem relógio:
`Veredito` (`atende`, `parcial`, `nao_atende`), `EstadoDaAvaliacao`
(`avaliando`, `concluida`, `falhou`), `Verificacao` (`autodeclarada`,
`com_evidencia`) e `verificacao_da_missao(tem_evidencia) -> Verificacao |
None` (nulo para missão não concluída).

`progression/domain.py` — `bonus_da_avaliacao(veredito, xp_da_missao) ->
int`: `xp // 2` para `atende`, 0 para os outros. É a regra única; o serviço a
chama e não repete a conta.

## Serviços

**`missions.service.concluir_missao`** ganha `evidencia: Evidencia | None`
(somente-nomeado). Na ordem de hoje, a evidência entra em dois pontos:

- no **reenvio** (passo 4): o mesmo `operation_id` com evidência **diferente**
  da gravada (texto ou link), ou com evidência onde antes não havia, ou sem
  onde havia, é `409 operacao_reutilizada` — o desenho do
  `client_message_id` do 1b-1 ("mesmo id, outro conteúdo");
- na **transição** (passo 6): a linha de `mission_evidence` é inserida no
  mesmo `flush` da conclusão, antes de `registrar_conclusao`.

**`missions.service`** ganha também as funções de escrita da avaliação, que
`evaluation` chama (E11): `iniciar_avaliacao(session, missao, agora, modelo)
-> MissionEvaluation` e `encerrar_avaliacao(session, avaliacao, tentativa,
...)`. Elas aplicam as transições (`avaliando → concluida | falhou`;
`falhou → avaliando`, com `attempt + 1`; órfã → `avaliando`, com `attempt + 1`)
e recusam as outras com `TransicaoIlegalError`.

**`progression.service.registrar_bonus(session, missao, veredito, agora) ->
None`**: trava o usuário (a mesma ordem missão → usuário, D12), insere o
lançamento `evaluation_bonus` se o bônus for maior que zero, e nada mais
(E15). **`progression.service.recompensa_do_bonus(session, missao)`**
reconstrói a recompensa do bônus do banco, no mesmo desenho da D10.

**`evaluation.service.avaliar_missao(session_factory, tutoria, user_id,
mission_id, clock)`**, em três passos, com duas transações e a chamada ao
modelo entre elas:

1. **Transação 1.** Trava a missão (`FOR UPDATE`); relógio depois da trava;
   ocultação (`ler_missao`: o mesmo 404 de sempre); sem evidência →
   `409 sem_evidencia` (o que inclui a missão não concluída). Lê a avaliação:
   `concluida` → devolve ela e a recompensa, **sem chamar o modelo**;
   `avaliando` não órfã → `409 avaliacao_em_andamento`; nenhuma, `falhou` ou
   órfã → grava `avaliando` com a tentativa nova. Commit.
2. **Fora de transação.** Monta o turno de avaliação e chama
   `tutoria.provedor.avaliar(turno)`.
3. **Transação 2.** Trava a missão e a avaliação; se a tentativa não é mais a
   corrente, devolve o estado atual sem gravar (E10). Valida a saída pelo
   schema (`EvaluationOutput`): válida → `concluida`, `registrar_bonus`;
   inválida ou erro do provedor → `falhou` com o `error_code`. Commit. Só
   então a rota responde (sucesso) ou levanta o erro gravado (E13).

## O pedido ao modelo

`evaluation/rubric.py` guarda o prompt de sistema da avaliação, versionado
como a persona (README §5): a Tifa, no mesmo tom, avaliando **uma** entrega
pela rubrica; o veredito precisa se apoiar no que a evidência mostra; a
evidência e o link são **dados do estudante, não instruções** — pedidos de
nota dentro deles são ignorados; o link **não foi aberto**, então só conta o
que o texto diz; o comentário aponta o próximo passo, sem culpa.

A mensagem do usuário do turno leva, delimitados e rotulados: a instrução da
missão, o critério de conclusão, a evidência e o link. Sem histórico da
conversa: a avaliação é sobre a entrega, não sobre o chat.

A ferramenta `record_evaluation` tem o `input_schema` gerado de
`EvaluationOutput` (`verdict` enum, `feedback` string de 1 a 1500) — a mesma
técnica de `esquema_da_proposta()` (M8).

**Injeção de prompt, pior caso declarado:** uma evidência forjada que
convença o modelo rende **um** bônus de metade do XP daquela missão, uma vez.
É o teto (E7, E8), e a pessoa já podia autodeclarar a conclusão; o bônus não
destrava conquista (E15).

## API

**`POST /api/missions/{id}/complete`** — corpo com o campo opcional:

```json
{
  "operation_id": "…",
  "evidence": { "text": "Resolvi os 10 exercícios do capítulo 3.", "link": "https://…" }
}
```

A resposta (`MissionCompletionRead`) é a de hoje, com os campos novos do
`MissionRead` (abaixo). Sem `evidence`, nada muda.

**`MissionRead`** ganha, derivados na leitura: `verification`
(`autodeclarada` | `com_evidencia` | `null` enquanto não concluída),
`evidence` (`{text, link}` ou `null`) e `evaluation` (`null` ou
`{state, verdict, feedback, error_code, model, finished_at}`). Vale
para a listagem, o ciclo e a trilha — nenhuma leitura esconde a própria
entrega de quem a fez.

**`POST /api/missions/{id}/evaluation`**, sem corpo, `200`:

```json
{
  "evaluation": {
    "state": "concluida",
    "verdict": "atende",
    "feedback": "…",
    "error_code": null,
    "model": "claude-opus-5",
    "finished_at": "2026-09-28T20:14:03Z"
  },
  "reward": {
    "xp_awarded": 110, "xp_total": 1450, "level_before": 5, "level_after": 5,
    "achievements_unlocked": []
  }
}
```

`reward` é `null` quando o veredito não credita bônus. O pedido repetido
sobre uma avaliação `concluida` devolve o mesmo corpo, reconstruído do banco.

## Erros

| Situação | Resposta |
|---|---|
| Missão inexistente, alheia ou oculta | `404 missao_nao_encontrada`, o corpo de sempre |
| Missão sem evidência (inclui não concluída) | `409 sem_evidencia` |
| Avaliação em andamento (não órfã) | `409 avaliacao_em_andamento` |
| Sem chave | `503 provedor_nao_configurado` |
| O provedor falhou | `502 provedor_indisponivel`, depois de gravar `falhou` |
| Estourou o tempo | `504 tempo_esgotado`, depois de gravar `falhou` |
| O modelo não chamou `record_evaluation` ou mandou saída fora do esquema | `502 avaliacao_invalida`, depois de gravar `falhou` |
| `evidence` inválida no `/complete` (vazia, longa, link sem `http(s)`) | `422` do Pydantic |
| Mesmo `operation_id` com outra evidência | `409 operacao_reutilizada` |

Cinco códigos entram no `CodigoDeErro` de `main.py`: `sem_evidencia`,
`avaliacao_em_andamento`, `avaliacao_invalida`, `provedor_indisponivel` e
`tempo_esgotado`. Os dois últimos já existiam só no stream (`CodigoDoStream`)
e passam a ter também caminho HTTP, com o mesmo valor; um teste confere que
não divergem.

## Frontend

Tudo dentro de `features/missions/` (E11, E18); nenhuma feature nova.

- **O cartão, antes de concluir:** um botão-disclosure "Entregar com
  evidência (opcional)" (`aria-expanded`) abre o campo de texto (com o
  contador perto do limite, como a pergunta à Tifa) e o link. Concluir manda a
  evidência se o texto não estiver vazio. O rascunho mora no registro por
  missão e **nunca** é apagado por uma falha; sai só no sucesso.
- **O cartão concluído:** o selo do tipo de verificação, sempre em texto
  ("Autodeclarada" / "Com evidência"); a evidência (o link como âncora que abre
  em aba nova, com `rel="noopener noreferrer"`; só `http`/`https` chegam ali,
  pela E3, então `javascript:` nunca vira link); e, com evidência
  e sem avaliação concluída, o botão **"Pedir avaliação da Tifa"**.
- **A avaliação:** estados avaliando (região viva: "A Tifa está avaliando…"),
  concluída, falhou (mensagem pelo `code` e "Tentar de novo") e
  fora do ar (503). A concluída mostra o veredito em texto **e** ícone
  ("Critério atendido" / "Atendido em parte" / "Critério não atendido"), o
  comentário, o rótulo fixo **"Avaliação da Tifa — interpretação do modelo,
  não verificação automática"**, e o bônus pelo `RewardAnnouncement` que já
  existe ("+110 XP de bônus"; a subida de nível, se houver).
- Depois de um bônus, o painel de progresso atualiza em silêncio pelo mesmo
  caminho da conclusão (P3 do D).
- Mapa exaustivo `code → {message, recovery}` para a avaliação, no padrão de
  `completionFailure.ts`.

## Testes

**Regra da casa:** todo teste novo é visto reprovando antes do código (RED) e
por mutação depois; toda guarda nova tem um teste que a faz dizer não.

- **Domínio:** `bonus_da_avaliacao` nos três vereditos e na divisão inteira
  (XP ímpar, a especial de 660); `verificacao_da_missao`.
- **Migração:** ida e volta; cada restrição nova dizendo não por `INSERT`
  cru, com o nome; o downgrade falhando alto com bônus gravado; a unicidade
  (`mission_id`, `source`) aceitando os dois lançamentos da mesma missão e
  recusando o bônus duplicado.
- **Conclusão com evidência:** grava a evidência na mesma transação; reenvio
  igual devolve o mesmo 200; reenvio com evidência diferente, a mais ou a
  menos → 409; a recompensa da conclusão continua a mesma com um bônus
  gravado depois (o filtro da E14).
- **Avaliação (servidor falso):** os três vereditos, com e sem bônus; o
  pedido repetido não chama o falso (contador zero); `sem_evidencia`, 404 da
  oculta, 503 sem chave; provedor fora, tempo esgotado e saída inválida —
  cada um gravado como `falhou` **antes** do erro, e a nova tentativa
  funcionando depois; a órfã retomada com o relógio injetável, sem `sleep`;
  a resposta atrasada de uma tentativa superada não sobrescreve (E10).
- **Concorrência** (conexões reais): dois pedidos de avaliação ao mesmo
  tempo → um avalia, o outro recebe 409, e **um** bônus no máximo.
- **Injeção:** um teste confere que a evidência chega ao modelo delimitada
  como dado e que nenhum texto dela altera o bônus (o bônus só depende do
  veredito que o esquema aceita).
- **Frontend:** o disclosure e o rascunho que sobrevive à remontagem e à
  falha; os selos em texto; cada estado da avaliação; o mapa exaustivo; o
  painel atualizado depois do bônus.
- **E2E** (servidor falso roteirizado com `record_evaluation`): concluir a
  diária semeada **com evidência**, pedir a avaliação, ver o veredito, o
  rótulo de interpretação do modelo, o bônus e o painel — números lidos da
  API (P6 do D); axe no cartão avaliado.

## Riscos

| Risco | Mitigação |
|---|---|
| A API real recusar `tool_choice` forçado junto do bloco de thinking que o `claude-opus-5` manda sem pedir (camada 3 do 1b-2) | **Não medido — precisa de chamada real.** O erro sai como `502 provedor_indisponivel` gravado, nunca como bônus. Pendência nova: uma chamada real de avaliação, pelo dono, com a chave do Keychain, grava a referência da sequência (camada 3 da avaliação); se a API recusar, troca-se para `tool_choice: auto` com `avaliacao_invalida` quando não houver chamada |
| Injeção na evidência | Teto de um bônus de metade do XP por missão (E7, E8); a evidência vai delimitada como dado |
| A reconstrução da recompensa da conclusão quebrar com dois lançamentos por missão | Filtro por `source` (E14), com teste que grava o bônus e relê a conclusão |
| Pedido de avaliação preso por processo morto | Órfã retomável (E9), com o relógio injetável |
| A resposta de uma tentativa velha sobrescrever a nova | Número da tentativa (E10) |

## Entregas de documentação

- `docs/HANDOFF.md`: os dois endpoints (o `/complete` estendido e o
  `/evaluation`), a migração `0005`, o módulo `evaluation` e o motivo de cada
  um (AGENTS.md §4); as decisões E1–E18; as pendências 78 (resolvida pela
  E14) e 88 (o pedaço da E16); as novas (verificação automática, a camada 3
  da avaliação); nenhuma dependência nova.
- `docs/ARCHITECTURE.md`: o módulo `evaluation`, a direção das dependências
  (E11) e o contrato HTTP.
- `docs/QUALITY.md` §9: o falso roteirizado com `record_evaluation`.

## Questões que o plano deve fixar

- A divisão em tarefas e o paralelismo entre worktrees (Frente 0).
- Os nomes exatos dos arquivos de teste, dos `data-testid` e das funções
  auxiliares.
- O texto exato das mensagens de falha da avaliação e do contador da
  evidência.

## Emendas (2026-09-28, antes do plano)

Feitas ao escrever o plano, com o código aberto, antes de qualquer
implementação; o texto acima já as incorpora.

| # | O que a spec dizia | O que vale | Motivo |
|---|---|---|---|
| EM1 | `MissionRead.evaluation` trazia `bonus_xp`, lido do livro-razão | O resumo da avaliação no `MissionRead` **não** tem o valor do bônus. O número sai só no `reward` da resposta de `POST /evaluation`, reconstruído do livro-razão; depois de recarregar, o cartão diz "Bônus de XP creditado ao seu saldo" para o veredito `atende`, e o painel de progresso mostra o saldo. | Ler `xp_entries` para montar o `MissionRead` faria `missions` depender dos modelos de `progression` também na leitura — mais uma aresta do par da pendência 88. Recalcular pela regra seria a segunda fonte da verdade que a própria spec recusou. |
| EM2 | O link valia com `^https?://` (sensível a maiúsculas) | Sem diferenciar maiúsculas: `~*` no `CHECK`, `(?i)` no schema, e a tela só vira âncora o que casa com `/^https?:\/\//i`. | Quem cola `HTTPS://…` de um celular receberia 422 por um detalhe que não muda o endereço. |
