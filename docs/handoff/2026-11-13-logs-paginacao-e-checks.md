# 2026-11-13 — logs sem parâmetros, paginação de missões e recusas de `rejeitar_acao`

## Objetivo

Resolver #166 (logs sem parâmetros SQL e só o tipo da exceção na avaliação),
#182 (paginação por keyset em `GET /api/missions`), #178 (sabotagem dedicada
dos caminhos de recusa de `rejeitar_acao`) e avaliar #183 (CHECK de tamanho
nos textos da missão avulsa).

## Decisões e porquê

- **#166 — `hide_parameters=True` no engine.** O SQLAlchemy deixa de colocar
  os valores ligados na mensagem de `DBAPIError`, que é o que vai para o log
  quando uma query falha. Limitação residual: mensagens geradas pelo próprio
  PostgreSQL (cast inválido, `DETAIL` de chave única) ainda podem ecoar um
  valor; e o traceback de um 500 não tratado é escrito pelo servidor ASGI.
  Fechar isso exige um handler genérico em `main.py`, fora deste incremento.
- **#166 — avaliação loga só o tipo da exceção.** `_log.exception` virou
  `_log.error(..., type(erro).__name__)`: a mensagem e o traceback do
  provedor podem carregar o texto da submissão. A causa continua encadeada na
  exceção que sobe.
- **#182 — cursor `(after_deadline, after_id)`, a mesma chave da ordenação.**
  Mudança aditiva: sem parâmetros, a resposta continua sendo a lista (agora a
  primeira página, 50 itens). Teto `limit <= 100`. Parâmetro desconhecido,
  cursor pela metade, data sem fuso ou fora da faixa e id fora do `int4` dão
  422, nunca 500. A listagem da tutoria (`listar_missoes`) continua sem
  paginação, porque filtra pendentes internamente.
- **#182 — frontend.** O hook pede a primeira página sem parâmetros e mostra
  "Carregar mais missões" quando a página chega cheia (`MISSIONS_PAGE_SIZE`,
  fixado igual ao padrão do backend por `tests/unit/test_tamanho_da_pagina.py`).
  Falha ao carregar mais mantém a lista e oferece nova tentativa. Trade-offs
  aceitos: recarregar volta à página 1; uma última página exatamente cheia
  mostra o botão uma vez a mais, e esse pedido volta vazio.
- **#182 — dedupe por `id` ao juntar páginas (revisão do PR).** O cursor
  acompanha o prazo: uma missão reagendada para depois dele entre dois
  pedidos volta na página seguinte. `loadMore` descarta a cópia antiga e
  fica com a da página (prazo atual, posição certa). Reagendada para antes
  do cursor, ela não aparece nas páginas seguintes até recarregar; as
  docstrings de `MissionListQuery` e `listar_pagina_de_missoes` dizem isso.
- **#178 — casos `rejeitar-*` criados.** Não existiam no repositório. Cada
  recusa (inexistente, alheia, executada, falhou) compara a foto do banco
  antes e depois, na mesma transação e depois de `flush`. `foto_do_banco` foi
  extraída para `tests/integration/foto_do_banco.py` e é compartilhada com
  `test_recusas_sem_escrita.py`.
- **#183 — CHECK não entra agora.** Na `main`, `POST /api/missions` não tem
  limite de 500 caracteres no schema (esse limite ainda não foi mesclado), e
  as propostas da tutora também não. Um CHECK hoje transformaria um texto
  longo em `IntegrityError`, ou seja, 500. A issue também pede conferir os
  dados reais antes, o que exige acesso ao banco de produção. Nenhuma
  migration foi criada; a issue fica aberta com os passos manuais.

## Alterações

- `src/focusquest/core/database.py`, `modules/evaluation/service.py`
- `modules/missions/{schemas,service,router}.py`
- `frontend/src/features/missions/{useMissions,MissionList}.ts(x)` e testes;
  catálogos i18n pt-BR e en
- Testes novos: `test_parametros_fora_do_erro.py`,
  `test_missions_paginacao.py`, `test_rejeitar_sem_escrita.py`,
  `foto_do_banco.py`, `tests/unit/test_tamanho_da_pagina.py`; ajustes em
  `test_evaluation_service.py`, `test_missions_listagem_consultas.py`,
  `test_recusas_sem_escrita.py`

## Comandos

- `make check-api`, `make check-web` (Vitest com `--maxWorkers=4`) e o
  `make check` completo pelo hook de `pre-commit` no commit.
- Sabotagens de #178, aplicadas à mão em `tutoring/service.py` e revertidas:
  A) gravar `decided_at` + `flush` antes de `validar_transicao_da_acao`;
  B) `UPDATE users` antes de `_buscar_acao`.

## Resultados

- Testes de #166 vistos falhando sem a correção e passando com ela.
- Sabotagem A: `rejeitar-executada` e `rejeitar-falhou` reprovaram.
  Sabotagem B: os quatro casos reprovaram. Sem sabotagem, os quatro passam.
- Frontend: 2829 testes aprovados, cobertura 100% em todos os arquivos.
- Resultado do `make check` completo: ver o commit (o hook reprova o commit
  se o gate falhar).

## Pendências

- #183: aplicar o CHECK depois que o limite de 500 no schema for mesclado e
  os dados de produção forem conferidos (passos na issue).
- #166: handler genérico de exceção em `main.py` para que o traceback de um
  500 não tratado não leve valores para o log.
