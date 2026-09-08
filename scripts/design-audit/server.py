"""Local static preview server; no production API proxy."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import os

PUBLIC = Path(__file__).resolve().parents[2] / "public"
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/privacy", "/terms"):
            self.path = path + ".html"
        elif not Path(self.translate_path(path)).is_file():
            self.path = "/index.html"
        super().do_GET()
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *args):
        pass

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("TRIPTO_AUDIT_PORT", "4174"))), Handler).serve_forever()
