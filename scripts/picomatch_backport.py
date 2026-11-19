"""Atesta o backport npm e reconcilia os relatórios bruto e final do Trivy."""

import argparse
import base64
import hashlib
import json
import os
import stat
import subprocess
import sys
import tarfile
from collections import Counter
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, NoReturn, cast
from zoneinfo import ZoneInfo

Json = dict[str, Any]


PACKAGE = "picomatch"
VERSION = "4.0.7"
PURL = f"pkg:npm/{PACKAGE}@{VERSION}"
ADVISORIES = {"CVE-2026-112366", "GHSA-fc5q-39xc-vjpf"}
LOCK = "frontend/package-lock.json"
VENDOR = "frontend/vendor/picomatch-4.0.7-backport4.tgz"
MANIFEST = "frontend/vendor/picomatch-provenance.json"
MANIFEST_SHA = "74cd2e8550bdf067550d2a22c7b4342d0295274cbc1c3acaf7328253cd9e7eff"
INSTALLED = "frontend/node_modules/picomatch"
VEX = "picomatch.openvex.json"
PROOF = "picomatch-proof.json"
RAW = "trivy-raw.json"
POLICY = "trivy-policy.json"
VEX_SOURCE = f"/reports/{VEX}"
CONSUMERS = ("vite", "vitest", "tinyglobby", "fdir")
RESOLUTION_PROBE = """
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const root = realpathSync(process.argv[1]);
const modules = path.join(root, 'frontend', 'node_modules');
const resolved = {};
for (const consumer of process.argv.slice(2)) {
  const manifest = realpathSync(path.join(modules, consumer, 'package.json'));
  const entry = realpathSync(createRequire(manifest).resolve('picomatch'));
  resolved[consumer] = path.relative(root, entry);
}
console.log(JSON.stringify({ nodeVersion: process.version, resolved }));
"""


def require(condition: object, message: str) -> None:
    if not condition:
        raise ValueError(message)


def unique_keys(pairs: list[tuple[str, Any]]) -> Json:
    result = {}
    for key, value in pairs:
        require(key not in result, f"chave JSON duplicada: {key}")
        result[key] = value
    return result


def load(data: bytes) -> Json:
    return cast(Json, json.loads(data, object_pairs_hook=unique_keys))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def integrity(data: bytes) -> str:
    return "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode("ascii")


def regular(path: Path) -> bytes:
    require(stat.S_ISREG(path.lstat().st_mode), f"arquivo regular esperado: {path}")
    return path.read_bytes()


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args], timeout=20)


def indexed(root: Path, path: str) -> bytes:
    entry = git(root, "ls-files", "--stage", "-z", "--", path).split(b"\0")
    require(
        len(entry) == 2 and entry[1] == b"",
        f"arquivo ausente ou ambíguo no índice: {path}",
    )
    metadata, indexed_path = entry[0].split(b"\t", 1)
    mode, _blob, stage = metadata.split()
    require(
        mode == b"100644" and stage == b"0" and indexed_path == path.encode(),
        f"entrada de índice incompatível: {path}",
    )
    data = regular(root / path)
    require(data == git(root, "show", f":{path}"), f"arquivo difere do índice: {path}")
    return data


def verify_lock(lock: Json, sri: str) -> None:
    packages = lock["packages"]
    copies = [
        path
        for path, pkg in packages.items()
        if path.split("/")[-1] == PACKAGE or pkg.get("name") == PACKAGE
    ]
    require(
        lock["lockfileVersion"] == 3 and copies == ["node_modules/picomatch"],
        "lockfile deve conter uma única entrada do Picomatch",
    )
    package = packages[copies[0]]
    require(
        package["version"] == VERSION
        and package.get("dev") is True
        and not package.get("link")
        and package.get("name", PACKAGE) == PACKAGE
        and package["resolved"] == "file:" + VENDOR.removeprefix("frontend/")
        and package["integrity"] == sri,
        "lockfile não fixa o tarball do backport",
    )


def verify_archive(data: bytes, manifest: Json) -> None:
    tarball = manifest["tarball"]
    require(
        tarball["path"] == VENDOR
        and sha(data) == tarball["sha256"]
        and integrity(data) == tarball["integrity"],
        "integridade do tarball divergente",
    )
    expected = manifest["backport"]["files"]
    with tarfile.open(fileobj=BytesIO(data), mode="r:gz") as archive:
        actual = {}
        for member in archive.getmembers():
            name = member.name.removeprefix("package/")
            require(
                member.isfile()
                and member.name == "package/" + name
                and name in expected
                and name not in actual,
                f"arquivo inesperado no tarball: {member.name}",
            )
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError(f"arquivo ilegível no tarball: {member.name}")
            with stream:
                actual[name] = sha(stream.read())
    require(actual == expected, "arquivos do tarball divergem do backport revisado")


