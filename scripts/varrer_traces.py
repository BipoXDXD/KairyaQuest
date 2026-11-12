"""Varre os traces do Playwright atras de segredo, ANTES de eles virarem artefato.

Uso: `varrer_traces.py <diretorio>`. Chamado pelo job `check-e2e` do CI
(`.github/workflows/quality.yml`), no passo que antecede o upload do
`test-results/` como artefato de falha. E GUARDA DO ARTEFATO, nao verificacao
do gate: nao ha alvo no Makefile (docs/handoff/2026-11-12-traces-e2e.md,
decisao D5). Um trace de falha de um repositorio PUBLICO e baixavel por
qualquer pessoa, e ja houve caso de chave de teste vazada assim em outro
projeto.

O que vira ERRO (sai com 1), contado por arquivo e por padrao:

- `sk-` / `sk_` / `tsk_` / `gsk_` seguido de token (Anthropic e OpenAI;
  ElevenLabs; Tripo; `gsk_` de outro provedor de LLM);
- `Bearer ` seguido de token;
- header `Authorization` / `Proxy-Authorization` com valor, em texto
  (`Authorization: x`) ou no par `{"name": ..., "value": ...}` do trace;
- header `x-api-key` com valor que nao seja a chave ficticia do E2E
  (`e2e-chave-ficticia`, imposta por `scripts/e2e-env.sh`);
- cookie: `Cookie` / `Set-Cookie` com valor. O backend NAO define nem le
  cookie nenhum (nenhum `set_cookie` em `src/`; nao ha sessao), e o
  `storageState` do E2E parte de `cookies: []`; portanto QUALQUER cookie no
  trace e inesperado, e nao ha nome de cookie de sessao a procurar.

O QUE E VARRIDO: todo arquivo regular sob o diretorio, e cada zip (o
`trace.zip` e os zips que ele contenha, recursivamente) membro a membro, em
memoria -- nada e extraido para o disco, entao nao ha zip-slip. O conteudo de
cada arquivo e de cada membro e varrido tambem como bytes crus.

O QUE NUNCA SAI NA SAIDA: o valor encontrado. Imprime-se so o caminho (de
membros de zip: `arquivo.zip!/membro`), o nome do padrao e a contagem.

CODIGOS DE SAIDA (o upload so acontece com 0):

- 0: varreu tudo e nada foi achado. Diretorio EXISTENTE e VAZIO tambem e 0
  ("0 arquivo(s) varrido(s)"): nao ha o que vazar, e o upload, sem arquivo,
  nao envia nada.
- 1: achou padrao de segredo (vale mesmo que parte da varredura tenha falhado).
- 2: NAO foi possivel varrer, e isso reprova do mesmo jeito (falha fechada):
  diretorio inexistente ou que nao e diretorio, uso errado, arquivo que nao e
  regular (link simbolico, fifo), arquivo `.zip` ilegivel, zip corrompido ou
  criptografado, zip aninhado fundo demais, conteudo descompactado acima do
  teto. Quem nao conseguiu olhar nao pode liberar.

LIMITE CONHECIDO: so zip e descompactado. Uma imagem ou um video do trace nao
e lido como imagem -- um segredo DESENHADO na tela nao seria visto. A
defesa de fundo e o job nao ter segredo nenhum (docs/QUALITY.md, secao 5).
"""

import re
import stat
import sys
import zipfile
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from zlib import error as ZlibError

SAIDA_LIMPO = 0
SAIDA_ACHOU = 1
SAIDA_NAO_VARREU = 2

# A chave que `scripts/e2e-env.sh` impoe a API do E2E. E a unica `x-api-key`
# que pode aparecer num trace sem reprovar.
CHAVE_FICTICIA_DO_E2E = "e2e-chave-ficticia"

PROFUNDIDADE_MAXIMA = 6
# Tetos contra zip bomb. Um trace real de uma falha tem dezenas de MB.
TETO_DO_MEMBRO = 512 * 1024 * 1024
TETO_TOTAL = 2 * 1024 * 1024 * 1024

