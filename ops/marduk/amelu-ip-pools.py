#!/usr/bin/env python3
"""
Picks the outbound IP per sender on marduk (see devlog 2026-11-01).

The three noez tunnel IPs each have a Stalwart connection strategy:
  out3 (5.230.173.87)  amelu.org's own mail
  out2 (5.230.173.86)  domains created in the last NEW_DAYS days
  out1 (5.230.173.85)  everyone else
so a new account that sends spam can't hurt established customers.
marduk's own IP (141.95.52.66) no longer sends while this is on.

Runs hourly from cron and rewrites the connection expression in the
x:MtaOutboundStrategy singleton; the route goes straight to MX. It only
uses the tunnel IPs while all three are A records of marduk.mx.amelu.org,
because customer SPF is "mx -all"; otherwise it falls back to 'default'.

  amelu-ip-pools.py --dry-run   print the decision, change nothing
  amelu-ip-pools.py --off       send everything from marduk's own IP again
"""
import base64, datetime, json, os, socket, sys, urllib.request

JMAP = "http://127.0.0.1:8080/jmap"
MX_HOST = "marduk.mx.amelu.org"
POOL_IPS = {"5.230.173.85", "5.230.173.86", "5.230.173.87"}
NEW_DAYS = 7
OWN_DOMAINS = ["amelu.org"]
ROUTE = {"match": {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}}, "else": "'mx'"}


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
        name, created = (d.get("name") or "").lower(), d.get("createdAt")
        # Names go into the expression in quotes; only plain hostnames.
        if not created or not name or name in OWN_DOMAINS or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789.-" for c in name):
            continue
        if datetime.datetime.fromisoformat(created.replace("Z", "+00:00")) >= cutoff:
            out.append(name)
    return sorted(out)


def pool_ips_in_mx():
    try:
        return POOL_IPS <= set(socket.gethostbyname_ex(MX_HOST)[2])
    except OSError:
        return False


def main():
    dry, off = "--dry-run" in sys.argv, "--off" in sys.argv
    if not off and pool_ips_in_mx():
        doms = new_domains()
        match = {"0": {"if": " || ".join(f"sender_domain == '{d}'" for d in OWN_DOMAINS), "then": "'out3'"}}
        if doms:
            match["1"] = {"if": " || ".join(f"sender_domain == '{d}'" for d in doms), "then": "'out2'"}
        connection = {"match": match, "else": "'out1'"}
        state = f"tunnel IPs: amelu.org on out3, {len(doms)} new domains on out2, the rest on out1"
    else:
        connection = {"match": {}, "else": "'default'"}
        state = "marduk's own IP" + ("" if off else f" (not all tunnel IPs are A records of {MX_HOST})")

    cur = jmap([["x:MtaOutboundStrategy/get", {"ids": ["singleton"]}, "0"]])[0][1]["list"][0]
    if cur["connection"] == connection and cur["route"] == ROUTE:
        print(f"unchanged: {state}")
        return
    if dry:
        print(f"WOULD SET: {state}")
        return
    r = jmap([["x:MtaOutboundStrategy/set", {"update": {"singleton": {"connection": connection, "route": ROUTE}}}, "0"]])[0][1]
    if "singleton" not in (r.get("updated") or {}):
        raise SystemExit(f"Stalwart refused: {r}")
    jmap([["x:Action/set", {"create": {"a": {"@type": "ReloadSettings"}}}, "0"]])
    print(f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} set: {state}", flush=True)


if __name__ == "__main__":
    main()
