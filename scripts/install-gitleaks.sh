#!/usr/bin/env bash
# Instala o Gitleaks numa versao fixa, verificando o checksum.
# Idempotente: se o binario ja existe e confere, nao baixa nada.
set -euo pipefail

VERSION="8.30.1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${ROOT}/.tools"
BIN="${TOOLS}/gitleaks"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    ASSET="gitleaks_${VERSION}_darwin_arm64.tar.gz"
    SHA256="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    ;;
  Linux-x86_64)
    ASSET="gitleaks_${VERSION}_linux_x64.tar.gz"
    SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    ;;
  *)
    echo "erro: plataforma nao suportada: $(uname -s)-$(uname -m)" >&2
    echo "acrescente o par asset/checksum em scripts/install-gitleaks.sh" >&2
    exit 1
    ;;
esac

if [ -x "$BIN" ] && "$BIN" version 2>/dev/null | grep -q "$VERSION"; then
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
mv "${TMP}/gitleaks" "$BIN"
chmod +x "$BIN"
echo "gitleaks ${VERSION} instalado em .tools/"
