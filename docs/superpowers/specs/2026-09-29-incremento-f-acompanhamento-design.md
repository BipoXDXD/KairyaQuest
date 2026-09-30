# Spec de design — Incremento F: acompanhar a execução (iniciar e reagendar missões)

**Data:** 2026-09-29
**Estado:** desenhada pelo agente, com **delegação expressa do dono** ("tome
todas as decisões por mim", 2026-09-29; o dono está ausente e o controlador da
sessão escolheu o tema). **Nada foi implementado.** Toda decisão abaixo é
**escolha do agente**, com o motivo e a alternativa recusada, e o dono pode
revogar qualquer uma. As que só ele pode tomar estão em "Para o dono
decidir", no fim, e **não bloqueiam** o plano: cada uma tem um padrão
escolhido.

## O que o README pede

- §5, **Acompanhar:** "consultar entregas e pendências, perguntar sobre
  bloqueios e distinguir dificuldade, falta de tempo e mudança de
  prioridade".
- §5, **Cobrar:** "propor retomar, dividir ou reagendar tarefas. Ser firme sem
  humilhar" — o F entrega o **reagendar**; retomar e dividir ficam fora
  (abaixo).
- §5: conectar "estou sem tempo" a funcionalidade real, não a botão
  decorativo; "não use culpa, ameaças, vigilância fictícia ou perda
  destrutiva de progresso".
- §6: projetar `reschedule_mission`; "o modelo solicita; o backend autoriza e
  executa"; "valide esquema, identidade, propriedade, permissões e
  pré-condições"; "novos compromissos e mudanças significativas exigem
  confirmação"; "persista mensagens e ações com estados de proposta,
  confirmação, execução e falha".
- §8: "o backend controla estados"; "valide transições"; "reenvios não
  duplicam"; "use identificadores de operação e restrições no banco; teste
  concorrência"; "**separe estimativa, prazo e duração real. Injete relógio
  nos testes e preserve histórico de replanejamento**".
- Pendência 3 do `docs/HANDOFF.md`: "não existe endpoint de iniciar missão";
  `em_andamento`, `started_at` e `actual_duration_minutes` existem no modelo e
  no contrato, mas nenhuma rota os alcança.

## O circuito que o F entrega

1. No cartão de uma missão disponível, a pessoa aperta **Iniciar**. A missão
   passa a `em_andamento` e o cartão diz desde quando. Ao concluir, a
   **duração real** aparece — a primeira vez que `actual_duration_minutes`
   sai diferente de `null` pela API.
2. Numa avulsa não concluída, a pessoa abre **Reagendar prazo**, escolhe o
   novo prazo e **o motivo** (dificuldade, falta de tempo ou mudança de
   prioridade) e salva. O prazo muda, e o cartão mostra o **histórico de
   prazos** — de quando para quando, por quê e por quem.
3. Na conversa, quando a pessoa diz "estou sem tempo", a Tifa pergunta o
   motivo e **propõe** reagendar (`reschedule_mission`). A proposta aparece
   como cartão, com o prazo atual e o proposto; nada muda até a pessoa
   **confirmar**. Confirmada, o reagendamento entra no mesmo histórico, marcado
   como proposto pela Tifa.
4. A Tifa passa a ver, no contexto, o estado de cada pendente (pendente ou em
   andamento, desde quando) e quantas vezes foi reagendada, com o último
   motivo — é o que deixa ela **acompanhar** sem inventar.

## Recorte

**Entra:** iniciar (pessoa, pela tela); reagendar (pessoa, pela tela; Tifa,
por proposta confirmada); o histórico de replanejamento; o motivo em três
valores; o contexto e a persona da Tifa para essas duas coisas; a migração
`0006`.

**Não entra** (cada item com o motivo):

- **Cobranças com preferências de intensidade, frequência, horários e pausa**
  (README §5): ficam para o **Incremento G**. O F dá à Tifa o que cobrar
  (estado, início, reagendamentos); o G decide quando e com que força.
- **Dividir missão** ("divida esta missão", README §5): pede criar várias
  missões a partir de uma e decidir o que acontece com a original (XP,
  histórico, avaliação). É outra ferramenta, com outro desenho.
- **`propose_plan`** e ligar o ciclo diário à conversa (pendências 55 e 59):
  continuam abertas; a Tifa só vê e só reagenda **avulsas**.
- **Pausar, retomar ou voltar a `pendente`**: `em_andamento` só vai para
  `concluida` (F5). Sessões de estudo com pausas são a entidade "sessão" do
  README §8, não implementada.
- **Notificações** e qualquer agendamento (README §8 proíbe anunciar antes de
  existir agendamento confiável).
- **Reagendar diária ou especial** (F7) e **antecipar automaticamente**
  prazos vencidos.
- Autenticação (A2): o usuário continua único.

## Decisões

