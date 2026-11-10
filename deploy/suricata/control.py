#!/usr/bin/env python3
"""Sidecar kontrol Suricata untuk Docker Compose NEXA.

Hanya dua perintah tetap: POST /validate dan POST /deploy (body = teks rule).
Keduanya memanggil nexa-suricata.sh dengan rule lewat stdin (tanpa shell, tanpa
argumen dari klien). Wajib header Authorization: Bearer <SURICATA_CONTROL_TOKEN>.
Hanya didengar di jaringan internal compose.
"""
import hmac
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("SURICATA_CONTROL_TOKEN", "")
WRAPPER = os.environ.get("NEXA_SURICATA_WRAPPER", "/opt/nexa/nexa-suricata.sh")
MAX_BODY = 512 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "nexa-suricata-control"

    def _send(self, code: int, text: str) -> None:
        body = text.encode("utf-8", "replace")
        self.send_response(code)
        self.send_header("content-type", "text/plain; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self._send(200, "ok")
        else:
            self._send(404, "not found")

    def do_POST(self) -> None:  # noqa: N802
        auth = self.headers.get("authorization", "")
        if not TOKEN or not hmac.compare_digest(auth, f"Bearer {TOKEN}"):
            self._send(401, "unauthorized")
            return
        command = {"/validate": "validate", "/deploy": "deploy"}.get(self.path)
        if command is None:
            self._send(404, "not found")
            return
        length = int(self.headers.get("content-length", "0") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(400, "body rule wajib (maks 512 KB)")
            return
        rules = self.rfile.read(length)
        proc = subprocess.run(
            [WRAPPER, command], input=rules, capture_output=True, timeout=90, check=False
        )
        out = (proc.stdout + proc.stderr).decode("utf-8", "replace")[-4000:]
        self._send(200 if proc.returncode == 0 else 422, out)

    def log_message(self, fmt: str, *args) -> None:  # tanpa log body/token
        print(f'{{"svc":"suricata-control","msg":"{self.command} {self.path}"}}', flush=True)


if __name__ == "__main__":
    if len(TOKEN) < 16:
        raise SystemExit("SURICATA_CONTROL_TOKEN wajib (min 16 karakter)")
    subprocess.run([WRAPPER, "start"], check=False)
    ThreadingHTTPServer(("0.0.0.0", 9010), Handler).serve_forever()
