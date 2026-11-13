"""`scripts/varrer_traces.py`: a guarda que antecede o upload dos traces do E2E.

O job `check-e2e` sobe `frontend/test-results/` como artefato quando falha, e
o repositorio e publico: o que esta no trace e baixavel por qualquer pessoa.
O script e a ultima barreira (o job nao tem segredo nenhum), e o que ele
promete e testado aqui, pelo processo de verdade:

- limpo passa; cada padrao reprova;
- o VALOR achado nunca aparece na saida (so caminho, padrao e contagem);
- zip, inclusive zip dentro de zip e conteudo comprimido, e varrido;
- o que nao pode ser varrido reprova (falha fechada), e nao passa em silencio.
"""

import importlib.util
import random
import subprocess
import sys
import zipfile
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

import pytest

ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".git").exists())
SCRIPT = ROOT / "scripts" / "varrer_traces.py"

# Um valor que nao existe em nenhuma mensagem do script: se ele aparecer na
# saida, o script ecoou o conteudo varrido.
CANARIO = "CANARIO7f3a9c1e"


def _varrer(*argumentos: Path | str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-I", str(SCRIPT), *map(str, argumentos)],
        capture_output=True,
        text=True,
        check=False,
    )


def _saida(processo: subprocess.CompletedProcess[str]) -> str:
    return processo.stdout + processo.stderr


def _zip(destino: Path, membros: dict[str, bytes | Path]) -> Path:
    """Um zip COMPRIMIDO (deflate): o texto nao aparece nos bytes crus."""
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as arquivo:
        for nome, conteudo in membros.items():
            if isinstance(conteudo, Path):
                arquivo.write(conteudo, nome)
            else:
                arquivo.writestr(nome, conteudo)
    return destino


