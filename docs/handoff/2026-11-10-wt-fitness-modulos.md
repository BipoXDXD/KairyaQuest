# Pendência 88: fitness function das fronteiras entre módulos — 2026-11-10

A linha 88 da tabela de pendências do `docs/HANDOFF.md` fica **resolvida por
esta seção**: os dois pares de pacotes que dependem um do outro continuam
existindo, mas agora estão numa allowlist nomeada e verificada pelo gate, e
um terceiro par reprova o `make check`.

**Objetivo.** Provar no build a convenção de fronteira 2 do
`docs/ARCHITECTURE.md` §5 ("nada de dependência circular") entre os pacotes
de `src/focusquest/modules/`, aceitando só os dois pares já registrados.

**Revisão-base.** `origin/main` em `258e801`.

**Decisões.**

- **Teste em `tests/unit/test_fronteira_dos_modulos.py`, com `ast` da stdlib**,
  sem dependência nova (nem `import-linter`, nem `pytestarch`). Segue o
  mesmo desenho de `tests/unit/test_core_sem_modulos.py`, que prova a outra
  direção (`core` não importa `modules`); aquele teste não cobre ciclos entre
  módulos, então não havia teste equivalente.
- **Allowlist `PARES_CONHECIDOS`**, com o porquê de cada par:
  `missions <-> progression` (missions credita a conclusão e mostra a
  recompensa, D3/D10; progression lê os fatos da missão e o `Veredito`) e
  `progression <-> tutoring` (tutoring lê o progresso para o turno, D15;
  progression lê `TutorAction`).
- **Allowlist não envelhece:** se um par listado deixar de existir, o teste
  reprova pedindo para tirá-lo da lista.
- **Mensagem de falha** traz o par e cada `arquivo:linha` dos imports nos dois
  sentidos, relativo a `modules/`.
- **Todo import estático conta**, inclusive dentro de função e de
  `if TYPE_CHECKING`: todos criam dependência de código-fonte. Imports
  relativos são resolvidos contra o pacote do arquivo.
- **Item (b) do pedido — proibir import de submódulo interno de outro
  módulo — não foi implementado.** O projeto não tem convenção de API pública
  por módulo: os `__init__.py` de `modules/*` só têm docstring, não há
  `api.py`, e o `docs/ARCHITECTURE.md` documenta imports diretos de
  `domain`, `models`, `service`, `schemas`, `provider` etc. entre módulos
  como o desenho atual. Ver limitações.

**Alterações.** Só o arquivo de teste novo e este handoff. Nenhum código de
produção mudou.

**Prova.**

- Vermelho: com `PARES_CONHECIDOS` vazio, o teste sobre o `modules/` real
  reprova listando exatamente os dois pares, com `arquivo:linha` de cada
  import (por exemplo `missions -> progression em missions/service.py:49`).
- Sabotagem, medida e desfeita: um `from focusquest.modules.tutoring.domain
  import Papel` no fim de `missions/cycle_domain.py` reprova com
  `par novo nos dois sentidos, missions <-> tutoring`, apontando
  `missions/cycle_domain.py:263` e os imports de volta em `tutoring/`.
- Testes unitários do detector sobre árvores sintéticas (`tmp_path`): cada
  forma de import (absoluto, `from ... import submódulo`, relativo em um e em
  dois níveis, prefixo parecido `modulesx`), `arquivo:linha` e aresta para o
  próprio pacote ignorada, par novo reprova, par conhecido que sumiu reprova,
  par conhecido presente não reprova.
- Colisão com as frentes abertas: o detector rodou sobre a árvore de cada uma
  das 29 branches `origin/wt/f*` (inclusive `wt/fix-flaky-decide`), em
  worktree temporário destacado. Nenhuma cria par novo nem apaga um par
  conhecido; nenhuma reprovaria por este teste.

**Comandos e resultados.**

- `pytest tests/unit/test_fronteira_dos_modulos.py`: 15 aprovados.
- `ruff check`, `ruff format --check` e `mypy` no arquivo novo: sem achados.
- `make check` completo: resultado registrado no corpo do PR.

**Limitações.**

- Sem regra de API pública entre módulos (item b): um módulo pode importar
  qualquer submódulo de outro. Para ter essa regra é preciso antes decidir a
  convenção (por exemplo, `__init__.py` reexportando a API, ou um `api.py`
  por módulo) e migrar os imports atuais; é decisão de arquitetura, não deste
  PR.
- A prova é por pares de pacotes (ciclos de tamanho 2). Um ciclo maior que
  não forme par mútuo (A → B → C → A) não é detectado. Hoje já existe um:
  `missions → progression → tutoring → missions`, todo feito de arestas dos
  dois pares conhecidos; `evaluation` fica fora de qualquer ciclo, porque só
  `main.py` o importa.
- Como em `test_core_sem_modulos.py`, `importlib.import_module` e
  `__import__` ficam fora da análise estática.
- O arquivo segue o nome pedido para este lote
  (`2026-11-10-wt-fitness-modulos.md`), que difere do padrão proposto no
  `docs/handoff/README.md` da branch `wt/handoff-fragmentos` (sem o `wt-`).
