# Ajustes das revisões dos PRs #78, #79, #80 e #82 — 2026-11-10

**Revisão-base:** `0c8e1ef` (main, com o #80 e o #82).

**Objetivo.** Corrigir os achados menores das revisões dos PRs #78 (datas
relativas no E2E), #79 (rascunho do reagendar no registro), #80 (textos de
falha de transporte) e #82 (fitness function da fronteira dos módulos). Nenhuma linha da tabela de pendências é resolvida aqui:
são correções de PRs já mesclados.

## #78: o `week_start` dos planos do E2E volta a ser segunda-feira

`layout.spec.ts` e `navigation.spec.ts` montavam o plano semanal com
`week_start = dia do ciclo − 6`, que cai em qualquer dia da semana. O backend
gera e valida segunda-feira (`cycle_domain.py` e `cycle_schemas.py`), e as
fixtures literais de antes do #78 também eram segunda (2026-09-28).

**Decisão.** `tests/e2e/datas.ts` ganha `segundaDaSemana(dia)` e
`diasEntre(inicio, fim)`. O plano passa a começar na segunda-feira da semana
do dia do ciclo, e a diária fica no índice desse dia, e não mais fixa no 6.
Em `layout.spec.ts` o dia do ciclo é `HOJE`; em `navigation.spec.ts`, o plano
é o do ciclo antigo, então a semana é a de `DIA_ANTIGO` (ontem). Ancorar na
semana de `HOJE` ali deixaria o dia antigo fora da semana toda segunda-feira.

**Testes.** `tests/unit/datas.test.ts` cobre a segunda de cada dia de uma
semana (segunda, terça, sábado, domingo e a segunda seguinte), a virada do
ano e `diasEntre` com zero, positivo, virada de ano e negativo.

## #79: o reagendamento aberto sai do registro quando perde o sentido

`openReschedules` só era limpo ao fechar o disclosure ou no sucesso do
reagendamento. Uma entrada de outro prazo ficava no registro: o formulário a
ignorava, mas, se o prazo voltasse ao de antes, o rascunho velho reabria.

**Decisões.**

- **Prazo mudou.** Na montagem, o `RescheduleForm` descarta (`onSave(null)`)
  um `saved` com `openedFor !== mission.deadline`. O descarte roda uma vez
  só, num `useEffect` guardado por `useRef`: `onSave` muda a cada render do
  cartão, e um descarte repetido apagaria o que a pessoa abrisse depois.
- **Missão concluída.** O sucesso do Concluir (`useCompleteMission`) chama
  `discardRescheduleDraft`, e `reconcileCompleted` (a leitura que confirma
  `concluida`) apaga a entrada na hora, sem esperar o fim dos POSTs em voo,
  porque o formulário de uma missão concluída não monta mais para descartá-la.
- O comentário de `rescheduleDraft.ts` dizia que o cartão liberava a chave.
  Desde o #79, quem reaproveita ou troca a chave é o registro
  (`rescheduleKeyFor`); o comentário foi corrigido.

**Testes.** Em `MissionList.test.tsx`, pelo registro real (`observeRegistry`):
prazo que muda numa recarga apaga a entrada, e prazo que volta ao de antes
monta o disclosure fechado; mesmo prazo conserva a entrada; leitura terminal
apaga; Concluir com sucesso apaga. Em `RescheduleForm.test.tsx`: o descarte
da montagem acontece uma vez só, não apaga o que foi aberto depois e não
acontece com o prazo atual nem sem nada guardado. Os três testes de
`MissionList` que exigem o descarte falharam antes da correção.

## #80: o E2E do QG confere o texto inteiro da falha de rede

`headquarters.spec.ts` conferia só `toContainText('Tentar de novo é seguro')`
no alerta da conclusão cuja resposta é abortada. O trecho passava mesmo se a
abertura perdesse a ação ou a causa, que é justamente o que o #80 mudou.
Agora o cenário afirma o texto exato com `toHaveText`: "Não foi possível
concluir a missão: sem conexão com o servidor. Tentar de novo é seguro: a
missão não será concluída duas vezes." O `route.abort()` é uma falha de rede,
daí a causa "sem conexão". O alerta (`mission-completion-error`) só contém a
mensagem, por isso o texto pode ser exato. Este item entrou depois do merge
do #80 na main (`35d676d`).

## Correção da seção da pendência 211 no `docs/HANDOFF.md`

A seção "Pendência 211: textos de falha de transporte" diz que, além do de
recusar, "as outras seis mensagens de transporte têm de 22 a 24 palavras".
São **doze** mensagens, e não seis: seis textos (concluir a missão, iniciar a
missão, reagendar a missão, pedir a avaliação, confirmar a missão e confirmar
o reagendamento) vezes duas causas (rede e prazo). Cada uma tem de 22 a 24
palavras, contadas por espaço: 22 a 23 por rede e 23 a 24 por prazo. As de
recusar a proposta são duas, com 16 e 17. A seção do `docs/HANDOFF.md` não
foi editada; a correção fica registrada aqui.

## #82: três ajustes no detector de `test_fronteira_dos_modulos.py`

- **Ordem dos locais.** `ast.walk` percorre em largura, então um import dentro
  de função saía depois de um import mais abaixo no arquivo. Os imports de
  cada arquivo agora são ordenados por `lineno` antes de virar
  `arquivo:linha`.
- **`from focusquest.modules import *`.** O `*` virava o submódulo
  `focusquest.modules.*` e, com ele, um pacote falso chamado `*`. O nome `*`
  agora é ignorado e só a base conta.
- **Encoding.** `read_text()` decodificava pela codificação do sistema.
  `ast.parse(arquivo.read_bytes())` respeita a declaração `coding:` do
  arquivo, como o interpretador.

**Testes.** Dois casos novos no `parametrize` (`from focusquest.modules
import *` e `from .. import *`, os dois sem pacote-alvo), um arquivo com
import dentro de função acima de um do nível do módulo (sai `:2` antes de
`:4`) e um arquivo em latin-1 com `coding:`. Os quatro falharam antes da
correção.

**Comandos e resultados.** `make check` completo sobre `0c8e1ef` mais estas
mudanças: EXIT 0 (Vitest 1150 testes em 55 arquivos com cobertura de 100%,
pytest 1692 aprovados com cobertura de 100%, Playwright 66 aprovados,
gitleaks sem achados). O Playwright de `layout`, `navigation` e
`headquarters` rodou dentro desse gate.
