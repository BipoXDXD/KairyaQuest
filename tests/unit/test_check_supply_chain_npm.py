"""Exercita o gate Bash com Trivy e emissão de VEX simulados."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/check-supply-chain-npm.sh"

DOCKER = """\
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
reports = Path(os.environ["FQ_SUPPLY_CHAIN_REPORTS"])
network = args[args.index("--network") + 1]
if network == "bridge":
    cache = Path(next(arg.removesuffix(":/trivy-cache") for arg in args
                      if arg.endswith(":/trivy-cache")))
    (cache / "db").mkdir()
    (cache / "db/trivy.db").write_bytes(b"fixture")
    (cache / "db/metadata.json").write_text("{}", encoding="utf-8")
    (reports / "trivy-raw.json").write_text("{}", encoding="utf-8")
else:
    assert network == "none"
    (reports / "argv-policy.json").write_text(json.dumps(args), encoding="utf-8")
    sys.exit(int(os.environ["KQ_TEST_TRIVY_STATUS"]))
"""

VERIFICADOR = """\
import os
import sys
from pathlib import Path

acao = sys.argv[1]
if acao == "emit" and os.environ["KQ_TEST_VEX"] == "1":
    (Path(sys.argv[3]) / "picomatch.openvex.json").write_text("{}", encoding="utf-8")
elif acao == "audit":
    (Path(sys.argv[3]) / "audit-invocado").touch()
"""


@pytest.mark.parametrize("com_vex", [False, True], ids=["sem-vex", "com-vex"])
@pytest.mark.parametrize("status", [0, 1], ids=["sucesso", "achado-ativo"])
def test_opcao_vex_e_status_da_politica(
    tmp_path: Path, com_vex: bool, status: int
) -> None:
    for dir_name in ("bin", "docker", "frontend", "scripts"):
        (tmp_path / dir_name).mkdir()

    docker_stub = tmp_path / "docker-stub.py"
    docker_stub.write_text(DOCKER, encoding="utf-8")
    docker = tmp_path / "bin/docker"
    docker.write_text(
        '#!/bin/sh\nexec "$KQ_TEST_PYTHON" "$KQ_TEST_DOCKER_STUB" "$@"\n',
        encoding="utf-8",
    )
    docker.chmod(0o700)
    python3 = tmp_path / "bin/python3"
    python3.write_text('#!/bin/sh\nexec "$KQ_TEST_PYTHON" "$@"\n', encoding="utf-8")
    python3.chmod(0o700)
    (tmp_path / "docker/trivy-npm.Dockerfile").write_text(
        f"FROM scanner:0.0.0@sha256:{'0' * 64}\n", encoding="utf-8"
    )
    (tmp_path / "frontend/package-lock.json").write_text("{}", encoding="utf-8")
    (tmp_path / "scripts/picomatch_backport.py").write_text(
        VERIFICADOR, encoding="utf-8"
    )

    reports = tmp_path / "reports"
    result = subprocess.run(
        ["/bin/bash", str(SCRIPT)],
        cwd=tmp_path,
        env={
            "PATH": f"{tmp_path / 'bin'}:{os.environ.get('PATH', os.defpath)}",
            "TMPDIR": str(tmp_path),
            "KQ_TEST_PYTHON": sys.executable,
            "KQ_TEST_DOCKER_STUB": str(docker_stub),
            "KQ_TEST_VEX": str(int(com_vex)),
            "KQ_TEST_TRIVY_STATUS": str(status),
            "FQ_SUPPLY_CHAIN_REPORTS": str(reports),
        },
        capture_output=True,
        text=True,
        check=False,
        timeout=15,
    )
    assert result.returncode == status, result.stdout + result.stderr
    assert (reports / "audit-invocado").is_file(), result.stdout + result.stderr
    argv = json.loads((reports / "argv-policy.json").read_text(encoding="utf-8"))
    optional = ["--vex", "/reports/picomatch.openvex.json"] if com_vex else []
    assert argv.count("--vex") == int(com_vex)
    assert argv[-(len(optional) + 4) :] == [
        *optional,
        "--exit-code",
        "1",
        "--output",
        "/reports/trivy-policy.json",
    ]
