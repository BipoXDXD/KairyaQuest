# wt/f5-conquistas: `first_pass`, `weekly_trial` e `comeback` derivadas na leitura (F5 Tarefa 5.2) — 2026-11-11

Objetivo: três conquistas novas no painel, sem gravar nada. Revisão-base:
`1e757af` (branch `wt/f5-faixas`, Tarefa 5.1). Plano:
`docs/superpowers/plans/2026-11-11-f5-gamificacao.md` (Tarefa 5.2).

## Declarações

- Zero dependência nova (nem de runtime, nem de dev).
- Zero endpoint novo.
- Zero migração, zero coluna nova, zero job. O CHECK
  `ck_user_achievements_code` e a migração 0004 não mudam: a tabela
  `user_achievements` continua guardando só as sete conquistas atuais.

## Delta de contrato (aditivo)

- `GET /api/progress`: `achievements` passa de 7 para 10 itens, na ordem das sete
  atuais e depois `first_pass`, `weekly_trial`, `comeback`. Cada item mantém os
  mesmos quatro campos (`code`, `title`, `description`, `unlocked_at`).
- `reward.achievements_unlocked` (conclusão da missão e bônus da avaliação)
  pode trazer os códigos novos: `weekly_trial` e `comeback` na conclusão que os
  causou, `first_pass` no bônus da avaliação que o causou, só a primeira vez.
  O formato do corpo e dos itens não muda; só os valores possíveis.

### Por que o contrato muda, e por que sem persistir

O painel precisa mostrar as três; a spec manda derivar na leitura. Os códigos
ficam fora de `Codigo` (R2): o CHECK da tabela é montado de `Codigo`, então
incluí-los exigiria migração e backfill. Se o dono quiser persistir depois, a
derivação continua valendo e a migração entra como expand, sem retrabalho de
regra. O anúncio em `achievements_unlocked` existe porque a Fase 8 (fala da
Kairya) lê esse campo para saber que houve conquista; sem ele as novas só
apareceriam no painel (R7).

## Decisões

- **R2.** `CodigoDerivado`, `ConquistaDerivada`, `CATALOGO_DERIVADO` e
  `PAINEL = CATALOGO + CATALOGO_DERIVADO` (10 itens) em `domain.py`.
  `Codigo`, `CATALOGO`, `registrar_conclusao` e `conquistas_satisfeitas` não
  mudaram.
- **R3.** Ordem do painel: as sete atuais e depois as três derivadas.
- **R4, `comeback`.** `indice_da_volta` (domínio puro) recebe a data civil
  (São Paulo) de cada diária concluída, em ordem, e os dias planejados
  (`carregar_historico`, `dia >= plano_criado_em`). A conclusão `i >= 1` é a
  volta quando 3 ou mais dias planejados caem estritamente entre a anterior e
  ela. Dia sem plano, de semana sem plano ou anterior à criação do plano não
  conta; quem ainda não concluiu nenhuma diária não "volta"; vale a primeira
  volta e só diárias. Como a lista de conclusões só cresce no fim, a conquista
  nunca é revogada nem muda de instante: uma conclusão tardia da diária de
  ontem não a desfaz, e o reenvio da conclusão devolve o mesmo corpo.
- **R5, `first_pass`.** Primeira avaliação `concluida` com veredito `atende`
  (menor `finished_at`, empate por `id`); `unlocked_at` é o `finished_at`.
  Anunciada em `recompensa_do_bonus`.
- **R6, `weekly_trial`.** Primeira especial concluída (menor `completed_at`,
  empate por `id`); `unlocked_at` é o `completed_at`. Anunciada em
  `recompensa_da_missao` da especial.
- **R7.** Só a primeira vez anuncia: a segunda especial e a segunda avaliação
  `atende` devolvem `achievements_unlocked` sem o código; os fatos de outro
  usuário não contam.
- **R8.** As derivadas são lidas em comandos separados do saldo, no mesmo
  request. Uma conclusão que comite entre os comandos pode mostrar, num
  refresh, uma conquista nova com o saldo antigo; o refresh seguinte corrige.
- **R13.** Texto em `CATALOGO_DERIVADO` (pt-BR, fallback do leitor tolerante) e
  no catálogo do front (`progression.achievement.<code>.{title,description}`,
  pt-BR e en, mesmas chaves). `test_conquistas_paridade_i18n.py` passou a
  cobrir o `PAINEL`.
- `registrar_bonus` (E15): o comentário agora diz que nenhum fato do catálogo
  **persistido** muda com o bônus.

## Testes existentes que mudaram, e por quê

Nenhuma expectativa foi enfraquecida: o contrato ganhou itens e os testes que
enumeravam o painel passaram a enumerar o `PAINEL`.

- `test_progression_consistency.py`: `== list(CATALOGO)` e `[None] * len(CATALOGO)`
  viraram `PAINEL`; as listas de `unlocked_at` ganharam três `None` (as
  derivadas ficam travadas nesses cenários).
- `test_progression_api.py`: `_ACHIEVEMENTS_TRAVADOS` sai de `PAINEL`.
- `test_evaluation_api.py::test_atende_devolve_o_corpo_da_spec`: o corpo do
  bônus da primeira avaliação `atende` agora traz `first_pass` com `code`,
  `title` e `description` do catálogo derivado.
- `test_progression_service.py::test_ler_progresso_sem_conclusoes`: compara com
  o `PAINEL`.
- `test_conquistas_paridade_i18n.py`: parametrizado por `PAINEL`.
- `frontend/tests/e2e/cycle.spec.ts` (painel de conquistas): a lista de
  `data-code` esperada ganhou `first_pass`, `weekly_trial` e `comeback`.
- `test_o_bonus_nao_destrava_conquista`, `test_recompensa_do_bonus_e_o_saldo_daquele_momento`
  e os testes de migração e de paridade de esquema não mudaram.

## Alterações

- Back: `progression/domain.py` (tipos derivados, `PAINEL`,
  `DIAS_SEM_CONCLUSAO_DA_VOLTA`, `indice_da_volta`), `service.py`
  (`DesbloqueioDerivado`, `_desbloqueios_derivados`, `ler_progresso` e as duas
  recompensas), `schemas.py` (`UnlockedAchievementRead.da_conquista` aceita
  `ConquistaDoPainel`).
- Front: `shared/i18n/achievementText.ts` (três códigos em `KNOWN_CODES`),
  `shared/i18n/messages/{pt-BR,en}.ts` (seis chaves).
- Testes novos: regra pura (limites 2 e 3 dias, dia sem plano, sem conclusão
  anterior, primeira volta, mesmo dia, ordem); serviço (um teste para cada
  regra, mais conclusão tardia, só a primeira vez, só o usuário, nunca
  gravadas); front (`achievementText`, `RewardAnnouncement`, `ProgressPanel`).

## Pendências

- Fase 8: ligar a fala da Kairya a `achievements_unlocked` (que agora pode
  trazer as derivadas).