def _carregar_modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("varrer_traces", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    # O @dataclass resolve o modulo pelo nome em `sys.modules`.
    sys.modules["varrer_traces"] = modulo
    spec.loader.exec_module(modulo)
    return modulo


# --- o que esta limpo passa --------------------------------------------------

LIMPOS = {
    "texto comum": b"POST /api/plan 200 OK\nmissao concluida\n",
    "palavra que contem sk-": b'class="task-card-title-longo" data-risk-level-high',
    "chave ficticia do E2E": b'{"name":"x-api-key","value":"e2e-chave-ficticia"}',
    "chave ficticia em texto": b"x-api-key: e2e-chave-ficticia\n",
    "cookie sem valor": b'{"name":"cookie","value":""} "cookies":[]',
    "authorization citado sem valor": b'o cabecalho "Authorization" nao e enviado',
    "bearer em prosa": b"the bearer of news",
    "gsk_ curto demais": b"gsk_abc",
    "x-api-key escapado com a ficticia": (rb"{\"x-api-key\":\"e2e-chave-ficticia\"}"),
    "cookie escapado sem valor": rb"{\"cookie\":\"\"}",
    "par name/value escapado sem valor": (
        rb"{\"name\":\"authorization\",\"value\":\"\"}"
    ),
}


@pytest.mark.parametrize("conteudo", LIMPOS.values(), ids=LIMPOS.keys())
def test_conteudo_limpo_passa(tmp_path: Path, conteudo: bytes) -> None:
    (tmp_path / "trace.network").write_bytes(conteudo)
    _zip(tmp_path / "trace.zip", {"0-trace.network": conteudo})

    processo = _varrer(tmp_path)

    assert processo.returncode == 0, _saida(processo)
    assert "2 arquivo(s) varrido(s), nada achado" in processo.stdout


# --- cada padrao reprova, e o valor nunca sai --------------------------------

SEGREDOS = {
    "sk- da Anthropic": f"sk-ant-api03-{CANARIO}",
    "sk- generico": f"sk-{CANARIO}",
    "sk_ da ElevenLabs": f"sk_{CANARIO}",
    "tsk_ da Tripo": f"tsk_{CANARIO}",
    "gsk_ de provedor de LLM": f"gsk_{CANARIO}",
    "Bearer": f"Bearer {CANARIO}",
    "bearer minusculo": f"bearer {CANARIO}",
    "Authorization em texto": f"Authorization: {CANARIO}",
    "authorization em json": f'{{"authorization": "{CANARIO}"}}',
    "Authorization no par do trace": (
        f'{{"name":"Authorization","value":"{CANARIO}"}}'
    ),
    "Proxy-Authorization": f"Proxy-Authorization: {CANARIO}",
    "x-api-key diferente da ficticia": f"x-api-key: {CANARIO}",
    "x-api-key no par do trace": f'{{"name":"X-Api-Key","value":"{CANARIO}"}}',
    # JSON dentro de string JSON (corpo de resposta gravado no trace): as
    # aspas chegam escapadas, `\\"`.
    "authorization escapado": rf"{{\"authorization\":\"Basic {CANARIO}\"}}",
    "authorization escapado em duplo nivel": (
        rf"{{\\\"authorization\\\":\\\"Basic {CANARIO}\\\"}}"
    ),
    "cookie escapado": rf"{{\"cookie\":\"sid={CANARIO}\"}}",
    "x-api-key escapado": rf"{{\"x-api-key\":\"{CANARIO}\"}}",
    "par name/value escapado": (
        rf"{{\"name\":\"Authorization\",\"value\":\"Bearer-{CANARIO}\"}}"
    ),
    # Cabecalhos colados num corpo gravado como string JSON: a quebra de
    # linha chega como `\\r\\n` (barra + letra), e a letra nao e fronteira.
    "authorization e cookie apos CRLF escapado": (
        rf"texto\r\nauthorization: Basic {CANARIO}\r\ncookie: sid={CANARIO}"
    ),
    "Cookie apos LF escapado": rf"texto\nCookie: sid={CANARIO}",
    "x-api-key apos CRLF escapado": rf"texto\r\nx-api-key: {CANARIO}",
    "sk- apos LF escapado": rf"texto\nsk-ant-api03-{CANARIO}",
    "Bearer apos LF escapado": rf"texto\nBearer {CANARIO}",
    "Cookie em texto": f"Cookie: sessao={CANARIO}",
    "Set-Cookie em texto": f"Set-Cookie: sessao={CANARIO}; HttpOnly",
    "cookie no par do trace": f'{{"name":"cookie","value":"sessao={CANARIO}"}}',
    "set-cookie no par do trace": (
        f'{{"name":"set-cookie","value":"sessao={CANARIO}"}}'
    ),
}


@pytest.mark.parametrize("segredo", SEGREDOS.values(), ids=SEGREDOS.keys())
def test_cada_padrao_reprova_sem_imprimir_o_valor(tmp_path: Path, segredo: str) -> None:
    (tmp_path / "test-1").mkdir()
    arquivo = tmp_path / "test-1" / "error-context.md"
    arquivo.write_text(f"texto antes\n{segredo}\ntexto depois\n", encoding="utf-8")

    processo = _varrer(tmp_path)

    assert processo.returncode == 1, _saida(processo)
    assert CANARIO not in _saida(processo)
    assert arquivo.as_posix() in processo.stdout
    assert "NAO sera enviado" in processo.stderr


def test_a_saida_traz_o_caminho_o_padrao_e_a_contagem(tmp_path: Path) -> None:
    (tmp_path / "a.txt").write_text(
        f"gsk_{CANARIO} e outra gsk_{CANARIO}XX", encoding="utf-8"
    )

    processo = _varrer(tmp_path)

    assert processo.returncode == 1
    assert f"{tmp_path / 'a.txt'}: padrao gsk_ x2" in processo.stdout


def test_dois_padroes_no_mesmo_arquivo_saem_separados(tmp_path: Path) -> None:
    (tmp_path / "a.txt").write_text(
        f"Bearer {CANARIO}\nSet-Cookie: s={CANARIO}\n", encoding="utf-8"
    )

    processo = _varrer(tmp_path)

    assert processo.returncode == 1
    assert "padrao Bearer x1" in processo.stdout
    assert "padrao cookie x1" in processo.stdout
    assert CANARIO not in _saida(processo)


# --- tempo: entrada patologica nao pode travar a varredura ------------------
#
# Duas garantias, ambas em tempo de CPU do processo filho
# (`time.process_time`, que nao conta a espera na fila do escalonador, entao a
# carga da maquina nao reprova o teste sem haver ReDoS):
#
# 1. Teto absoluto: a entrada de 1 MB e varrida em menos de TETO_DE_TEMPO_S
#    de CPU. Pega regressao de custo constante que a escala nao ve.
# 2. Forma do custo: com a entrada de tamanho n e 4n, o custo cresce no
#    maximo RAZAO_MAXIMA vezes. Linear cresce 4x; quadratico, 16x; 8 e a
#    media geometrica, a mesma folga (2x) para os dois lados. Medido: de 3,5
#    a 4,4 com e sem 20 processos `yes` em 10 nucleos
#    (docs/handoff/2026-11-12-varrer-custo-escala.md).
#
# O minimo de REPETICOES medidas descarta interrupcoes isoladas.
FATOR_DE_ESCALA = 4
RAZAO_MAXIMA = 8.0
TAMANHO_BASE = 250_000
TETO_DE_TEMPO_S = 1.0
REPETICOES = 3
# Custo minimo assumido para a entrada pequena: evita divisao por zero quando
# a varredura e rapida demais para a resolucao do relogio. O teto absoluto
# continua cobrindo a entrada grande.
PISO_DE_CUSTO_S = 1e-4
# Retrocesso catastrofico (exponencial) nao chega a dar razao: o filho queima
# CPU ate o RLIMIT_CPU e o sistema o mata. O limite e de CPU, e nao de
# parede, para que a carga nao o dispare. O timeout de parede so evita
# pendurar a suite.
TETO_DE_CPU_S = 10
TETO_DO_PROCESSO_S = 60

_CRONOMETRO = """
import importlib.util, resource, sys, time
teto = int(sys.argv[4])
resource.setrlimit(resource.RLIMIT_CPU, (teto, teto))
spec = importlib.util.spec_from_file_location("varrer_traces", sys.argv[1])
modulo = importlib.util.module_from_spec(spec)
sys.modules["varrer_traces"] = modulo
spec.loader.exec_module(modulo)
pequena = open(sys.argv[2], "rb").read()
grande = open(sys.argv[3], "rb").read()

def custo(dados):
    inicio = time.process_time()
    modulo.contar_padroes(dados)
    return time.process_time() - inicio

custos_pequena, custos_grande = [], []
for _ in range(int(sys.argv[5])):
    custos_pequena.append(custo(pequena))
    custos_grande.append(custo(grande))
print(min(custos_pequena), min(custos_grande))
"""

# Cada caso e gerado no tamanho pedido. Nos casos em blocos, cresce o bloco e
# nao a quantidade de blocos: um custo quadratico DENTRO de cada bloco ficaria
# linear se so a quantidade dobrasse.
PATOLOGICAS: dict[str, Callable[[int], bytes]] = {
    "barras invertidas puras": lambda n: b"\\" * n,
    "barras com aspas intercaladas": lambda n: (b"\\" * (n // 1_000) + b'"') * 1_000,
    "barra-aspas repetidas": lambda n: b'\\"' * (n // 2),
    "barras antes de name": lambda n: (b"\\" * (n // 200) + b"name") * 200,
    "barras depois de authorization": lambda n: b"authorization" + b"\\" * n,
    "espacos depois de authorization": lambda n: b"authorization" + b" " * n,
    "espacos depois de bearer": lambda n: b"bearer" + b" " * n,
    "aspas e espacos no par": lambda n: (b'"name"' + b" " * (n // 1_000)) * 1_000,
}


def _medir_custos(
    script: Path, pequena: bytes, grande: bytes, diretorio: Path, teto_de_cpu_s: int
) -> tuple[float, float] | None:
    """Custo de CPU minimo de `contar_padroes` em (pequena, grande).

    None quando o filho morre (RLIMIT_CPU estourado: retrocesso catastrofico).
    """
    arquivo_pequeno = diretorio / "pequena.bin"
    arquivo_pequeno.write_bytes(pequena)
    arquivo_grande = diretorio / "grande.bin"
    arquivo_grande.write_bytes(grande)
    try:
        processo = subprocess.run(
            [
                sys.executable,
                "-I",
                "-c",
                _CRONOMETRO,
                str(script),
                str(arquivo_pequeno),
                str(arquivo_grande),
                str(teto_de_cpu_s),
                str(REPETICOES),
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=TETO_DO_PROCESSO_S,
        )
    except subprocess.TimeoutExpired:
        pytest.fail(f"a varredura passou de {TETO_DO_PROCESSO_S} s de parede (ReDoS)")
    if processo.returncode != 0:
        return None
    custo_pequena, custo_grande = (float(campo) for campo in processo.stdout.split())
    return custo_pequena, custo_grande


def _razao(custo_pequena: float, custo_grande: float) -> float:
    return custo_grande / max(custo_pequena, PISO_DE_CUSTO_S)


@pytest.mark.parametrize("gerar", PATOLOGICAS.values(), ids=PATOLOGICAS.keys())
def test_entrada_patologica_de_1_mb_e_varrida_em_custo_linear_e_abaixo_do_teto(
    tmp_path: Path, gerar: Callable[[int], bytes]
) -> None:
    custos = _medir_custos(
        SCRIPT,
        gerar(TAMANHO_BASE),
        gerar(FATOR_DE_ESCALA * TAMANHO_BASE),
        tmp_path,
        TETO_DE_CPU_S,
    )

    assert custos is not None, f"a varredura passou de {TETO_DE_CPU_S} s de CPU (ReDoS)"
    custo_pequena, custo_grande = custos
    assert custo_grande < TETO_DE_TEMPO_S
    assert _razao(custo_pequena, custo_grande) < RAZAO_MAXIMA


def test_medicao_reprova_varredor_vulneravel_a_redos(tmp_path: Path) -> None:
    # Sabotagem: um varredor com retrocesso exponencial tem de ser reprovado
    # pela mesma medicao. Se passar, ela deixou de enxergar ReDoS.
    vulneravel = tmp_path / "varredor_vulneravel.py"
    vulneravel.write_text(
        "import re\n"
        "_PADRAO = re.compile(rb'(\\\\+)+$')\n"
        "def contar_padroes(dados):\n"
        "    return sum(1 for _ in _PADRAO.finditer(dados))\n"
    )
    teto_curto_de_cpu_s = 2

    custos = _medir_custos(
        vulneravel, b"\\" * 16 + b"x", b"\\" * 64 + b"x", tmp_path, teto_curto_de_cpu_s
    )

    reprovaria = (
        custos is None
        or custos[1] >= TETO_DE_TEMPO_S
        or _razao(*custos) >= RAZAO_MAXIMA
    )
    assert reprovaria


# --- zip ---------------------------------------------------------------------


def test_segredo_dentro_do_zip_comprimido_reprova(tmp_path: Path) -> None:
    pasta = tmp_path / "test-1"
    pasta.mkdir()
    conteudo = f'{{"authorization":"Bearer {CANARIO}"}}'.encode()
    # Comprimido: se o script varresse so os bytes crus do .zip, nao veria.
    zip_do_trace = _zip(pasta / "trace.zip", {"0-trace.network": conteudo * 50})
    assert CANARIO.encode() not in zip_do_trace.read_bytes()

    processo = _varrer(tmp_path)

    assert processo.returncode == 1, _saida(processo)
    assert f"{zip_do_trace.as_posix()}!/0-trace.network: padrao Bearer" in (
        processo.stdout
    )
    assert CANARIO not in _saida(processo)


def test_zip_aninhado_e_varrido(tmp_path: Path) -> None:
    folha = _zip(tmp_path / "folha.zip", {"dentro.txt": f"gsk_{CANARIO}".encode()})
    meio = _zip(tmp_path / "meio.zip", {"folha.zip": folha})
    folha.unlink()
    topo = _zip(tmp_path / "trace.zip", {"meio.zip": meio})
    meio.unlink()

    processo = _varrer(tmp_path)

    assert processo.returncode == 1, _saida(processo)
    assert (
        f"{topo.as_posix()}!/meio.zip!/folha.zip!/dentro.txt: padrao gsk_"
        in processo.stdout
    )
    assert CANARIO not in _saida(processo)


def test_zip_limpo_aninhado_passa(tmp_path: Path) -> None:
    folha = _zip(tmp_path / "folha.zip", {"a.txt": b"nada aqui"})
    _zip(tmp_path / "trace.zip", {"folha.zip": folha})
    folha.unlink()

    processo = _varrer(tmp_path)

    assert processo.returncode == 0, _saida(processo)


# --- o que nao pode ser varrido reprova (falha fechada) -----------------------


def test_diretorio_inexistente_reprova(tmp_path: Path) -> None:
    processo = _varrer(tmp_path / "nao-existe")

    assert processo.returncode == 2
    assert "nao e um diretorio existente" in processo.stderr


def test_arquivo_no_lugar_do_diretorio_reprova(tmp_path: Path) -> None:
    arquivo = tmp_path / "arquivo.txt"
    arquivo.write_text("x", encoding="utf-8")

    processo = _varrer(arquivo)

    assert processo.returncode == 2
    assert "nao e um diretorio existente" in processo.stderr


def test_diretorio_existente_e_vazio_passa(tmp_path: Path) -> None:
    (tmp_path / "subpasta-vazia").mkdir()

    processo = _varrer(tmp_path)

    assert processo.returncode == 0
    assert "0 arquivo(s) varrido(s), nada achado" in processo.stdout


@pytest.mark.parametrize("argumentos", [[], ["a", "b"]], ids=["nenhum", "dois"])
def test_uso_errado_reprova(argumentos: list[str]) -> None:
    processo = _varrer(*argumentos)

    assert processo.returncode == 2
    assert "uso:" in processo.stderr


def test_zip_que_nao_e_zip_reprova(tmp_path: Path) -> None:
    (tmp_path / "trace.zip").write_bytes(b"isto nao e um zip")

    processo = _varrer(tmp_path)

    assert processo.returncode == 2
    assert "termina em .zip mas nao e um zip" in processo.stderr


def test_zip_truncado_reprova(tmp_path: Path) -> None:
    inteiro = _zip(tmp_path / "inteiro.zip", {"a.txt": b"conteudo " * 200})
    bytes_do_zip = inteiro.read_bytes()
    inteiro.unlink()
    (tmp_path / "trace.zip").write_bytes(bytes_do_zip[: len(bytes_do_zip) // 2])

    processo = _varrer(tmp_path)

    assert processo.returncode == 2, _saida(processo)


def test_membro_corrompido_reprova(tmp_path: Path) -> None:
    # Bytes incompressiveis: o fluxo do membro e longo o bastante para os
    # bytes estragados abaixo caiam DENTRO dele, e nao no diretorio central.
    conteudo = random.Random(7).randbytes(500)
    caminho = _zip(tmp_path / "trace.zip", {"a.txt": conteudo})
    dados = bytearray(caminho.read_bytes())
    # Estraga o fluxo comprimido do membro (logo depois do cabecalho local).
    for posicao in range(40, 60):
        dados[posicao] ^= 0xFF
    caminho.write_bytes(bytes(dados))

    processo = _varrer(tmp_path)

    assert processo.returncode == 2, _saida(processo)
    assert "zip ilegivel" in processo.stderr


def test_zip_aninhado_fundo_demais_reprova(tmp_path: Path) -> None:
    atual = tmp_path / "n0.zip"
    _zip(atual, {"x.txt": b"nada"})
    for nivel in range(1, 9):
        proximo = tmp_path / f"n{nivel}.zip"
        _zip(proximo, {f"n{nivel - 1}.zip": atual})
        atual.unlink()
        atual = proximo

    processo = _varrer(tmp_path)

    assert processo.returncode == 2, _saida(processo)
    assert "fundo demais" in processo.stderr


def test_link_simbolico_reprova(tmp_path: Path) -> None:
    alvo = tmp_path / "fora.txt"
    alvo.write_text("x", encoding="utf-8")
    pasta = tmp_path / "pasta"
    pasta.mkdir()
    (pasta / "atalho.txt").symlink_to(alvo)

    processo = _varrer(pasta)

    assert processo.returncode == 2
    assert "nao e arquivo regular" in processo.stderr


def test_segredo_prevalece_sobre_arquivo_nao_varrido(tmp_path: Path) -> None:
    (tmp_path / "a.txt").write_text(f"gsk_{CANARIO}", encoding="utf-8")
    (tmp_path / "trace.zip").write_bytes(b"isto nao e um zip")

    processo = _varrer(tmp_path)

    assert processo.returncode == 1
    assert "NAO VARRIDO" in processo.stderr
    assert CANARIO not in _saida(processo)


# --- tetos contra zip bomb ---------------------------------------------------


def test_membro_acima_do_teto_nao_e_varrido(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    modulo = _carregar_modulo()
    monkeypatch.setattr(modulo, "TETO_DO_MEMBRO", 100)
    _zip(tmp_path / "trace.zip", {"grande.txt": b"a" * 1000})

    resultado = modulo.varrer_diretorio(tmp_path)

    assert any("membro acima do teto" in p for p in resultado.problemas)


def test_total_acima_do_teto_nao_e_varrido(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    modulo = _carregar_modulo()
    monkeypatch.setattr(modulo, "TETO_TOTAL", 1500)
    _zip(
        tmp_path / "trace.zip",
        {"a.txt": b"a" * 1000, "b.txt": b"b" * 1000},
    )

    resultado = modulo.varrer_diretorio(tmp_path)

    assert any("acima do teto total" in p for p in resultado.problemas)
