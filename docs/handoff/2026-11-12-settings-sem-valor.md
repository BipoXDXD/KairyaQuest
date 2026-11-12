# Settings sem valor no erro de validação (2026-11-12)

## Objetivo
O erro de validação do `Settings` imprimia `input_value=...`; se o valor fosse
segredo, vazava no terminal e no log.

## Decisão
`hide_input_in_errors=True` no `model_config` de `ConfiguracaoDeLog` e de
`Settings` (únicos `BaseSettings` em `src/`), com comentário de uma linha.

## Testes (tests/unit/test_config.py)
- Chave extra no dotenv (o pydantic-settings só produz `extra_forbidden` a
  partir de arquivo dotenv, nunca de `os.environ`) com canário: erro não o contém.
- `FOCUSQUEST_DB_PORT` inválido com canário: erro não o contém.

## Resultados
- Antes da correção: os 2 testes novos falham.
- Depois: os 2 passam.
- Causa raiz dos 2 testes que falhavam: liam o `.env` real (cwd) e dependiam
  dele para as URLs do banco; um `.env` local com chave desconhecida (ex.: a
  de um provedor já removido) os derrubava por outro motivo.
- Correção: `test_a_suite_nunca_aponta_para_a_anthropic` e
  `test_a_guarda_vale_com_a_chave_exportada_no_ambiente` agora usam
  `_ambiente_minimo` (chdir para tmp + variáveis do banco) e `_env_file=None`.
  Os demais testes de config/log/tutoria já faziam chdir para tmp_path.
- Prova: com um `.env` temporário contendo `FOCUSQUEST_CHAVE_DESCONHECIDA` no
  cwd (fora do repositório, apagado depois), os dois passam. O `.env` real
  nunca foi lido nem editado.
