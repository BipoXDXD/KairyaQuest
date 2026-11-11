"""Confere que o wheel leva todo prompt `.md` do checkout, e nao vazio.

Uso: `check_wheel.py <wheel> <src>`. Chamado por `scripts/check-wheel.sh`
(alvo `make check-wheel`) depois do `uv build`.

A lista do esperado vem dos arquivos em `src/**/prompts/*.md`, e nao de uma
lista fixa: um idioma ou prompt novo entra na conferencia sem editar este
script. So biblioteca padrao, como `verify_image_platforms.py`.
"""

import sys
import zipfile
from pathlib import Path

_PADRAO_DOS_PROMPTS = "**/prompts/*.md"


def prompts_do_checkout(src: Path) -> list[str]:
    """Os caminhos, relativos a `src`, de todo prompt `.md` do checkout."""
    return sorted(p.relative_to(src).as_posix() for p in src.glob(_PADRAO_DOS_PROMPTS))


def problemas_do_wheel(wheel: Path, esperados: list[str]) -> list[str]:
    """Uma linha por prompt ausente ou vazio no wheel; vazia se estiver tudo la."""
    with zipfile.ZipFile(wheel) as arquivo:
        tamanhos = {info.filename: info.file_size for info in arquivo.infolist()}
    problemas = []
    for caminho in esperados:
        if caminho not in tamanhos:
            problemas.append(f"ausente no wheel: {caminho}")
        elif tamanhos[caminho] == 0:
            problemas.append(f"vazio no wheel: {caminho}")
    return problemas


def main(argv: list[str]) -> int:
    wheel, src = Path(argv[1]), Path(argv[2])
    esperados = prompts_do_checkout(src)
    if not esperados:
        print(
            f"check-wheel: nenhum prompt em {src}/{_PADRAO_DOS_PROMPTS}",
            file=sys.stderr,
        )
        return 1
    problemas = problemas_do_wheel(wheel, esperados)
    for problema in problemas:
        print(f"check-wheel: {problema}", file=sys.stderr)
    if problemas:
        return 1
    print(f"check-wheel: {len(esperados)} prompts presentes no wheel")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
