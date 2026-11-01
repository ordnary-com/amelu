#!/usr/bin/env python3
"""
Sends all mail from new Amelu domains through the temporary Hetzner relay
(amelu-relay, 5.75.135.131), so new accounts don't share marduk's IP with
established customers. Runs hourly from cron; see devlog 2026-11-01.

New means: created in Stalwart within the last NEW_DAYS days. The route
expression in the x:MtaOutboundStrategy singleton is rewritten to
  local domain -> 'local'; sender domain is new -> 'hetzner-relay'; else 'mx'.
It only routes through the relay while relay.mx.amelu.org resolves to the
relay IP (forward-confirmed reverse DNS). Without that, Gmail and others
refuse everything from it permanently (5.7.25), so mail stays direct.

  amelu-relay-route.py --dry-run   print the decision, change nothing
  amelu-relay-route.py --off       route everything direct again
"""
import base64, datetime, json, os, socket, sys, urllib.request

JMAP = "http://127.0.0.1:8080/jmap"
RELAY_ROUTE = "hetzner-relay"
RELAY_HOST, RELAY_IP = "relay.mx.amelu.org", "5.75.135.131"
NEW_DAYS = 7
LOCAL = {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}}


def jmap(calls):
    user, pw = os.environ["STALWART_RECOVERY_ADMIN"].split(":", 1)
    req = urllib.request.Request(JMAP, data=json.dumps({"using": ["urn:ietf:params:jmap:core"], "methodCalls": calls}).encode(),
                                 headers={"Authorization": "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode(), "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))["methodResponses"]


def new_domains():
    ids = jmap([["x:Domain/query", {}, "0"]])[0][1].get("ids", [])
    doms = []
    for i in range(0, len(ids), 200):
        doms += jmap([["x:Domain/get", {"ids": ids[i:i + 200], "properties": ["name", "createdAt"]}, "0"]])[0][1]["list"]
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=NEW_DAYS)
    out = []
    for d in doms:
        created = d.get("createdAt")
        name = (d.get("name") or "").lower()
        # Names go into the expression in quotes; skip anything that isn't a plain hostname.
        if not created or not name or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789.-" for c in name):
            continue
        if datetime.datetime.fromisoformat(created.replace("Z", "+00:00")) >= cutoff:
            out.append(name)
    return sorted(out)


def relay_dns_ok():
    try:
        return socket.gethostbyname(RELAY_HOST) == RELAY_IP
    except OSError:
        return False


def main():
    dry, off = "--dry-run" in sys.argv, "--off" in sys.argv
    doms = [] if off else new_domains()
    dns = relay_dns_ok()
    if doms and dns:
        cond = " || ".join(f"sender_domain == '{d}'" for d in doms)
        route = {"match": {**LOCAL, "1": {"if": cond, "then": f"'{RELAY_ROUTE}'"}}, "else": "'mx'"}
        state = f"{len(doms)} new domains via {RELAY_ROUTE}"
    else:
        route = {"match": LOCAL, "else": "'mx'"}
        state = "everything direct" + ("" if dns or off else f" ({RELAY_HOST} doesn't resolve to {RELAY_IP} yet)")

    current = jmap([["x:MtaOutboundStrategy/get", {"ids": ["singleton"]}, "0"]])[0][1]["list"][0]["route"]
    if current == route:
        print(f"unchanged: {state}")
        return
    if dry:
        print(f"WOULD SET: {state}")
        return
    r = jmap([["x:MtaOutboundStrategy/set", {"update": {"singleton": {"route": route}}}, "0"]])[0][1]
    if "singleton" not in (r.get("updated") or {}):
        raise SystemExit(f"Stalwart refused the route: {r}")
    jmap([["x:Action/set", {"create": {"a": {"@type": "ReloadSettings"}}}, "0"]])
    print(f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} set: {state}", flush=True)


if __name__ == "__main__":
    main()
