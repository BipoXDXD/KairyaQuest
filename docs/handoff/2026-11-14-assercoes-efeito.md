# Testes que provam o efeito, não só o status

## Objetivo
Itens médios de testes da guarda-chuva #208: testes de recusa e de rejeição
que afirmavam só o status HTTP passam a reler o banco, e trechos sem caso de
borda ou sem valor literal ganham o teste que faltava. Nenhum código de
produção muda.

Revisão-base: `main` em `fb7d11b`.

## Decisões e porquê
- **Reler o banco depois da recusa.** Recusar uma ação da tutoria (proposta
  de missão e de reagendamento) afirmava só `state`/`decided_at`. Agora o
  teste confere que a contagem de missões não mudou, que o prazo e o estado
  da missão reagendável ficaram iguais, que nenhuma `MissionOperation` nasceu
  e que a ação ficou `recusada` sem `mission_id` nem `operation_id`.
- **422 e 409 do plano sem gravação.** As rejeições do plano semanal (422 de
  validação, 409 de semana fora do alcance, ano 9999) conferem que
  `weekly_plans` e `missions` continuam vazias. O 409 de plano repetido
  ficou como estava: reler a sessão compartilhada depois do
  `UniqueViolation` cai em `PendingRollbackError`, e a constraint `UNIQUE`
  já garante que não há duplicata.
- **Bordas do plano.** Mínimos (1, 1, 1) e máximos (5, 1440, 1440) são
  aceitos e gravados como vieram, conferidos relendo as missões.
- **Teto do id na avaliação.** `0`, `-1` e `2**31` respondem 422 antes do
  banco; `2**31 - 1` (o maior `integer` do PostgreSQL) ainda é 404 de
  inexistente, com o mesmo corpo da conclusão.
- **Curva de XP com valores literais.** `[20, 40, 80, 140, 220]` para as
  dificuldades 1 a 5, calculados à mão; os testes antigos só afirmavam que a
  curva cresce e é positiva.
- **Janela do histórico da tutoria.** Com `historico=3`, a primeira troca
  fica fora do turno; todos os testes usavam a janela de 20.
- **Histórico de outro usuário.** Mensagens de outro usuário não aparecem na
  listagem do serviço nem no contexto enviado ao modelo; o teste HTTP da
  listagem passou a afirmar status 200, o conjunto exato de chaves da
  mensagem e da ação, e a ausência da mensagem alheia.
- **Fora deste incremento.** Os itens médios de testes do frontend ficam
  para um PR do front: este mexe só na suíte Python.

## Alterações
- `tests/integration/test_tutoring_acoes.py`, `test_tutoring_api.py`,
  `test_tutoring_reagendamento.py`: recusas relendo o banco.
- `tests/integration/test_cycle_api.py`: rejeições sem gravação e bordas.
- `tests/integration/test_evaluation_api.py`: faixa e teto do id.
- `tests/unit/test_missions_domain.py`: curva de XP literal.
- `tests/integration/test_tutoring_service.py`: janela do histórico e
  mensagens de outro usuário.

## Comandos e resultados
- Sabotagem, cada uma revertida com `git restore src/`:
  - recusa criando missão ou movendo o prazo → os 4 testes de recusa
    reprovam;
  - faixas do plano exclusivas (`gt`/`lt`) → os dois casos de borda
    reprovam;
  - `flush` do plano antes da checagem da semana → os dois 409 e o caso
    9999 reprovam;
  - sem o teto do id → os 3 casos fora da faixa reprovam; `le=MAIOR-1` →
    o caso do teto reprova;
  - `XP_INCREMENTO = 11` → a curva reprova;
  - sem `.limit(quantas)` no histórico → a janela reprova;
  - sem o filtro de usuário na listagem → o teste do serviço e o HTTP
    reprovam; sem o filtro no histórico → o teste do serviço reprova.
- Sem sabotagem possível nos 422 do plano: a validação acontece no
  pydantic, antes do handler, e não há gravação para provocar.
- Verde: pytest dos sete arquivos afetados, 242 passed; Ruff, `ruff format
  --check` e mypy estrito (`src tests alembic`) limpos.

## Pendências
- Itens médios de testes do frontend na #208, num PR próprio.
