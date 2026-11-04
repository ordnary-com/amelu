#!/usr/bin/env python3
"""
Picks the outbound IP per sender on marduk (see devlog 2026-11-01 and
2026-11-04).

The three noez tunnel IPs each have a Stalwart connection strategy:
  out3 (5.230.173.87)  amelu.org's own mail
  out2 (5.230.173.86)  domains created in the last NEW_DAYS days
  out1 (5.230.173.85)  everyone else's mail to Gmail
so a new account that sends spam can't hurt established customers.
Everyone else's other mail goes out over the OVH lane: the strategy 'ovh'
with the OVH failover IPs out4-6 that sit directly on marduk. noez allows 150
messages an hour through the tunnel, so the cap of 140 only counts the
tunnel pools; the OVH lane has its own cap that grows while its IPs warm up.
marduk's own IP (141.95.52.66) no longer sends while this is on.

Runs hourly from cron and rewrites the connection expression in the
x:MtaOutboundStrategy singleton, the 'ovh' strategy's source IPs and the
two caps; the route goes straight to MX. It only uses the tunnel IPs while
all three are A records of marduk.mx.amelu.org, because customer SPF is
"mx -all"; otherwise it falls back to 'default'. An OVH IP joins the lane
only once it is an A record of marduk.mx.amelu.org too and its PTR and its
outN name point at each other; without any, that mail stays on out1.

  amelu-ip-pools.py --dry-run   print the decision, change nothing
  amelu-ip-pools.py --off       send everything from marduk's own IP again
"""
import base64, datetime, json, os, socket, sys, urllib.request

JMAP = "http://127.0.0.1:8080/jmap"
MX_HOST = "marduk.mx.amelu.org"
POOL_IPS = {"5.230.173.85", "5.230.173.86", "5.230.173.87"}
OVH_IPS = {"out4.mx.amelu.org": "51.89.39.34", "out5.mx.amelu.org": "51.89.2.193", "out6.mx.amelu.org": "51.89.1.228"}
NEW_DAYS = 7
OWN_DOMAINS = ["amelu.org"]
# Gmail is strictest with new IPs, so it keeps the warm tunnel IP.
TUNNEL_RCPT_DOMAINS = ["gmail.com", "googlemail.com"]
ROUTE = {"match": {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}}, "else": "'mx'"}
NOT_LOCAL = {"if": "is_local_domain(rcpt_domain)", "then": "false"}
TUNNEL_CAP = "noez tunnel cap"
OVH_CAP = "OVH lane warm-up cap"
# Messages an hour over the whole OVH lane, by days since it first sent.
WARMUP = [60, 120, 250, 500, 800, 1200]
SINCE_FILE = "/var/lib/amelu-ip-pools/ovh-since"


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


def mx_ips():
    try:
        return set(socket.gethostbyname_ex(MX_HOST)[2])
    except OSError:
        return set()


def ovh_ready(mx):
    """The OVH IPs receivers will accept: in customer SPF, with forward-confirmed reverse DNS."""
    ready = {}
    for name, ip in OVH_IPS.items():
        try:
            ptr = socket.gethostbyaddr(ip)[0].rstrip(".").lower()
            forward = set(socket.gethostbyname_ex(name)[2])
        except OSError:
            continue
        if ip in mx and ptr == name and forward == {ip}:
            ready[name] = ip
    return ready


def warmup_rate(dry):
    today = datetime.date.today()
    try:
        since = datetime.date.fromisoformat(open(SINCE_FILE).read().strip())
    except (OSError, ValueError):
        since = today
        if not dry:
            os.makedirs(os.path.dirname(SINCE_FILE), exist_ok=True)
            open(SINCE_FILE, "w").write(since.isoformat() + "\n")
    return WARMUP[min((today - since).days, len(WARMUP) - 1)]


def either(field, values):
    return " || ".join(f"{field} == '{v}'" for v in values)


