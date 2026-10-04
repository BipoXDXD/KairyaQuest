"""Configuracao de logging do app (pendencia 13).

Minima de proposito: um handler no stderr, um formato simples e um nivel que
vale SO para os loggers do app (`focusquest.*`). Tres decisoes, com motivo:

1. **O handler vai na raiz, e so se a raiz nao tiver nenhum.** E o que o
   `logging.basicConfig` faz, e e por isso que ele e usado: se quem roda o app
   ja configurou a raiz (um `--log-config` do uvicorn, os handlers de captura
   do pytest), nada e empilhado por cima; e chamar de novo nao duplica nada.
   O uvicorn, na configuracao padrao, poe handler nos loggers `uvicorn*` com
   `propagate: false` e nenhum na raiz -- as linhas dele nao passam pelo
   handler do app, e as do app saem uma vez (medido, `tests/unit/test_log.py`).
2. **O nivel vai no logger `focusquest`, nao na raiz.** A raiz fica em WARNING
   (o padrao do Python). Pedir DEBUG para depurar o app nao liga o DEBUG do
   `httpx` nem do SDK da Anthropic, que registram as requisicoes, nem o INFO
   do `sqlalchemy.engine`, que registra cada SQL: e por essas torneiras que
   cabecalho com chave e URL de banco vazariam.
3. **Sem dependencia nova e sem JSON.** Um formato de texto com instante,
   nivel, logger e mensagem basta para um processo local; log estruturado
   entra quando houver quem o consuma.
"""

import logging

FORMATO = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configurar_logging(nivel: str) -> None:
    """Instala o handler do app (se a raiz nao tiver um) e aplica `nivel` aos
    loggers `focusquest.*`. Idempotente."""
    logging.basicConfig(format=FORMATO)
    logging.getLogger("focusquest").setLevel(nivel)
