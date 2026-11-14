# Varredura de AST mais barata nos testes de fitness do frontend (#140) — 2026-11-12

Objetivo: `noCrossFeatureInternals.test.ts` e `noMathRandom.test.ts` estouraram
o timeout de 5 s do Vitest com a máquina carregada (load > 15; ocorrência
registrada em `docs/handoff/2026-11-11-ressalvas-minor.md`, load ~25). Diagnóstico:
não há corrida; cada um varre sincronamente a AST de ~280 e ~160 arquivos. Meta:
reduzir o custo da varredura de forma mensurável **sem enfraquecer a detecção** e
sem tocar no timeout, na cobertura ou em teste algum. Revisão-base: `9c2ead9` (main).

## Declarações

- Zero dependência nova, zero endpoint, zero migração, zero contrato. Só `frontend/src/test`.
- Timeout intacto, nenhum teste pulado, nenhum limiar de cobertura mexido
  (`src/test/**` já está fora do denominador, `vite.config.ts`).
- A detecção não encolheu: os testes anteriores dos dois arquivos passam sem edição
  de expectativa; só entraram casos novos.

## Alterações

- `src/test/mayContainWord.ts` (novo): filtro textual `mayContainWord(text, word)`.
  Cada letra da palavra casa com ela mesma **ou com qualquer escape** JavaScript
  (`\uXXXX`, `\u{X…}`, `\xXX`, octal, `\c`), e uma continuação de linha pode vir entre as
  letras. É condição necessária e nunca suficiente: erra só para o lado do `true` e quem
  recebe `false` não tem como conter a palavra, por nenhuma grafia.
- `src/test/mayContainWord.test.ts` (novo): 24 casos do filtro (escapes, octal, CRLF, U+2028…).
- `noMathRandom.test.ts`: `usesMathRandom` só faz o parse se `mayContainWord(text, 'random')`.
- `noCrossFeatureInternals.test.ts`: `offendersIn` só faz o parse se o texto puder citar
  `features` ou o nome de OUTRA feature (os nomes vêm de `readdirSync(src/features)`, então
  feature nova entra sozinha; o nome da própria feature não conta, porque importá-la é permitido).
- Contador `parsedCount` em cada arquivo, para provar o filtro: o teste da varredura
  afirma que no máximo metade dos arquivos passa pelo parse.

## Medições (antes/depois, mediana de 3 execuções; duração do teste da varredura no `vitest --reporter=json`)

Condição "isolado" = máquina com a carga ambiente de outras sessões (load 9–10; não dá
para zerá-la). Condição "carga" = o mesmo mais 8 laços `yes > /dev/null`, encerrados pelo
PID próprio. Pares medidos um logo após o outro (o `stash` do worktree separa antes/depois).

| teste | isolado antes | isolado depois | carga antes | carga depois |
|---|---|---|---|---|
| `noCrossFeatureInternals` | 285 ms | 135 ms (-53%) | 401 ms | 227 ms (-43%) |
| `noMathRandom` | 211 ms | 107 ms (-49%) | 319 ms | 181 ms (-43%) |

Arquivos que ainda passam pelo parse: 277 → 85 (cross-feature) e 157 → 29 (Math.random).
Uma primeira rodada, medida antes (ambiente mais ruidoso), deu 585/510 ms isolado e
404/312 ms sob carga: a ordem de grandeza é a mesma. Observação: 8 laços não saturam
esta máquina, então o efeito da carga ficou aquém do load > 15 do problema original;
a redução de trabalho (CPU de parse) é a que vale.

## Decisões

- **D1, filtro textual em vez de parse compartilhado.** O Vitest roda cada arquivo de teste
  num worker próprio, com o grafo de módulos próprio; um cache de AST entre os dois testes
  exigiria estado fora do processo (disco), mais caro e mais frágil que a CPU economizada.
