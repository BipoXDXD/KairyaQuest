# Cenário (f) do `tutoring.spec.ts`: investigação sem causa demonstrável — 2026-11-11

Branch `wt/cenario-f-tutoria`, revisão-base `d3d96a2` (main com o #93).

## Objetivo

Achar, por leitura do código e não por mais repetições cegas, a causa da
falha única do cenário (f) "resposta cortada por tamanho"
(`model_context_window_exceeded`) de `frontend/tests/e2e/tutoring.spec.ts`,
registrada como `P-intermitentes-tutoria-1` em
`2026-11-11-intermitentes-tutoria.md`. Este arquivo trata essa pendência.

## Resultado

**Causa não demonstrada; nenhuma correção.** O que entra é só este arquivo:
o rastro da falha recuperado do log do gate, o que a leitura do código
descarta e o que as medições mostram. `src/` e os testes ficam intocados.

## O rastro recuperado

O `trace.zip` da falha foi apagado junto com o worktree que o gerou
(`prazo-refresh`), mas a saída do `make check` rodado pelo `git commit` dele
sobreviveu na pasta de notas da coordenação. Dela:

- Falha em `tutoring.spec.ts:212`, o PRIMEIRO `expect` depois do envio:
  `tutor-message-mark` da mensagem que contém o texto do cenário, esperando
  `Resposta interrompida`, `element(s) not found` em 5000 ms. O teste durou
  7,2 s: ~2,2 s de preparo (painel, `fill`, clique) mais os 5 s do `expect`.
- O log da API mostra `POST /api/tutoring/messages 200` e **nenhuma** linha de
  API depois dele até o cenário seguinte: nem `GET /api/tutoring/messages`,
  nem a leitura que o próprio teste faz em `conversa()` (que nunca foi
  alcançada).
- O cenário irmão `max_tokens` passou na mesma rodada com 7,1 s, e (g) com
  6,2 s. A rodada inteira estava lenta: (b) 4,4 s e (c) 2,6 s, contra 0,3 s
  cada num gate quieto, ou seja, ~9 a 14 vezes mais lenta de modo geral.

## O que o rastro permite afirmar

1. **O turno não terminou em 5 s.** O hook `useTutorConversation` só deixa de
   emitir `GET /api/tutoring/messages` no caminho `done` (a resposta entra na
   lista já carregada). Os caminhos `failed` e `unknown` com a pergunta
   gravada chamam `refreshSilently`, que faz o `GET`. Sem `GET` e sem marca na
   tela, nem `done` nem erro tinham chegado ao navegador; o fim do teste
   abortou o stream. A parada está entre o 200 (preparo e commit já
   concluídos: o 200 só sai depois de `preparar_turno`) e o evento `done`:
   `_proximo` em thread, SDK, falso, `_completar` e o commit.
2. **Lentidão uniforme não explica.** Com a rodada ~10x mais lenta, um turno
   de ~90 ms levaria ~1 s. O turno precisou de mais de 5 s: foi um **estancamento**
   de pelo menos 5 s num salto só, não lentidão proporcional.

## Medidas desta investigação

Cenário (f) reproduzido num spec temporário (apagado, não está no PR) que
marca `Date.now()` no clique e na primeira aparição de `Resposta
interrompida`, nas duas variantes, `--repeat-each 10` (20 execuções por
linha), sob a trava do deslocamento 9:

| Carga | Clique → marca | Resultado |
|---|---|---|
| nenhuma | 30–190 ms (típico 87 ms); POST concluído ~145 ms após o início | 20/20 |
| 30 laços `python3 -c "while True: pass"` (10 núcleos) | 5–327 ms (mediana ~66 ms) | 20/20 |

A margem do `expect` de 5 s é ~55x o turno quieto e ~15x o pior turno sob 30
laços de CPU. CPU disputada sozinha, portanto, não produz o estancamento (o
que bate com os 0/40 e 0/20 do handoff anterior).

## O que a leitura do código descartou

- **Prazos do cliente.** O navegador: `READ_TIMEOUT_MS` e `MUTATION_TIMEOUT_MS`
  são de 20 s e o stream (`postStream`) não tem prazo próprio. O SDK da
  Anthropic na API: 60 s (`tutor_timeout_seconds`) e `max_retries=2`; o
  backoff do SDK soma no máximo ~1,5 s antes do primeiro evento, e uma
  tentativa a mais apareceria em `requisicoes()` do falso.
- **Temporizadores na UI.** O diretório `features/tutoring` não tem
  `setTimeout`, `setInterval`, `requestAnimationFrame` nem transições adiadas.
- **Estado compartilhado do banco E2E.** A pergunta e a resposta do cenário
  levam `EXECUCAO` e o motivo no texto, então o localizador é único mesmo com
  a conversa acumulada. `preparar_turno` recusaria com 409 (outra `gerando`)
  ou 429 (limite diário de 60 turnos; um gate faz 10 `POST`s) e o log mostra
  200. O recolhimento de órfãs só age depois de `tutor_timeout_seconds` mais a
  folga (60 s+). O relógio fixado do `cycle-midnight.spec.ts` é solto no fim
  dele e a ordem alfabética o põe antes.
- **Diferença entre as variantes.** As duas variantes do (f) usam o mesmo
  caminho: `max_tokens` e `model_context_window_exceeded` caem ambos em
  `Parada.CORTADA` em `_PARADAS`; o falso só troca a string do `stop_reason`.
  O (f) tampouco é o único lento na rodada: (g) e (h) também levaram 4–7 s.
- **`done` dependente do fim do corpo HTTP.** `transmitir` só emite
  `RespostaConcluida` depois de o gerador do provedor se esgotar, e o SDK só
  se esgota no EOF da conexão do falso (`connection: close`). O falso fecha
  ao sair de `do_POST`, e a medida acima (POST concluído ~145 ms) mostra que
  no caso normal o EOF é imediato.
- **Esperas por tempo no teste.** Nenhuma: o primeiro `expect` espera um
  estado final (a marca), não transitório, e não há `sleep`.

## O que ficou sem resposta

Qual salto estancou: a `anyio.to_thread` do `fechando_ao_cancelar`
(pool de 40), o SDK ou o falso (`ThreadingHTTPServer`, `request_queue_size`
5), a espera do EOF, ou o `commit` de `_completar` no PostgreSQL de container
compartilhado por dezenas de bancos de teste (fsync do disco da VM disputado
por outros gates). A última é a mais compatível com o padrão (estancamento
seco, só em gate com várias frentes, nunca com CPU sozinha), mas **não foi
medida**: provocá-la exigiria carregar o PostgreSQL que as outras frentes
usam, e provocar um estancamento artificial só provaria o óbvio (qualquer
parada de 5 s num salto reproduz a assinatura).

Nada aqui é correção, porque subir o prazo do `expect` sem saber o salto só
esconderia a falha, e o AGENTS.md §3 proíbe contornar o sintoma.

## Próxima ocorrência

Guardar, antes de refazer o gate: `frontend/test-results/<cenário>/trace.zip`
(o Playwright o retém na falha; ele mostra o `POST`, o tempo até o primeiro
byte e o DOM no instante da falha) e a saída do `kq-gate-pg`
(`docker logs --since 10m kq-gate-pg`, para ver `checkpoint starting`/`log
checkpoint complete` e consultas lentas no momento). Se a falha vier com um
`GET /api/tutoring/messages` depois do `POST`, esta análise não vale: o
caminho então é `failed`/`unknown` e a pergunta passa a ser por que o
stream caiu.

## Pendências e limitações

- `P-intermitentes-tutoria-1` continua aberta; este arquivo é o que se sabe
  sobre ela. A consolidação deve manter a linha e apontar para cá.
- Nenhum arquivo de `src/` nem de teste foi alterado; nada a reverter.