def walk_error(error: OSError) -> NoReturn:
    raise error


def verify_installed(root: Path, expected: dict[str, str]) -> None:
    modules = root / "frontend/node_modules"
    require(
        modules.is_dir() and not modules.is_symlink(), "node_modules físico esperado"
    )
    package = root / INSTALLED
    copies = []
    for path, dirs, names in os.walk(modules, onerror=walk_error):
        current = Path(path)
        require(
            all(not (current / name).is_symlink() for name in dirs),
            f"diretório vinculado em node_modules: {current}",
        )
        if "package.json" in names:
            metadata = load(regular(current / "package.json"))
            if metadata.get("name") == PACKAGE or current.name == PACKAGE:
                require(
                    metadata.get("name") == PACKAGE
                    and metadata.get("version") == VERSION,
                    f"identidade inesperada do Picomatch instalado: {current}",
                )
                copies.append(current)
    require(copies == [package], "npm deve instalar uma única cópia física do backport")
    actual = {
        path.relative_to(package).as_posix(): sha(regular(path))
        for path in package.rglob("*")
        if path.is_symlink() or not path.is_dir()
    }
    require(actual == expected, "arquivos instalados divergem do backport revisado")


def verify_resolution(root: Path) -> Json:
    output = subprocess.check_output(
        [
            "node",
            "--input-type=commonjs",
            "-e",
            RESOLUTION_PROBE,
            str(root),
            *CONSUMERS,
        ],
        timeout=20,
    )
    result = load(output)
    expected = f"{INSTALLED}/index.js"
    require(
        result["resolved"] == dict.fromkeys(CONSUMERS, expected),
        f"consumidor resolveu outra cópia do Picomatch: {result['resolved']}",
    )
    return result


def checkout_identity(root: Path) -> dict[str, str]:
    head = git(root, "rev-parse", "HEAD").decode().strip()
    index_tree = git(root, "write-tree").decode().strip()
    if os.environ.get("GITHUB_ACTIONS") == "true":
        commit_tree = git(root, "rev-parse", "HEAD^{tree}").decode().strip()
        require(index_tree == commit_tree, "árvore do índice difere do commit no CI")
    return {"head": head, "indexTree": index_tree}


def verify(root: Path) -> Json:
    checkout = checkout_identity(root)
    manifest_bytes = indexed(root, MANIFEST)
    require(
        sha(manifest_bytes) == MANIFEST_SHA, "proveniência diverge do backport revisado"
    )
    manifest = load(manifest_bytes)
    lock = indexed(root, LOCK)
    data = indexed(root, VENDOR)
    verify_lock(load(lock), manifest["tarball"]["integrity"])
    verify_archive(data, manifest)
    verify_installed(root, manifest["backport"]["files"])
    resolution = verify_resolution(root)
    return {
        **checkout,
        "lockSha256": sha(lock),
        "manifestSha256": sha(manifest_bytes),
        "tarballSha256": sha(data),
        "patchSha256": manifest["backport"]["patchSha256"],
        "installedPackage": INSTALLED,
        "consumers": resolution["resolved"],
        "nodeVersion": resolution["nodeVersion"],
        "npmVersion": subprocess.check_output(
            ["npm", "--version"], cwd=root / "frontend", text=True, timeout=20
        ).strip(),
        "npmAllowFile": subprocess.check_output(
            ["npm", "config", "get", "allow-file"],
            cwd=root / "frontend",
            text=True,
            timeout=20,
        ).strip(),
    }


def scan_result(report: Json, version: str) -> Json:
    require(
        report.get("SchemaVersion") == 2
        and report.get("ArtifactName") == "."
        and report.get("ArtifactType") == "filesystem"
        and report["Trivy"]["Version"] == version,
        "identidade inesperada do relatório Trivy",
    )
    (result,) = cast(list[Json], report["Results"])
    require(
        (result["Target"], result["Class"], result["Type"])
        == (LOCK, "lang-pkgs", "npm"),
        "alvo inesperado no relatório Trivy",
    )
    copies = [pkg for pkg in result["Packages"] if pkg["Name"] == PACKAGE]
    require(
        len(copies) == 1
        and copies[0]["Version"] == VERSION
        and copies[0]["Identifier"]["PURL"] == PURL,
        "Trivy deve inventariar exatamente o PURL original do backport",
    )
    return result


def allowed(finding: Json) -> bool:
    return (
        finding.get("VulnerabilityID") in ADVISORIES
        and finding.get("PkgName") == PACKAGE
        and finding.get("InstalledVersion") == VERSION
        and (finding.get("PkgIdentifier") or {}).get("PURL") == PURL
    )