| # | Decisão | Motivo | Alternativa recusada |
|---|---|---|---|
| F1 | **Iniciar é `POST /api/missions/{id}/start`**, corpo `{"operation_id": "…"}`, resposta `200` com o `MissionRead`. Só `pendente → em_andamento`; `started_at` é o relógio lido **depois** da trava (C13). | É a transição que o domínio já declara (`_TRANSICOES`), com a mesma ordem da conclusão (trava, relógio, ocultação, reenvio, regra do dia, transição). Uma rota por ação mantém o contrato legível e o `code` de cada falha sem ambiguidade. | `PATCH /api/missions/{id}` com `state` — deixaria o cliente pedir qualquer estado e mover a validação da transição para a interpretação de um campo; e iniciar "implícito" ao abrir o cartão, que gravaria início sem intenção da pessoa (duração real falsa). |
| F2 | **Idempotência do início pelo `operation_id`**, gravado em `mission_operations` com `kind = 'start'`, na mesma UNIQUE da conclusão. Reenvio da mesma chave → o mesmo `200` (a missão como está agora); chave nova numa missão já `em_andamento` ou `concluida` → `409 transicao_ilegal`; chave gasta em outra missão ou em outra operação → `409 operacao_reutilizada`. | É exatamente o contrato que a conclusão já cumpre, e o comentário de `CONCLUSAO` em `service.py` já previa "havera pelo menos o inicio". Uma chave só por operação, qualquer que seja o tipo, é o que a UNIQUE sobre `operation_id` sozinho garante. | Iniciar idempotente **por estado** (iniciar o que já está em andamento devolve 200): confundiria o reenvio com uma segunda tentativa e divergiria do Concluir, e a tela não saberia se foi ela quem iniciou. |
| F3 | **Iniciar vale para os três tipos**, pela disponibilidade derivada: a avulsa sempre, a diária no dia dela, a especial na janela. Diária perdida, fora do plano ou especial expirada → `409 missao_expirada`; diária futura ou especial bloqueada → o `404` de sempre (ocultação C11, antes do reenvio). | A diária é justamente a missão que se faz hoje; excluí-la tiraria o F do ciclo. A regra do dia é a mesma da conclusão (`NAO_CONCLUIVEIS`), e a ocultação vem de `ler_missao`, a mesma função — a leitura e a escrita não podem discordar sobre o que existe (P6 do B). | Só avulsa: simples, mas deixaria a diária sem duração real para sempre. |
| F4 | **Concluir continua permitido direto de `pendente`**, sem iniciar (a autodeclarada de sempre); a duração real, nesse caso, continua `null`. | O A, o D e o E dependem de concluir a um clique; exigir o início seria um ritual sem ganho para quem já terminou. `null` é "ninguém mediu", não "zero minuto" (comentário do `MissionCard`). | Exigir iniciar antes de concluir: quebraria o contrato publicado e todos os E2E existentes. |
| F5 | **`em_andamento` não volta a `pendente`, e não há pausa.** A duração real é `completed_at − started_at`, relógio de parede, em minutos truncados (a regra que já existe). | Voltar a pendente apagaria (ou falsificaria) o `started_at`; pausar pede sessões com início e fim próprios — a entidade "sessão" do README §8, que o F não cria. Declarar o limite é mais honesto que medir errado. | Um `paused_at` na missão: um campo que só funciona para uma pausa, e mentiria na segunda. Pendência **111**. |
| F6 | **Reagendar é `POST /api/missions/{id}/reschedule`**, corpo `{"operation_id", "new_deadline", "reason"}`, resposta `200` com o `MissionRead` já com o prazo novo e o histórico. | Um verbo de domínio carrega o motivo e grava o histórico no mesmo ato; o prazo corrente continua em `missions.deadline`, então listagem, ordem por prazo e todos os leitores atuais seguem iguais. | `PATCH` genérico do `deadline`: perderia o motivo e o histórico que o README §8 manda preservar. |
| F7 | **Só a avulsa se reagenda.** Diária e especial → `409 prazo_derivado`. | O prazo delas é **derivado** do ciclo (C10) e nunca gravado: o fim do dia da diária, a janela da especial. Não há coluna para mudar; mudar a regra do dia de uma missão só quebraria a sequência (B) e a trilha (C). | Mover a diária para outro dia: é replanejar a semana, trabalho de `propose_plan`. Pendência **113**. |
| F8 | **Reagendar vale em `pendente` e `em_andamento`**, e não muda o estado nem o `started_at`; em `concluida` → `409 transicao_ilegal` ("não é possível reagendar uma missão concluída"). | "Estou sem tempo" acontece no meio da execução. O estado diz o que foi feito; o prazo diz até quando — são eixos separados, como o README §8 manda separar estimativa, prazo e duração. | Reagendar voltar a missão para `pendente`: perderia o início e a duração real. |
| F9 | **O novo prazo:** com fuso (`AwareDatetime`, sem fuso → `422` do Pydantic), representável em UTC (a guarda `_instante_representavel` do `MissionCreate`), **estritamente no futuro** pelo relógio lido depois da trava (senão `422 prazo_expirado`, o **mesmo** `code` da proposta cujo prazo passou) e **diferente do atual** (senão `409 prazo_inalterado`). Antecipar é permitido. Não há teto de horizonte. | Um prazo no passado não é compromisso, é registro de atraso — e o F não o registra. O mesmo `code` de "prazo no passado" nos dois caminhos (proposta e reagendamento) é um texto só na tela. "Mesmo prazo" é um no-op que sujaria o histórico; é `409` porque depende do estado atual, não da forma do pedido. Antecipar é o caso "mudança de prioridade" para cima. O teto de horizonte do `MissionCreate` também não existe (decisão aberta do dono desde o 1a), e o F não inventa um só para o reagendamento. | Aceitar prazo passado "para registrar"; recusar antecipação; limitar a N dias. |
| F10 | **O motivo é obrigatório e fechado em três valores:** `dificuldade`, `falta_de_tempo`, `mudanca_de_prioridade` (`MotivoDoReagendamento`). Sem texto livre. | É a distinção literal do README §5. Um enum a máquina distingue (a tela conta, a Tifa lê, o G poderá cobrar diferente); texto livre seria mais um dado não confiável dentro do prompt, sem ganho de decisão. Obrigatório porque um histórico sem "por quê" não é replanejamento, é só prazo mudado. | Motivo opcional; texto livre; um quarto valor "outro" (convida a não escolher). Registrado em "Para o dono decidir". |
| F11 | **Sem limite de reagendamentos.** O número fica visível para a pessoa (no cartão) e para a Tifa (no contexto). | Um limite seria punição — o README §5 proíbe "perda destrutiva" e manda "ser firme sem humilhar". Com o histórico à vista, a cobrança do G tem o dado sem que o F precise bloquear ninguém. | Um teto (ex.: 3 por missão) com `409`: a pessoa com a vida real atropelando ficaria sem saída, ou abandonaria a missão. Pendência **110**; "Para o dono decidir". |
| F12 | **O histórico é a tabela `mission_reschedules`, só de inserção:** uma linha por reagendamento, com `previous_deadline`, `new_deadline`, `reason`, `origin` (`usuario` ou `tifa`), `operation_id` e `rescheduled_at`. `missions.deadline` continua sendo o prazo **corrente**. O `MissionRead` ganha `reschedules`, a lista em ordem de gravação. | "Preserve histórico de replanejamento" (§8) pede os dois lados de cada mudança e o motivo. Uma tabela própria, sem `UPDATE` nem `DELETE` pelo serviço, é o histórico que não se reescreve. `previous_deadline` gravado (e não reconstruído da linha anterior) torna cada linha legível sozinha e prova, no teste de concorrência, que não houve atualização perdida. | Guardar só uma contagem; ou derivar o prazo corrente do histórico — o que obrigaria todo leitor atual (listagem, contexto, ordenação) a juntar tabelas. |
| F13 | **Idempotência do reagendamento:** `mission_operations` com `kind = 'reschedule'`, e a linha do histórico ligada à operação (`operation_id` → `mission_operations.operation_id`, UNIQUE). Reenvio com a mesma chave e o **mesmo** `(new_deadline, reason)` → `200` com a missão como está agora; mesma chave com outro conteúdo → `409 operacao_reutilizada` (o desenho da evidência no E). | O mesmo mecanismo das outras duas escritas; a comparação de conteúdo é a regra "mesmo id, outro conteúdo é chave gasta" do 1b-1 e do E. Comparar instantes com fuso compara o instante, não a grafia (`-03:00` e `Z` do mesmo instante são iguais). | Idempotência pela chave natural `(missão, novo prazo)`: reagendar de volta para um prazo que já existiu é pedido legítimo, e seria confundido com reenvio. |
| F14 | **Concorrência:** iniciar e reagendar travam a missão (`FOR UPDATE`, `buscar_para_escrever(travar=True)`) **antes** de ler relógio, estado e prazo. Dois reagendamentos simultâneos com chaves diferentes viram **dois elos encadeados** (o `previous_deadline` do segundo é o `new_deadline` do primeiro), nunca uma atualização perdida. A ordem global das travas passa a ser **ação → missão → avaliação → usuário**: a confirmação de uma proposta trava a ação e depois a missão; nenhum caminho trava na ordem inversa. | É o ponto de serialização que a conclusão já usa, e a hora lida depois da trava (C13). Declarar a ordem das travas é o que impede a espera circular entre a confirmação, o reagendamento direto, a conclusão e a avaliação. | Controle otimista (coluna de versão): mais uma coluna e um laço de repetição, sem ganho com um usuário. |
| F15 | **A Tifa ganha `reschedule_mission`, ferramenta de proposta**, com a entrada `{mission_id, new_deadline, reason}` (`RescheduleProposal`). Vira uma `TutorAction` de `kind = 'reschedule_mission'` em `proposta`; **nada muda** até a pessoa confirmar. A confirmação executa pelo **mesmo** `reagendar_missao`, com `origin = 'tifa'` e o `operation_id` da confirmação. | README §6: "mudanças significativas exigem confirmação" e "automação depende de preferências explícitas" (que não existem até o G). Um caminho de execução só (o serviço de `missions`) e um histórico só, marcado pela origem. | Executar direto, sem confirmação: seria o modelo mudando compromissos da pessoa sozinho. |
| F16 | **Pré-condição na hora da proposta:** ao gravar a resposta com uma proposta de reagendamento, o backend confere que a missão existe, é do usuário, é avulsa e não está concluída; grava no `payload`, **além** da entrada do modelo, um **retrato** escrito pelo backend (`instructions` e `previous_deadline`). Se a pré-condição falhar, a resposta é gravada `falhou` com `proposta_invalida` — o mesmo destino da proposta fora do esquema. | O README §6 manda validar pré-condições; propor mudar uma missão que não existe (ou alheia, ou concluída) é saída inválida do modelo, não uma proposta. O retrato é o que o cartão mostra — "de 02/10 18:00 para 05/10 18:00" — sem a feature `tutoring` do frontend importar `missions` (`docs/ARCHITECTURE.md` §5, regra 1), e registra o que a pessoa viu quando decidiu. | Guardar só o `mission_id` e o cartão buscar a missão: dependência entre features no frontend, e o cartão mudaria de conteúdo depois de decidido. Custo aceito: o retrato pode estar velho na hora de confirmar (pendência **114**); a confirmação revalida tudo (F17). |
| F17 | **Na confirmação, tudo é revalidado** pelo `reagendar_missao`, que confere **todas** as pré-condições antes da primeira escrita. Se o novo prazo já passou → a ação é gravada `falhou` com `prazo_expirado`, commit, `422 prazo_expirado` (o desenho que existe para a criação). Se a missão não pode mais ser reagendada (sumiu, concluída, prazo já igual, tipo derivado) → a ação é gravada `falhou` com `reagendamento_invalido`, commit, `409 reagendamento_invalido`. Chave reutilizada → `409 operacao_reutilizada`, sem gravar. O reenvio da confirmação com a mesma chave devolve o mesmo resultado, inclusive o mesmo erro. | Gravar a falha e só depois levantar é o desenho do `prazo_expirado` (1b-1) e da avaliação (E13): a proposta não fica pendurada como `proposta` sobre uma missão que já não aceita a mudança. Um `code` só para "a missão mudou" porque a tela oferece a mesma saída para todos os casos (pedir outra proposta); `transicao_ilegal` na confirmação já significa "a proposta já foi decidida", e reusá-lo aqui misturaria dois significados. | Deixar a ação `proposta` e devolver o erro da missão: a pessoa ficaria com um cartão que falha para sempre. |
| F18 | **O provedor passa a dizer qual ferramenta foi chamada:** `Proposta(nome, entrada)`. O adaptador oferece **as duas** ferramentas na conversa (`create_mission` e `reschedule_mission`), ainda com **uma chamada por resposta** (`disable_parallel_tool_use`) e sem `strict`, como hoje. Nome fora das duas → `proposta_invalida`. | Com duas ferramentas, a entrada sozinha não diz o que o modelo pediu. Manter uma proposta por resposta preserva o cartão único por mensagem que a tela já sabe mostrar. Sem `strict` na conversa porque a validação é do backend (o schema), e mudar o modo da ferramenta de proposta é mudança de comportamento sem medida real (pendência **109**). | Uma ferramenta genérica `propose_action` com `kind` no corpo: esquema mais fraco para o modelo e para a validação. |
| F19 | **O contexto e a persona:** cada pendente no contexto ganha o estado, o início (se houver) e "reagendada N vez(es), último motivo: …"; as ações antigas entram no histórico como texto **por tipo** ("[Proposta de reagendamento da missão #12 para … (falta de tempo) — executada]"). A persona ganha as regras: propor reagendar só com o motivo conversado; com "dificuldade", oferecer ajuda (pistas, exemplo) **antes** de adiar; nunca culpa pela contagem. | É o `get_study_context` (README §6) com o que a Tifa precisa para acompanhar, sem ferramenta nova de leitura. O texto por tipo impede que a proposta de reagendamento apareça ao modelo como "Proposta de missão" (o `_texto` de hoje lê `instructions` do payload). | Uma ferramenta de leitura `get_study_context`: o contexto já vai inteiro no sistema, e o README manda enviar só o relevante. |
| F20 | **A tela:** no cartão da missão, o botão **Iniciar** (pendente e disponível), a linha "Iniciada em …" (em andamento), o disclosure **Reagendar prazo** (avulsa não concluída) com o novo prazo em horário de Brasília e os três motivos, e o **histórico de prazos**. As chaves de iniciar e de reagendar moram no registro do quadro, **por missão e por tipo**; o rascunho do reagendamento mora no cartão. | As chaves no registro pelo mesmo motivo da pendência 35 (a recarga do quadro remonta os cartões e mataria a chave de uma tentativa com resultado desconhecido). Por tipo porque a UNIQUE é por chave: a chave do Concluir gasta num Iniciar faria o Concluir falhar com `operacao_reutilizada`. O rascunho do reagendamento (um instante e um botão de opção) no cartão: perder isso numa recarga custa dois cliques, e guardá-lo no registro dobraria a superfície do registro por um ganho pequeno. | Rascunho no registro, como a evidência (E17): pendência **112** se o dono quiser. |
| F21 | **A hora civil de São Paulo vira instante no cliente**, por uma função pura de `shared/lib/deadline.ts` (`saoPauloCivilToIso`, e a inversa para preencher o campo), com o `Intl` e o fuso `America/Sao_Paulo` — **sem** deslocamento fixo. O campo é `datetime-local`, rotulado "horário de Brasília". | O README §8 manda apresentar em `America/Sao_Paulo`; o navegador pode estar em outro fuso, e o `datetime-local` só sabe o do navegador. São Paulo já teve horário de verão; o `cycle_domain.py` recusa deslocamento fixo pelo mesmo motivo. Mora em `shared/lib/` ao lado de `formatDeadline`, que é a mesma regra do fuso. | Mandar a hora sem fuso e o backend supor São Paulo: o backend recusa `deadline` sem fuso desde o 1a (defeito medido), e a regra continuaria a mesma. |
| F22 | **O cartão de proposta de reagendamento é um componente próprio** da feature `tutoring` (`RescheduleProposalCard`), escolhido pelo `kind` da ação; o `ProposalCard` de hoje continua sendo o da criação. O retorno de confirmar continua chamando `onMissionCreated`, que passa a significar "o quadro mudou" (o nome fica, com o novo sentido no comentário). | Os dois cartões mostram coisas diferentes (uma missão nova; dois prazos e um motivo) e compartilham só os controles de decisão (`DecisionControls`, extraído). Renomear o callback mexeria em testes que não mudam de comportamento. | Um cartão único com ramos por tipo: o componente dobraria de tamanho e cada estado teria dois textos. |
| F23 | **Migração `0006`** (`revision = "0006"`, `down_revision = "0005"`): a tabela `mission_reschedules`; `ck_mission_operations_kind` (`kind IN ('complete', 'start', 'reschedule')`); `ck_tutor_actions_kind` passa a aceitar `'reschedule_mission'`; `ck_missions_em_andamento_iniciada` e `ck_missions_inicio_antes_da_conclusao`. O `downgrade` **falha alto** se houver linha em `mission_reschedules` ou ação `reschedule_mission`. | Cada regra nova com uma restrição nomeada no banco (README §8). O `CHECK` do `kind` de operação transforma o comentário "havera pelo menos o inicio" em regra. O downgrade que apaga histórico em silêncio é o que a `0005` já recusa para evidências. | Não restringir `mission_operations.kind` (como hoje): um `kind` digitado errado viraria uma operação que nenhuma conferência reconhece. |
| F24 | **Nenhuma dependência nova, nenhum serviço novo, nenhuma mudança na progressão.** Iniciar e reagendar nunca mexem em XP, nível, conquistas nem na sequência. | README §3 e §5: reagendar não é perda de progresso, e iniciar não é conquista. | Um bônus por iniciar, ou uma penalidade por reagendar: o primeiro é XP sem critério; o segundo, a punição que o §5 proíbe. |

