import copy
import importlib.util
import io
import json
import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from typing import Any, ClassVar
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
_SPEC = importlib.util.spec_from_file_location(
    "picomatch_backport", ROOT / "scripts/picomatch_backport.py"
)
assert _SPEC is not None and _SPEC.loader is not None
gate = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gate)
VERSION = "0.76.2"


def advisory(
    identifier: str = "CVE-2026-112366",
    package: str = gate.PACKAGE,
    version: str = gate.VERSION,
) -> dict[str, Any]:
    return {
        "VulnerabilityID": identifier,
        "PkgName": package,
        "InstalledVersion": version,
        "PkgIdentifier": {"PURL": f"pkg:npm/{package}@{version}"},
        "Severity": "HIGH",
    }


def report(*findings: dict[str, Any]) -> dict[str, Any]:
    return {
        "SchemaVersion": 2,
        "Trivy": {"Version": VERSION},
        "ArtifactName": ".",
        "ArtifactType": "filesystem",
        "Results": [
            {
                "Target": gate.LOCK,
                "Class": "lang-pkgs",
                "Type": "npm",
                "Packages": [
                    {
                        "Name": gate.PACKAGE,
                        "Version": gate.VERSION,
                        "Identifier": {"PURL": gate.PURL},
                    }
                ],
                "Vulnerabilities": list(findings),
            }
        ],
    }


def evaluated(
    *fixed: dict[str, Any], active: tuple[dict[str, Any], ...] = ()
) -> dict[str, Any]:
    policy = report(*active)
    policy["Results"][0]["ExperimentalModifiedFindings"] = [
        {
            "Source": gate.VEX_SOURCE,
            "Status": "fixed",
            "Type": "vulnerability",
            "Finding": item,
        }
        for item in fixed
    ]
    return policy


class BackportNpm(unittest.TestCase):
    lock: ClassVar[dict[str, Any]]
    manifest: ClassVar[dict[str, Any]]
    vendor: ClassVar[bytes]
    hashes: ClassVar[dict[str, str]]

    @classmethod
    def setUpClass(cls) -> None:
        cls.lock = json.loads((ROOT / gate.LOCK).read_bytes())
        cls.manifest = json.loads((ROOT / gate.MANIFEST).read_bytes())
        cls.vendor = (ROOT / gate.VENDOR).read_bytes()
        cls.hashes = cls.manifest["backport"]["files"]

    def test_lock_and_vendor_are_exact(self) -> None:
        gate.verify_lock(self.lock, self.manifest["tarball"]["integrity"])
        gate.verify_archive(self.vendor, self.manifest)

    def test_original_registry_pin_is_rejected(self) -> None:
        lock = copy.deepcopy(self.lock)
        original = self.manifest["upstream"]
        lock["packages"]["node_modules/picomatch"].update(
            resolved=original["tarball"],
            integrity=original["integrity"],
        )
        with self.assertRaisesRegex(ValueError, "lockfile não fixa"):
            gate.verify_lock(lock, self.manifest["tarball"]["integrity"])

    def test_nested_copy_is_rejected(self) -> None:
        lock = copy.deepcopy(self.lock)
        lock["packages"]["node_modules/vite/node_modules/picomatch"] = {
            "version": "4.0.7",
        }
        with self.assertRaisesRegex(ValueError, "uma única entrada"):
            gate.verify_lock(lock, self.manifest["tarball"]["integrity"])

    def test_tarball_with_changed_bytes_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "integridade do tarball"):
            gate.verify_archive(self.vendor + b"\x00", self.manifest)

    def test_changed_installed_parser_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            installed = root / gate.INSTALLED
            with tarfile.open(fileobj=io.BytesIO(self.vendor)) as archive:
                for name in self.hashes:
                    path = installed / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    stream = archive.extractfile("package/" + name)
                    assert stream is not None
                    with stream:
                        path.write_bytes(stream.read())
            gate.verify_installed(root, self.hashes)
            with (installed / "lib/parse.js").open("ab") as parser:
                parser.write(b"\n")
            with self.assertRaisesRegex(ValueError, "arquivos instalados divergem"):
                gate.verify_installed(root, self.hashes)

    def test_actual_node_resolver_rejects_shadowed_consumer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            modules = root / "frontend/node_modules"
            for name in (gate.PACKAGE, *gate.CONSUMERS):
                package = modules / name
                package.mkdir(parents=True)
                (package / "package.json").write_text("{}")
            (modules / gate.PACKAGE / "index.js").touch()
            got = gate.verify_resolution(root)
            self.assertEqual(
                got["resolved"],
                dict.fromkeys(gate.CONSUMERS, f"{gate.INSTALLED}/index.js"),
            )
            shadow = modules / "vite/node_modules/picomatch"
            shadow.mkdir(parents=True)
            (shadow / "index.js").touch()
            with self.assertRaisesRegex(ValueError, "consumidor resolveu outra cópia"):
                gate.verify_resolution(root)