def raw_findings(result: Json) -> list[Json]:
    require(
        not result.get("ExperimentalModifiedFindings"),
        "relatório bruto contém supressões",
    )
    findings = cast(list[Json], result.get("Vulnerabilities") or [])
    require(
        all(finding["Severity"] in {"HIGH", "CRITICAL"} for finding in findings),
        "severidade fora do filtro esperado",
    )
    return findings


def vex_document(proof: Json) -> Json:
    tree = proof["indexTree"]
    return {
        "@context": "https://openvex.dev/ns/v0.2.0",
        "@id": f"urn:kairyaquest:backport:picomatch:{tree}:{proof['rawSha256']}",
        "author": "KairyaQuest CI",
        "timestamp": proof["timestamp"],
        "version": 1,
        "statements": [
            {
                "vulnerability": {"name": advisory},
                "products": [{"@id": PURL}],
                "status": "fixed",
                "action_statement": f"Backport verificado na árvore {tree}.",
            }
            for advisory in proof["advisories"]
        ],
    }


def encode(value: Json) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False) + "\n").encode()


def evidence(root: Path, raw_bytes: bytes, version: str) -> Json:
    findings = raw_findings(scan_result(load(raw_bytes), version))
    return {
        **verify(root),
        "rawSha256": sha(raw_bytes),
        "advisories": sorted(
            {finding["VulnerabilityID"] for finding in findings if allowed(finding)}
        ),
    }


def write_new(path: Path, data: bytes) -> None:
    with path.open("xb") as output:
        output.write(data)


def emit(root: Path, reports: Path, version: str) -> None:
    proof = evidence(root, regular(reports / RAW), version)
    proof["timestamp"] = datetime.now(ZoneInfo("UTC")).isoformat(timespec="seconds")
    vex = encode(vex_document(proof)) if proof["advisories"] else None
    proof["vexSha256"] = sha(vex) if vex else None
    if vex:
        write_new(reports / VEX, vex)
    write_new(reports / PROOF, encode(proof))


def check_evidence(root: Path, reports: Path, version: str) -> Json:
    raw_bytes = regular(reports / RAW)
    actual = load(regular(reports / PROOF))
    expected = {**evidence(root, raw_bytes, version), "timestamp": actual["timestamp"]}
    vex = encode(vex_document(expected)) if expected["advisories"] else None
    expected["vexSha256"] = sha(vex) if vex else None
    vex_path = reports / VEX
    if vex:
        require(regular(vex_path) == vex, "VEX difere do escopo verificado")
    else:
        require(not vex_path.exists() and not vex_path.is_symlink(), "VEX indevido")
    require(
        actual == expected, "prova não corresponde ao checkout e ao relatório bruto"
    )
    return load(raw_bytes)


def reconcile(raw: Json, policy: Json, version: str) -> None:
    before = scan_result(raw, version)
    after = scan_result(policy, version)
    require(
        all(
            raw.get(key) == policy.get(key)
            for key in ("ArtifactName", "ArtifactType", "ArtifactID", "Metadata")
        ),
        "identidade do alvo mudou entre as varreduras",
    )
    require(
        Counter(map(encode, before["Packages"]))
        == Counter(map(encode, after["Packages"])),
        "inventário de pacotes mudou entre as varreduras",
    )
    findings = raw_findings(before)
    fixed = []
    for item in after.get("ExperimentalModifiedFindings") or []:
        finding = item["Finding"]
        require(
            (item["Source"], item["Type"], item["Status"])
            == (VEX_SOURCE, "vulnerability", "fixed")
            and allowed(finding),
            "supressão fora do backport verificado",
        )
        fixed.append(finding)
    active = after.get("Vulnerabilities") or []
    require(
        Counter(map(encode, fixed))
        == Counter(encode(item) for item in findings if allowed(item)),
        "o VEX não corresponde aos achados exatos do backport",
    )
    require(
        Counter(map(encode, active + fixed)) == Counter(map(encode, findings)),
        "um achado bruto sumiu, apareceu ou mudou no relatório final",
    )
    require(not active, "vulnerabilidades HIGH ou CRITICAL continuam ativas")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "emit", "guard", "audit"))
    parser.add_argument("root", type=Path)
    parser.add_argument("reports", type=Path, nargs="?")
    parser.add_argument("scanner_version", nargs="?")
    args = parser.parse_args()
    if args.command == "verify":
        print(encode(verify(args.root)).decode().strip())
        return
    if args.reports is None or args.scanner_version is None:
        parser.error("informe a pasta dos relatórios e a versão do Trivy")
    if args.command == "emit":
        emit(args.root, args.reports, args.scanner_version)
    else:
        raw = check_evidence(args.root, args.reports, args.scanner_version)
        if args.command == "audit":
            reconcile(raw, load(regular(args.reports / POLICY)), args.scanner_version)


if __name__ == "__main__":
    try:
        main()
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
        subprocess.SubprocessError,
        tarfile.TarError,
    ) as error:
        sys.exit(f"Backport Picomatch: {error}")
