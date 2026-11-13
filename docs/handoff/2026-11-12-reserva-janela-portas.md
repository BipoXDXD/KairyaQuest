# Reserva da janela de portas entre processos (issue #167)

**Objetivo:** eliminar a falha intermitente de `test_nomes_vizinhos_de_push_nao_colidem`
quando gates de worktrees diferentes rodam ao mesmo tempo.

**Base:** `origin/main` (`ba18b0b`). Nada commitado; a mudança está unstaged.

**Causa:** o fixture escolhia a primeira janela "livre agora" a partir de 20000. Outro
processo pytest podia escolher a mesma janela e ocupar 20001–20024 depois da sondagem, e o
script recusava com "nenhum deslocamento livre de 1 a 24".

**Correção (só no teste):** `_reservar_janela_de_portas()` em
`tests/integration/test_novo_worktree.py` toma `flock(LOCK_EX|LOCK_NB)` em
`<temp do sistema>/kairyaquest-portas-<inicio>.lock`. Uma janela travada é pulada. A trava
fica com o `Repositorio` e é liberada no teardown do fixture `repo` (`liberar_portas`). A
sonda e o timeout do script não mudaram.

**Teste novo:** `test_dois_repositorios_vivos_nunca_dividem_a_janela_de_portas`. Antes da
correção, os dois repositórios recebiam `(20000, 20040, 20080, 20120)`.

**Prova da colisão real:** um processo externo toma a trava da janela 20000 e, quando o teste
começa, ocupa 20001–20024. Antes da correção o teste falhava com "nenhum deslocamento livre";
depois, passa porque o fixture pula para a janela seguinte.

**Riscos:**
- A coordenação depende de os processos verem o mesmo `tempfile.gettempdir()` (o mesmo
  `TMPDIR`).
- O nome da trava segue o início da janela. Se outra branch mudar a geometria (passo ou
  largura), janelas que se sobrepõem passam a ter nomes de trava diferentes e deixam de se
  coordenar até as duas branches convergirem.