**Suposições desta spec** (não ditas pelo dono): o usuário continua único
(A2); "reagendar" é mudar o **prazo**, não a estimativa (a estimativa é o
esforço, e o F não a toca); a diária e a especial ficam fora do reagendamento
porque o prazo delas é do ciclo.

## Emendas

Decisões tomadas depois da aprovação, durante a execução do F, com o mesmo
formato da tabela acima. Cada emenda diz qual decisão anterior ela ajusta.

| # | Decisão | Por quê | Alternativa descartada |
|---|---|---|---|
| F25 | **A missão iniciada dentro do prazo pode ser concluída depois dele, até o fim do dia seguinte ao prazo** (pendência 115, decisão do controlador por delegação do dono, 2026-09-29). A diária de quarta iniciada às 23:50 conclui às 00:10 de quinta, e até quinta 23:59:59; a especial iniciada na janela conclui até o fim do dia seguinte ao fim da janela. A conclusão grava normalmente: `completed_at`, duração real, **o XP normal da missão** e as conquistas. **A sequência conta o dia da missão** — a diária pertence ao dia dela, e a sequência já é derivada da conclusão de cada dia (`carregar_historico`), sem mudança no cálculo; a diária que completa 7 dias abre o marco dela, e a janela da especial desse marco ainda está aberta na hora da conclusão tardia. A disponibilidade derivada dessa missão volta a ser `disponivel` (`com_inicio_a_tempo`, `cycle_domain.py`) — só para concluir: iniciar de novo é `409 transicao_ilegal`. **Só vale para `em_andamento` com `started_at` antes do prazo**: a pendente depois do prazo continua perdida/expirada (`409 missao_expirada`), como antes. O `GET /api/cycle` ganha `late_daily` (a diária de ontem nessa situação, ou `null`), e o `special` continua a especial nesse período; o Quartel-General mostra a diária de ontem numa seção própria, com o motivo a vista. Ajusta **F3** (a regra do dia deixa de olhar só "concluída?" e o dia) e **F5** (a missão iniciada não fica mais presa em `em_andamento` sem saída), e é coerente com **F24**: iniciar continua sem dar XP. | A pessoa começou a tempo. Prender a missão em `em_andamento` para sempre, sem duração real e com um Concluir que sempre falha, é a perda destrutiva que o README §5 proíbe. O limite existe porque, sem ele, uma missão iniciada meses atrás reescreveria a sequência e os marcos de semanas passadas, e "iniciar tudo e concluir quando der" viraria atalho; "até o fim do dia seguinte" cobre a virada da noite (quem começa às 23:50 e termina de manhã), é o mesmo desenho da janela da especial (C8), garante que só a diária de **ontem** pode estar nessa situação (um campo só no ciclo) e que o marco aberto por ela ainda encontra a janela da especial. | (a) Manter como estava (a pendência 115 descreve o defeito); (b) dar o XP e **não** contar para a sequência — exigiria um segundo critério de "concluída" no histórico só para a sequência, sem ganho de honestidade, porque a diária foi começada no dia dela; (c) sem limite — reescrita arbitrária do passado; (d) 24 h corridas a partir do prazo — igual ao limite escolhido fora do horário de verão, mas com um instante que não é meia-noite, diferente de toda outra borda do ciclo. |

