# teste de ReDoS do `varrer_traces.py` independente da carga

## Objetivo

`tests/unit/test_varrer_traces.py::test_entrada_patologica_e_varrida_em_menos_de_um_segundo`
cronometrava `contar_padroes` com relógio de parede contra um teto absoluto de
1,0 s. Sob carga da máquina ele reprovava sem haver ReDoS. O objetivo é tirar a
dependência da carga **sem afrouxar** a garantia contra retrocesso
catastrófico de regex.

Revisão-base: `origin/main` em `ba18b0b`.

## Decisão: escala (opção b), com tempo de CPU e limite de CPU

O teste passou a se chamar
`test_custo_da_entrada_patologica_cresce_linearmente`. Para cada uma das 8
entradas patológicas (as mesmas de antes, agora geradas por tamanho):

1. mede o custo de CPU do processo (`time.process_time`) com tamanho n
   (100 000 bytes) e 4n, intercalados, 3 vezes, e fica com o mínimo de cada;
2. exige `custo(4n) / custo(n) < 8`;
3. o processo filho roda com `RLIMIT_CPU` de 10 s: retrocesso exponencial é
   morto pelo sistema (SIGXCPU) e o teste reprova com a mensagem de ReDoS.

Por que 4x e limiar 8: linear cresce 4x, quadrático 16x, exponencial não
termina. 8 é a média geométrica entre 4 e 16, a mesma folga multiplicativa
(2x) para os dois lados. Medido nesta máquina (10 núcleos): razões de 3,5 a
4,4 sem carga e com 20 processos `yes`.

Por que escala e não linha de base benigna (opção a): a linha de base exigiria
uma entrada "benigna" com o mesmo custo por byte que cada patológica, e esse
custo varia de caso para caso; o `k` teria de ser calibrado por entrada e
ficaria arbitrário. A escala compara a entrada consigo mesma, então o `k`
(o limiar 8) sai da teoria (linear contra quadrático), e não de calibração.

Por que tempo de CPU e não de parede: a carga atrasa o processo na fila do
escalonador, e o `process_time` não conta essa espera. A razão sozinha já
cancelaria boa parte da carga, mas a medição de parede de cada tamanho é
tomada em instantes diferentes, e a carga muda entre eles.

Por que trocar o timeout de parede por `RLIMIT_CPU` na guarda contra
travamento: no teste antigo, 1 MB chegou a levar 16 s de parede sob carga, perto
do `timeout=20` que deveria pegar só travamento. O limite de CPU não dispara
por carga; o timeout de parede ficou em 600 s, só para não pendurar a suíte.

Nos casos em blocos (por exemplo `aspas e espacos no par`), o que cresce é o
tamanho do bloco, não a quantidade de blocos: um custo quadrático dentro de
cada bloco ficaria linear se só a quantidade crescesse.

## Alterações

- `tests/unit/test_varrer_traces.py`: bloco de tempo reescrito (constantes,
  cronômetro do filho, geradores dos casos, teste).

## Verificação

Mutações (aplicadas no `scripts/varrer_traces.py` e revertidas; o caso
correspondente foi acrescentado só durante a mutação):

| Mutante | Entrada | Resultado do teste novo |
|---|---|---|
| `"sk-"` → `(a+)+$` (exponencial) | `"a" * (n // 1000) + "b"` | reprovou: código -24 (SIGXCPU após 10 s de CPU), medido no macOS |
| `"sk-"` → `a*b` (quadrático) | `("a" * (n // 100) + "c") * 100` | reprovou: razão 11,6 > 8 |

O código -24 foi medido no macOS. No Linux, com o limite brando igual ao
rígido (como aqui), o filho pode sair com -24 (SIGXCPU) ou -9 (SIGKILL). O
teste não depende do sinal: aceita qualquer código diferente de 0 como
reprovação.

Instabilidade (20 execuções de pytest por cenário, 8 casos cada; carga = 20
processos `yes` em 10 núcleos). A máquina já estava carregada por outras
sessões, por isso o teste antigo reprovou também sem carga artificial:

| Cenário | Teste antigo | Teste novo |
|---|---|---|
| sem carga artificial | 17/20 execuções reprovadas (67/160 casos; até 11,0 s) | 20/20 aprovadas (0/160 casos) |
| com 20 `yes` | 20/20 reprovadas (160/160 casos; até 16,4 s) | 20/20 aprovadas (0/160 casos) |

## Pendências

Nenhuma nova.
