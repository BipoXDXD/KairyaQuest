# Ressalvas Minor de `leitura.py` (#127/#129/#133) — 2026-11-11

Revisão-base: `c89ecb0` (main, #133). Branch `wt/leitura-ressalvas`.

Fecha as três ressalvas Minor que as revisões dos #127, #129 e #133 deixaram em
`src/focusquest/modules/tutoring/leitura.py`. Sem mudança de contrato, de código
de erro ou de comportamento observável fora dos casos abaixo. Nenhuma decisão de
produto: tudo é técnico e reversível.

## Status por item

1. **Leitor cancelado antes do primeiro `next()` — corrigido, vermelho primeiro.**
   O `for evento in eventos` de `_ler` fazia o primeiro `next()` (a chamada paga
   ao provedor) antes de qualquer conferência de `cancelado`. Agora `_ler`
   confere `cancelado` antes do `for`: cancelado, o gerador é fechado sem ser
   iterado (o corpo do provedor nunca roda) e a vaga volta. Teste
   `test_leitor_cancelado_antes_do_primeiro_evento_nao_chama_o_provedor`
   (unit): uma thread segurada por `Event` deixa o consumidor estourar (teto 0)
   antes do primeiro passo do leitor, sem corrida e sem `sleep`; reprovou
   (`stream.iniciou` setado) antes da correção.
2. **`UnboundLocalError` no log de `_ler` — confirmado e corrigido, vermelho
   primeiro.** Era real: se `espera.monotonic()` lançasse na primeira leitura
   com `cancelado` já setado, o `finally` externo usava `inicio` não atribuído e
   o erro escapava da thread. Agora `inicio` nasce `None` antes do `try`, a
   primeira leitura do relógio fica dentro do `try` interno (a falha vai ao
   consumidor como `_Falha`, o gerador é fechado e a vaga volta) e o log só sai
   com `inicio` atribuído. Teste
   `test_relogio_que_falha_no_leitor_cancelado_devolve_a_vaga_sem_erro_solto`:
   relógio que falha só na primeira leitura da thread leitora; reprovou com
   `UnboundLocalError` capturado por `threading.excepthook` antes da correção.
3. **Drenagem com `get_nowait` — caracterização (já passava).**
   `test_intermediario_ja_enfileirado_e_entregue_e_depois_a_fila_vazia_estoura`
   (integração, pelo `transmitir`): com o relógio além do teto, o `b` já está na
   fila (o falso espera o leitor setar `travou`, que só ocorre depois de
   enfileirar o `b`) e a fila esvazia em seguida; o `b` é entregue, o stream
   estoura com `tempo_esgotado`, o texto parcial gravado é `"ab"` e houve uma
   única espera real. Prova de que o teste protege: trocando o `get_nowait` por
   `raise queue.Empty`, ele (e o teste da drenagem já existente) reprova.

## Alterações

- `src/focusquest/modules/tutoring/leitura.py`: `_ler` (itens 1 e 2).
- `tests/unit/test_tutoring_leitores_vivos.py`: 2 testes novos + helper
  `_thread_segurada_ate`.
- `tests/integration/test_tutoring_teto_do_stream.py`: 1 teste novo.

Nada em `docs/ARCHITECTURE.md` (nenhuma frase existente ficou falsa), `main.py`,
`service.py`, frontend, `.env`, banco ou contrato de API. `docs/HANDOFF.md`
intocado.

## Verificação

- Os três arquivos de teste tocados repetidos 5 vezes seguidas: 5 verdes, sem
  `sleep` real (Event, join, relógio falso).
- Sabotagens (cada uma desfeita): sem a checagem antes do `for` reprova o teste
  do item 1; `get_nowait` trocado por `queue.Empty` reprova o do item 3.
- `ruff check`, `ruff format --check` e mypy dos arquivos tocados: limpos.
- O resultado do `make check` completo está no PR.