**Efeito declarado da F25:** entre a meia-noite e a conclusão tardia, a
sequência exibida já não conta o dia de ontem (ele ainda não tem conclusão) e
volta a contar assim que a diária de ontem é concluída. O cálculo da sequência
não mudou: ele mostra o que está concluído no instante da leitura.

## Contratos

### `POST /api/missions/{mission_id}/start`

Corpo: `{"operation_id": "<1 a 200 caracteres>"}` (o teto de
`TAMANHO_MAXIMO_DO_IDENTIFICADOR`). Resposta `200`, `MissionRead` com
`state: "em_andamento"` e `started_at` preenchido.

### `POST /api/missions/{mission_id}/reschedule`

```json
{
  "operation_id": "3f0c…",
  "new_deadline": "2026-10-05T18:00:00-03:00",
  "reason": "falta_de_tempo"
}
```

`extra="forbid"`: um campo a mais é `422` (quem o mandou acharia que foi
gravado). Resposta `200`, `MissionRead` com o prazo novo e o histórico.

### `MissionRead` ganha `reschedules`

Em toda leitura (listagem, ciclo, trilha, conclusão, confirmação):

```json
"reschedules": [
  {
    "previous_deadline": "2026-10-02T21:00:00Z",
    "new_deadline": "2026-10-05T21:00:00Z",
    "reason": "falta_de_tempo",
    "origin": "usuario",
    "rescheduled_at": "2026-10-01T14:03:11Z"
  }
]
```

