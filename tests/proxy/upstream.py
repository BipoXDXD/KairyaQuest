"""Backend HTTP de teste que sinaliza a presença do cabeçalho sem ler seu valor."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class ProbeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = json.dumps(
            {
                "path": self.path,
                "method": self.command,
                "authorization_present": "Authorization" in self.headers,
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_POST = do_GET


if __name__ == "__main__":
    with ThreadingHTTPServer(("0.0.0.0", 8000), ProbeHandler) as server:
        server.serve_forever()