- **D2, `includes(palavra)` ingênuo rejeitado.** Deixaria escapar `Math['random']`,
  `Math.random`, `'../kairya/x'`, continuação de linha dentro do nome etc., que
  a AST pega (lê o texto decodificado). Um primeiro filtro que tratava qualquer `\` como
  "faz o parse" era correto mas deixava 67% dos bytes no parse (regex e `\n` são comuns);
  o `mayContainWord` derrubou isso para ~18% (random) e ~31% (cross-feature).
- **D3, nome de feature lido do disco.** Consequência aceita: um `vi.mock('../fantasma/x')`
  de uma pasta que **não existe** em `src/features` e sem `features` no texto deixa de ser
  acusado dentro de uma feature (o detector antigo o acusava). Não é fronteira cruzada
  (não há feature do outro lado), e o import real de pasta inexistente reprova no `tsc`/Vite.
  Fora das features, e em qualquer caminho que passe por `features`, o caso continua acusado
  (teste `inexistente`).
- **D4, o filtro não decodifica escapes.** `ranxom` (que é `ranxom`) passa para o parse
  e a AST decide; custa um parse inútil num caso absurdo e mantém o filtro simples e seguro.
- **D5, limite de "metade".** Medido: 18% e 31%. A asserção é `<= 50%` para ter folga sem
  deixar um filtro que passa tudo escapar (sabotado: reprova).
- Fora do escopo: nenhum outro teste de fitness usa `createSourceFile` (os demais varrem
  texto com regex e não têm esse custo).

## Prova de detecção (TDD) e sabotagem

Primeiro entraram, contra o código sem filtro, os casos que o filtro poderia deixar
escapar: alias de import, import de namespace, template sem substituição, `../a/../b`,
nome com `\u`/`\x`/continuação de linha, `Math['random']`, `Math.random`,
`Math['ran\x64om']`, `Math['ran\dom']`, desestruturação com escape, atribuição
desestruturada com escape. Todos passaram sem filtro (a detecção já existia) e os testes
de "poupa o parse" falharam (vermelho). Depois do filtro, sabotagens medidas, cada uma
reprovando o teste esperado e revertida:

- `mayContainWord` trocado por `text.includes(word)` (o filtro ingênuo): 29 testes reprovam;
- sem a cláusula `features` (cross-feature): 2 reprovam; sem a exceção da própria feature: 2;
- filtro sempre `true`: 5 (cross-feature) e 3 (random) reprovam, pelos testes de "poupa o
  parse" e pelo limite de metade;
- filtro que só procura `Math.random`: 17 reprovam;
- `mayContainWord` sem continuação de linha: 6 reprovam; sem octal: 3 reprovam.

## Limitações

- `noMathRandom` continua não seguindo alias (`const m = Math`) nem `globalThis['Math']`
  (pendência pré-existente de `2026-11-11-f6-pendencias.md`); este PR não mudou isso.
- O ganho é de CPU de parse; o custo fixo de carregar o `typescript` no worker (fora do
  corpo do teste, não sujeito ao timeout de 5 s do teste) ficou como está.

## Comandos e resultados

- `npx vitest run src/test/{noCrossFeatureInternals,noMathRandom,mayContainWord}.test.ts`: 102 testes, verdes.
- `eslint src/test --max-warnings 0`, `prettier --check src/test` e `tsc -b`: limpos.
- `make check` completo sob `lote-off9.lock`, **EXIT 0** (a primeira execução deu EXIT 2 por
  motivo alheio ao código: o `.env` copiado do principal trazia uma variável de um provedor
  de tutoria que o `Settings` de `9c2ead9` proíbe como entrada extra; a linha saiu do `.env`
  do worktree e a segunda execução passou): Vitest 129 arquivos, 2643 testes; cobertura do
  frontend 100% (2355/2355 instruções, 1534/1534 ramos, 655/655 funções, 2261/2261 linhas);
  pytest 2165 testes; E2E e demais alvos verdes.
- Worktree criado a mão (ver "Pendências").

## Pendências

- **P-fitness-varredura-1.** `scripts/novo-worktree.sh` recusa criar worktree quando os
  deslocamentos 1–24 estão todos ocupados (os 24 estão; 16 e 23 já estão duplicados
  por worktrees antigos). O worktree deste PR foi montado a mão, com o mesmo `.env`
  que o script geraria e `FOCUSQUEST_E2E_PORT_OFFSET=9` (o do lote, nome da trava
  `lote-off9`); as portas 8109/5282/8159 estavam livres. Vale podar worktrees mortos
  e/ou ampliar a faixa.
