# Dispose da engine no shutdown — 2026-11-11

Objetivo: resolver o resíduo da pendência 14 de `docs/HANDOFF.md` ("Engine
global/lazy, sem dispose no shutdown"). A corrida já estava resolvida (trava
com dupla checagem em `get_engine`); faltava fechar o pool ao desligar.
Revisão-base: `9c8577e` (`origin/main`). **A linha 14 da tabela de pendências
fica resolvida por este arquivo** e deve ser riscada na consolidação.

## Decisões

- Confirmado por `git grep` na `main`: não existia `descartar_engine` nem
  `dispose` de engine em `src/` (só em testes).
- Nova `descartar_engine()` em `src/focusquest/core/database.py`: sob a mesma
  trava do `get_engine`, troca `_engine` por `None` e chama `dispose()` fora
  da trava. Sem engine criada é no-op; chamada repetida descarta uma vez só;
  o `get_engine` seguinte cria outra engine.
- `_ciclo_de_vida` (`main.py`) chama `descartar_engine()` no `finally`, antes
  de restaurar o log, num `try/finally` interno: erro ao fechar o pool não
  impede restaurar handlers e nível. Exceção autorizada pela coordenação para
  este item: a edição em `main.py` se limita ao lifespan.
- Criação continua preguiçosa. A partida não cria engine nem toca no banco,
  então a liveness (`/health`) segue sem configuração e sem banco. Mover a
  criação para o lifespan foi recusado: mudaria o `/health` sem configuração.
- Nenhuma rota mudou de comportamento.
- Um teste existente mudou de expectativa, com justificativa:
  `tests/integration/test_health.py::test_ready_resolve_engine_real_sem_override_e_reaproveita`
  afirmava, DEPOIS de sair do `with TestClient(app)`, que `database._engine`
  seguia sendo a engine criada. Essa era a ausência de dispose que a pendência
  14 descreve; agora a reutilização é afirmada DENTRO do `with` e, ao sair, a
  referência é `None`. O teste foi renomeado
  (`..._reaproveita_e_descarta_no_fim`). A falha apareceu no primeiro
  `make check` (1 falha, 1909 passaram).

## Alterações

- `src/focusquest/core/database.py`: `descartar_engine`.
- `src/focusquest/main.py`: import e chamada no `finally` do lifespan.
- `tests/unit/test_descartar_engine.py` (novo, 9 testes, sem banco): no-op sem
  engine; `dispose` + referência zerada; idempotência; `get_engine` recria;
  descarte espera a trava da criação; lifespan descarta na saída e não toca na
  engine na partida; descarta mesmo se o corpo levanta; erro no `dispose` não
  impede restaurar o log; `/health` não cria engine.

## Verificação

Ver o corpo do PR para os comandos e o resultado do `make check`.

## Pendências

Nenhuma nova. Pendência 14 resolvida.