# FRONTEIRA do que vem antes de um nome ou de uma chave: nao ser o meio de uma
# palavra comum (`task-card-...` contem `sk-card-...`, e nao e chave). Um
# corpo gravado no trace como string JSON traz a quebra de linha como DUAS
# letras, barra + `n` (`\r\n`, `\n`, `\t`): a letra nao pode bloquear a
# fronteira, senao um cabecalho colado depois da quebra passa batido.
_ANTES = rb"(?:(?<![A-Za-z0-9])|(?<=\\[rnt]))"
_ANTES_DE_CHAVE = rb"(?:(?<![A-Za-z0-9-])|(?<=\\[rnt]))"
# Aspas com ATE 15 barras antes: o trace guarda corpos de requisicao e
# resposta como TEXTO, e um JSON dentro de uma string JSON chega escapado
# (`\"authorization\":\"...\"`), e escapado de novo a cada aninhamento: 0, 1,
# 3, 7, 15 barras = ate QUATRO niveis. O teto e de proposito: `\\*"` sem teto,
# em entrada com milhares de barras e sem aspas, e QUADRATICO (cada posicao
# tenta consumir todas as barras e recuar; 80 mil barras levaram 7 s). Com
# teto, cada posicao custa no maximo 16 tentativas.
_BARRAS = rb"\\{0,15}"
_ASPAS = _BARRAS + rb'"'
_ASPAS_OU_APOSTROFO = _BARRAS + rb"""["']"""
# Primeiro caractere de um valor: nem separador, nem aspas, nem barra -- um
# valor vazio (`""`, `\"\"`) nao e valor.
_INICIO_DE_VALOR = rb"""[^\s"',}\\]"""
_PAR_VALOR = rb"\s*,\s*" + _ASPAS + rb"value" + _ASPAS + rb"\s*:\s*" + _ASPAS
_FICTICIA = CHAVE_FICTICIA_DO_E2E.encode()


def _chave_com_valor(nome: bytes, separador: bytes, *, exceto: bytes = b"") -> bytes:
    """`nome: valor`, em texto, JSON ou JSON escapado (`nome` pode ter regex)."""
    return (
        _ANTES_DE_CHAVE
        + nome
        + rb"(?:"
        + _ASPAS_OU_APOSTROFO
        + rb")?"
        + separador
        + rb"(?:"
        + _ASPAS_OU_APOSTROFO
        + rb")?"
        + (rb"(?!" + exceto + rb")" if exceto else b"")
        + _INICIO_DE_VALOR
    )


def _par_nome_valor(nome: bytes, *, exceto: bytes = b"") -> bytes:
    """O par `{"name": nome, "value": ...}` do trace, com valor nao vazio."""
    return (
        _ASPAS
        + rb"name"
        + _ASPAS
        + rb"\s*:\s*"
        + _ASPAS
        + nome
        + _ASPAS
        + _PAR_VALOR
        + (rb"(?!" + exceto + rb")" if exceto else b"")
        + rb'[^"\\]'
    )


_DOIS_PONTOS_OU_IGUAL = rb"\s*[:=]\s*"

