#!/usr/bin/env python3
"""Validate Android SDK prerequisites and debug/release APK contents."""

from __future__ import annotations

import argparse
import json
import os
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class Result:
    name: str
    status: str
    detail: str


def sdk_root() -> Path | None:
    for value in (os.environ.get("ANDROID_SDK_ROOT"), os.environ.get("ANDROID_HOME")):
        if value and Path(value).is_dir():
            return Path(value)
    local_app_data = os.environ.get("LOCALAPPDATA")
    candidate = Path(local_app_data) / "Android" / "Sdk" if local_app_data else None
    return candidate if candidate and candidate.is_dir() else None


def apk_result(name: str, apk: Path, expect_bundle: bool) -> Result:
    if not apk.is_file():
        return Result(name, "SKIP", f"APK nao encontrada: {apk}")
    try:
        with zipfile.ZipFile(apk) as archive:
            names = set(archive.namelist())
            has_bundle = any(path.endswith("assets/index.android.bundle") for path in names)
            if expect_bundle and not has_bundle:
                return Result(name, "FAIL", "release sem assets/index.android.bundle")
            return Result(name, "PASS", f"{apk} ({apk.stat().st_size / 1_048_576:.1f} MiB, bundle={'sim' if has_bundle else 'nao'})")
    except (OSError, zipfile.BadZipFile) as exc:
        return Result(name, "FAIL", f"APK invalida: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida artefactos e pre-requisitos Android do BYOK Chat.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--require-release", action="store_true", help="Falhar se a APK release nao existir")
    parser.add_argument("--json", action="store_true", help="Emitir relatorio JSON")
    args = parser.parse_args()
    root = args.root.resolve()
    results: list[Result] = []
    sdk = sdk_root()
    results.append(Result("sdk", "PASS", str(sdk)) if sdk else Result("sdk", "FAIL", "ANDROID_HOME/ANDROID_SDK_ROOT nao encontrado"))
    if sdk:
        ndk = sdk / "ndk" / "27.1.12297006" / "source.properties"
        results.append(Result("ndk", "PASS", str(ndk)) if ndk.is_file() else Result("ndk", "FAIL", f"NDK incompleto: {ndk}"))
    wrapper = root / "android" / "gradlew.bat"
    results.append(Result("gradle-wrapper", "PASS", str(wrapper)) if wrapper.is_file() else Result("gradle-wrapper", "FAIL", "gradlew.bat ausente"))
    results.append(apk_result("apk-debug", root / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk", False))
    release = apk_result("apk-release", root / "android" / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk", True)
    if args.require_release and release.status == "SKIP":
        release = Result(release.name, "FAIL", release.detail)
    results.append(release)
    if args.json:
        print(json.dumps([asdict(result) for result in results], ensure_ascii=True, indent=2))
    else:
        for result in results:
            print(f"[{result.status:4}] {result.name}: {result.detail}")
        print(f"\nResumo: {sum(result.status == 'PASS' for result in results)} PASS, {sum(result.status == 'FAIL' for result in results)} FAIL, {sum(result.status == 'SKIP' for result in results)} SKIP")
    return 1 if any(result.status == "FAIL" for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
