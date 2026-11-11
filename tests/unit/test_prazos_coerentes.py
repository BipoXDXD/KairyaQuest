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

O orcamento do provedor (pendencia P-prazo-medido-1, resolvida em parte): o
pior caso de UMA chamada ao modelo, calculado do cliente real do SDK
(`max_retries`, as quatro fases do timeout e o backoff), cabe em
`proxy_read_timeout - FOLGA_DO_ORFAO`; e a espera por uma conexao do pool do
banco (`pool_timeout`) cabe na metade da janela de uma rota de leitura ou
mutacao do navegador.

A parada no meio do stream (pendencia P-orcamento-tempo-1, resolvida): o
timeout do SDK e por leitura, entao o stream da tutoria ganhou um teto TOTAL de
parede (`tutoring/leitura.py`) igual a `tutor_timeout_seconds`, contado do
inicio da chamada e conferido sem depender de evento. O teto, mais as fases que
nao sao leitura (que entram na contagem), cabe em `proxy_read_timeout -
FOLGA_DO_ORFAO`: e o que o teste do teto prova abaixo, a partir das constantes
reais. A avaliacao NAO tem esse teto (ela le o stream inteiro por dentro do
adaptador); fica registrado em `docs/handoff/2026-11-11-teto-stream.md`.
"""

import re
from pathlib import Path

from anthropic import _constants as constantes_do_sdk
from sqlalchemy.pool import NullPool, QueuePool

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.service import FOLGA_DO_ORFAO

RAIZ = Path(__file__).resolve().parents[2]
CLIENTE = RAIZ / "frontend/src/shared/api/client.ts"
NGINX = RAIZ / "docker/nginx.conf"

# Julgamento, sem medida: o que sobra, depois do corte do proxy, para o navegador
# receber a resposta (gravacao final e volta pela rede). E a mesma margem que o
# comentario de `EVALUATION_TIMEOUT_MS` ja justificava (90 s + 15 s); o teste a
# promove de prosa a numero conferido. Mudar a margem e decisao, nao ajuste.
MARGEM_DE_VOLTA_MS = 15_000

# Julgamento, sem medida: da janela de uma rota de leitura ou de mutacao, a
# parte que a espera por uma conexao do pool pode gastar. O resto fica para a
# consulta, a gravacao e a volta pela rede depois que a conexao chega.
PARTE_DO_PRAZO_DA_ROTA_PARA_O_POOL = 0.5

_URL_SEM_BANCO = "postgresql+psycopg://u:p@127.0.0.1:1/orcamento_de_tempo"

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


def _provedor_com_os_padroes() -> ProvedorAnthropic:
    """O adaptador montado como `dependencies.py` o monta, so que sem rede e
    sem chave de verdade: o cliente do SDK nao conecta ao nascer."""
    padroes = Settings.model_fields
    return ProvedorAnthropic(
        chave="sk-ant-ficticia",
        base_url="http://127.0.0.1:9",
        modelo="claude-sonnet-5-5",
        max_tokens=256,
        timeout_segundos=float(padroes["tutor_timeout_seconds"].default),
        fallback=True,
        esforco="low",
        esforco_da_avaliacao="medium",
    )


def _pior_caso_do_cliente_ms(provedor: ProvedorAnthropic) -> int:
    """O pior caso de UMA chamada ao provedor, so do que o cliente configura.

    Uma tentativa gasta no maximo `connect + write + read + pool` (cada fase
    tem o seu relogio, e as quatro podem esgotar em sequencia). Entre uma
    tentativa e a seguinte o SDK dorme o backoff exponencial, no maximo
    (jitter so diminui). Tudo lido do cliente real e das constantes do SDK,
    nada copiado.
    """
    cliente = provedor._cliente
    prazo = cliente.timeout
    assert prazo is not None, "sem timeout nao ha pior caso"
    fases = (
        (prazo, prazo, prazo, prazo)
        if isinstance(prazo, int | float)
        else (prazo.connect, prazo.read, prazo.write, prazo.pool)
    )
    assert None not in fases, "uma fase sem prazo nao tem pior caso"
    por_tentativa = sum(float(fase) for fase in fases if fase is not None)
    backoff = sum(
        min(
            constantes_do_sdk.INITIAL_RETRY_DELAY * 2.0**n,
            constantes_do_sdk.MAX_RETRY_DELAY,
        )
        for n in range(cliente.max_retries)
    )
    return round((por_tentativa * (1 + cliente.max_retries) + backoff) * 1000)


def test_o_pior_caso_do_provedor_sai_antes_do_corte_do_proxy_com_folga() -> None:
    # Com os retries do SDK e um timeout igual para as quatro fases, o pior caso
    # era de ~181 s (pendencia P-prazo-medido-1), acima dos 90 s do nginx: o
    # navegador via o 504 do proxy, sem `code`, enquanto o backend seguia pago.
    # A folga e a do orfao: a mesma que o teste do proxy ja exige acima.
    folga_ms = round(FOLGA_DO_ORFAO.total_seconds() * 1000)

    pior_caso = _pior_caso_do_cliente_ms(_provedor_com_os_padroes())

    assert pior_caso <= _proxy_read_timeout_ms() - folga_ms


def test_o_teto_de_parede_do_stream_cabe_no_corte_do_proxy_com_folga() -> None:
    # O teto e o `limite` da tutoria (`tutor_timeout_seconds`), conferido por um
    # relogio de parede que anda MESMO SEM evento: sem ele, uma parada depois de
    # ~36 s do pedido saia depois dos 90 s do nginx (timeout por leitura de 54 s
    # contado do ultimo evento). A conta e CONSERVADORA: a conexao, a escrita e
    # a fila do pool ja estao dentro do teto (ele conta do inicio da chamada), e
    # mesmo assim sao somadas de novo.
    cliente = _provedor_com_os_padroes()._cliente
    prazo = cliente.timeout
    assert not isinstance(prazo, int | float | None), "o cliente tem fases nomeadas"
    assert prazo.connect is not None
    assert prazo.write is not None
    assert prazo.pool is not None
    fases_fora_da_leitura_ms = round((prazo.connect + prazo.write + prazo.pool) * 1000)
    folga_ms = round(FOLGA_DO_ORFAO.total_seconds() * 1000)

    assert (
        _tutor_timeout_ms() + fases_fora_da_leitura_ms
        <= _proxy_read_timeout_ms() - folga_ms
    )


def test_o_cliente_do_provedor_nao_repete_a_chamada() -> None:
    # O teto acima so e uma prova com `max_retries == 0`: a partir da primeira
    # retentativa o SDK 1.x obedece ao `Retry-After` da resposta SEM limite
    # (`_calculate_retry_timeout`), e o pior caso deixa de ser calculavel pelo
    # que o cliente configura. A retentativa, se um dia voltar, e do chamador.
    assert _provedor_com_os_padroes()._cliente.max_retries == 0


def test_o_pool_desiste_antes_de_a_rota_de_leitura_ou_mutacao_estourar() -> None:
    # `pool_timeout` padrao do SQLAlchemy: 30 s, acima dos 20 s do navegador.
    # Com o pool esgotado a rota esperaria depois de o navegador desistir.
    pool = create_engine_from_url(_URL_SEM_BANCO).pool
    assert isinstance(pool, QueuePool)
    rota_mais_curta_ms = min(
        _prazo_do_front("READ_TIMEOUT_MS"), _prazo_do_front("MUTATION_TIMEOUT_MS")
    )

    assert (
        pool.timeout() * 1000 <= rota_mais_curta_ms * PARTE_DO_PRAZO_DA_ROTA_PARA_O_POOL
    )


def test_o_pool_do_alembic_continua_sem_pool_nenhum() -> None:
    # `pool_timeout` so existe no QueuePool: passado ao NullPool do Alembic, o
    # `create_engine` recusaria o argumento.
    engine = create_engine_from_url(_URL_SEM_BANCO, poolclass=NullPool)

    assert isinstance(engine.pool, NullPool)
