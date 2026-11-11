# Idioma do usuário no back: `users.locale` e `/api/me` (F3, Task 3) — 2026-11-10

Base: `c0a5eb4`. Migração `0009_user_locale` (`down_revision = "0008"`; o
contract da Tarefa 2.2 passa a ser a `0010`). Acrescenta `users.locale`
(`text`, CHECK `ck_users_locale`: `locale IN ('pt-BR', 'en')`). As linhas
existentes ficam `NULL`. O downgrade remove o CHECK e a coluna, e perde só a
preferência de idioma.

**Endpoint novo: `GET` e `PATCH /api/me`.** O front precisa ler e gravar o
idioma escolhido, e nenhum endpoint existente fala do usuário: `/api/progress`
é saldo e conquistas, e pôr a preferência ali misturaria leitura agregada com
escrita de configuração. `GET` devolve exatamente `{"display_name", "locale"}`,
com `"locale": null` para quem nunca escolheu. `PATCH` aceita só
`{"locale": "pt-BR" | "en"}` e devolve o mesmo corpo do `GET`. O `null` não é
aceito no `PATCH`: não existe "desescolher". Campo extra (`display_name`,
`id`, `role`...) → 400 `{"detail", "code": "campo_desconhecido"}`, com corpo
fixo que não ecoa o campo. Valor fora da lista ou corpo que não é objeto →
422 no formato nativo. Com extra e valor inválido juntos, vence o 400.

**Como sai o 400.** O handler global de `RequestValidationError` segue em 422
para toda a API. O router de `users` usa a `APIRoute` própria
`RotaQueRecusaCampoExtra`, que captura o `RequestValidationError` e, se algum
erro for `extra_forbidden`, levanta `CampoDesconhecidoError` (`core/errors.py`).
`main.py` traduz em 400 (`CodigoDeErro.CAMPO_DESCONHECIDO`), e a tradução HTTP
continua num arquivo só.

**Sem `If-Match`.** O `PATCH` grava um único valor escolhido pela própria
pessoa, num `UPDATE` atômico e idempotente: a última escolha vence, e não há
leitura-modificação-escrita que um ETag protegeria. Com autenticação e mais
campos editáveis, a decisão volta.

**Por que `User` continua em `missions/models.py`.** As tabelas de `missions`
apontam para `users.id`; com a classe em `users`, `missions` passaria a
importar `users` só para resolver a chave estrangeira. `users/service.py` lê
`display_name` e `locale` e escreve só `locale`.

**Desvio da spec (3.3).** A spec pede `users.locale` "not null default".
Aqui a coluna é anulável e sem default: com default, o servidor não distingue
"escolheu `pt-BR`" de "nunca escolheu", e a detecção por `navigator.language`
da §6 nunca valeria. O fallback do back para `pt-BR` mora só em
`users.service.ler_idioma` (`IDIOMA_PADRAO`). `Idioma` (`core/idioma.py`) fica
no `core` porque `tutoring`, `evaluation` e `users` o usam.

**Implantação.** A 0009 só acrescenta: a API antiga ignora a coluna e o CHECK
aceita `NULL`, então a ordem migrar → subir a API nova não tem janela de
erro. Rollback de código não exige downgrade.

**Desvio do plano: `RETURNING` em vez de `rowcount`.** `atualizar_idioma`
confere a linha afetada por `UPDATE ... RETURNING display_name` (exatamente
uma, senão `RuntimeError`), e não por `rowcount`. O motivo é o mypy estrito:
`Session.execute(update(...))` é tipado como `Result`, que não tem `rowcount`.
A semântica é a mesma e a resposta sai sem segunda consulta.

Validação no worktree, sem banco, com `UV_PYTHON=3.14.10` (resultados lidos
na saída de cada comando):

- `uv run pytest tests/unit -q` → `475 passed, 32 subtests passed`
  (inclui `test_idioma.py` e `test_me_validacao.py`);
- `uv run ruff check .` → `All checks passed!`;
- `uv run ruff format --check .` → `181 files already formatted`;
- `uv run mypy src tests alembic` → `Success: no issues found in 174 source
  files`;
- `uv run alembic upgrade 0008:0009 --sql` e `downgrade 0009:0008 --sql`
  (offline) → o `ADD COLUMN`/`ADD CONSTRAINT` e o `DROP CONSTRAINT`/`DROP
  COLUMN` esperados; `alembic heads` → `0009 (head)`.

Os testes de integração (`tests/integration/test_me_api.py`) e de migração
(`tests/integration/test_user_locale_migration.py`), a suíte de integração
inteira e a cobertura de 100% precisam de PostgreSQL e não rodaram no
worktree. Eles rodam no `make check` completo do hook de commit, com um
PostgreSQL efêmero: este registro só entra no histórico se esse gate passar.
As contagens do gate ficam na descrição do PR.

**Tabela de endpoints do `docs/HANDOFF.md`.** A consolidação acrescenta a
linha:

| `/api/me` (GET/PATCH) | Ler e gravar o idioma escolhido (F3); `null` = nunca escolheu. Nenhum endpoint existente fala do usuário. |

**Movido para cá.** Esta seção ficava no `docs/HANDOFF.md`; saiu de lá na
atualização com a `main` que trouxe a regra do `docs/handoff/` (#81).
