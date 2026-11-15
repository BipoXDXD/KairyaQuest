# Fallback da tutoria desligado por padrão

## Objetivo
Alinhar o código ao `docs/ARCHITECTURE.md`: o fallback do lado do servidor
para a recusa (beta da Anthropic, pendência 174) passa a ser desligado por
padrão. Refazer a pergunta recusada em outro modelo tem custo próprio, então
só acontece quando a configuração o liga de propósito. Item da guarda-chuva
#208 (divergência entre a documentação e o código do fallback).

Revisão-base: `main` em `fb7d11b`.

## Decisões e porquê
- **Padrão no código, não no ambiente.** `Settings.tutor_fallback` passa de
  `True` para `False`, e o `.env.example` acompanha (`false`). Uma instalação
  sem `FOCUSQUEST_TUTOR_FALLBACK` deixa de pedir `fallbacks` e o beta;
  `FOCUSQUEST_TUTOR_FALLBACK=true` continua ligando.
- **O caminho ligado continua testado.** A fixture `tutoria` dos testes de
  integração monta o adaptador com `fallback=True` de propósito, para que os
  testes do bloco `fallback` sigam exercitando o caminho; o comentário dela
  deixou de chamar isso de padrão.
- **O teste de "valor fora do padrão" inverteu.** Em
  `test_get_tutoria_repassa_esforco_e_fallback_ao_pedido`, o valor fora do
  padrão agora é `true`, e o teste afirma `fallbacks="default"` e o beta no
  pedido. Um `fallback=False` fixo na fiação passaria em todos os outros
  testes, porque coincide com o padrão.
- **ARCHITECTURE.md:** "Fallback histórico, desativado em produção" virou
  "Fallback opcional, desligado por padrão", com a variável que o liga.

## Alterações
- `src/focusquest/core/config.py`: padrão `False` e comentário.
- `.env.example`: `FOCUSQUEST_TUTOR_FALLBACK=false` e comentário.
- `src/focusquest/modules/tutoring/anthropic_provider.py`: o comentário do
  beta aponta o padrão desligado como saída para um 400 do beta.
- `tests/unit/test_config.py`: o padrão esperado é `False` (a paridade com o
  `.env.example` já existia e cobre a linha nova).
- `tests/integration/test_tutoring_api.py`: teste novo
  `test_get_tutoria_sem_a_variavel_nao_pede_fallback` (sem a variável, o
  pedido sai sem `fallbacks` e sem o cabeçalho do beta); o parametrizado
  `false`/`true` continua.
- `tests/unit/test_tutoring_dependencies.py` e
  `tests/integration/conftest.py`: ajustes descritos acima.
- `docs/ARCHITECTURE.md`: título do parágrafo do fallback.

## Comandos e resultados
- Vermelho primeiro: `test_padroes_da_tutoria` e o teste novo reprovaram com
  o padrão antigo (o pedido saía com `fallbacks`).
- Verde: pytest de `test_config`, `test_tutoring_dependencies`,
  `test_anthropic_provider` (unit e integração) e `test_tutoring_api`, 124
  passed; Ruff, `ruff format --check` e mypy estrito (`src tests alembic`)
  limpos.
- `make check` completo nos hooks de commit e de push.

## Pendências
- `docs/HANDOFF.md` ainda cita `tutor_fallback=true` como padrão; a
  consolidação corrige.
