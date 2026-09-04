#!/usr/bin/env python3
"""Send a safe smoke prompt through the Android BYOK Chat app."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path


DEFAULT_PROMPT = "Quais sao os principais debates atuais sobre inteligencia artificial na Europa em setembro de 2026?"


class ChatSmoke:
    def __init__(self, root: Path, serial: str, timeout: float) -> None:
        self.root = root
        self.serial = serial
        self.timeout = timeout
        self.adb = self.find_adb()

    def find_adb(self) -> str:
        candidates = [
            os.environ.get("ADB_PATH"),
            os.environ.get("ANDROID_HOME"),
            os.environ.get("ANDROID_SDK_ROOT"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk"),
        ]
        for value in candidates:
            if not value:
                continue
            path = Path(value)
            executable = path if path.name.lower() == "adb.exe" else path / "platform-tools" / "adb.exe"
            if executable.is_file():
                return str(executable)
        found = shutil.which("adb")
        if found:
            return found
        raise RuntimeError("adb nao encontrado")

    def run(self, args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
        return subprocess.run([self.adb, "-s", self.serial, *args], cwd=self.root, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False)

    @staticmethod
    def bounds(node: ET.Element) -> tuple[int, int, int, int] | None:
        match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        return tuple(int(value) for value in match.groups()) if match else None

    def dump(self) -> ET.Element:
        remote = "/sdcard/byok-chat-chat-test.xml"
        result = self.run(["shell", "uiautomator", "dump", remote])
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "uiautomator dump falhou")
        xml = self.run(["exec-out", "cat", remote]).stdout or ""
        start = xml.find("<hierarchy")
        if start < 0:
            raise RuntimeError("arvore UI vazia")
        return ET.fromstring(xml[start:])

    @staticmethod
    def find(root: ET.Element, label: str) -> ET.Element | None:
        for node in root.iter("node"):
            values = (node.attrib.get("text", ""), node.attrib.get("content-desc", ""))
            if label in values or any(label.lower() in value.lower() for value in values if value):
                return node
        return None

    def tap(self, label: str) -> bool:
        node = self.find(self.dump(), label)
        box = self.bounds(node) if node is not None else None
        if box is None:
            return False
        x1, y1, x2, y2 = box
        return self.run(["shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)]).returncode == 0

    def input_text(self, value: str) -> bool:
        safe_value = value.replace(" ", "%s")
        return self.run(["shell", "input", "text", safe_value]).returncode == 0

    def visible_text(self) -> list[str]:
        values: list[str] = []
        for node in self.dump().iter("node"):
            values.extend(value for value in (node.attrib.get("text", ""), node.attrib.get("content-desc", "")) if value)
        return values

    def wait_for(self, label: str, timeout: float | None = None) -> bool:
        deadline = time.monotonic() + (timeout or self.timeout)
        while time.monotonic() < deadline:
            try:
                if self.find(self.dump(), label) is not None:
                    return True
            except (OSError, ET.ParseError, RuntimeError):
                pass
            time.sleep(0.4)
        return False

    def check_scroll_to_end(self) -> bool:
        size = self.run(["shell", "wm", "size"]).stdout
        match = re.search(r"(\d+)x(\d+)", size)
        width, height = (int(match.group(1)), int(match.group(2))) if match else (1080, 2340)
        swipe = self.run(["shell", "input", "swipe", str(width // 2), str(round(height * 0.72)), str(width // 2), str(round(height * 0.34)), "500"])
        if swipe.returncode != 0 or not self.wait_for("Ir para o fim da resposta", 4):
            return False
        return self.tap("Ir para o fim da resposta") and not self.wait_for("Ir para o fim da resposta", 2)

    def launch(self) -> None:
        self.run(["reverse", "tcp:8081", "tcp:8081"])
        self.run(["shell", "am", "force-stop", "com.byokchat.mobile"])
        result = self.run(["shell", "am", "start", "-n", "com.byokchat.mobile/.MainActivity"])
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "nao foi possivel abrir a app")

    def send(self, prompt: str, check_scroll: bool) -> str:
        if not self.wait_for("BYOK / CHAT"):
            raise RuntimeError("Home nao carregou; confirmar que o dispositivo esta desbloqueado")
        if self.find(self.dump(), "Como te chamas?") is not None:
            if not (self.tap("Nome do utilizador") and self.input_text("Tiago") and self.tap("Guardar nome") and self.wait_for("Olá, Tiago", 6)):
                raise RuntimeError("nao foi possivel guardar o nome local Tiago")
        if not self.tap("Nova conversa"):
            raise RuntimeError("botao Nova conversa nao encontrado")
        if not self.wait_for("Prompt"):
            raise RuntimeError("composer nao carregou")
        if not self.tap("Prompt"):
            raise RuntimeError("campo Prompt nao recebeu foco")
        safe_prompt = prompt.replace(" ", "%s")
        if self.run(["shell", "input", "text", safe_prompt]).returncode != 0:
            raise RuntimeError("nao foi possivel escrever o prompt")
        if not self.tap("Enviar prompt"):
            raise RuntimeError("botao Enviar prompt nao encontrado")
        deadline = time.monotonic() + self.timeout
        saw_streaming = False
        while time.monotonic() < deadline:
            texts = self.visible_text()
            if any("Configure uma API key" in text for text in texts):
                return "CONFIGURATION_ERROR"
            if any("A preparar resposta" in text for text in texts):
                saw_streaming = True
            elif saw_streaming:
                if check_scroll:
                    return "RESPONSE_FINISHED_SCROLL_PASS" if self.check_scroll_to_end() else "RESPONSE_FINISHED_SCROLL_FAIL"
                return "RESPONSE_FINISHED"
            time.sleep(0.5)
        return "STREAMING_TIMEOUT" if saw_streaming else "MESSAGE_SENT_NO_RESULT"


def main() -> int:
    parser = argparse.ArgumentParser(description="Executa uma conversa smoke segura no BYOK Chat Android.")
    parser.add_argument("--serial", required=True, help="Serial ADB do dispositivo")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt de teste sem credenciais")
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--check-scroll", action="store_true", help="Validar a seta de regresso ao fim numa resposta longa")
    args = parser.parse_args()
    try:
        result = ChatSmoke(Path(__file__).resolve().parents[1], args.serial, args.timeout)
        result.launch()
        outcome = result.send(args.prompt, args.check_scroll)
        print(f"CHAT_SMOKE={outcome}")
        return 0
    except (OSError, RuntimeError, ET.ParseError, subprocess.SubprocessError) as exc:
        print(f"CHAT_SMOKE=FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
