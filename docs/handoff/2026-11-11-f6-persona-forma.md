# wt/f6-persona-forma: regras de forma do chat travadas por teste (F6 Tarefa 6.3a) — 2026-11-11

Objetivo: impedir a regressão silenciosa das regras de forma da Kairya no chat
(persona, seção 3) nos dois idiomas. Revisão-base: `162fc1f` (main).
Plano: `docs/superpowers/plans/2026-11-11-f6-presenca.md` (Tarefa 6.3a).

## Declarações

- Zero dependência nova (nem de runtime, nem de dev).
- Zero endpoint novo.
- Zero migração, zero coluna nova.
- Nenhum texto de produto mudou: só testes e este fragmento.

## Decisões

- **R14, persona: só travar por teste.** As regras de forma da §4 da spec já
  estavam nos dois arquivos (`persona.pt-BR.md` e `persona.en.md`, seção 3
  "Forma do chat"). O plano não reescreve o texto; só impede que uma edição
  futura apague uma regra sem que algum teste reprove.
- **Análise de que o texto já cumpria a §4.** As cinco regras (até cerca de 120
  palavras, uma pergunta por vez, próximo passo concreto, sem diagnóstico nem
  promessa, resposta no idioma da pessoa) existiam literalmente na seção 3 dos
  dois idiomas. Os testes novos nasceram verdes por construção; a prova de que
  protegem é a sabotagem abaixo.
- **Trecho literal, na seção certa.** Cada regra é afirmada dentro de
  `secoes(persona_do_idioma(idioma))["3"]`, não no texto inteiro: a mesma frase
  em outra seção não satisfaz o teste. Os trechos ficam num dicionário
  `REGRAS_DE_FORMA` (regra -> idioma -> trecho), e o `id` do caso nomeia a regra.
- **Ordem das seções.** A forma do chat (3) precede as missões (4) no texto em
  pt-BR; vive em `test_tutoring_persona.py`, onde já moram as invariantes
  de estrutura do pt-BR.

## Alterações

- `tests/unit/test_prompts_concordancia.py`:
  `test_persona_fixa_as_regras_de_forma_do_chat` (5 regras x 2 idiomas) e a
  constante `REGRAS_DE_FORMA`.
- `tests/unit/test_tutoring_persona.py`:
  `test_a_forma_do_chat_vem_antes_das_ferramentas`.

## Comandos e resultados

- `uv run pytest tests/unit/test_tutoring_persona.py tests/unit/test_prompts_concordancia.py -q`: verde.
- `uv run ruff check`, `uv run ruff format --check` e `uv run mypy` nos dois arquivos: verdes.
- Sabotagem manual, sempre restaurada com `git checkout --`:
  - apagar a regra "Never give a health diagnosis..." de `persona.en.md`
    reprova só `[sem_diagnostico_e_sem_promessa-en]`;
  - apagar a regra "Até cerca de 120 palavras..." de `persona.pt-BR.md`
    reprova só `[ate_120_palavras-pt-BR]`;
  - renumerar a seção 3 do pt-BR reprova a ordem, a concordância de
    cabeçalhos e as cinco regras do pt-BR.

## Pendências

Nenhuma nova.
