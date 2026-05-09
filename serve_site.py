from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"


class Handler(BaseHTTPRequestHandler):
    def _send_index(self, include_body=True):
        data = INDEX.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def do_GET(self):
        self._send_index()

    def do_HEAD(self):
        self._send_index(False)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8768), Handler).serve_forever()
