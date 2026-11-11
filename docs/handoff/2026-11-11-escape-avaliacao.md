# Pendência 205: separadores de linha no turno da avaliação — 2026-11-11

A linha 205 da tabela de pendências ("`rubric.py` usa
`json.dumps(ensure_ascii=False)` sem escapar U+2028, U+2029 e U+0085 …
Alinhar a avaliação num PR próprio") fica **resolvida por esta seção**.

**Objetivo.** O turno da avaliação serializava a missão e a evidência com
`json.dumps(dados, ensure_ascii=False)`, que deixa U+2028, U+2029 e U+0085
crus. `str.splitlines()` (e vários renderizadores) trata os três como quebra
de linha, então uma evidência podia abrir linha no meio do JSON. A tutoria já
os escapava no contexto e no histórico da Kairya.

**Revisão-base.** `origin/main` em `e4d1ddd`.

**O que mudou.**
- `src/focusquest/modules/tutoring/provider.py`: ganha a função pública
  `como_dado(valor)` e a tabela `_SEPARADORES_QUE_O_JSON_NAO_ESCAPA`, movidas
  sem mudança de comportamento de `tutoring/context.py` (onde eram
  `_como_dado` e a mesma tabela).
- `src/focusquest/modules/tutoring/context.py`: importa `como_dado` de
  `provider.py`; o contexto e as ações do histórico saem iguais.
- `src/focusquest/modules/evaluation/rubric.py`: `montar_turno_da_avaliacao`
  serializa por `como_dado` em vez de `json.dumps`, e o docstring diz isso.
- `tests/unit/test_evaluation_rubric.py`: teste novo
  `test_separadores_de_linha_saem_escapados_e_voltam_intactos`, com os três
  caracteres na instrução, no critério e na evidência. Ele prova que o texto
  da mensagem não contém nenhum deles cru, que é uma linha só e que o
  `json.loads` devolve exatamente os valores originais. Os caracteres estão
  escritos como escape (`"\u2028"`, `"\u2029"` e `"\x85"`) no fonte do teste.

**Decisão: reusar, não duplicar.** Reusar não exigiu tocar
`tutoring/service.py` nem importar interno da tutoria. A função saiu de
`context.py`, onde era privada, para `provider.py`, onde é pública. A
avaliação já dependia de `provider.py` (`Turno`, `MensagemDoTurno`,
`Ferramenta`), e o `docs/ARCHITECTURE.md` descreve esse arquivo como o ponto
que a avaliação consome da tutoria. A aresta `evaluation -> tutoring` já
existia, a tutoria não importa a avaliação, e
`tests/unit/test_fronteira_dos_modulos.py` continua verde. Alternativas
descartadas:
- importar `context._como_dado` da avaliação: atravessaria a fronteira por um
  nome privado;
- pôr a função em `core/`: o `ARCHITECTURE.md` diz que `core/` "não é
  depósito de funções soltas", e um arquivo novo lá deixaria o documento
  desatualizado, que este lote não pode editar;
- duplicar a função: seriam duas cópias da mesma regra de segurança do prompt,
  e a próxima correção poderia atingir só uma delas.

**Comandos e resultados.**
- `uv run pytest tests/unit/test_evaluation_rubric.py` antes da correção:
  o teste novo reprovou em `assert not any(s in mensagem.texto ...)`, porque
  os separadores chegavam crus.
- Depois da correção, `uv run pytest tests/unit/test_evaluation_rubric.py
  tests/unit/test_tutoring_context.py tests/unit/test_fronteira_dos_modulos.py`:
  todos passaram. `ruff check` e `mypy --strict` sobre os dois módulos estão
  limpos.
- `make check` completo: EXIT 0. pytest com 1719 passed e cobertura de 100%,
  vitest com 1157 passed e cobertura de 100%, Playwright com 68 passed,
  `check-handoff` com `docs/HANDOFF.md` intocado e gitleaks sem achados.

**Pendências.** Nenhuma nova. A pendência 205 fica resolvida, e não sobra
uma segunda cópia do escape para unificar depois.
