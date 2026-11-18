#!/usr/bin/env python3
"""
GET /healthz on port 9180: 200 while at least one of the router's upstream
BGP sessions is Established (the router still carries 89.106.70.0/24), 503
otherwise. ordnary.com/status checks it every minute
(Airplane, Status, Service Health), so a dropped session shows there.

The sessions to watch are BIRD protocol names in BGP_PROTOCOLS (space
separated, /etc/default/bgp-health), e.g. "ifog4". It asks BIRD in restricted
mode (birdc -r) and caches the answer for a few seconds.
"""
import http.server, os, subprocess, time

PORT = int(os.environ.get("BGP_HEALTH_PORT", "9180"))
WATCH = os.environ.get("BGP_PROTOCOLS", "").split()
CACHE_SECONDS = 5
_cache = {"at": 0.0, "ok": False}


def established():
    now = time.monotonic()
    if now - _cache["at"] < CACHE_SECONDS:
        return _cache["ok"]
    try:
        out = subprocess.run(["birdc", "-r", "show", "protocols"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        out = ""
    states = {}
    for line in out.splitlines():
        cols = line.split()
        if len(cols) >= 6 and cols[1] == "BGP":
            states[cols[0]] = cols[3] == "up" and "Established" in line
    watched = WATCH or list(states)
    ok = any(states.get(name, False) for name in watched)
    _cache.update(at=now, ok=ok)
    return ok


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/healthz":
            self.send_error(404)
            return
        ok = established()
        body = b"ok\n" if ok else b"bgp down\n"
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    do_HEAD = do_GET

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
