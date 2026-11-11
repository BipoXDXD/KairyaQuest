# Testes instáveis sob carga — 2026-11-10

**Objetivo.** Dois testes de integração reprovavam o gate de vez em quando,
com a máquina carregada por outros gates, e passavam sozinhos:

1. `tests/integration/test_anthropic_provider.py::test_texto_em_pedacos_e_fim`
   (`TempoEsgotadoError` numa rodada de pytest de 20 min);
2. `tests/integration/test_falso_do_e2e.py::test_o_processo_sobe_na_porta_pedida_e_responde_o_controle`
   ("o falso nao subiu em 15 s").

Este PR tira dos dois a dependência do tempo de parede sem afrouxar o que
cada um prova. É provavelmente a "possível intermitência sob carga, não
reproduzida nem investigada" registrada no `docs/HANDOFF.md` (seção da
pendência 207, parágrafo "Validação"); aquela execução não guardou o nome dos
testes, então a ligação não está provada.

**Revisão-base.** `origin/main` em `bc43845`.

## Causas

- **Adaptador.** O módulo inteiro usava `TIMEOUT = 0.3` como prazo do SDK,
  inclusive nos testes do caminho feliz. Ali o prazo não é o objeto do teste:
  é só um teto. Com a máquina carregada, o servidor falso (uma thread do
  próprio pytest) ou o cliente demoravam mais de 0,3 s entre dois eventos, o
  SDK estourava nas três tentativas e o teste reprovava sem nada errado no
  adaptador.
- **Processo do falso.** O teste subia `python -m integration.falso_do_e2e` e
  sondava a porta por até 15 s. Só o import do falso (o SDK da Anthropic e os
  modelos pydantic) leva cerca de 5,6 s com a máquina livre (medido:
  `python -c "import integration.falso_do_e2e"`, 5,648 s total); com o disco e
  a CPU disputados por outros gates, passava dos 15 s.

## Decisões

- **Prazo testado separado do teto.** `TIMEOUT_DA_DEMORA = 0.3` fica só nos
  dois testes de demora, onde o estouro é o comportamento provado;
  `TIMEOUT_FOLGADO = 30.0` é o padrão de `_provedor()` e do teste do provedor
  fora do ar. O prazo entra por parâmetro (`_provedor(..., timeout=...)`), e
  não por número solto em cada teste.
- **Linha de pronto em vez de sondagem.** `falso_do_e2e.main()` imprime
  `LINHA_DE_PRONTO` seguida da URL, com `flush`, depois que a porta já
  escuta. O teste lê essa linha do stdout e só então faz o GET de controle.
  A linha também prova a porta: ela traz a URL que o processo de fato abriu,
  e o teste compara com a pedida. O teto de 120 s
  (`TETO_DA_SUBIDA_SEGUNDOS`, o mesmo `timeout` do `webServer` do
  `playwright.config.ts`) só existe contra travamento; se o processo morrer
  antes, `readline` devolve `""` na hora e a comparação reprova sem esperar.
- O Playwright não muda: ele continua sondando a URL de controle. Como o
  `webServer` do falso tem `stdout: 'pipe'`, a linha de pronto aparece uma
  vez na saída do E2E, com o prefixo `[WebServer]`.

## Alterações

- `tests/integration/test_anthropic_provider.py`: `TIMEOUT` vira
  `TIMEOUT_DA_DEMORA` e `TIMEOUT_FOLGADO`; `_provedor()` ganha `timeout`; os
  dois testes de demora passam o prazo curto de forma explícita.
- `tests/integration/falso_do_e2e.py`: `LINHA_DE_PRONTO` e o `print` no
  `main()`.
- `tests/integration/test_falso_do_e2e.py`: `_primeira_linha()` e o teste do
  processo esperando a linha de pronto.

## Verificação

**Reprodução determinística (código original).** Com um atraso injetado de
0,4 s antes dos cabeçalhos no falso (`atrasar_cabecalhos` padrão 0,4) e de
16 s no import de `falso_do_e2e`, os dois testes reprovaram com as mesmas
mensagens do gate: `TempoEsgotadoError: o provedor demorou alem do limite` e
`AssertionError: o falso nao subiu em 15 s`. Com a correção e as mesmas
injeções, os dois passaram. Injeções revertidas.

**Reprodução por carga de CPU (código original).** 40 laços Python ocupados
em 10 núcleos, 5 repetições de cada teste: 5/5 e 5/5 aprovados. Carga só de
CPU não reproduziu; a instabilidade real veio com gates inteiros disputando
CPU, disco e memória.

**Sabotagens (uma vez, à mão, revertidas; `git diff -- src` vazio).**

- O adaptador sem `yield Delta(...)`: `test_texto_em_pedacos_e_fim` reprova.
- O adaptador com `timeout=None` no cliente: os dois testes de demora
  reprovam. O prazo curto continua sendo o objeto deles.
- `falso_do_e2e.main()` com `porta=0` no lugar da pedida: o teste do processo
  reprova na comparação da linha de pronto (porta diferente).

**Repetição sob carga (com a correção).** 40 laços Python ocupados, 20
repetições de cada teste (`carga.sh 40 20`, sob a trava do deslocamento 9):

| Teste | Aprovados |
|---|---|
| `test_o_processo_sobe_na_porta_pedida_e_responde_o_controle` | 20/20 |
| `test_texto_em_pedacos_e_fim` | 20/20 |
| `test_demora_no_meio_vira_tempo_esgotado` | 20/20 |
| `test_demora_antes_de_responder_vira_tempo_esgotado_depois_das_tentativas` | 20/20 |

**Comandos.** `ruff check`, `ruff format --check` e `mypy --strict` nos
arquivos alterados sem erros; os dois arquivos de teste, 80 passed.
`make check` completo, EXIT 0 na base `bc43845` (`check-handoff` com `docs/HANDOFF.md` intocado, Vitest 1157 testes em 55 arquivos, pytest 1705 e 32 subtests, Playwright 66, gitleaks sem achados).

## Limitações

- Outros testes de integração ainda usam `TIMEOUT_DE_TESTE = 0.3`
  (`tests/integration/conftest.py`) como prazo do caminho feliz, nos testes
  da camada 3 da avaliação, do fallback e da API de avaliação. É a mesma causa
  e pode aparecer sob carga. Ficaram fora deste PR, que se limitou aos dois
  testes pedidos.
- Os testes de demora continuam dependentes do relógio: o falso atrasa
  1,2 s e o prazo é 0,3 s. Com a thread do cliente parada mais de 0,9 s, o
  dado chegaria antes do estouro. Isso não apareceu nas repetições acima.
- `_porta_livre()` continua sujeito à corrida de outra aplicação pegar a
  porta entre o `close` e o `bind` do processo; a falha seria alta (o
  processo morre e a linha de pronto não chega), não silenciosa.