Lista vazia quando nunca houve reagendamento (e sempre vazia em diária e
especial). `actual_duration_minutes` passa a sair preenchido quando há
`started_at` e `completed_at`.

### A ferramenta `reschedule_mission` e a ação

Entrada do modelo (`RescheduleProposal`, `extra="forbid"`):
`{"mission_id": <int 1..2^31-1>, "new_deadline": "<ISO com fuso>", "reason":
"dificuldade" | "falta_de_tempo" | "mudanca_de_prioridade"}`. O
`input_schema` é gerado do schema, como `esquema_da_proposta()` (M8).

`ActionRead` de um reagendamento:

```json
{
  "id": 31,
  "kind": "reschedule_mission",
  "state": "proposta",
  "payload": {
    "mission_id": 12,
    "new_deadline": "2026-10-05T21:00:00Z",
    "reason": "falta_de_tempo",
    "instructions": "Resumir o capítulo 3",
    "previous_deadline": "2026-10-02T21:00:00Z"
  },
  "mission_id": null,
  "error_code": null
}
```

`instructions` e `previous_deadline` são o **retrato** do backend (F16), não
entrada do modelo. `mission_id` da ação continua nulo até `executada` (o
`CHECK` `ck_tutor_actions_missao_so_quando_executada` fica como está).
`POST /api/tutoring/actions/{id}/confirm` devolve o `ConfirmRead` de sempre,
com `mission` = a missão reagendada.

### Erros

| Situação | Rota | Resposta |
|---|---|---|
| Missão inexistente, alheia ou oculta | start, reschedule | `404 missao_nao_encontrada` |
| Iniciar missão já `em_andamento` ou `concluida` (chave nova) | start | `409 transicao_ilegal` |
| Iniciar diária perdida / fora do plano / especial expirada | start | `409 missao_expirada` |
| Reagendar missão `concluida` | reschedule | `409 transicao_ilegal` |
| Reagendar diária ou especial | reschedule | `409 prazo_derivado` (**novo**) |
| Novo prazo igual ao atual | reschedule | `409 prazo_inalterado` (**novo**) |
| Novo prazo no passado (ou agora) | reschedule | `422 prazo_expirado` |
| Chave gasta em outra missão, em outra operação, ou mesma chave com outro conteúdo | start, reschedule | `409 operacao_reutilizada` |
| Corpo inválido (sem fuso, motivo fora do enum, campo a mais, chave vazia) | start, reschedule | `422` do Pydantic |
| Confirmar reagendamento cuja missão mudou | confirm | ação gravada `falhou`, `409 reagendamento_invalido` (**novo**) |
| Confirmar reagendamento com o prazo proposto já passado | confirm | ação gravada `falhou`, `422 prazo_expirado` |

Três códigos entram no `CodigoDeErro` de `main.py`: `prazo_derivado`,
`prazo_inalterado` e `reagendamento_invalido`; três erros de domínio em
`core/errors.py`: `PrazoDerivadoError`, `PrazoInalteradoError` e
`ReagendamentoInvalidoError`. `PrazoExpiradoError` é reusado.

