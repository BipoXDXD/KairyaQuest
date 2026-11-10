#!/usr/bin/env bash
# Pós-processo único das falas e dos efeitos da Kairya: mp3 MPEG-1 Layer III,
# 44,1 kHz, mono, CBR 64 kbps, loudness aproximada por `loudnorm`, sem metadados.
#
# Uso: scripts/encode-audio.sh <entrada> <saída> voice|sfx [trim]
#   voice → alvo -18 LUFS; sfx → alvo -20 LUFS; pico real -1,5 dBTP nos dois.
#   trim  → corta o silêncio só das pontas. O `stop_periods` do `silenceremove`
#           encerraria o áudio na primeira pausa entre palavras; por isso o corte
#           do fim é o do começo aplicado ao áudio invertido (`areverse`).
#
# Depende do `ffmpeg` local do dono, não de pacote do repositório.
set -euo pipefail

die() {
  echo "encode-audio: $*" >&2
  exit 1
}

if [[ $# -lt 3 || $# -gt 4 ]]; then
  die "uso: $0 <entrada> <saída> voice|sfx [trim]"
fi

input=$1
output=$2
kind=$3
mode=${4:-}

command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg não encontrado no PATH"

case $kind in
  voice) target=-18 ;;
  sfx) target=-20 ;;
  *) die "terceiro argumento deve ser voice ou sfx, recebido: '$kind'" ;;
esac

trim_filter=''
if [[ $# -eq 4 ]]; then
  [[ $mode == trim ]] || die "quarto argumento, se presente, deve ser trim, recebido: '$mode'"
  edge='silenceremove=start_periods=1:start_threshold=-50dB'
  trim_filter="$edge,areverse,$edge,areverse,"
fi

mkdir -p "$(dirname "$output")"

ffmpeg -nostdin -y -i "$input" \
  -af "${trim_filter}loudnorm=I=${target}:TP=-1.5:LRA=7" \
  -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k \
  -map_metadata -1 -id3v2_version 0 -write_xing 0 \
  "$output"
