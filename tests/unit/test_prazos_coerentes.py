"""Os prazos do navegador, do proxy e do backend contam a mesma historia.

O frontend tem prazos "sem medida real de rede" (pendencia 193): localhost nao
mede rede, e a producao esta fora de alcance de quem desenvolve. O que se pode
fazer e fixar a RELACAO entre os numeros que a decisao depende, e e isso que
este arquivo faz. Os numeros em si continuam julgamento; o que o gate impede e
que um lado mude sem o outro e o prazo do navegador fique MENOR que o do que ele
precisa esperar, caso em que o `504` com `code` (`tempo_esgotado`) ou o `409`
nunca chegaria a tela: o navegador abortaria antes e sairia um `ApiTimeoutError`
sem `code`.

A cadeia da avaliacao, do menor para o maior:

    tutor_timeout_seconds  <  proxy_read_timeout  <  EVALUATION_TIMEOUT_MS
    (backend, o modelo)       (nginx, producao)       (navegador)

O que NAO esta aqui: dois caminhos em que o `tempo_esgotado` do backend sai
depois do corte do proxy. (1) Com demora nos cabecalhos o SDK chama de novo ate
`TENTATIVAS` vezes, e o pior caso e `(1 + TENTATIVAS) * tutor_timeout_seconds`.
(2) O timeout do SDK e por leitura e o total so e conferido quando um evento
chega, entao uma parada no meio do stream sai em `t + tutor_timeout_seconds`.
Nos dois o nginx responde antes, sem `code`; ficam registrados como pendencia
nova em `docs/handoff/2026-11-11-prazo-medido.md`, nao escondidos por um teste
que os aprovasse.
"""

import re
from pathlib import Path

from focusquest.core.config import Settings
from focusquest.modules.tutoring.service import FOLGA_DO_ORFAO

RAIZ = Path(__file__).resolve().parents[2]
CLIENTE = RAIZ / "frontend/src/shared/api/client.ts"
NGINX = RAIZ / "docker/nginx.conf"

# Julgamento, sem medida: o que sobra, depois do corte do proxy, para o navegador
# receber a resposta (gravacao final e volta pela rede). E a mesma margem que o
# comentario de `EVALUATION_TIMEOUT_MS` ja justificava (90 s + 15 s); o teste a
# promove de prosa a numero conferido. Mudar a margem e decisao, nao ajuste.
MARGEM_DE_VOLTA_MS = 15_000

_CONSTANTE_DO_FRONT = r"export const {nome} = ([\d_]+)\b"
_LOCATION_DA_API = re.compile(r"location \^~ /api \{(.*?)\n    \}", re.DOTALL)
_PROXY_READ_TIMEOUT = re.compile(r"proxy_read_timeout\s+(\d+)s;")


def _prazo_do_front(nome: str) -> int:
    achado = re.search(
        _CONSTANTE_DO_FRONT.format(nome=nome), CLIENTE.read_text("utf-8")
    )
    assert achado is not None, f"`export const {nome} = <numero>` sumiu de client.ts"
    return int(achado.group(1).replace("_", ""))


def _proxy_read_timeout_ms() -> int:
    bloco = _LOCATION_DA_API.search(NGINX.read_text("utf-8"))
    assert bloco is not None, "o `location ^~ /api` sumiu de docker/nginx.conf"
    achado = _PROXY_READ_TIMEOUT.search(bloco.group(1))
    assert achado is not None, "o `location ^~ /api` ficou sem `proxy_read_timeout`"
    return int(achado.group(1)) * 1000


def _tutor_timeout_ms() -> int:
    # O padrao do codigo, e nao `Settings()`: o ambiente da maquina nao pode
    # mudar o resultado de um teste sobre o que o repositorio entrega.
    padrao = Settings.model_fields["tutor_timeout_seconds"].default
    assert isinstance(padrao, int | float)
    return round(padrao * 1000)


def test_os_leitores_acham_numeros_de_verdade() -> None:
    # Guarda contra um regex que nao casa e um teste que passaria vazio.
    for prazo in (
        _prazo_do_front("READ_TIMEOUT_MS"),
        _prazo_do_front("MUTATION_TIMEOUT_MS"),
        _prazo_do_front("EVALUATION_TIMEOUT_MS"),
        _prazo_do_front("ERROR_BODY_TIMEOUT_MS"),
        _proxy_read_timeout_ms(),
        _tutor_timeout_ms(),
    ):
        assert prazo > 0


def test_o_proxy_espera_o_modelo_mais_a_folga_do_orfao() -> None:
    # O `tempo_esgotado` que o backend grava deveria sair em torno de
    # `tutor_timeout_seconds`; o proxy so pode cortar depois, ou o 504 do nginx
    # (sem `code`) venceria o do backend (com `code`). Pode sair DEPOIS disso: o
    # timeout do SDK e por leitura e o total so e conferido quando um evento
    # chega (a docstring do modulo e o handoff da pendencia P-prazo-medido-1).
    # A folga e a mesma do corte do orfao: ate la a avaliacao ainda pode estar
    # em curso, e o reenvio recebe 409.
    folga_ms = round(FOLGA_DO_ORFAO.total_seconds() * 1000)

    assert _proxy_read_timeout_ms() >= _tutor_timeout_ms() + folga_ms


def test_o_prazo_da_avaliacao_cobre_o_corte_do_proxy_com_margem() -> None:
    # Se o navegador abortar antes do nginx responder, a resposta real (um 504
    # sem `code`, mas ainda um fato) vira `ApiTimeoutError`, "resultado
    # desconhecido".
    assert (
        _prazo_do_front("EVALUATION_TIMEOUT_MS")
        >= _proxy_read_timeout_ms() + MARGEM_DE_VOLTA_MS
    )


def test_so_a_avaliacao_espera_o_modelo() -> None:
    # GET e POSTs de estado nao chamam o modelo; um prazo maior que o da
    # avaliacao nessas rotas prenderia a tela por mais tempo que a rota mais
    # lenta do produto.
    maior = _prazo_do_front("EVALUATION_TIMEOUT_MS")

    assert _prazo_do_front("READ_TIMEOUT_MS") < maior
    assert _prazo_do_front("MUTATION_TIMEOUT_MS") < maior
    assert _prazo_do_front("ERROR_BODY_TIMEOUT_MS") < _prazo_do_front("READ_TIMEOUT_MS")