## Modelo de dados — migração `0006_acompanhamento.py`

**`mission_reschedules`** (em `missions/models.py`, classe `MissionReschedule`):

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `INTEGER` | PK |
| `mission_id` | `INTEGER` | NOT NULL, FK → `missions.id` `ON DELETE CASCADE`; índice `ix_mission_reschedules_mission_id` |
| `operation_id` | `TEXT` | NOT NULL, FK → `mission_operations.operation_id` `ON DELETE CASCADE`, `UNIQUE` (`uq_mission_reschedules_operation_id`) |
| `previous_deadline` | `TIMESTAMPTZ` | NOT NULL |
| `new_deadline` | `TIMESTAMPTZ` | NOT NULL; `CHECK (new_deadline <> previous_deadline)` (`ck_mission_reschedules_prazo_mudou`) |
| `reason` | `TEXT` | NOT NULL; `CHECK (reason IN ('dificuldade', 'falta_de_tempo', 'mudanca_de_prioridade'))` (`ck_mission_reschedules_reason`) |
| `origin` | `TEXT` | NOT NULL; `CHECK (origin IN ('usuario', 'tifa'))` (`ck_mission_reschedules_origin`) |
| `rescheduled_at` | `TIMESTAMPTZ` | NOT NULL, do relógio injetável (lido depois da trava) |

**Garantido só pelo serviço, e declarado:** o reagendamento só existe para
avulsa não concluída; `previous_deadline` é o prazo corrente no instante da
gravação; `new_deadline > rescheduled_at`. O banco não expressa as três
(dependem de outra tabela ou do relógio).

**`missions`:** `ck_missions_em_andamento_iniciada` (`state <> 'em_andamento'
OR started_at IS NOT NULL`) e `ck_missions_inicio_antes_da_conclusao`
(`started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at`).
Não há `CHECK` de "pendente sem `started_at`": o teste
`test_duracao_real_no_corpo_vem_dos_instantes` grava um `started_at` numa
pendente para exercitar a duração, e a regra seria só do serviço de qualquer
jeito.

**`mission_operations`:** `ck_mission_operations_kind` (`kind IN ('complete',
'start', 'reschedule')`). **`tutor_actions`:** `ck_tutor_actions_kind` passa a
`kind IN ('create_mission', 'reschedule_mission')`.

Valores **congelados** na migração (D8), derivados dos enums no modelo, como
nas migrações anteriores. **Sem backfill:** nenhuma missão existente ganha
início nem histórico.

**Downgrade:** falha alto se houver linha em `mission_reschedules` (apagaria o
histórico) ou ação `reschedule_mission` (o `CHECK` antigo a recusaria); sem
elas, remove a tabela e as quatro restrições novas e restaura o `CHECK` antigo
de `tutor_actions`. As operações `start` e `reschedule` que ficarem em
`mission_operations` são inofensivas no esquema `0005` (que não restringe
`kind`) e ficam.

## Regras de domínio (`missions/domain.py`, puras)

- `MotivoDoReagendamento(StrEnum)`: `DIFICULDADE = "dificuldade"`,
  `FALTA_DE_TEMPO = "falta_de_tempo"`, `MUDANCA_DE_PRIORIDADE =
  "mudanca_de_prioridade"`.
- `OrigemDoReagendamento(StrEnum)`: `USUARIO = "usuario"`, `TIFA = "tifa"`.
- `ProblemaDoNovoPrazo(StrEnum)`: `NO_PASSADO`, `INALTERADO`.
- `problema_do_novo_prazo(novo, atual, agora) -> ProblemaDoNovoPrazo | None`:
  `NO_PASSADO` se `novo <= agora` (vem primeiro: um prazo passado igual ao
  atual é, antes de tudo, passado); `INALTERADO` se `novo == atual`; senão
  `None`. Exige os três com fuso (`ValueError` sem fuso, como `dia_de`).
- `validar_reagendamento(estado)`: `TransicaoIlegalError` para `concluida`,
  com a mensagem "nao e possivel reagendar uma missao 'concluida'"; nada para
  os outros dois.
- A transição `pendente → em_andamento` já existe em `_TRANSICOES`; nenhuma
  transição nova.

## Serviços (`missions/service.py`)

Constantes: `INICIO = "start"`, `REAGENDAMENTO = "reschedule"` (ao lado de
`CONCLUSAO`). `_exigir_mesma_operacao` ganha o parâmetro `kind` (a conclusão
passa `CONCLUSAO`).

**`iniciar_missao(session, user_id, mission_id, operation_id, *, clock) ->
Mission`**, na ordem:

1. `buscar_para_escrever(..., travar=True)`;
2. `agora = clock()` (depois da trava, C13);
3. `lida = ler_missao(session, missao, agora)` — ocultação antes do reenvio;
4. operação já gravada com a chave → `_exigir_mesma_operacao(..., INICIO)` e
   devolve a missão;
5. `lida.availability in NAO_CONCLUIVEIS` → `MissaoExpiradaError`;
6. `validar_transicao(missao.state, EM_ANDAMENTO)`;
7. `state = EM_ANDAMENTO`, `started_at = agora`, `MissionOperation(kind =
   INICIO)`, `flush` com a tradução do `IntegrityError` da UNIQUE para
   `OperacaoReutilizadaError` (o mesmo `try` da conclusão).

**`reagendar_missao(session, user_id, mission_id, operation_id, *, novo_prazo,
motivo, origem, clock) -> Mission`**, na ordem — e **todas as recusas antes da
primeira escrita** (é o contrato que a confirmação da Tifa usa, F17):

1. trava; 2. relógio; 3. `ler_missao` (404 da oculta);
4. operação já gravada → `_exigir_mesma_operacao(..., REAGENDAMENTO)`; a linha
   do histórico daquela chave com outro `(new_deadline, reason)` →
   `OperacaoReutilizadaError`; igual → devolve a missão;
5. tipo diferente de avulsa → `PrazoDerivadoError`;
6. `validar_reagendamento(missao.state)`;
7. `problema_do_novo_prazo(novo_prazo, missao.deadline, agora)`: `NO_PASSADO` →
   `PrazoExpiradoError`; `INALTERADO` → `PrazoInalteradoError`;
