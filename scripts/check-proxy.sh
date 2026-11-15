#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Reutiliza as bases fixadas dos Dockerfiles sem compilar o front ou a API.
base_image() {
  awk -v prefix="$1:" '$1 == "FROM" && index($2, prefix) == 1 { image = $2 }
    END { if (!image) exit 1; print image }' "$2"
}
if ! PROXY_TEST_NGINX_IMAGE="$(base_image nginx "$root/docker/web.Dockerfile")" ||
   ! PROXY_TEST_PYTHON_IMAGE="$(base_image python "$root/docker/api.Dockerfile")"; then
  echo "Não foi possível localizar as imagens do teste nos Dockerfiles." >&2
  exit 1
fi
export PROXY_TEST_NGINX_IMAGE PROXY_TEST_PYTHON_IMAGE

scratch="$(mktemp -d "${TMPDIR:-/tmp}/kairya-proxy-XXXXXXXX")"
project="$(basename "$scratch" | tr '[:upper:]' '[:lower:]')"

compose() {
  "$root/scripts/docker-build.sh" compose --env-file /dev/null --project-name "$project" \
    --file "$root/tests/proxy/compose.yaml" "$@"
}

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    compose logs --no-color api proxy >&2 || echo "Falha ao coletar logs do teste." >&2
  fi
  if ! compose down --timeout 5 --remove-orphans; then
    status=1
  fi
  rmdir "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose up --wait --wait-timeout 30 api proxy
compose run --rm --no-deps -T client
