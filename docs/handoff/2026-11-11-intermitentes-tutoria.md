# Testes intermitentes da tutoria — 2026-11-11

Branch `wt/intermitentes-tutoria`, revisão-base `e4d1ddd` (main com o #86).

## Objetivo

Estabilizar três intermitências vistas sob carga por frentes anteriores:

1. `tests/integration/test_tutoring_desconexao.py::test_desconectar_no_meio_grava_interrompida`
   (1 falha em 4 execuções, registrada em `2026-11-10-wt-abort-any-safari.md`:
   "a resposta já estava `falhou` quando o teste esperava `gerando`");
2. `frontend/tests/e2e/tutoring.spec.ts`, cenário (f) "resposta cortada por
   tamanho" (`model_context_window_exceeded`), falhou uma vez num gate;
3. `TIMEOUT_DE_TESTE = 0.3` em `tests/integration/conftest.py`, usado também
   no caminho feliz (limitação registrada pelo PR #88).

## Causa encontrada

### 1 e 3: o prazo de 0,3 s do SDK no caminho feliz (mesma causa)

O prazo do SDK conta o silêncio **entre** dois pedaços do stream, não a
duração do turno. A fixture `tutoria` do conftest usava 0,3 s para todos os
testes. No teste de desconexão, o falso entrega o primeiro pedaço e fica
**segurado** até o teste chamar `falso.liberar.set()`; nesse intervalo o
cliente ainda lê a linha SSE, consulta o banco (`_status`) e só então
desconecta. Se esse trecho passa de 0,3 s — o que a carga de vários gates em
paralelo provoca —, o SDK estoura o prazo, o serviço grava `falhou`
(`tempo_esgotado`) e o `assert ... == [GERANDO]` reprova. É exatamente a
assinatura registrada.

O mesmo prazo curto estava nos testes da camada 3 e no do espião, todos de
caminho feliz (ou de erro HTTP imediato), onde o prazo é só um teto.

### 2: cenário (f) do Playwright — não reproduzido

20 execuções sob carga (ver "Resultados") passaram todas. Não houve correção
para ele (ver pendência `P-intermitentes-tutoria-1`).

## Decisões

- **Prazo folgado por padrão, curto só onde a demora é o objeto.** O conftest
  passa a ter `TIMEOUT_FOLGADO = 30.0` e `TIMEOUT_DA_DEMORA = 0.3`, o mesmo
  par que o PR #88 adotou em `test_anthropic_provider.py`. As constantes ficam
  repetidas nos dois arquivos enquanto o #88 não entrar; este PR não toca no
  arquivo dele para não gerar conflito.
- **O prazo da `tutoria` vem de uma fixture, `prazo_do_provedor`.** Os testes
  de demora o trocam por `@pytest.mark.parametrize("prazo_do_provedor",
  [TIMEOUT_DA_DEMORA])`: a parametrização direta do pytest substitui a
  fixture também quando quem a pede é outra fixture (a `tutoria`, ou o
  `cliente` do `test_evaluation_api.py`). Nos testes parametrizados que
  misturam "provedor fora" e "tempo esgotado", o prazo virou mais uma coluna:
  só o caso de tempo esgotado usa o curto. Alternativa descartada: uma segunda
  fixture `tutoria_com_prazo_curto`, que não alcança o `cliente` da API sem
  duplicá-lo.
- O atraso do teste de demora da tutoria passou de `1.2` literal para
  `TIMEOUT_DA_DEMORA * 4` (mesmo valor), para o atraso andar junto com o prazo.
- Sem retry, sem `sleep`, sem `flaky` e sem prazo aumentado nos testes de
  demora: eles continuam medindo o estouro com 0,3 s.

## Alterações

Só código de teste; `src/` intocado.

- `tests/integration/conftest.py`: `TIMEOUT_DE_TESTE` sai; entram
  `TIMEOUT_DA_DEMORA`, `TIMEOUT_FOLGADO` e a fixture `prazo_do_provedor`.
- Testes de demora com o prazo curto parametrizado:
  `test_tutoring_service.py::test_demora_no_meio_vira_tempo_esgotado_com_o_texto_parcial`,
  `test_evaluation_provider.py::test_avaliar_com_demora_e_tempo_esgotado`,
  `test_evaluation_service.py::test_falha_do_provedor_ja_gravada_quando_o_erro_chega[tempo-esgotado]`,
  `test_evaluation_api.py::test_falhas_do_modelo_ja_gravadas[tempo-esgotado]`.
- Caminho feliz com `TIMEOUT_FOLGADO`: `test_camada3_da_avaliacao.py`,
  `test_camada3_do_fallback.py`, `test_camada3_do_reagendamento.py`,
  `test_camada3_da_conclusao_tardia.py`, `test_espiao.py`.
- `test_tutoring_desconexao.py`: comentário explica por que segurar o falso
  exige o prazo folgado.

## Comandos e resultados

Repetição: um laço de shell, fora do repositório, que roda
`pytest -q -p no:cacheprovider --no-cov <nodeid>` R vezes, com N processos
`python3 -c "while True: pass"` ocupando a CPU (máquina de 10 núcleos), sob a
trava do deslocamento 9.

| Medida | Código | Carga | Resultado |
|---|---|---|---|
| desconexão, espontânea | original | outros gates rodando | 20/20 aprovados |
| desconexão, espontânea | original | 30 laços de CPU | 20/20 aprovados |
| desconexão, janela alargada (0,5 s injetados entre o `delta` e o `assert`, revertidos) | original | nenhuma extra | **0/5**, `falhou != gerando` (a assinatura registrada) |
| desconexão, mesma injeção | corrigido | nenhuma extra | 5/5 |
| desconexão, espontânea | corrigido | 30 laços de CPU | 20/20 |
| (f) Playwright, `-g "cortada por tamanho" --repeat-each 10` (20 execuções) | original | 30 laços de CPU | 20/20 aprovados |

A taxa espontânea de falha não foi reproduzida nesta máquina só com carga de
CPU (0/40 no código original); a falha original veio de gates inteiros
disputando CPU, disco e memória. A causa foi confirmada pela reprodução
determinística da mensagem exata, e a correção pela mesma injeção passando.

Os testes de demora continuam provando o estouro: se a parametrização não
substituísse a fixture, eles rodariam com 30 s de prazo contra 0,9–1,2 s de
atraso e reprovariam por não estourar. Os arquivos alterados rodaram juntos
(136 testes) e o mais lento levou 2,4 s, nenhum perto dos 30 s do teto.

`make check` completo: ver o corpo do PR.

## Pendências e limitações

- **`P-intermitentes-tutoria-1` — cenário (f) do `tutoring.spec.ts` não
  reproduzido.** A única falha registrada (`model_context_window_exceeded`,
  7,2 s) foi `element(s) not found` no primeiro `expect` depois do envio: em
  5 s a bolha com o texto e a marca não apareceu, e o log da API não mostra
  nenhum `GET /api/tutoring/messages` depois do `POST` — ou seja, o `done`
  não chegou à tela no prazo do `expect`. O cenário vizinho (`max_tokens`)
  levou 7,1 s na mesma rodada e passou; nas rodadas registradas o (f) leva
  de 1,0 s a 5,4 s. A hipótese é lentidão do turno inteiro sob carga, mas sem
  o rastro (`test-results/`, já apagado) ela não está provada, e por isso não
  houve correção. Próxima ocorrência: guardar o `trace.zip` que o Playwright
  retém na falha antes de rodar de novo.
- As constantes `TIMEOUT_DA_DEMORA`/`TIMEOUT_FOLGADO` ficam duplicadas no
  conftest e em `test_anthropic_provider.py` depois que o #88 entrar; unificar
  é um ajuste de uma linha numa consolidação.
- A linha da limitação "outros testes de integração ainda usam
  `TIMEOUT_DE_TESTE = 0.3` no caminho feliz", do handoff do #88
  (`2026-11-10-wt-testes-sob-carga.md`), fica resolvida por este arquivo.