8. grava a `MissionOperation(kind = REAGENDAMENTO)` e faz `flush` (com a
   tradução da UNIQUE), **depois** a `MissionReschedule` (a FK exige a
   operação antes), e troca `missao.deadline`; `flush`.

**`missao_reagendavel(session, user_id, mission_id) -> Mission | None`** — a
pré-condição da proposta (F16), sem trava: a missão, se existe, é do usuário,
é avulsa e não está concluída; senão `None`. Não levanta.

## Tutoria

- `TipoDeAcao.REAGENDAR_MISSAO = "reschedule_mission"`; a constante
  `REAGENDAMENTO_INVALIDO = "reagendamento_invalido"` ao lado de
  `PRAZO_EXPIRADO`.
- `Proposta(nome: str, entrada: dict)`. `responder` oferece as duas
  ferramentas e emite `Proposta(bloco.name, bloco.input)`.
- `transmitir`: valida a entrada **pelo nome** (`MissionCreate` para
  `create_mission`, `RescheduleProposal` para `reschedule_mission`, nome
  desconhecido → `proposta_invalida`). `_completar`, na mesma transação que
  grava a resposta, confere `missao_reagendavel` para a de reagendamento: `None`
  → a resposta é gravada `falhou` com `proposta_invalida` (e o stream emite o
  `error` de sempre); senão grava a ação com o `payload` = entrada validada +
  retrato.
- `confirmar_acao`: despacha pelo `kind`. O reagendamento revalida o `payload`
  (os três campos do modelo) com `RescheduleProposal`, chama
  `reagendar_missao(..., origem=TIFA, operation_id=<o da confirmação>)`,
  captura `PrazoExpiradoError` (→ `falhou`/`prazo_expirado`, devolve
  `PrazoExpirado`) e `MissaoNaoEncontradaError`, `NaoPertenceAoUsuarioError`,
  `TransicaoIlegalError`, `PrazoInalteradoError`, `PrazoDerivadoError` (→
  `falhou`/`reagendamento_invalido`, devolve `ReagendamentoInvalido`), e deixa
  `OperacaoReutilizadaError` subir. A trava da ação vem antes da da missão
  (F14). `_resultado_anterior` reconhece os dois `error_code`.
- A rota de confirmar commita e só então levanta `PrazoExpiradoError` ou
  `ReagendamentoInvalidoError`.
- `context.py`: a linha de cada pendente e o `_texto` por tipo (F19).
- `persona.py`: o bloco "Reagendar" (F19), nomeando a ferramenta pelo valor do
  domínio (o teste de hoje faz isso para `create_mission`).

## Idempotência, reenvio e concorrência — o que os testes provam

- Reenvio sequencial: mesma chave → mesmo corpo `200`, uma linha em
  `mission_operations` e, no reagendamento, uma em `mission_reschedules`.
- Chave cruzada: a chave de um Concluir mandada ao Iniciar (e vice-versa, e
  ao Reagendar) → `409 operacao_reutilizada`.
- Concorrência (conexões reais, `threading.Barrier`, sem `sleep`):
  dois inícios com chaves diferentes → um inicia, o outro `transicao_ilegal`;
  início e conclusão juntos → o estado final é `concluida` e, se o início
  venceu, `started_at <= completed_at`; dois reagendamentos com chaves
  diferentes → duas linhas encadeadas; reagendamento e conclusão juntos →
  nunca um reagendamento gravado depois da conclusão; o mesmo reagendamento
  reenviado em paralelo → uma linha; duas confirmações da mesma proposta com
  chaves diferentes → um reagendamento só.
- Relógio: o `rescheduled_at` e o `started_at` são o relógio lido com a linha
  já travada (a sonda de `test_relogio_e_lido_com_a_linha_ja_travada`).

## O que a tela mostra

No cartão da missão (`MissionCard`, quadro de avulsas e Missão de hoje):

- **Pendente e disponível:** o botão **Iniciar** (nome acessível completando a
  missão, como o Concluir), ao lado do Concluir. Enquanto voa, "Iniciando…",
  desabilitado; a região viva anuncia "Missão iniciada." no sucesso.
- **Em andamento:** o rótulo "Em andamento" (o que `MISSION_STATE_LABELS` já
  tem) e a linha **"Iniciada em 01/10/2026 14:03"** (`formatDeadline`, em São
  Paulo). O Concluir continua ali.
- **Concluída com início:** a "Duração real" que o cartão já sabe mostrar.
- **Avulsa não concluída:** o disclosure **"Reagendar prazo"**
  (`aria-expanded`), com o campo **"Novo prazo (horário de Brasília)"**
  preenchido com o prazo atual, o grupo **"Por que reagendar?"** (`fieldset`
  com três botões de opção: Dificuldade, Falta de tempo, Mudança de
  prioridade — nenhum marcado) e **"Salvar novo prazo"**, desabilitado até
  haver prazo e motivo. Falha com mensagem por `code`; o formulário e o que foi
  digitado ficam.
- **Histórico:** com pelo menos um reagendamento, a linha **"Reagendada 2
  vezes"** e um `<details>` "Histórico de prazos" com uma linha por
  reagendamento: "02/10/2026 18:00 → 05/10/2026 18:00 · Falta de tempo · por
  você" (ou "· proposto pela Tifa"). Sem cor como único sinal.
- **Na Tifa:** o cartão "Proposta de reagendamento" com a missão
  (`instructions` do retrato), "Prazo atual" e "Prazo proposto" (`<time>`), o
  motivo em texto, Confirmar e Recusar; executada → "Prazo reagendado" e "Ver
  no Quartel-General"; falhou → o texto do `prazo_expirado` ou "A missão mudou
  desde a proposta e não pôde ser reagendada. Peça à Tifa uma nova proposta.".

Textos de falha (mapas exaustivos por `code`, no padrão de
`completionFailure.ts`):

