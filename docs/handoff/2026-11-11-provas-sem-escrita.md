# Pendência 97/T-M1: provas de ausência de escrita nas recusas — 2026-11-11

Branch `wt/provas-sem-escrita`, base `origin/main` em `162fc1f`. Só testes
(pytest, backend); nenhuma linha de produção mudou.

**A linha `97/T-M1` da tabela de pendências do `docs/HANDOFF.md` fica resolvida
por esta seção, com o resíduo declarado abaixo.** A consolidação a risca lá.

## O que T-M1 pedia e onde está agora

T-M1: "provas de ausência de escrita antes do rollback são parciais; faltam
todas as falhas, `_mesma_evidencia`, disputa UNIQUE e HTTP".

| Lacuna | Prova nova |
|---|---|
| Todas as falhas | `tests/integration/test_recusas_sem_escrita.py::CASOS`: 36 recusas de `concluir_missao`, `iniciar_missao` e `reagendar_missao` (inexistente, de outro usuário, diária futura oculta com chave gasta, chave gasta em outra missão e em outro tipo, já concluída/iniciada, diária de ontem, seis variações de evidência no reenvio, reenvio de reagendamento com outro prazo e outro motivo, diária, prazo no passado, igual a agora, igual ao atual e 1 µs além do horizonte). |
| "Antes do rollback" | `test_a_recusa_nao_escreve_nada`: a foto do banco (dump `to_jsonb` de TODAS as tabelas, descobertas pelo esquema) é tirada (a) na própria transação da recusa, após `flush`, e (b) depois do rollback, por outra conexão. (a) prova que a função não escreve antes de recusar (a confirmação da Kairya grava a falha na mesma transação, F17); (b) prova que nada sobreviveu. |
| `_mesma_evidencia` | `tests/unit/test_mesma_evidencia.py`: 15 casos (as 4 combinações de presente/ausente, cada elemento de `(texto, link)` variando sozinho nos dois sentidos, fronteira de 1 caractere, de caixa e de espaço, `submitted_at` fora da comparação). Mais seis reenvios com evidência diferente, de ponta a ponta, no catálogo. |
| Disputa da UNIQUE | `test_a_unique_recusa_a_perdedora_e_o_rollback_desfaz_o_que_ela_escreveu` (3 casos, uma por operação perdedora): REPEATABLE READ faz a perdedora ESCREVER até o índice recusar; confere `__cause__` = `IntegrityError` da `uq_mission_operations_operation_id` e que a foto após o rollback é exatamente a da vencedora. Mais quatro testes com a vencedora segurando a chave sem commitar e a perdedora observada BLOQUEADA em `pg_stat_activity` (sem `sleep` como sincronização): vencedora commita → perdedora recebe "chave gasta"; vencedora desfaz → perdedora conclui; um só efeito nos dois desfechos (estado, operação, evidência, XP). |
| HTTP | `test_a_api_recusa_com_o_code_certo_e_nao_escreve_nada` (as 36 recusas: status, `code` e banco intacto, com a sessão real da requisição sobre a engine de teste), 6 corpos inválidos → 422 sem escrita, os dois desfechos da disputa pela API (409 `operacao_reutilizada` / 200) e o 409 sequencial. |

Também: `test_a_foto_enxerga_uma_escrita` garante que a comparação não é vazia
(a foto cobre as tabelas das operações e muda quando uma linha muda).

## Decisões

- **Foto de todas as tabelas, não de colunas escolhidas.** Uma escrita numa
  tabela que ninguém lembrou de conferir (conquista, avaliação) também reprova.
- **Commit de verdade e limpeza própria (`Cenario.limpar`)**, em vez da fixture
  `session`: o rollback da transação externa mascararia o que se mede. Mesmo
  padrão de `test_missions_concorrencia.py`; apaga só o que o teste criou.
- **Colisão determinística**, sem threads de largada: REPEATABLE READ (snapshot
  fixado antes de o vencedor commitar) e bloqueio observado no PostgreSQL. As
  threads existem só para segurar a perdedora presa no índice enquanto o teste
  decide o desfecho da vencedora.