def main():
    dry, off = "--dry-run" in sys.argv, "--off" in sys.argv
    mx = mx_ips()
    ovh, rate = {}, None
    if not off and POOL_IPS <= mx:
        doms = new_domains()
        ovh = ovh_ready(mx)
        # The same first matches decide the IP and which cap counts the message.
        tunnel = {"0": {"if": either("sender_domain", OWN_DOMAINS), "then": "'out3'"}}
        if doms:
            tunnel["1"] = {"if": either("sender_domain", doms), "then": "'out2'"}
        if ovh:
            tunnel[str(len(tunnel))] = {"if": either("rcpt_domain", TUNNEL_RCPT_DOMAINS), "then": "'out1'"}
            connection = {"match": tunnel, "else": "'ovh'"}
            rate = warmup_rate(dry)
            lane = f"Gmail on out1, the rest on the OVH lane ({', '.join(n.split('.')[0] for n in sorted(ovh))}, {rate}/h)"
        else:
            connection = {"match": tunnel, "else": "'out1'"}
            lane = "the rest on out1 (no OVH IP ready)"
        state = f"tunnel IPs: amelu.org on out3, {len(doms)} new domains on out2, {lane}"
        shift = lambda then: {str(int(k) + 1): {"if": v["if"], "then": then} for k, v in tunnel.items()}
        tunnel_cap = {"match": {"0": NOT_LOCAL, **shift("true")}, "else": "false"} if ovh else {"match": {"0": NOT_LOCAL}, "else": "true"}
        ovh_cap = {"match": {"0": NOT_LOCAL, **shift("false")}, "else": "true"}
    else:
        connection = {"match": {}, "else": "'default'"}
        state = "marduk's own IP" + ("" if off else f" (not all tunnel IPs are A records of {MX_HOST})")
        tunnel_cap = {"match": {"0": NOT_LOCAL}, "else": "true"}

    cur = jmap([["x:MtaOutboundStrategy/get", {"ids": ["singleton"]}, "0"],
                ["x:MtaConnectionStrategy/get", {}, "1"],
                ["x:MtaOutboundThrottle/get", {}, "2"]])
    strategy = cur[0][1]["list"][0]
    ovh_strategy = next((s for s in cur[1][1]["list"] if s["name"] == "ovh"), None)
    throttles = cur[2][1]["list"]
    tcap = next(t for t in throttles if t["description"].startswith(TUNNEL_CAP))
    ocap = next((t for t in throttles if t["description"].startswith(OVH_CAP)), None)

    calls = []
    if strategy["connection"] != connection or strategy["route"] != ROUTE:
        calls.append(["x:MtaOutboundStrategy/set", {"update": {"singleton": {"connection": connection, "route": ROUTE}}}, "s"])
    if tcap["match"] != tunnel_cap:
        calls.append(["x:MtaOutboundThrottle/set", {"update": {tcap["id"]: {"match": tunnel_cap}}}, "t"])
    if ovh:
        source = {str(i): {"ehloHostname": n, "sourceIp": ip} for i, (n, ip) in enumerate(sorted(ovh.items()))}
        fields = {"description": "Send from the OVH failover IPs directly on marduk (out4-6.mx.amelu.org)",
                  "ehloHostname": sorted(ovh)[0], "sourceIps": source}
        if ovh_strategy is None:
            calls.append(["x:MtaConnectionStrategy/set", {"create": {"o": {"name": "ovh", **fields}}}, "o"])
        elif ovh_strategy["sourceIps"] != source:
            calls.append(["x:MtaConnectionStrategy/set", {"update": {ovh_strategy["id"]: fields}}, "o"])
        cap = {"enable": True, "description": f"{OVH_CAP}: {rate} messages per hour over out4-6, grows daily (amelu-ip-pools)",
               "key": {}, "match": ovh_cap, "rate": {"count": rate, "period": 3600000}}
        if ocap is None:
            calls.append(["x:MtaOutboundThrottle/set", {"create": {"c": cap}}, "c"])
        elif any(ocap[k] != cap[k] for k in ("enable", "description", "match", "rate")):
            calls.append(["x:MtaOutboundThrottle/set", {"update": {ocap["id"]: cap}}, "c"])

    if not calls:
        print(f"unchanged: {state}")
        return
    if dry:
        print(f"WOULD SET: {state}")
        print(json.dumps(calls, indent=1)[:3000])
        return
    # Strategy and caps first, so the connection expression never names an 'ovh' that isn't there.
    calls.sort(key=lambda c: c[2] == "s")
    for r in jmap(calls):
        res = r[1]
        if r[0].endswith("/error") or res.get("notCreated") or res.get("notUpdated"):
            raise SystemExit(f"Stalwart refused: {r}")
    jmap([["x:Action/set", {"create": {"a": {"@type": "ReloadSettings"}}}, "0"]])
    print(f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} set: {state}", flush=True)


if __name__ == "__main__":
    main()