PADROES: dict[str, re.Pattern[bytes]] = {
    "sk-": re.compile(_ANTES + rb"sk-[A-Za-z0-9_-]{8,}"),
    "sk_/tsk_": re.compile(_ANTES + rb"t?sk_[A-Za-z0-9]{8,}"),
    "gsk_": re.compile(_ANTES + rb"gsk_[A-Za-z0-9]{8,}"),
    "Bearer": re.compile(_ANTES + rb"bearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE),
    "Authorization": re.compile(
        _chave_com_valor(rb"(?:proxy-)?authorization", _DOIS_PONTOS_OU_IGUAL)
        + rb"|"
        + _par_nome_valor(rb"(?:proxy-)?authorization"),
        re.IGNORECASE,
    ),
    "x-api-key": re.compile(
        _chave_com_valor(rb"x-api-key", _DOIS_PONTOS_OU_IGUAL, exceto=_FICTICIA)
        + rb"|"
        + _par_nome_valor(rb"x-api-key", exceto=_FICTICIA),
        re.IGNORECASE,
    ),
    "cookie": re.compile(
        _chave_com_valor(rb"(?:set-)?cookie", rb"[ \t]*:[ \t]*")
        + rb"|"
        + _par_nome_valor(rb"(?:set-)?cookie"),
        re.IGNORECASE,
    ),
}


class NaoFoiPossivelVarrer(Exception):
    """O conteudo nao pode ser inspecionado por inteiro; a varredura reprova."""


@dataclass
class Resultado:
    achados: dict[str, Counter[str]] = field(default_factory=dict)
    arquivos: int = 0
    bytes_lidos: int = 0
    problemas: list[str] = field(default_factory=list)


def contar_padroes(dados: bytes) -> Counter[str]:
    """Quantas ocorrencias de cada padrao ha em `dados` (o valor nao e guardado)."""
    contagem: Counter[str] = Counter()
    for nome, padrao in PADROES.items():
        total = sum(1 for _ in padrao.finditer(dados))
        if total:
            contagem[nome] = total
    return contagem


def _membros_do_zip(
    dados: bytes, caminho: str, profundidade: int, resultado: Resultado
) -> Iterator[tuple[str, bytes]]:
    """Os membros (nome, bytes) de um zip, recursivamente para zip dentro de zip."""
    if profundidade > PROFUNDIDADE_MAXIMA:
        raise NaoFoiPossivelVarrer(f"{caminho}: zip aninhado fundo demais")
    try:
        with zipfile.ZipFile(BytesIO(dados)) as arquivo:
            for info in arquivo.infolist():
                if info.is_dir():
                    continue
                if info.file_size > TETO_DO_MEMBRO:
                    raise NaoFoiPossivelVarrer(
                        f"{caminho}!/{info.filename}: membro acima do teto"
                    )
                resultado.bytes_lidos += info.file_size
                if resultado.bytes_lidos > TETO_TOTAL:
                    raise NaoFoiPossivelVarrer(f"{caminho}: acima do teto total")
                yield f"{caminho}!/{info.filename}", arquivo.read(info)
    except (
        zipfile.BadZipFile,
        RuntimeError,
        NotImplementedError,
        ZlibError,
        EOFError,
        OSError,
    ) as erro:
        # So o TIPO do erro: a mensagem de um zip corrompido cita nomes, e
        # nada aqui deve ecoar conteudo.
        raise NaoFoiPossivelVarrer(
            f"{caminho}: zip ilegivel ({type(erro).__name__})"
        ) from None


def _varrer_conteudo(
    caminho: str, dados: bytes, profundidade: int, resultado: Resultado
) -> None:
    contagem = contar_padroes(dados)
    if contagem:
        resultado.achados.setdefault(caminho, Counter()).update(contagem)
    if zipfile.is_zipfile(BytesIO(dados)):
        for nome, conteudo in _membros_do_zip(
            dados, caminho, profundidade + 1, resultado
        ):
            _varrer_conteudo(nome, conteudo, profundidade + 1, resultado)
    elif caminho.lower().endswith(".zip"):
        raise NaoFoiPossivelVarrer(f"{caminho}: termina em .zip mas nao e um zip")


def varrer_diretorio(raiz: Path) -> Resultado:
    """Varre `raiz` inteira. Problemas de leitura vao para `problemas`, e a
    varredura segue nos demais arquivos: o relatorio sai completo."""
    resultado = Resultado()
    if not raiz.is_dir():
        resultado.problemas.append(f"{raiz}: nao e um diretorio existente")
        return resultado
    for caminho in sorted(raiz.rglob("*")):
        modo = caminho.lstat().st_mode
        if stat.S_ISDIR(modo):
            continue
        nome = caminho.as_posix()
        if not stat.S_ISREG(modo):
            resultado.problemas.append(f"{nome}: nao e arquivo regular")
            continue
        try:
            dados = caminho.read_bytes()
            resultado.arquivos += 1
            resultado.bytes_lidos += len(dados)
            _varrer_conteudo(nome, dados, 0, resultado)
        except NaoFoiPossivelVarrer as erro:
            resultado.problemas.append(str(erro))
        except OSError as erro:
            resultado.problemas.append(f"{nome}: ilegivel ({type(erro).__name__})")
    return resultado


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: varrer_traces.py <diretorio>", file=sys.stderr)
        return SAIDA_NAO_VARREU
    raiz = Path(argv[1])
    resultado = varrer_diretorio(raiz)
    for problema in resultado.problemas:
        print(f"varrer-traces: NAO VARRIDO: {problema}", file=sys.stderr)
    for caminho, contagem in resultado.achados.items():
        for nome, total in sorted(contagem.items()):
            print(f"varrer-traces: SEGREDO? {caminho}: padrao {nome} x{total}")
    if resultado.achados:
        print(
            f"varrer-traces: {len(resultado.achados)} arquivo(s) com padrao de "
            "segredo; o artefato NAO sera enviado",
            file=sys.stderr,
        )
        return SAIDA_ACHOU
    if resultado.problemas:
        return SAIDA_NAO_VARREU
    print(f"varrer-traces: {resultado.arquivos} arquivo(s) varrido(s), nada achado")
    return SAIDA_LIMPO


if __name__ == "__main__":
    sys.exit(main(sys.argv))