class IndiceGit(unittest.TestCase):
    def test_indice_aceita_conteudo_staged_e_recusa_divergencia(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True)
            target = root / "arquivo.json"
            target.write_bytes(b"{}")
            with self.assertRaisesRegex(ValueError, "arquivo ausente ou ambíguo"):
                gate.indexed(root, target.name)
            subprocess.run(
                ["git", "-C", str(root), "add", "--", target.name], check=True
            )
            self.assertEqual(gate.indexed(root, target.name), b"{}")
            target.write_bytes(b'{"outro": 1}')
            with self.assertRaisesRegex(ValueError, "arquivo difere do índice"):
                gate.indexed(root, target.name)


class IdentidadeLocalECI(unittest.TestCase):
    def test_diferenca_do_indice_e_permitida_so_no_hook_local(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True)

            def git(*args: str) -> str:
                return subprocess.check_output(
                    ["git", "-C", str(root), *args], text=True
                ).strip()

            lock = root / "lock-ficticio.json"
            lock.write_bytes(b"{}")
            git("add", "--", lock.name)
            base_tree = git("write-tree")
            head = git(
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit-tree",
                base_tree,
                "-m",
                "fixture",
            )
            git("update-ref", "HEAD", head)
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
                self.assertEqual(
                    gate.checkout_identity(root), {"head": head, "indexTree": base_tree}
                )

            lock.write_bytes(b'{"outro": 1}')
            git("add", "--", lock.name)
            staged_tree = git("write-tree")
            self.assertNotEqual(staged_tree, base_tree)
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "false"}):
                self.assertEqual(
                    gate.checkout_identity(root),
                    {"head": head, "indexTree": staged_tree},
                )
            with (
                patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}),
                self.assertRaisesRegex(
                    ValueError, "árvore do índice difere do commit no CI"
                ),
            ):
                gate.checkout_identity(root)


class RelatoriosTrivy(unittest.TestCase):
    def test_accepts_exact_fix_and_no_advisories(self) -> None:
        known = advisory()
        gate.reconcile(report(known), evaluated(known), VERSION)
        gate.reconcile(report(), report(), VERSION)

    def test_new_cve_is_blocking_even_on_picomatch(self) -> None:
        known = advisory()
        future = advisory("CVE-2099-00001")
        with self.assertRaisesRegex(ValueError, "continuam ativas"):
            gate.reconcile(
                report(known, future), evaluated(known, active=(future,)), VERSION
            )
        with self.assertRaisesRegex(ValueError, "supressão fora"):
            gate.reconcile(report(known, future), evaluated(known, future), VERSION)
        with self.assertRaisesRegex(ValueError, "achado bruto sumiu"):
            gate.reconcile(report(known, future), evaluated(known), VERSION)

    def test_same_advisory_elsewhere_is_blocking(self) -> None:
        known = advisory()
        for foreign in (advisory(package="outro"), advisory(version="4.0.6")):
            with self.subTest(foreign=foreign):
                with self.assertRaisesRegex(ValueError, "supressão fora"):
                    gate.reconcile(
                        report(known, foreign), evaluated(known, foreign), VERSION
                    )
                with self.assertRaisesRegex(ValueError, "continuam ativas"):
                    gate.reconcile(
                        report(known, foreign),
                        evaluated(known, active=(foreign,)),
                        VERSION,
                    )

    def test_source_and_inventory_drift_fail(self) -> None:
        known = advisory()
        policy = evaluated(known)
        policy["Results"][0]["ExperimentalModifiedFindings"][0]["Source"] = (
            ".trivyignore"
        )
        with self.assertRaisesRegex(ValueError, "supressão fora"):
            gate.reconcile(report(known), policy, VERSION)
        policy = evaluated(known)
        policy["Results"][0]["Packages"].append({"Name": "outro"})
        with self.assertRaisesRegex(ValueError, "inventário de pacotes mudou"):
            gate.reconcile(report(known), policy, VERSION)

    def test_missing_purl_and_wrong_target_are_rejected(self) -> None:
        for field, value, message in (
            ("Target", "outro/package-lock.json", "alvo inesperado"),
            ("Packages", [], "inventariar exatamente o PURL"),
        ):
            with self.subTest(field=field):
                raw = report()
                raw["Results"][0][field] = value
                with self.assertRaisesRegex(ValueError, message):
                    gate.reconcile(raw, report(), VERSION)


if __name__ == "__main__":
    unittest.main()
