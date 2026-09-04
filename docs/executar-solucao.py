"""Launcher da solucao BYOK Chat.

Exemplos:
    python docs/executar-solucao.py --platform web
    python docs/executar-solucao.py --platform native
    python docs/executar-solucao.py --install --platform web --clear
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


MIN_NODE_VERSION = (20, 0, 0)
PUBLIC_REGISTRY = "https://registry.npmjs.org/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Executa o BYOK Chat com Expo.")
    parser.add_argument(
        "--platform",
        choices=("web", "native"),
        default="web",
        help="Destino da execucao: browser web ou telefone/Expo Go.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8082,
        help="Porta usada pela preview web (default: 8082).",
    )
    parser.add_argument(
        "--install",
        action="store_true",
        help="Forca a reinstalacao das dependencias antes de iniciar.",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Limpa a cache do Metro antes de iniciar.",
    )
    return parser.parse_args()


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def executable(name: str) -> str | None:
    command = shutil.which(name)
    if command:
        return command
    if os.name == "nt" and name == "npm":
        return shutil.which("npm.cmd")
    return None


def run(command: list[str], cwd: Path) -> None:
    print(f"$ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def validate_node(node: str) -> None:
    result = subprocess.run(
        [node, "--version"],
        capture_output=True,
        text=True,
        check=True,
    )
    match = re.fullmatch(r"v(\d+)(?:\.(\d+))?(?:\.(\d+))?.*", result.stdout.strip())
    version = tuple(int(part or 0) for part in match.groups()) if match else (0, 0, 0)
    if version < MIN_NODE_VERSION:
        required = ".".join(str(part) for part in MIN_NODE_VERSION)
        raise RuntimeError(f"Node.js {required}+ e necessario; encontrado {result.stdout.strip()}.")


def install_dependencies(root: Path, npm: str) -> None:
    run(
        [
            npm,
            "install",
            "--legacy-peer-deps",
            "--no-audit",
            "--no-fund",
            f"--registry={PUBLIC_REGISTRY}",
        ],
        root,
    )


def main() -> int:
    args = parse_args()
    root = project_root()
    node = executable("node")
    npm = executable("npm")

    if not node:
        raise RuntimeError("Node.js nao foi encontrado no PATH.")
    if not npm:
        raise RuntimeError("npm nao foi encontrado no PATH.")
    validate_node(node)

    expo_cli = root / "node_modules" / "@expo" / "cli" / "main.js"
    if args.install or not expo_cli.exists():
        print("Dependencias ausentes ou reinstalacao solicitada.", flush=True)
        install_dependencies(root, npm)

    if not expo_cli.exists():
        raise RuntimeError(f"CLI Expo nao encontrado em {expo_cli}.")

    expo_args = [node, str(expo_cli), "start"]
    if args.platform == "web":
        expo_args.extend(["--web", "--port", str(args.port)])
        print(f"Preview web: http://localhost:{args.port}", flush=True)
    else:
        print("Modo native: leia o QR code no terminal com Expo Go.", flush=True)
        print("Para voz, use um development build em vez de Expo Go.", flush=True)

    if args.clear:
        expo_args.append("--clear")

    run(expo_args, root)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nExecucao interrompida.", flush=True)
        raise SystemExit(130)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        raise SystemExit(1)
