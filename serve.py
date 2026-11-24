"""Local server for Wishlist Tracker, started by run.bat.

Serves the app at http://localhost:8000 and keeps an automatic copy of your list in the repo's
backups/ folder (ignored by git, so it never shows up in commits):

  backups/wishlist.json                 the whole list after every change (Import… can load it back)
  backups/wishlist.csv                  the same list for Excel
  backups/history/wishlist-<date>.json  one copy per day, last 30 days kept

Only this PC can reach it: it listens on 127.0.0.1, and it only accepts saves sent from the app's
own page, never from other websites.

Usage: python serve.py [port]
"""

import json
import os
import sys
import tempfile
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKUPS = ROOT / "backups"
HISTORY = BACKUPS / "history"
KEEP_DAILY = 30
MAX_BODY = 25 * 1024 * 1024  # 25 MB is far more than any wishlist needs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
ORIGINS = {f"http://{h}" for h in HOSTS}


def write_atomic(path: Path, text: str) -> None:
    """Write to a temporary file, then swap it in, so a crash never leaves half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def read_backup():
    try:
        data = json.loads((BACKUPS / "wishlist.json").read_text(encoding="utf-8"))
        items = data.get("items", []) if isinstance(data, dict) else data
        return data, items if isinstance(items, list) else []
    except (OSError, ValueError):
        return None, []


class Handler(SimpleHTTPRequestHandler):
    # Windows can map .js to text/plain from the registry, which breaks the app's modules.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
        ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".webp": "image/webp",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always the latest files after an update
        super().end_headers()

    # Requests must name this server (stops other sites reaching it through DNS tricks)...
    def host_ok(self):
        return self.headers.get("Host", "") in HOSTS

    # ...and saves must come from the app's own page (stops other open tabs posting to it).
    def origin_ok(self):
        return self.headers.get("Origin", "") in ORIGINS

    def send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if not self.host_ok():
            return self.send_error(403)
        if path == "/api/backup":
            data, items = read_backup()
            return self.send_json(200, {
                "exists": data is not None,
                "saved": data.get("saved", "") if isinstance(data, dict) else "",
                "count": len(items),
                "items": items,
            })
        # The app reads backups through /api/backup; don't serve them (or git internals) as files.
        if path.startswith(("/backups", "/.git")):
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if not self.host_ok():
            return self.send_error(403)
        return super().do_HEAD()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/backup":
            return self.send_error(404)
        if not (self.host_ok() and self.origin_ok()):
            return self.send_json(403, {"error": "Saves are only accepted from the Wishlist Tracker page."})
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY:
            return self.send_json(413, {"error": "Backup is empty or too large."})
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self.send_json(400, {"error": "Backup wasn't valid JSON."})
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            return self.send_json(400, {"error": "Backup has no item list."})

        # A fresh browser starts with an empty list; never let that wipe a good backup.
        # (The app sets allowEmpty only when you deleted the items yourself.)
        _, existing = read_backup()
        if not items and existing and not payload.get("allowEmpty"):
            return self.send_json(200, {"skipped": True, "count": len(existing)})

        now = datetime.now().astimezone()
        doc = {"app": "Wishlist Tracker", "saved": now.isoformat(timespec="seconds"), "count": len(items), "items": items}
        text = json.dumps(doc, ensure_ascii=False, indent=2)
        try:
            write_atomic(BACKUPS / "wishlist.json", text)
            csv_text = payload.get("csv")
            if isinstance(csv_text, str):
                write_atomic(BACKUPS / "wishlist.csv", csv_text)
            write_atomic(HISTORY / f"wishlist-{now:%Y-%m-%d}.json", text)
            for old in sorted(HISTORY.glob("wishlist-*.json"))[:-KEEP_DAILY]:
                old.unlink(missing_ok=True)
        except OSError as e:
            return self.send_json(500, {"error": f"Couldn't write the backup: {e}"})
        return self.send_json(200, {"ok": True, "saved": doc["saved"], "count": len(items), "path": "backups/wishlist.json"})

    def log_request(self, code="-", size="-"):
        # Only print problems, not every file the page loads.
        try:
            bad = int(code) >= 400
        except (TypeError, ValueError):
            bad = False
        if bad:
            super().log_request(code, size)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(ROOT)))
    print(f"Wishlist Tracker is running at http://localhost:{PORT}/")
    print(f"Automatic local copy: {BACKUPS / 'wishlist.json'}")
    print("Close this window (or press Ctrl+C) to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
