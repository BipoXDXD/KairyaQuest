# Handoff 2026-11-12: kq-settings (pendência 12/151, parte do Settings)

**Objetivo:** documentar e testar o limite do `extra="forbid"` do `Settings`, sem mudar comportamento.

**Decisão:** só fixar o comportamento atual. Variável `FOCUSQUEST_*` desconhecida no arquivo `.env` é erro; a mesma variável só no ambiente do processo é ignorada. Confirmado em `pydantic_settings/sources/providers/dotenv.py` (`extra` só vira dado extra na fonte de arquivo); a fonte de ambiente lê só os campos declarados.

**Alterações:**
- `tests/unit/test_config.py`: um teste novo fixa que a variável desconhecida só no ambiente do processo é ignorada (`_env_file` em `tmp_path`, sem tocar o `.env` real). O lado do arquivo já era coberto por `test_falha_quando_ha_variavel_desconhecida_no_env` e pelo teste de mensagem sem valor; um terceiro teste igual foi descartado na revisão.
- `src/focusquest/core/config.py`: comentário explicando o limite.

**Declarações:** zero dependência, endpoint, migração ou contrato; comportamento inalterado; nenhum teste pulado; limiar intacto. A pendência 12/151 segue aberta nos demais pontos (`uv --env-file`, suíte dependendo da raiz); o HANDOFF não pediu linha em ARCHITECTURE/QUALITY.
