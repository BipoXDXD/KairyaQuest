"""A publicação só aprova índices com os dois runtimes e configs reais corretos."""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".git").exists())
SCRIPT = ROOT / "scripts" / "verify_image_platforms.py"
REPOSITORY = "ghcr.io/bipoxdxd/kairyaquest-api"
DIGEST = "sha256:" + "a" * 64
AMD = "sha256:" + "b" * 64
ARM = "sha256:" + "c" * 64


class PublishedImageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(SCRIPT.is_file(), "falta verificar os runtimes publicados")
        self.directory = tempfile.TemporaryDirectory(prefix="ghcr-platform-check-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.fixture = self.root / "registry.json"
        self.data: dict[str, Any] = {
            "index": {
                "schemaVersion": 2,
                "digest": DIGEST,
                "mediaType": "application/vnd.oci.image.index.v1+json",
                "manifests": [
                    {
                        "digest": AMD,
                        "platform": {"os": "linux", "architecture": "amd64"},
                    },
                    {
                        "digest": ARM,
                        "platform": {"os": "linux", "architecture": "arm64"},
                    },
                ],
            },
            "configs": {
                AMD: {"os": "linux", "architecture": "amd64"},
                ARM: {"os": "linux", "architecture": "arm64"},
            },
        }
        docker = self.root / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json,os,sys\n"
            "from pathlib import Path\n"
            "data=json.loads(Path(os.environ['REGISTRY_FIXTURE']).read_text())\n"
            "if data.get('fail'): sys.exit(42)\n"
            "if data.get('invalid_json'): print('not-json'); sys.exit(0)\n"
            "if sys.argv[1:4]!=['buildx','imagetools','inspect']: sys.exit(43)\n"
            "ref=sys.argv[4]\n"
            "if sys.argv[5:]==['--format','{{json .Manifest}}']:\n"
            " print(json.dumps(data['index']))\n"
            "elif sys.argv[5:]==['--format','{{json .Image}}'] and '@' in ref:\n"
            " print(json.dumps(data['configs'][ref.split('@')[1]]))\n"
            "else: sys.exit(44)\n"
        )
        docker.chmod(0o755)

    def call(
        self, reference: str | None = None, digest: str = ""
    ) -> subprocess.CompletedProcess[str]:
        self.fixture.write_text(json.dumps(self.data))
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            env={
                **os.environ,
                "PATH": f"{self.root}:{os.environ['PATH']}",
                "REGISTRY_FIXTURE": str(self.fixture),
                "IMAGE_REFERENCE": reference or REPOSITORY + "@" + DIGEST,
                "IMAGE_DIGEST": digest,
            },
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )

    def test_valid_index_reports_both_real_platforms(self) -> None:
        result = self.call()
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["digest"], DIGEST)
        self.assertEqual(record["platforms"], ["linux/amd64", "linux/arm64"])
        self.assertEqual(record["verified_native_configs"], 2)

    def test_valid_provenance_attestation_is_not_a_runtime(self) -> None:
        self.data["index"]["manifests"].append(
            {
                "digest": "sha256:" + "d" * 64,
                "platform": {"os": "unknown", "architecture": "unknown"},
                "annotations": {"vnd.docker.reference.type": "attestation-manifest"},
            }
        )
        self.assertEqual(self.call().returncode, 0)

    def test_missing_duplicate_extra_and_foreign_platforms_fail(self) -> None:
        original = copy.deepcopy(self.data["index"])
        descriptors = original["manifests"]
        invalid = [
            descriptors[:1],
            descriptors * 2,
            [],
            descriptors
            + [
                {
                    "digest": "sha256:" + "e" * 64,
                    "platform": {"os": "linux", "architecture": "386"},
                }
            ],
            [
                dict(
                    descriptors[0], platform={"os": "windows", "architecture": "amd64"}
                ),
                descriptors[1],
            ],
            [dict(descriptors[0], platform={}), descriptors[1]],
        ]
        for manifests in invalid:
            with self.subTest(manifests=manifests):
                self.data["index"] = dict(original, manifests=manifests)
                self.assertNotEqual(self.call().returncode, 0)

    def test_wrong_actual_config_platform_fails(self) -> None:
        for config in [
            {"os": "linux", "architecture": "amd64"},
            {"os": "windows", "architecture": "arm64"},
            {},
            None,
        ]:
            with self.subTest(config=config):
                self.data["configs"][ARM] = config
                self.assertNotEqual(self.call().returncode, 0)

    def test_bad_native_digest_and_unknown_without_attestation_fail(self) -> None:
        self.data["index"]["manifests"][0]["digest"] = "not-a-digest"
        self.assertNotEqual(self.call().returncode, 0)
        self.data["index"]["manifests"][0]["digest"] = AMD
        self.data["index"]["manifests"].append(
            {
                "digest": "sha256:" + "d" * 64,
                "platform": {"os": "unknown", "architecture": "unknown"},
            }
        )
        self.assertNotEqual(self.call().returncode, 0)

    def test_alias_requires_expected_digest_and_must_resolve_it(self) -> None:
        self.assertNotEqual(self.call(REPOSITORY + ":main").returncode, 0)
        self.assertEqual(self.call(REPOSITORY + ":main", DIGEST).returncode, 0)
        self.assertNotEqual(
            self.call(REPOSITORY + ":main", "sha256:" + "f" * 64).returncode, 0
        )

    def test_reference_and_reported_digest_cannot_disagree(self) -> None:
        self.assertNotEqual(self.call(digest="sha256:" + "f" * 64).returncode, 0)
        self.data["index"]["digest"] = "sha256:" + "f" * 64
        self.assertNotEqual(self.call().returncode, 0)

    def test_invalid_reference_transport_and_json_fail_closed(self) -> None:
        for reference in [
            "--help",
            "docker.io/unrelated/app:latest",
            REPOSITORY + "@bad",
        ]:
            with self.subTest(reference=reference):
                self.assertNotEqual(self.call(reference).returncode, 0)
        self.data["fail"] = True
        self.assertNotEqual(self.call().returncode, 0)
        self.data.pop("fail")
        self.data["invalid_json"] = True
        self.assertNotEqual(self.call().returncode, 0)

    def promotion(
        self, heads: list[str], overrides: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str]:
        script = SCRIPT.with_name("promote_images.py")
        self.assertTrue(
            script.is_file(), "falta recusar a promoção de um commit superado"
        )
        self.fixture.write_text(json.dumps(self.data))
        gh = self.root / "gh"
        gh.write_text(
            f"#!{sys.executable}\n"
            "import json,os,sys\nfrom pathlib import Path\n"
            "expected=['api','repos/BipoXDXD/KairyaQuest/git/ref/heads/main','--jq','.object.sha']\n"
            "if sys.argv[1:]!=expected: sys.exit(42)\n"
            "heads=json.loads(os.environ['MAIN_HEADS'])\n"
            "counter=Path(os.environ['MAIN_COUNTER'])\n"
            "n=int(counter.read_text()) if counter.exists() else 0\n"
            "counter.write_text(str(n+1))\n"
            "print(heads[min(n,len(heads)-1)])\n"
        )
        gh.chmod(0o755)
        (self.root / "counter").unlink(missing_ok=True)
        return subprocess.run(
            [sys.executable, str(script)],
            env={
                **os.environ,
                "PATH": f"{self.root}:{os.environ['PATH']}",
                "REGISTRY_FIXTURE": str(self.fixture),
                "MAIN_HEADS": json.dumps(heads),
                "MAIN_COUNTER": str(self.root / "counter"),
                "GITHUB_REPOSITORY": "BipoXDXD/KairyaQuest",
                "GITHUB_SHA": "1" * 40,
                "API_REFERENCE": REPOSITORY + "@" + DIGEST,
                "WEB_REFERENCE": "ghcr.io/bipoxdxd/kairyaquest-web@" + DIGEST,
                **(overrides or {}),
            },
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )

    def test_superseded_commit_cannot_promote_moving_tags(self) -> None:
        result = self.promotion(["2" * 40])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "skipped")

    def test_main_advancing_during_preflight_stops_promotion(self) -> None:
        result = self.promotion(["1" * 40, "2" * 40])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "skipped")

    def test_promotion_rejects_missing_and_foreign_inputs(self) -> None:
        for values in [
            {"API_REFERENCE": ""},
            {"WEB_REFERENCE": REPOSITORY + "@" + DIGEST},
            {"GITHUB_SHA": "invalid"},
            {"GITHUB_REPOSITORY": "bad/query?"},
        ]:
            with self.subTest(values=values):
                self.assertNotEqual(self.promotion(["1" * 40], values).returncode, 0)


if __name__ == "__main__":
    unittest.main()
