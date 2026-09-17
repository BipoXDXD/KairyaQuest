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

if [ -x "$BIN" ] && echo "${BIN_SHA256}  ${BIN}" | shasum -a 256 -c - >/dev/null 2>&1; then
  exit 0
fi

URL="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "baixando gitleaks ${VERSION}..."
curl --fail --silent --show-error --location --output "${TMP}/${ASSET}" "$URL"

echo "${SHA256}  ${TMP}/${ASSET}" | shasum -a 256 -c - >/dev/null || {
  echo "erro: checksum do gitleaks nao confere. Download abortado." >&2
  exit 1
}

mkdir -p "$TOOLS"
tar -xzf "${TMP}/${ASSET}" -C "$TMP" gitleaks

echo "${BIN_SHA256}  ${TMP}/gitleaks" | shasum -a 256 -c - >/dev/null || {
  echo "erro: checksum do binario extraido do gitleaks nao confere. Instalacao abortada." >&2
  exit 1
}

mv "${TMP}/gitleaks" "$BIN"
chmod +x "$BIN"
echo "gitleaks ${VERSION} instalado em ${TOOLS}/"
