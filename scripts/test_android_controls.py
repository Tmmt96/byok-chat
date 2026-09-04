#!/usr/bin/env python3
"""Exercise Android stop-response and stop-voice controls without logging secrets."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


class AndroidControls:
    def __init__(self, serial: str, timeout: float) -> None:
        self.serial = serial
        self.timeout = timeout
        self.adb = self.find_adb()
        self.remote_xml = "/sdcard/byok-chat-controls.xml"

    @staticmethod
    def find_adb() -> Path:
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
        if found:
            return Path(found)
        raise RuntimeError("adb nao encontrado")

    def run(self, args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
        return subprocess.run([str(self.adb), "-s", self.serial, *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False)

    def dump(self) -> ET.Element:
        result = self.run(["shell", "uiautomator", "dump", self.remote_xml])
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "uiautomator dump falhou")
        raw = self.run(["exec-out", "cat", self.remote_xml]).stdout
        start = raw.find("<hierarchy")
        if start < 0:
            raise RuntimeError("arvore UI vazia")
        return ET.fromstring(raw[start:])

    @staticmethod
    def find(root: ET.Element, label: str) -> ET.Element | None:
        for node in root.iter("node"):
            values = (node.attrib.get("text", ""), node.attrib.get("content-desc", ""))
            if label in values or any(label.lower() in value.lower() for value in values if value):
                return node
        return None

    @staticmethod
    def bounds(node: ET.Element) -> tuple[int, int, int, int] | None:
        match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        return tuple(int(value) for value in match.groups()) if match else None

    def wait_for(self, label: str, timeout: float | None = None) -> bool:
        deadline = time.monotonic() + (timeout or self.timeout)
        while time.monotonic() < deadline:
            if self.find(self.dump(), label) is not None:
                return True
            time.sleep(0.08)
        return False

    def tap(self, label: str) -> bool:
        node = self.find(self.dump(), label)
        box = self.bounds(node) if node is not None else None
        if box is None:
            return False
        x1, y1, x2, y2 = box
        return self.run(["shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)]).returncode == 0

    def input_text(self, value: str) -> bool:
        return self.run(["shell", "input", "text", value.replace(" ", "%s")]).returncode == 0

    def visible_labels(self) -> list[str]:
        labels: list[str] = []
        for node in self.dump().iter("node"):
            labels.extend(value for value in (node.attrib.get("text", ""), node.attrib.get("content-desc", "")) if value)
        return labels

    def open_new_conversation(self) -> bool:
        for _ in range(5):
            if self.tap("Nova conversa") or self.tap("Nova conversa pelo menu"):
                return True
            self.run(["shell", "input", "swipe", "540", "1850", "540", "650", "300"])
            time.sleep(0.2)
        return False

    def launch(self) -> None:
        self.run(["reverse", "tcp:8081", "tcp:8081"])
        self.run(["shell", "am", "force-stop", "com.byokchat.mobile"])
        result = self.run(["shell", "am", "start", "-n", "com.byokchat.mobile/.MainActivity"])
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "nao foi possivel abrir a app")

    def ensure_home(self) -> None:
        if self.wait_for("BYOK / CHAT", 8):
            if self.find(self.dump(), "Como te chamas?") is not None:
                if not (self.tap("Nome do utilizador") and self.input_text("Tiago") and self.tap("Guardar nome") and self.wait_for("Olá, Tiago", 6)):
                    raise RuntimeError("nao foi possivel configurar o nome local")
            return
        raise RuntimeError("Home nao carregou")

    def stop_response(self) -> None:
        opened = self.open_new_conversation()
        if not opened or not self.wait_for("Prompt") or not self.tap("Prompt"):
            raise RuntimeError(f"nao foi possivel abrir uma conversa nova; labels={self.visible_labels()[-30:]}")
        if not self.input_text("Faz uma analise muito longa sobre os impactos economicos sociais e regulatorios da inteligencia artificial na Europa") or not self.tap("Enviar prompt"):
            raise RuntimeError("nao foi possivel iniciar o streaming")
        if not self.wait_for("Parar resposta", 8):
            raise RuntimeError("o botao Parar resposta nao apareceu durante o streaming")
        tapped = any(self.tap("Parar resposta") or time.sleep(0.08) for _ in range(3))
        if not tapped or not self.wait_for("Enviar prompt", 4):
            raise RuntimeError("o streaming nao parou")

    def stop_voice_and_leave(self) -> None:
        if self.find(self.dump(), "Ouvir resposta") is None:
            if not self.tap("Prompt") or not self.input_text("Responde com um texto detalhado em varios paragrafos sobre inteligencia artificial na Europa") or not self.tap("Enviar prompt"):
                raise RuntimeError("nao foi possivel obter uma resposta para testar voz")
            if not self.wait_for("Ouvir resposta", 15):
                raise RuntimeError("resposta sem controlo Ouvir resposta")
        if not self.tap("Ouvir resposta") or not self.wait_for("Parar de ouvir", 3):
            raise RuntimeError("o botao Parar de ouvir nao apareceu")
        if not self.tap("Parar de ouvir") or not self.wait_for("Ouvir resposta", 3):
            raise RuntimeError("a voz nao parou")
        if not self.tap("Voltar") or not self.wait_for("BYOK / CHAT", 4):
            raise RuntimeError("nao foi possivel sair do chat")

    def check_conversation_persistence(self) -> None:
        self.launch()
        self.ensure_home()
        if not self.wait_for("Faz uma analise longa", 6):
            raise RuntimeError("a conversa criada nao foi recuperada depois de reabrir a app")


def main() -> int:
    parser = argparse.ArgumentParser(description="Testa os controlos de stop no BYOK Chat Android.")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--timeout", type=float, default=12)
    args = parser.parse_args()
    try:
        controls = AndroidControls(args.serial, args.timeout)
        controls.launch()
        controls.ensure_home()
        controls.stop_response()
        print("ANDROID_STOP_RESPONSE=PASS")
        controls.stop_voice_and_leave()
        print("ANDROID_STOP_VOICE_AND_LEAVE=PASS")
        controls.check_conversation_persistence()
        print("ANDROID_CONVERSATION_PERSISTENCE=PASS")
        return 0
    except (OSError, RuntimeError, ET.ParseError, subprocess.SubprocessError) as exc:
        print(f"ANDROID_CONTROLS=FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())