- Nenhum defeito de produção apareceu.

## Verificação de que os testes falham com o código sabotado

Cada sabotagem foi aplicada em `service.py`/`router.py`, os testes novos
rodados e o arquivo restaurado (`git status` limpo ao fim). O script e o log
bruto ficaram fora do repositório. Resultado (falhas / passes dos 99 testes
novos, e qual teste pegou):

| Sabotagem | Resultado |
|---|---|
| `_mesma_evidencia` ignora o link | 9 falham (unit `test_e_outro_pedido`, serviço e API) |
| ramo de ausência de `_mesma_evidencia` passa a devolver sempre `True` | 7 falham |
| `_mesma_evidencia` aceita pedida ausente | 4 falham |
| `concluir` escreve `completed_at` antes do reuso | 3 falham (serviço, antes do rollback) |
| `concluir` escreve evidência antes do reuso | 3 falham (serviço e API) |
| `concluir` escreve antes da transição / antes da recusa de expirada | 1 e 1 falham |
| `iniciar` escreve antes do reuso / antes da transição | 4 e 2 falham |
| `reagendar` escreve antes de `prazo_inalterado` / antes de `prazo_derivado` | 1 e 5 falham |
| `_gravar_operacao` deixa de traduzir a UNIQUE | 5 falham (3 REPEATABLE READ, vencedora commita, API 409) |
| router commita mesmo quando a operação falha | 1 falha (a disputa pela API; nos demais caminhos não há o que commitar) |

Duas sabotagens iniciais (escrever `started_at`/`completed_at` antes da
transição) passaram por artefato: o setup dos testes executa o mesmo código
sabotado e grava o mesmo valor. Refeitas gravando `instructions = operation_id`
(valor que difere entre setup e recusa), as duas falharam como o esperado.

## Comandos e resultados

Todos sob `flock` da trava do deslocamento 9, com `memory_pressure` a 52% livre.

- Testes novos, 5 vezes seguidas (`uv run pytest
  tests/integration/test_recusas_sem_escrita.py tests/unit/test_mesma_evidencia.py`):
  `99 passed` nas cinco, em 2.32s, 2.25s, 2.18s, 2.11s e 2.22s; zero falha. Os testes de bloqueio esperam o estado do PostgreSQL, não um tempo.
- Junto de `test_missions_models.py`, `test_missions_service.py` e
  `test_missions_concorrencia.py` na mesma sessão: `115 passed in 4.40s` (a
  limpeza do módulo novo não contamina os testes que exigem tabelas vazias).
- `ruff format`, `ruff check tests` e `mypy` estrito nos dois arquivos: limpos.
- `make check` completo: `EXIT 0`. Pytest `2079 passed, 32 subtests passed`
  com cobertura `100.00%`; vitest `2177 passed (2177)`; Playwright
  `123 passed`; gitleaks `no leaks found`; `check-wheel` ok.

## Resíduo (o que T-M1 ainda não cobre)

- A prova de ausência de escrita vale para `concluir`, `iniciar` e `reagendar`
  do serviço de missões. A confirmação da Kairya (tutoria, F17) que reusa
  `reagendar_missao` e grava a falha da ação na mesma transação não foi tocada:
  `tutoring/service.py` está fora do escopo deste lote. A garantia que ela
  consome ("nada gravado antes da recusa") agora tem prova direta no
  `reagendar_missao`.
- "Casos sequenciais não provam todos os entrelaçamentos" continua verdadeiro
  em geral: aqui cobrem-se os dois desfechos da disputa da UNIQUE
  (commita/desfaz) e o caso de snapshot defasado, não toda a matriz de
  entrelaçamentos de trava de missão × usuário (outras pendências: 104, 160).
- Os caminhos de falha do `registrar_conclusao` (progressão) depois do
  `flush` da operação não têm injeção de erro própria; a prova de rollback
  cobre o que acontece se a UNIQUE recusar, não uma falha do crédito de XP.
