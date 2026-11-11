# Pendência 165: elo do histórico de reagendamentos — 2026-11-11

Objetivo: o banco passa a recusar um reagendamento amarrado a uma operação de
outro tipo (`complete`, `start`) ou de outra missão. Antes, só o serviço
garantia isso. Revisão-base: `980e314` (`origin/main`).

A linha 165 da tabela de pendências do `docs/HANDOFF.md` fica **resolvida por
este arquivo**; a consolidação a risca lá. O texto da pendência não indicava
opção recomendada, então vale a decisão abaixo.

## Decisão da coordenação

- **Escolhida:** FK composta. Nova migração `0010`:
  - `mission_operations` ganha `UNIQUE (operation_id, mission_id, kind)`
    (`uq_mission_operations_vinculo`), o alvo que o PostgreSQL exige;
  - `mission_reschedules` ganha `operation_kind` (`NOT NULL`,
    `server_default 'reschedule'`) com `CHECK operation_kind = 'reschedule'`
    (`ck_mission_reschedules_operation_kind`);
  - a FK simples `mission_reschedules_operation_id_fkey` sai e entra
    `fk_mission_reschedules_operacao`: `(operation_id, mission_id,
    operation_kind)` → `(operation_id, mission_id, kind)`, `ON DELETE CASCADE`.
- **Expand-safe:** o código da revisão anterior não conhece `operation_kind` e
  continua inserindo (o default preenche). O serviço não mudou.
- **Linhas legadas inconsistentes:** o upgrade lê antes de qualquer DDL e para
  com `RuntimeError` listando as chaves (até 20). Nenhuma é corrigida ou
  apagada sozinha. Offline (`--sql`) a leitura é pulada.
- **Downgrade funcional, sem guarda de dados:** devolve a FK simples e remove o
  UNIQUE, o CHECK e a coluna. O histórico fica inteiro.
- **Recusadas:**
  - só um `CHECK`: não consegue olhar outra tabela, então não prova a missão
    nem o tipo da operação referenciada;
  - trigger: lógica fora do esquema declarativo, invisível ao `compare_metadata`
    e ao modelo ORM;
  - manter também a FK simples: a composta a implica (as três colunas são
    `NOT NULL`) e as duas juntas só dobrariam a checagem;
  - coluna `mission_id` removida de `mission_reschedules` (derivá-la da
    operação): mudaria leituras e o índice `ix_mission_reschedules_mission_id`,
    fora do escopo.

## Alterações

- `alembic/versions/0010_historico_vinculo.py` (nova).
- `src/focusquest/modules/missions/models.py`: o modelo espelha a 0010
  (`operation_kind`, a FK composta, o CHECK e o UNIQUE novo).
- `tests/integration/test_historico_vinculo_migration.py` (nova): a inserção
  inconsistente é recusada pelo banco (operação `complete`/`start`, operação de
  outra missão, `operation_kind` diferente de `reschedule`), a consistente passa
  com o tipo `reschedule` por default, a FK composta e o CASCADE, o upgrade
  falha alto com legado inconsistente sem mudar nada, o downgrade devolve a FK
  simples e preserva o histórico.
- `tests/integration/test_migracoes_offline.py`: faixas `0009:head` e `0010:0009`.
- `tests/integration/test_acompanhamento_migration.py`: **uma** expectativa
  mudou, o nome da restrição que recusa a operação inexistente
  (`mission_reschedules_operation_id_fkey` → `fk_mission_reschedules_operacao`).
  A recusa é a mesma; a mudança do nome é consequência direta da decisão acima.

## Limitações

- A guarda do upgrade só enxerga o que existia na hora: não há como o PR provar
  o estado do banco de produção. Se houver linha legada inconsistente, o
  deploy para com a mensagem e a correção é manual.
