# wt/user-modulo: `User` passa a morar no módulo `users` (pendência 8) — 2026-11-12

Objetivo: refactor puro. O modelo `User` saiu de `modules/missions/models.py` para
`modules/users/models.py`, o módulo que já cuidava do usuário (idioma e `/api/me`).
Nenhum comportamento muda: o esquema, as migrações, a API e o front ficam iguais.
Revisão-base: `daae7a2` (main). Resolve a pendência 8.

## Declarações

- Zero dependência, endpoint, migração ou mudança de contrato. Nenhum teste
  pulado, limiar intacto, nenhum hook tocado. A tabela `users` continua registrada
  uma única vez em `Base.metadata`.

## Decisão: direção do import

As tabelas de `missions` apontam para `users.id`, e o SQLAlchemy precisa do alvo
registrado em `Base.metadata` para configurar os mappers. Por isso
`missions/models.py` importa `focusquest.modules.users.models`, só pelo efeito
colateral de registrar a tabela, e `users` não importa nada de `missions`. Antes
era o contrário: `users.service` importava `User` de `missions.models`. Agora a
dependência aponta de quem tem a chave estrangeira para o dono da tabela.

## Alterações

- `src/focusquest/modules/users/models.py` (novo): `User` e o CHECK
  `ck_users_locale`, movidos sem mudança.
- `src/focusquest/modules/missions/models.py`: a classe e `_IDIOMAS_SQL` saem;
  entra o import de registro de `users.models`.
- `alembic/env.py`: importa `users.models` explicitamente, junto dos outros.
- Imports de `User` trocados para `users.models` em 3 services e 17 testes.
- `docs/ARCHITECTURE.md`: os três trechos que diziam que `User` morava em
  `missions/models.py`.
