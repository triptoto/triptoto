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
        fixture = os.environ.get("TRIPTO_AUDIT_FIXTURE")
        if fixture and path == "/mobile-app.min.js":
            # Local-only state fixtures use the real source renderer. The
            # fixture is never bundled or sent to the production Worker.
            script = (PUBLIC / "mobile-app.js").read_text().replace(
                "      applyPreviewData();",
                "      applyPreviewData();\n" + Path(fixture).read_text(),
                1,
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.end_headers()
            self.wfile.write(script)
            return
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