| Ação | `code` | Texto | Saída |
|---|---|---|---|
| Iniciar | `transicao_ilegal` | "Esta missão já foi iniciada ou concluída. Atualize para ver o estado atual." | atualizar |
| Iniciar | `missao_expirada` | "O prazo desta missão já terminou e ela não pode mais ser iniciada. Atualize para ver o estado atual." | atualizar |
| Iniciar | `missao_nao_encontrada` | "Esta missão não está mais disponível. Atualize para ver o estado atual." | atualizar |
| Iniciar | `operacao_reutilizada` | "Não foi possível registrar esta tentativa. Tente de novo." | nova chave |
| Iniciar | outro / rede | "Não foi possível confirmar o início. Tentar de novo é seguro: a missão não será iniciada duas vezes." | mesma chave |
| Reagendar | `prazo_expirado` | "O novo prazo precisa estar no futuro." | corrigir |
| Reagendar | `prazo_inalterado` | "O novo prazo é igual ao atual. Escolha outro horário." | corrigir |
| Reagendar | `transicao_ilegal` | "Esta missão já foi concluída e não pode ser reagendada. Atualize para ver o estado atual." | atualizar |
| Reagendar | `prazo_derivado` | "O prazo desta missão vem do plano da semana e não pode ser reagendado." | atualizar |
| Reagendar | `missao_nao_encontrada` | "Esta missão não está mais disponível. Atualize para ver o estado atual." | atualizar |
| Reagendar | `operacao_reutilizada` | "Não foi possível registrar esta tentativa. Tente de novo." | nova chave |
| Reagendar | `422` sem `code` | "O novo prazo não foi aceito. Revise a data e o motivo." | corrigir |
| Reagendar | outro / rede | "Não foi possível confirmar o reagendamento. Tentar de novo é seguro: o prazo não mudará duas vezes." | mesma chave |

"Corrigir" libera a chave (nada foi gravado) e deixa o formulário; "mesma
chave" retém a chave no registro.

## Testes (regra da casa)

Todo teste novo é visto **reprovando** antes do código (RED) e, depois, por
**mutação** da guarda que ele prova. Camadas: domínio puro; migração (ida e
volta; cada restrição nova dizendo não por `INSERT` cru, com o nome; o
downgrade falhando alto); serviço e API de iniciar e reagendar (sucesso,
reenvio, chave cruzada, cada erro da tabela); concorrência com conexões
reais; provedor contra o servidor falso (as duas ferramentas na requisição, o
nome na `Proposta`); tutoria (proposta válida, fora do esquema, com
pré-condição falha, confirmação com cada desfecho, reenvio da confirmação);
contexto e persona; frontend (hooks, mapas, cartão, cartão de proposta,
conversão de fuso rodando com o processo em `Asia/Tokyo`); **E2E** do início,
do reagendamento pela tela e da proposta da Tifa confirmada, com axe.

## Riscos

| Risco | Mitigação |
|---|---|
| O modelo real, com duas ferramentas, propor reagendamento onde devia propor missão (ou o contrário) | Nada muda sem confirmação (F15); a pré-condição recusa missão inexistente (F16). **Não medido por chamada real** (pendência 109) |
| O retrato da proposta envelhecer antes da confirmação | A confirmação revalida tudo e grava `reagendamento_invalido` (F17); o cartão mostra o prazo "de quando a Tifa propôs" (pendência 114) |
| Espera circular entre confirmação, reagendamento, conclusão e avaliação | Ordem única das travas (F14), com os testes de concorrência cruzados |
| A conversão de fuso errar num dia de horário de verão | Função pura, sem deslocamento fixo, com caso de teste em 2018 (SP em −02:00) e o processo de teste em `Asia/Tokyo` |
| As guardas de `downgrade` da `0005` passarem a esbarrar na `0006` | Os testes da `0005` descem pela cadeia (`_anterior_a_0005`); a `0006` só recusa com dados dela, que aqueles testes não criam. Conferir que continuam verdes sem mudança (Task 2) |

## Pendências que o F cria (numeradas para a Task de documentação)

- **109** — A conversa com **duas** ferramentas não foi medida contra a API
  real; a referência da camada 3 é de uma ferramenta só.
- **110** — Sem limite de reagendamentos (F11), decisão do dono.
- **111** — Sem pausa nem sessões: a duração real conta o tempo parado (F5).
- **112** — O rascunho do reagendamento não sobrevive à recarga do quadro
  (F20).
- **113** — Diária e especial não se reagendam (F7); replanejar a semana é do
  `propose_plan`.
- **114** — O retrato da proposta de reagendamento pode estar velho na hora de
  confirmar (F16).

E o F **resolve** a pendência **3** (iniciar) e toca, sem resolver, a **47**
(a confirmação revalida o `payload` guardado — agora também o do
reagendamento), a **55** (a Tifa continua sem ver o ciclo) e a **96** (o N+1
ganha a lista `reschedules`).

## Para o dono decidir

Nenhum destes bloqueia o plano: cada um tem o padrão escolhido entre
parênteses.

1. **Limite de reagendamentos por missão** (padrão: nenhum, F11). Um limite
   daria firmeza à cobrança, ao custo de travar quem precisa.
2. **Motivo obrigatório e em três valores fixos** (padrão: sim, F10). Um texto
   livre opcional ao lado do motivo é barato de acrescentar depois.
3. **Reagendar só avulsa** (padrão: sim, F7). Mover uma diária é replanejar a
   semana.
4. **Antecipar prazo** (padrão: permitido, F9).
5. **A chamada real com as duas ferramentas** (pendência 109), pelo dono, com
   a chave do Keychain — o mesmo roteiro da pendência 42.

## Entregas de documentação

- `docs/HANDOFF.md`: revisão-base do F; as decisões F1–F24; os dois endpoints
  e a ferramenta nova, com o motivo (AGENTS.md §4); a migração `0006` e a
  ordem de implantação (parar a API, migrar, subir: o código anterior ao F
  grava `kind` que o `CHECK` novo aceita, mas não conhece `reschedule_mission`
  na leitura da conversa); pendência 3 riscada; 109–114 novas; 47, 55 e 96
  atualizadas; nenhuma dependência nova.
- `docs/ARCHITECTURE.md`: a árvore; o contrato HTTP de iniciar e reagendar; a
  ferramenta nova na tutoria; a ordem das travas (F14).
- `docs/QUALITY.md` §9: a conversa com duas ferramentas no falso.
