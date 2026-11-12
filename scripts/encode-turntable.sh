#!/usr/bin/env bash
# Codifica os quadros do turntable da Kairya: webm VP9 (24 fps, sem áudio,
# yuv420p) e poster webp (quadro 0 pelo `magick`; o ffmpeg local não tem
# encoder webp).
#
# Uso: scripts/encode-turntable.sh <frames-dir> <out.webm> <out-poster.webp>
#
# Gera os dois arquivos em temporários no mesmo diretório de cada destino (mesmo
# filesystem, então o `mv` é atômico), confere quadros e tetos de tamanho dos
# dois e só então move; um erro não deixa um par inconsistente.
# Depende de `ffmpeg` e `magick` locais do dono.
set -euo pipefail

# FRAMES e FPS espelham turntable_params.FRAMES e turntable_params.FPS.
readonly FRAMES=72
readonly FPS=24
readonly CRF=36
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

shopt -s nullglob
frames=("$frames_dir"/frame_*.png)
(( ${#frames[@]} == FRAMES )) \
  || die "esperava $FRAMES quadros frame_*.png em $frames_dir, achei ${#frames[@]}"
[[ -f "$frames_dir/frame_0000.png" ]] || die "sem $frames_dir/frame_0000.png"

mkdir -p "$(dirname "$out_webm")" "$(dirname "$out_poster")"
tmp_webm_dir=$(mktemp -d "$(dirname "$out_webm")/.turntable-tmp.XXXXXX")
tmp_poster_dir=$(mktemp -d "$(dirname "$out_poster")/.turntable-tmp.XXXXXX")
trap 'rm -rf "$tmp_webm_dir" "$tmp_poster_dir"' EXIT

ffmpeg -nostdin -y -loglevel error -framerate "$FPS" -i "$frames_dir/frame_%04d.png" \
  -c:v libvpx-vp9 -b:v 0 -crf "$CRF" -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -an -r "$FPS" \
  "$tmp_webm_dir/out.webm"
magick "$frames_dir/frame_0000.png" -quality 82 "$tmp_poster_dir/poster.webp"

webm_bytes=$(wc -c <"$tmp_webm_dir/out.webm" | tr -d ' ')
poster_bytes=$(wc -c <"$tmp_poster_dir/poster.webp" | tr -d ' ')
(( webm_bytes <= MAX_WEBM_BYTES )) || die "webm com $webm_bytes bytes, teto $MAX_WEBM_BYTES"
(( poster_bytes <= MAX_POSTER_BYTES )) || die "poster com $poster_bytes bytes, teto $MAX_POSTER_BYTES"

mv "$tmp_webm_dir/out.webm" "$out_webm"
mv "$tmp_poster_dir/poster.webp" "$out_poster"
echo "webm: $webm_bytes bytes; poster: $poster_bytes bytes"
