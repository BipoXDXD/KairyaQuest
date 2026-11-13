# Medição de ReDoS, exclusão de cobertura morta e limite do Scheduler lento

## Objetivo
Resolver três issues de teste e cobertura: #198 (a medição de ReDoS em
`tests/unit/test_varrer_traces.py` confundia falha comum do filho com estouro
de CPU), #168 (a exclusão `src/**/*.d.ts` da cobertura do front não tinha
efeito) e #200 (testes de front reprovando com o Scheduler do React atrasado
em 600 ms por tarefa).

Revisão-base: `0067e2f` (origin/main).

## Decisões e porquê
- **#198:** só `-SIGXCPU` e `-SIGKILL` contam como ReDoS (`MORTES_POR_CPU`).
  Com o limite brando igual ao rígido, o Linux pode entregar qualquer um dos
  dois; o macOS entrega SIGXCPU. Qualquer outro código diferente de 0 reprova o
  teste com o `stderr` do filho, para que a sabotagem não passe sem medir.
- **#168:** a exclusão saiu, e uma fitness function
  (`tests/unit/test_exclusoes_de_cobertura.py`) reprova qualquer exclusão de
  `coverage.exclude` que não case com ao menos um arquivo de
  `frontend/src` (lida do disco: dentro do hook de commit o `git ls-files`
  não devolvia nada). Sem ela, a próxima exclusão morta passaria do mesmo jeito.
- **#200:** registrado que o limite suportado é 250 ms por tarefa (abaixo de
  500 ms), em vez de reescrever os testes. Medição desta sessão: uma
  atualização vinda de fora do `act` custa no mínimo duas tarefas do Scheduler
  até ficar observável (o commit e, em seguida, os efeitos passivos; o
  `renderHook` da Testing Library publica `result.current` num efeito
  passivo). Rastreado com um `setImmediate` instrumentado: a 600 ms, a primeira
  tarefa sai ~28 ms depois da montagem, a segunda é reagendada de dentro da
  primeira, e o `history` só aparece como `loaded` depois dela (~1270 ms). Com
  duas tarefas, N ≥ 500 ms já soma o prazo padrão de 1000 ms; passar exigiria
  aumentar o prazo, retry ou sleep, e os três são proibidos pela issue.
  Também foi descartada a hipótese de a reprodução atrasar o corpo do `fetch`:
  atrasar só o `setImmediate` que o Scheduler captura dá o mesmo resultado (42
  reprovam a 600 ms) e o `Response.json()` leva 2 a 6 ms nos dois casos.

## Alterações
- `tests/unit/test_varrer_traces.py`: `MORTES_POR_CPU`, o `pytest.fail` com o
  `stderr` e o teste `test_medicao_reprova_filho_que_quebra_por_outro_motivo`.
- `tests/unit/test_exclusoes_de_cobertura.py` (novo).
- `frontend/vite.config.ts`: sem `src/**/*.d.ts` em `coverage.exclude`.
- `docs/QUALITY.md`: linha da tabela do §3 removida, parágrafo da regra nova
  no §3 e o limite do Scheduler lento no §6.

## Comandos
- `uv run pytest -q --no-cov tests/unit/test_varrer_traces.py -k medicao` (vermelho antes da correção: `DID NOT RAISE Failed`).
- `uv run pytest -q --no-cov tests/unit/test_exclusoes_de_cobertura.py` (vermelho antes: `Left contains one more item: 'src/**/*.d.ts'`).
- Reprodução do Scheduler lento (config e setup temporários, fora do commit, como em `docs/handoff/2026-11-12-flaky-latente.md`), `--maxWorkers=4`.

## Resultados
| Cenário | Resultado |
|---|---|
| Scheduler 250 ms, suíte inteira | 136 arquivos, 2819 testes passam |
| Scheduler 400 ms, os três arquivos | 100 de 100 passam |
| Scheduler 500 ms, os três arquivos | 40 reprovam |
| Scheduler 600 ms, os três arquivos | 42 reprovam (o mesmo número da issue) |

O resultado do `make check` está no PR (rodado pelo hook do commit).

## Pendências
- A config lenta continua fora do repositório; um teste novo com espera
  encadeada só será pego por quem a rodar de novo.
