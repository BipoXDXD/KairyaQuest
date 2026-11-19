"""O gate local serializa as receitas que compartilham o banco de teste."""

import os
import subprocess
from pathlib import Path

import pytest

MAKEFILE = Path(__file__).resolve().parents[2] / "Makefile"


@pytest.mark.parametrize(
    ("argumentos", "makeflags"),
    [(("-j2",), ""), ((), "-j2")],
    ids=["argumento", "ambiente"],
)
def test_gate_termina_check_api_antes_do_reset_do_e2e(
    tmp_path: Path, argumentos: tuple[str, ...], makeflags: str
) -> None:
    # Usa o grafo do gate de verdade, com receitas isoladas de banco e Docker.
    regras = [
        linha
        for linha in MAKEFILE.read_text(encoding="utf-8").splitlines()
        if linha.startswith((".NOTPARALLEL:", "check:", "check-e2e:"))
    ]
    simulacao = tmp_path / "Makefile"
    simulacao.write_text(
        "\n".join(regras)
        + """
check-handoff check-supply-chain-npm check-web check-proxy check-secrets check-wheel:
\t@:
check-api:
\t@sleep 1
\t@echo api > ordem
reset-test-db:
\t@test -f ordem
\t@echo reset >> ordem
check-e2e:
\t@echo e2e >> ordem
""",
        encoding="utf-8",
    )

    resultado = subprocess.run(
        ["make", *argumentos, "check"],
        cwd=tmp_path,
        env={"PATH": os.environ.get("PATH", os.defpath), "MAKEFLAGS": makeflags},
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )

    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert (tmp_path / "ordem").read_text(encoding="utf-8").splitlines() == [
        "api",
        "reset",
        "e2e",
    ]
