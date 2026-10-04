#!/usr/bin/env bash
# Instala o Gitleaks numa versao fixa, verificando o checksum.
# Idempotente: se o binario em cache confere pelo proprio hash SHA-256
# (BIN_SHA256), nao baixa nada. O binario NUNCA e executado para perguntar
# a si mesmo quem ele e -- um binario forjado poderia simplesmente mentir.
set -euo pipefail

VERSION="8.30.1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# FQ_TOOLS_DIR (caminho ABSOLUTO) sobrescreve o .tools/ local. Existe para
# o scripts/check-push.sh: ele valida cada ref em um worktree novo, onde
# .tools/ nao existe (o diretorio e ignorado pelo git), e sem isto o
# Gitleaks seria baixado inteiro -- 21 MB mais o tempo de rede -- a cada
# push. Apontando o cache para o .tools/ do repositorio principal, o
# binario e reaproveitado.
#
# Compartilhar NAO afrouxa a verificacao: o binario reaproveitado passa
# pela mesma checagem contra BIN_SHA256 abaixo, exatamente como o local. E
# justamente essa checagem por hash que torna o compartilhamento seguro --
# um diretorio de cache compartilhado sem ela seria um vetor obvio de
# troca de binario.
TOOLS="${FQ_TOOLS_DIR:-${ROOT}/.tools}"
BIN="${TOOLS}/gitleaks"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    ASSET="gitleaks_${VERSION}_darwin_arm64.tar.gz"
    SHA256="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    BIN_SHA256="ba52fb1bfabbcde42f032afad3d6e0b19dff8ed105229a16e7caa338bbc0e84f"
    ;;
  Linux-x86_64)
    ASSET="gitleaks_${VERSION}_linux_x64.tar.gz"
    SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    BIN_SHA256="88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509"
    ;;
  *)
    echo "erro: plataforma nao suportada: $(uname -s)-$(uname -m)" >&2
    echo "acrescente o par asset/checksum em scripts/install-gitleaks.sh" >&2
    exit 1
    ;;
esac

# shasum e um script Perl que so vem de graca em sistemas com Perl (macOS,
# Debian/Ubuntu completos); imagens Linux enxutas trazem sha256sum, do
# coreutils, e nenhum shasum. As duas ferramentas aceitam o mesmo formato
# "<hash>  <arquivo>" em "-c -", entao basta escolher qual chamar.
#
# Sem esta deteccao, em uma imagem slim o "shasum" ausente fazia a checagem
# falhar e o script imprimia "checksum nao confere" -- acusando adulteracao
# quando o problema era ferramenta que nao existe. Esse diagnostico
# enganoso e exatamente o defeito que o restante do gate ja evita
# em outros pontos. Hoje o runner do GitHub tem shasum, e
# por isso o defeito nunca apareceu; ele esperava a primeira imagem slim.
if command -v shasum >/dev/null 2>&1; then
  verifica_sha256() { shasum -a 256 -c -; }
elif command -v sha256sum >/dev/null 2>&1; then
  verifica_sha256() { sha256sum -c -; }
else
  echo "erro: nem 'shasum' nem 'sha256sum' foram encontrados no PATH." >&2
  echo "Instale um dos dois (coreutils fornece sha256sum); sem verificacao" >&2
  echo "de checksum este script nao instala nada." >&2
  exit 1
fi

# A GUARDA que torna seguro qualquer cache deste diretorio -- o .tools/ local,
# o FQ_TOOLS_DIR do pre-push e o `actions/cache` do job check-secrets no CI:
# um binario so e aceito sem download se o hash dele conferir com BIN_SHA256.
# Um binario que nao confere NAO E USADO, mas tambem nao e removido aqui: o
# script segue para o download, e so o `rm -rf "$BIN"` (mais abaixo, apos o
# download verificado) o substitui. Se o download falhar antes disso, o
# binario que nao confere continua no disco e o script reprova mesmo assim --
# o `set -e` para no `curl`, antes de qualquer `mv`. Teste que a faz dizer
# nao: tests/integration/test_install_gitleaks.py.
if [ -f "$BIN" ] && [ -x "$BIN" ] && echo "${BIN_SHA256}  ${BIN}" | verifica_sha256 >/dev/null 2>&1; then
  exit 0
fi

URL="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Nova tentativa no download. Motivo medido: no PR #5 uma execucao do CI
# reprovou com "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL" ao falar
# com release-assets.githubusercontent.com, e a reexecucao passou -- queda de
# rede do lado do GitHub, nao defeito do codigo.
#
# `--retry` SOZINHO nao cobre esse caso: ele so repete erros "transitorios"
# (timeout e HTTP 408, 429, 500, 502, 503 ou 504 -- man curl, secao --retry),
# e o erro 35 de handshake TLS nao esta na lista -- medido com um servidor
# HTTP puro respondendo a um pedido HTTPS:
# com `--retry 2` o curl tentou uma vez; com `--retry-all-errors`, tres.
# `--retry-connrefused` tambem nao serve, so cobre ECONNREFUSED. Por isso
# `--retry-all-errors` (curl >= 7.71.0; o runner ubuntu-24.04 tem 8.5.0 e o
# macOS, 8.7.1). Ele repete tambem um 404 do `--fail`, o que so gasta tempo:
# o numero de tentativas e o teto de tempo sao finitos.
#
# Limites: 5 novas tentativas com 5s entre elas, dentro de uma janela de 240s;
# cada tentativa com 20s para conectar e 120s para terminar (21 MB). Pior caso
# ~6 min, abaixo do `timeout-minutes: 10` do job check-secrets.
#
# Esgotadas as tentativas, o curl sai com o codigo do ultimo erro e o
# `set -e` reprova o script -- nova tentativa NAO transforma falha em
# sucesso. O teste tests/integration/test_install_gitleaks.py confere isso.
echo "baixando gitleaks ${VERSION}..."
curl --fail --silent --show-error --location \
  --retry 5 --retry-delay 5 --retry-max-time 240 --retry-all-errors \
  --connect-timeout 20 --max-time 120 \
  --output "${TMP}/${ASSET}" "$URL"

echo "${SHA256}  ${TMP}/${ASSET}" | verifica_sha256 >/dev/null || {
  echo "erro: checksum do gitleaks nao confere. Download abortado." >&2
  exit 1
}

mkdir -p "$TOOLS"
tar -xzf "${TMP}/${ASSET}" -C "$TMP" gitleaks

echo "${BIN_SHA256}  ${TMP}/gitleaks" | verifica_sha256 >/dev/null || {
  echo "erro: checksum do binario extraido do gitleaks nao confere. Instalacao abortada." >&2
  exit 1
}

# Sem o rm, um "$BIN" que ja exista como DIRETORIO faz o mv aninhar o
# binario dentro dele ("${BIN}/gitleaks"). A checagem la em cima passa a
# falhar para sempre (o teste -f rejeita diretorio), e cada execucao rebaixa
# 21 MB enquanto imprime "instalado" -- idempotencia perdida em silencio.
rm -rf "$BIN"
mv "${TMP}/gitleaks" "$BIN"
chmod +x "$BIN"
echo "gitleaks ${VERSION} instalado em ${TOOLS}/"
