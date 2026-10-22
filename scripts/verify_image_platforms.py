"""Confere o índice publicado e os configs reais de Linux AMD64 e ARM64."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Any

SHA256 = r"sha256:[0-9a-f]{64}"
REFERENCE = re.compile(
    r"(?P<repo>ghcr\.io/[a-z0-9._-]+/kairyaquest-(?:api|web))"
    rf"(?:@(?P<digest>{SHA256})|:[A-Za-z0-9_][A-Za-z0-9_.-]{{0,127}})"
)


def inspect(reference: str, field: str) -> dict[str, Any]:
    result = subprocess.check_output(
        [
            "docker",
            "buildx",
            "imagetools",
            "inspect",
            reference,
            "--format",
            "{{json ." + field + "}}",
        ],
        text=True,
        timeout=120,
    )
    payload = json.loads(result)
    if not isinstance(payload, dict):
        raise ValueError("Manifest/config precisa ser um objeto JSON")
    return payload


def verify(reference: str, expected: str) -> dict[str, Any]:
    match = REFERENCE.fullmatch(reference)
    if match is None:
        raise ValueError("Referência GHCR da API ou web inválida")
    pinned = match.group("digest")
    expected = expected or pinned or ""
    if not re.fullmatch(SHA256, expected) or (pinned and pinned != expected):
        raise ValueError("Um digest esperado consistente é obrigatório")
    index = inspect(reference, "Manifest")
    if index.get("digest") != expected:
        raise ValueError("A referência não resolve o digest aprovado")
    manifests = index.get("manifests")
    if not isinstance(manifests, list):
        raise ValueError("Índice multiplataforma obrigatório")
    runtimes = {}
    for item in manifests:
        platform = item.get("platform", {})
        os_name, arch = platform.get("os"), platform.get("architecture")
        digest = item.get("digest", "")
        if not re.fullmatch(SHA256, digest):
            raise ValueError("Digest de manifest inválido")
        if os_name == arch == "unknown":
            if (
                item.get("annotations", {}).get("vnd.docker.reference.type")
                != "attestation-manifest"
            ):
                raise ValueError("Descritor desconhecido sem atestado")
            continue
        if os_name != "linux" or arch not in ("amd64", "arm64") or arch in runtimes:
            raise ValueError("Plataforma ausente, inesperada ou duplicada")
        runtimes[arch] = digest
    if set(runtimes) != {"amd64", "arm64"}:
        raise ValueError("A imagem precisa conter Linux AMD64 e ARM64")
    for arch, digest in runtimes.items():
        config = inspect(match.group("repo") + "@" + digest, "Image")
        if config.get("os") != "linux" or config.get("architecture") != arch:
            raise ValueError("O config real diverge da arquitetura do índice")
    return {
        "reference": reference,
        "digest": expected,
        "platforms": ["linux/amd64", "linux/arm64"],
        "verified_native_configs": 2,
    }


def main() -> None:
    try:
        record = verify(
            os.environ.get("IMAGE_REFERENCE", ""), os.environ.get("IMAGE_DIGEST", "")
        )
    except (
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        OSError,
        subprocess.SubprocessError,
    ) as error:
        print(f"Verificação da imagem reprovada: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(json.dumps(record))


if __name__ == "__main__":
    main()
