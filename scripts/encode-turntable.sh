#!/usr/bin/env bash
# Codifica os quadros do turntable da Kairya: webm VP9 (24 fps, sem áudio,
# yuv420p) e poster webp (quadro 0 pelo `magick`; o ffmpeg local não tem
# encoder webp).
#
# Uso: scripts/encode-turntable.sh <frames-dir> <out.webm> <out-poster.webp>
#
# Grava em temporários, confere os tetos de tamanho e só então move.
# Depende de `ffmpeg` e `magick` locais do dono.
set -euo pipefail

readonly MAX_WEBM_BYTES=1572864
readonly MAX_POSTER_BYTES=204800

die() {
  echo "encode-turntable: $*" >&2
  exit 1
}

[[ $# -eq 3 ]] || die "uso: $0 <frames-dir> <out.webm> <out-poster.webp>"

frames_dir=$1
out_webm=$2
out_poster=$3

command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg não encontrado no PATH"
command -v magick >/dev/null 2>&1 || die "magick não encontrado no PATH"
[[ -f "$frames_dir/frame_0000.png" ]] || die "sem $frames_dir/frame_0000.png"

mkdir -p "$(dirname "$out_webm")" "$(dirname "$out_poster")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

ffmpeg -nostdin -y -loglevel error -framerate 24 -i "$frames_dir/frame_%04d.png" \
  -c:v libvpx-vp9 -b:v 0 -crf 36 -pix_fmt yuv420p -an -r 24 \
  "$tmp/out.webm"
magick "$frames_dir/frame_0000.png" -quality 82 "$tmp/poster.webp"

webm_bytes=$(wc -c <"$tmp/out.webm" | tr -d ' ')
poster_bytes=$(wc -c <"$tmp/poster.webp" | tr -d ' ')
(( webm_bytes <= MAX_WEBM_BYTES )) || die "webm com $webm_bytes bytes, teto $MAX_WEBM_BYTES"
(( poster_bytes <= MAX_POSTER_BYTES )) || die "poster com $poster_bytes bytes, teto $MAX_POSTER_BYTES"

mv "$tmp/out.webm" "$out_webm"
mv "$tmp/poster.webp" "$out_poster"
echo "webm: $webm_bytes bytes; poster: $poster_bytes bytes"
