#!/usr/bin/env bash
set -euo pipefail

root=$PWD
verificador=$root/scripts/picomatch_backport.py
trivy=$(sed -n 's/^FROM //p' docker/trivy-npm.Dockerfile)
[[ $trivy =~ ^[^[:space:]]+:([0-9]+\.[0-9]+\.[0-9]+)@sha256:[a-f0-9]{64}$ ]]
versao=${BASH_REMATCH[1]}

temporario=$(mktemp -d "${TMPDIR:-/tmp}/kq-supply-chain-npm.XXXXXX")
limpar() {
    python3 -c 'import shutil, sys; shutil.rmtree(sys.argv[1])' "$temporario"
}
trap limpar EXIT
cache=$temporario/cache
alvo=$temporario/alvo
reports=${FQ_SUPPLY_CHAIN_REPORTS:-"$temporario/relatorios"}
mkdir -p "$cache" "$alvo/frontend" "$reports"
reports=$(cd "$reports" && pwd -P)
[[ -z $(find "$reports" -mindepth 1 -maxdepth 1 -print -quit) ]]
cp -- frontend/package-lock.json "$alvo/frontend/package-lock.json"
python3 "$verificador" verify "$root"

varrer() {
    local rede=$1
    shift
    docker run --rm --network "$rede" --user "$(id -u):$(id -g)" --env HOME=/tmp \
        --cpus=1 --memory=2g --pids-limit=128 \
        -v "$alvo:/scan:ro" -v "$reports:/reports" -v "$cache:/trivy-cache" \
        -w /scan "$trivy" --config '' --cache-dir /trivy-cache --timeout 8m fs . \
        --parallel 1 \
        --scanners vuln --severity HIGH,CRITICAL --include-dev-deps \
        --db-repository public.ecr.aws/aquasecurity/trivy-db,ghcr.io/aquasecurity/trivy-db \
        --ignorefile /dev/null --format json --list-all-pkgs --show-suppressed "$@"
}

hash_da_base() (
    cd "$cache"
    sha256sum db/trivy.db db/metadata.json
)

varrer bridge --exit-code 0 --output /reports/trivy-raw.json
hash_da_base > "$reports/dataset-digests.sha256"
cmp -- frontend/package-lock.json "$alvo/frontend/package-lock.json"
python3 "$verificador" emit "$root" "$reports" "$versao"

politica=(--exit-code 1 --output /reports/trivy-policy.json)
if [[ -f $reports/picomatch.openvex.json ]]; then
    politica=(--vex /reports/picomatch.openvex.json "${politica[@]}")
fi
python3 "$verificador" guard "$root" "$reports" "$versao"
hash_da_base | cmp - "$reports/dataset-digests.sha256"
status=0
varrer none --offline-scan --skip-db-update --skip-java-db-update --skip-check-update \
    "${politica[@]}" || status=$?
hash_da_base | cmp - "$reports/dataset-digests.sha256"
cmp -- frontend/package-lock.json "$alvo/frontend/package-lock.json"
python3 "$verificador" audit "$root" "$reports" "$versao"
exit "$status"
