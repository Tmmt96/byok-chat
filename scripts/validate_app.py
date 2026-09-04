#!/usr/bin/env python3
"""Validate BYOK Chat source, Metro, ADB, and non-destructive UI flows."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Result:
    name: str
    status: str
    detail: str
    evidence: str = ""


class Validator:
    def __init__(self, root: Path, serial: str | None, metro_port: int) -> None:
        self.root = root
        self.serial = serial
        self.metro_port = metro_port
        self.results: list[Result] = []
        self.adb_path = self.find_adb()

    def add(self, name: str, status: str, detail: str, evidence: str = "") -> None:
        self.results.append(Result(name, status, detail, evidence))

    def find_adb(self) -> Path | None:
        candidates = [
            os.environ.get("ADB_PATH"),
            os.environ.get("ANDROID_HOME"),
            os.environ.get("ANDROID_SDK_ROOT"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk"),
        ]
        for candidate in candidates:
            if not candidate:
                continue
            path = Path(candidate)
            executable = path if path.name.lower() == "adb.exe" else path / "platform-tools" / "adb.exe"
            if executable.is_file():
                return executable
        found = shutil.which("adb")
        return Path(found) if found else None

    def command(self, args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
        return subprocess.run(args, cwd=self.root, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False)

    def adb(self, args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
        if self.adb_path is None:
            raise FileNotFoundError("adb nao encontrado")
        command = [str(self.adb_path)]
        if self.serial:
            command.extend(["-s", self.serial])
        command.extend(args)
        return self.command(command, timeout)

    def check_source(self) -> None:
        app = self.root / "App.tsx"
        provider = self.root / "src" / "providers" / "base-sse.ts"
        context = self.root / "src" / "domain" / "project-context.ts"
        package_file = self.root / "package.json"
        if not all(path.is_file() for path in (app, provider, context, package_file)):
            self.add("source-files", "FAIL", "Ficheiros essenciais em falta")
            return

        app_text = app.read_text(encoding="utf-8")
        provider_text = provider.read_text(encoding="utf-8")
        context_text = context.read_text(encoding="utf-8")
        package_data = json.loads(package_file.read_text(encoding="utf-8"))
        checks = {
            "safe-area": "SafeAreaProvider" in app_text and "edges={['top', 'bottom']}" in app_text,
            "new-conversation-handler": "onPress={onNewConversation}" in app_text,
            "chat-options-handler": "onPress={onMorePress}" in app_text,
            "model-selection-handler": "onSelect(model.id)" in app_text,
            "sse-line-parser": "buffer.split(/\\r?\\n/)" in provider_text,
            "stream-cleanup": "finally" in provider_text and "setIsStreaming(false)" in app_text,
            "context-newlines": r"\n" in context_text and r"\\n" not in context_text,
            "test-script": "test" in package_data.get("scripts", {}),
        }
        for name, passed in checks.items():
            self.add(f"static:{name}", "PASS" if passed else "FAIL", "check source markers")

    def check_node(self, run_commands: bool) -> None:
        node = shutil.which("node")
        if node is None:
            candidate = Path(r"C:\Program Files\nodejs\node.exe")
            node = str(candidate) if candidate.is_file() else None
        if node is None:
            self.add("node", "SKIP", "node nao encontrado no PATH")
            return
        self.add("node", "PASS", "node disponivel", node)
        if not run_commands:
            return
        tsc = self.root / "node_modules" / "typescript" / "bin" / "tsc"
        jest = self.root / "node_modules" / "jest" / "bin" / "jest.js"
        for name, script, args in (
            ("typecheck", tsc, ["--noEmit"]),
            ("unit-tests", jest, ["--runInBand"]),
        ):
            if not script.is_file():
                self.add(f"node:{name}", "SKIP", f"{script} nao encontrado")
                continue
            result = self.command([node, str(script), *args], timeout=180)
            detail = (result.stdout + result.stderr).strip().splitlines()
            evidence = detail[-1] if detail else "exit code 0"
            self.add(f"node:{name}", "PASS" if result.returncode == 0 else "FAIL", "executado", evidence)

    def check_metro(self) -> None:
        url = f"http://127.0.0.1:{self.metro_port}/status"
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                body = response.read().decode("utf-8", errors="replace")
            running = response.status == 200 and "packager-status" in body
            self.add("metro", "PASS" if running else "FAIL", f"HTTP {response.status}", body[:120])
        except Exception as exc:
            self.add("metro", "SKIP", "Metro nao respondeu", str(exc))

    def discover_device(self) -> bool:
        if self.adb_path is None:
            self.add("adb", "SKIP", "adb nao encontrado")
            return False
        result = self.adb(["devices", "-l"])
        lines = [line for line in result.stdout.splitlines() if line.strip() and not line.startswith("List of devices")]
        if self.serial:
            matching = [line for line in lines if line.split()[0] == self.serial]
        else:
            matching = lines
            if matching:
                self.serial = matching[0].split()[0]
        if not matching:
            self.add("adb:device", "SKIP", "nenhum dispositivo conectado", result.stdout.strip())
            return False
        state = matching[0].split()[1] if len(matching[0].split()) > 1 else "unknown"
        self.add("adb:device", "PASS" if state == "device" else "FAIL", f"estado {state}", matching[0])
        return state == "device"

    def check_adb_runtime(self) -> None:
        if self.adb_path is None or self.serial is None:
            return
        package = self.adb(["shell", "pm", "path", "com.byokchat.mobile"])
        self.add("adb:package", "PASS" if package.returncode == 0 and "package:" in package.stdout else "FAIL", "pacote instalado", package.stdout.strip())
        reverse = self.adb(["reverse", "--list"])
        has_reverse = "tcp:8081" in reverse.stdout
        self.add("adb:metro-reverse", "PASS" if has_reverse else "FAIL", "tunnel USB 8081", reverse.stdout.strip())
        process = self.adb(["shell", "pidof", "com.byokchat.mobile"])
        self.add("adb:process", "PASS" if process.stdout.strip() else "FAIL", "processo da app", process.stdout.strip())

    def dump_ui(self) -> ET.Element | None:
        if self.adb_path is None or self.serial is None:
            return None
        remote = "/sdcard/byok-chat-uiautomator.xml"
        dump = self.adb(["shell", "uiautomator", "dump", remote])
        if dump.returncode != 0:
            return None
        raw = self.adb(["exec-out", "cat", remote]).stdout or ""
        start = raw.find("<hierarchy")
        if start < 0:
            return None
        try:
            return ET.fromstring(raw[start:])
        except ET.ParseError:
            return None

    @staticmethod
    def find_node(root: ET.Element, label: str) -> ET.Element | None:
        for node in root.iter("node"):
            values = (node.attrib.get("text", ""), node.attrib.get("content-desc", ""), node.attrib.get("resource-id", ""))
            if label in values or any(label.lower() in value.lower() for value in values if value):
                return node
        return None

    def tap_label(self, label: str) -> bool:
        root = self.dump_ui()
        node = self.find_node(root, label) if root is not None else None
        if node is None:
            return False
        match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if match is None:
            return False
        x1, y1, x2, y2 = (int(value) for value in match.groups())
        result = self.adb(["shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)])
        return result.returncode == 0

    def input_text(self, value: str) -> bool:
        safe_value = value.replace(" ", "%s")
        return self.adb(["shell", "input", "text", safe_value]).returncode == 0

    def display_metrics(self) -> tuple[int, int, int, int]:
        size = self.adb(["shell", "wm", "size"]).stdout
        match = re.search(r"(\d+)x(\d+)", size)
        width, height = (int(match.group(1)), int(match.group(2))) if match else (1080, 2340)
        displays = self.adb(["shell", "dumpsys", "window", "displays"]).stdout
        inset_match = re.search(r"mStableInsets=Rect\((\d+),\s*(\d+)\s*-\s*(\d+),\s*(\d+)\)", displays)
        top, bottom = (int(inset_match.group(2)), int(inset_match.group(4))) if inset_match else (80, 100)
        return width, height, top, bottom

    @staticmethod
    def node_bounds(node: ET.Element) -> tuple[int, int, int, int] | None:
        match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        return tuple(int(value) for value in match.groups()) if match else None

    def check_safe_node(self, name: str, label: str) -> bool:
        root = self.dump_ui()
        node = self.find_node(root, label) if root is not None else None
        if node is None:
            self.add(f"ui:{name}:safe-area", "FAIL", f"controlo nao encontrado: {label}")
            return False
        bounds = self.node_bounds(node)
        if bounds is None:
            self.add(f"ui:{name}:safe-area", "FAIL", f"bounds ausentes: {label}")
            return False
        _, height, top_inset, bottom_inset = self.display_metrics()
        safe = bounds[1] >= top_inset and bounds[3] <= height - bottom_inset
        detail = f"{label} bounds={bounds}, safe=[{top_inset},{height - bottom_inset}]"
        self.add(f"ui:{name}:safe-area", "PASS" if safe else "FAIL", detail)
        return safe

    def keyboard_top(self, root: ET.Element, height: int) -> int | None:
        candidates: list[int] = []
        for node in root.iter("node"):
            package = node.attrib.get("package", "").lower()
            resource = node.attrib.get("resource-id", "").lower()
            if not any(value in package or value in resource for value in ("inputmethod", "keyboard", "ime")):
                continue
            bounds = self.node_bounds(node)
            if bounds is not None and bounds[1] > height // 2:
                candidates.append(bounds[1])
        return min(candidates) if candidates else None

    def check_keyboard_input(self, name: str, label: str) -> bool:
        if not self.wait_for_label(label):
            self.add(f"ui:{name}", "SKIP", f"campo nao disponivel: {label}")
            return False
        if not self.tap_label(label):
            self.add(f"ui:{name}", "FAIL", f"nao foi possivel focar: {label}")
            return False
        time.sleep(0.7)
        root = self.dump_ui()
        node = self.find_node(root, label) if root is not None else None
        if root is None or node is None:
            self.add(f"ui:{name}", "FAIL", f"campo desapareceu: {label}")
            return True
        bounds = self.node_bounds(node)
        composer = self.find_node(root, "Composer") if label == "Prompt" and root is not None else None
        reference_bounds = self.node_bounds(composer) if composer is not None else bounds
        _, height, top_inset, _ = self.display_metrics()
        ime_top = self.keyboard_top(root, height)
        if bounds is None or reference_bounds is None or ime_top is None:
            self.add(f"ui:{name}", "SKIP", "IME nao identificado na arvore UI")
            return True
        minimum_gap = max(1, round(height * 0.018))
        gap = ime_top - reference_bounds[3]
        safe = bounds[1] >= top_inset and gap >= minimum_gap
        detail = f"{label} bounds={bounds}, reference={reference_bounds}, ime_top={ime_top}, gap={gap}px, min_gap={minimum_gap}px, top={top_inset}"
        self.add(f"ui:{name}", "PASS" if safe else "FAIL", detail)
        return True

    def wait_for_label(self, label: str, timeout: float = 6) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            root = self.dump_ui()
            if root is not None and self.find_node(root, label) is not None:
                return True
            time.sleep(0.4)
        return False

    def back(self) -> None:
        self.adb(["shell", "input", "keyevent", "4"])
        time.sleep(0.5)

    def runtime_flows(self) -> None:
        if self.adb_path is None or self.serial is None:
            self.add("ui:flows", "SKIP", "ADB indisponivel")
            return
        self.adb(["reverse", "tcp:8081", "tcp:8081"])
        self.adb(["shell", "am", "force-stop", "com.byokchat.mobile"])
        self.adb(["shell", "am", "start", "-n", "com.byokchat.mobile/.MainActivity"])

        ui_root = self.dump_ui()
        app_visible = ui_root is not None and any(node.attrib.get("package") == "com.byokchat.mobile" for node in ui_root.iter("node"))
        if not app_visible:
            self.add("ui:device-unlocked", "SKIP", "a app nao esta visivel; desbloquear o dispositivo para correr UIAutomator")
            return

        if self.wait_for_label("Como te chamas?", timeout=2):
            profile_ok = self.tap_label("Nome do utilizador") and self.input_text("Tiago") and self.tap_label("Guardar nome") and self.wait_for_label("Olá, Tiago")
            self.add("ui:profile-name", "PASS" if profile_ok else "FAIL", "nome local Tiago guardado")
            if not profile_ok:
                return
        elif self.wait_for_label("Olá, Tiago", timeout=2):
            self.add("ui:profile-name", "PASS", "nome local Tiago já configurado")

        def exercise(name: str, tap: str, expected: str) -> bool:
            if not self.wait_for_label(tap):
                self.add(f"ui:{name}", "FAIL", f"controlo nao encontrado: {tap}")
                return False
            if not self.tap_label(tap):
                self.add(f"ui:{name}", "FAIL", f"nao foi possivel tocar: {tap}")
                return False
            passed = self.wait_for_label(expected)
            safe = True
            safe_labels = {
                "new-project-modal": ("Novo projeto", "Criar projeto"),
                "model-modal": ("Escolher modelo", "GPT-5.6 Luna"),
                "chat-options": ("Opções", "Nova conversa"),
                "conversation-project-modal": ("Adicionar ao projeto", "Criar novo projeto"),
                "project-context": ("CONVERSAS DO PROJETO", "Apagar projeto"),
                "voice-modal": ("Voz da IA",),
            }
            if name in safe_labels and passed:
                for safe_label in safe_labels[name]:
                    safe = self.check_safe_node(f"{name}:{safe_label}", safe_label) and safe
            self.add(f"ui:{name}", "PASS" if passed and safe else "FAIL", f"esperado {expected}")
            return passed

        if self.wait_for_label("BYOK / CHAT"):
            self.add("ui:home", "PASS", "ecran inicial carregado")
            self.check_safe_node("home-header", "BYOK / CHAT")
            self.check_safe_node("home-footer", "Nova conversa pelo menu")
        else:
            self.add("ui:home", "FAIL", "ecran inicial nao carregou")
            return

        if exercise("settings", "Abrir definições", "DEFINIÇÕES"):
            exercise("voice-modal", "Selecionar voz", "Voz da IA")
            self.back()
            if self.check_keyboard_input("settings-keyboard", "API key"):
                self.back()
            self.back()
        if exercise("new-project-modal", "Novo projeto", "Novo projeto"):
            if self.check_keyboard_input("new-project-keyboard", "Nome do projeto"):
                self.back()
            self.back()
        if exercise("new-conversation", "Nova conversa", "Escreve uma mensagem"):
            if self.check_keyboard_input("chat-keyboard", "Prompt"):
                self.back()
            exercise("model-modal", "Escolher modelo", "Escolher modelo")
            self.back()
            exercise("chat-options", "Mais opções", "Opções")
            self.back()
            exercise("voice-mode", "Modo voz", "Resposta por voz")
            exercise("text-mode", "Modo texto", "Resposta por texto")
            self.back()
        if exercise("project-context", "Lançamento BYOK", "CONVERSAS DO PROJETO"):
            self.back()
        if exercise("conversation-project-modal", "Adicionar conversa ao projeto", "Adicionar ao projeto"):
            self.back()
        if exercise("bottom-chat", "Nova conversa pelo menu", "Escreve uma mensagem"):
            self.back()

    def check_logs(self) -> None:
        if self.adb_path is None or self.serial is None:
            self.add("adb:logs", "SKIP", "ADB indisponivel")
            return
        result = self.adb(["logcat", "-d", "-t", "400"])
        patterns = ("Unable to load script", "FATAL EXCEPTION", "ReactNativeJS: Error")
        matches = [line for line in result.stdout.splitlines() if any(pattern in line for pattern in patterns)]
        self.add("adb:logs", "FAIL" if matches else "PASS", "erros criticos recentes", " | ".join(matches[-3:]))

    def run(self, run_commands: bool, runtime: bool) -> int:
        self.check_source()
        self.check_node(run_commands)
        self.check_metro()
        if self.discover_device():
            self.check_adb_runtime()
            if runtime:
                self.runtime_flows()
            self.check_logs()
        failed = [result for result in self.results if result.status == "FAIL"]
        return 1 if failed else 0


def print_results(results: Iterable[Result], as_json: bool) -> None:
    values = list(results)
    if as_json:
        print(json.dumps([asdict(result) for result in values], ensure_ascii=True, indent=2))
        return
    for result in values:
        evidence = f" | {result.evidence}" if result.evidence else ""
        print(f"[{result.status:4}] {result.name}: {result.detail}{evidence}")
    print(f"\nResumo: {sum(result.status == 'PASS' for result in values)} PASS, {sum(result.status == 'FAIL' for result in values)} FAIL, {sum(result.status == 'SKIP' for result in values)} SKIP")


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida fonte, ferramentas e fluxos nao destrutivos do BYOK Chat.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--serial", help="Serial ADB do dispositivo")
    parser.add_argument("--metro-port", type=int, default=8081)
    parser.add_argument("--no-node", action="store_true", help="Nao executar typecheck/testes")
    parser.add_argument("--runtime", action="store_true", help="Executar smoke flows via UIAutomator")
    parser.add_argument("--json", action="store_true", help="Emitir relatorio JSON")
    args = parser.parse_args()
    validator = Validator(args.root.resolve(), args.serial, args.metro_port)
    code = validator.run(not args.no_node, args.runtime)
    print_results(validator.results, args.json)
    return code


if __name__ == "__main__":
    sys.exit(main())
