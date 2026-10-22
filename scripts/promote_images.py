"""Promove os dois digests aprovados somente enquanto o commit for a main atual."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Any

from verify_image_platforms import SHA256, verify


def main_head(repository: str) -> str:
    head = subprocess.check_output(
        ["gh", "api", f"repos/{repository}/git/ref/heads/main", "--jq", ".object.sha"],
        text=True,
        timeout=60,
    ).strip()
    if not re.fullmatch("[0-9a-f]{40}", head):
        raise ValueError("Resposta inválida ao consultar a main")
    return head


def promote() -> dict[str, Any]:
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    match = re.fullmatch(r"([A-Za-z0-9_.-]+)/KairyaQuest", repository)
    commit = os.environ.get("GITHUB_SHA", "")
    if match is None or not re.fullmatch("[0-9a-f]{40}", commit):
        raise ValueError("Identidade de repositório/commit inválida")
    references = []
    for target in ("api", "web"):
        reference = os.environ.get(target.upper() + "_REFERENCE", "")
        expected = f"ghcr.io/{match[1].lower()}/kairyaquest-{target}@{SHA256}"
        if not re.fullmatch(expected, reference):
            raise ValueError(
                "Os dois digests devem pertencer às imagens deste repositório"
            )
        references.append(reference)
    if main_head(repository) != commit:
        return {"status": "skipped", "reason": "commit_superseded", "commit": commit}
    for reference in references:
        verify(reference, "")
    # A main pode avançar durante as consultas ao registry. Não promover nesse caso.
    if main_head(repository) != commit:
        return {"status": "skipped", "reason": "commit_superseded", "commit": commit}
    for reference in references:
        image, digest = reference.split("@")
        subprocess.run(
            [
                "docker",
                "buildx",
                "imagetools",
                "create",
                "--tag",
                image + ":main",
                "--tag",
                image + ":latest",
                reference,
            ],
            check=True,
            timeout=120,
        )
        for tag in ("main", "latest"):
            verify(image + ":" + tag, digest)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a") as output:
            output.write("\n".join(references) + "\n")
    return {"status": "promoted", "commit": commit, "references": references}


if __name__ == "__main__":
    try:
        print(json.dumps(promote()))
    except (
        ValueError,
        TypeError,
        KeyError,
        OSError,
        subprocess.SubprocessError,
    ) as error:
        print(f"Promoção reprovada: {error}", file=sys.stderr)
        raise SystemExit(1) from error
