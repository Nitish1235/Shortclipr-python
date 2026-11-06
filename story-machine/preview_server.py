"""Local-only preview server for the ShortClipr landing page and studio UI."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


WORKSPACE = Path(__file__).resolve().parent.parent
STORY_ROOT = WORKSPACE / "story-machine"
PUBLIC_ROOT = WORKSPACE / "public"
HOST = "127.0.0.1"
PORT = 8765


class PreviewHandler(SimpleHTTPRequestHandler):
    allowed_public_files = {"logo.svg", "favicon.svg"}

    def translate_path(self, path: str) -> str:
        request_path = Path(unquote(urlparse(path).path).lstrip("/"))
        parts = request_path.parts

        if parts and parts[0] == "story-machine":
            relative = Path(*parts[1:]) if len(parts) > 1 else Path("index.html")
            target = (STORY_ROOT / relative).resolve()
            if target == STORY_ROOT or STORY_ROOT in target.parents:
                if target.is_dir():
                    target /= "index.html"
                return str(target)

        if len(parts) == 2 and parts[0] == "public" and parts[1] in self.allowed_public_files:
            return str((PUBLIC_ROOT / parts[1]).resolve())

        return str(STORY_ROOT / "__not_found__")

    def do_GET(self) -> None:
        if self.path in {"/", "/story-machine"}:
            self.send_response(302)
            self.send_header("Location", "/story-machine/")
            self.end_headers()
            return
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), PreviewHandler)
    print(f"ShortClipr preview: http://{HOST}:{PORT}/story-machine/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
