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

Runs every 10 minutes from cron and rewrites the connection expression in the
x:MtaOutboundStrategy singleton, the 'ovh' strategy's source IPs and the
two caps; the route goes straight to MX. It only uses the tunnel IPs while
all three are A records of marduk.mx.amelu.org, because customer SPF is
"mx -all"; otherwise it falls back to 'default'. An OVH IP joins the lane
only once it is an A record of marduk.mx.amelu.org too and its PTR and its
outN name point at each other; without any, that mail stays on out1.

Like Migadu's strela it also watches each source IP's reputation: it reads
Stalwart's log from where it left off, finds remote rejections that blame
the sending IP (blacklists, Yahoo's TSS codes, Outlook's "banned sending
IP", or "blocked" with IP wording three times in an hour) and takes that
OVH IP out of the lane for DEGRADE_HOURS, longer each time it happens
again. If every OVH IP is out, the lane keeps them all rather than stop.
A tunnel IP can't be swapped, so for those it only logs.

  amelu-ip-pools.py --dry-run   print the decision, change nothing
  amelu-ip-pools.py --off       send everything from marduk's own IP again
"""
import base64, datetime, json, os, re, socket, sys, urllib.request

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
LOG_DIR = "/var/log/stalwart"
REPUTATION_FILE = "/var/lib/amelu-ip-pools/reputation.json"
DEGRADE_HOURS, MAX_DEGRADE_HOURS = 48, 168
WEAK_STRIKES, WEAK_WINDOW = 3, datetime.timedelta(hours=1)
# Strela's strong signals plus the providers' own codes for an IP block.
STRONG = ["blacklist", "blocklist", "block list", "poor reputation", "rbl", "dnsbl", "spamhaus", "proofpoint", "cloudmark",
          "barracuda", "banned sending ip", "[tss", "s3140", "s3150"]
# These also show up for a single message, so they need IP wording with them.
WEAK = ["blocked", "rejected for policy reasons", "deferred"]
IP_WORDS = ["your ip", "ip address", "sending ip", "the ip", "listed", "reputation", "ptr", "rdns", "reverse dns"]
# A listing of the sender's domain (Spamhaus DBL, Outlook S8002) says nothing about our IP.
DOMAIN_WORDS = ["domain is listed", "domain listed", "dbl", "(s8002)"]
REJECTION = re.compile(r"\((delivery\.[a-z-]*(?:rejected|failed))\)")


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


def classify(line, ip):
    """'strong', 'weak' or None for a rejection line sent from ip."""
    # From/to come before hostname and could contain any word.
    text = line.split("hostname = ", 1)[-1].lower()
    if any(k in text for k in DOMAIN_WORDS) and ip not in text:
        return None
    if any(k in text for k in STRONG):
        return "strong"
    # Gmail puts "[ip  12]" in front of every reply and quotes the IP in SPF
    # results; neither says the IP is the problem.
    quoted = re.sub(r"\[[0-9.]+\s+\d+\]|with ip: \[[0-9.]+\]", "", text)
    code = re.search(r"(?:code = |code: )(\d{3})", text)
    if code and code.group(1).startswith("5") and "authenticat" not in text and any(k in text for k in WEAK) \
            and (ip in quoted or any(k in quoted for k in IP_WORDS)):
        return "weak"
    return None


def watch_reputation(dry):
    """Reads the new Stalwart log lines; returns the IPs that are out, and what happened."""
    try:
        st = json.load(open(REPUTATION_FILE))
    except (OSError, ValueError):
        st = {}
    conn, strikes, degraded = st.get("conn", {}), st.get("strikes", {}), st.get("degraded", {})
    files = sorted(f for f in os.listdir(LOG_DIR) if f.startswith("stalwart."))
    start = st.get("file") if st.get("file") in files else files[-1]
    offset = st.get("offset", 0) if start == st.get("file") else 0
    news, sources = [], set(POOL_IPS) | set(OVH_IPS.values())
    for name in files[files.index(start):]:
        with open(os.path.join(LOG_DIR, name), "rb") as f:
            f.seek(offset)
            for raw in f:
                line = raw.decode("utf-8", "replace")
                qid = re.search(r"queueId = (\d+)", line)
                local = re.search(r"localIp = ([0-9.]+)", line)
                if "(delivery.connect)" in line and qid and local:
                    conn[qid.group(1)] = local.group(1)
                    continue
                if not REJECTION.search(line):
                    continue
                ip = local.group(1) if local else conn.get(qid.group(1)) if qid else None
                kind = ip in sources and classify(line, ip)
                if not kind:
                    continue
                at = line[:20]
                hits = [t for t in strikes.get(ip, []) if datetime.datetime.fromisoformat(at.rstrip("Z")) - datetime.datetime.fromisoformat(t.rstrip("Z")) < WEAK_WINDOW] + [at]
                strikes[ip] = hits
                if kind == "weak" and len(hits) < WEAK_STRIKES:
                    continue
                strikes.pop(ip, None)
                old = degraded.get(ip)
                if old and old["until"] > at:
                    continue
                count = (old or {}).get("count", 0) + 1
                until = datetime.datetime.fromisoformat(at.rstrip("Z")) + datetime.timedelta(hours=min(DEGRADE_HOURS * count, MAX_DEGRADE_HOURS))
                reason = re.sub(r"\s+", " ", line.split("hostname = ", 1)[-1])[:300].strip()
                degraded[ip] = {"at": at, "until": until.isoformat() + "Z", "count": count, "reason": reason}
                news.append(f"{ip} {'out of the OVH lane' if ip in OVH_IPS.values() else '(tunnel IP, stays)'} until {until:%Y-%m-%d %H:%M} UTC: {reason}")
            offset = f.tell()
        last = name
        if name != files[-1]:
            offset = 0
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Kept a week past the end, so a repeat block lasts longer.
    forget = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    degraded = {ip: d for ip, d in degraded.items() if d["until"] > forget}
    if not dry:
        # Stalwart retries a queue id from another connect, so only the recent ones matter.
        st = {"file": last, "offset": offset, "conn": dict(list(conn.items())[-5000:]), "strikes": strikes, "degraded": degraded}
        os.makedirs(os.path.dirname(REPUTATION_FILE), exist_ok=True)
        json.dump(st, open(REPUTATION_FILE + ".tmp", "w"))
        os.replace(REPUTATION_FILE + ".tmp", REPUTATION_FILE)
    return {ip for ip, d in degraded.items() if d["until"] > now}, news


def either(field, values):
    return " || ".join(f"{field} == '{v}'" for v in values)


def main():
    dry, off = "--dry-run" in sys.argv, "--off" in sys.argv
    mx = mx_ips()
    out, news = watch_reputation(dry)
    for n in news:
        print(f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} reputation: {n}", flush=True)
    ovh, rate = {}, None
    if not off and POOL_IPS <= mx:
        doms = new_domains()
        ready = ovh_ready(mx)
        ovh = {n: ip for n, ip in ready.items() if ip not in out} or ready
        # The same first matches decide the IP and which cap counts the message.
        tunnel = {"0": {"if": either("sender_domain", OWN_DOMAINS), "then": "'out3'"}}
        if doms:
            tunnel["1"] = {"if": either("sender_domain", doms), "then": "'out2'"}
        if ovh:
            tunnel[str(len(tunnel))] = {"if": either("rcpt_domain", TUNNEL_RCPT_DOMAINS), "then": "'out1'"}
            connection = {"match": tunnel, "else": "'ovh'"}
            rate = warmup_rate(dry)
            lane = f"Gmail on out1, the rest on the OVH lane ({', '.join(n.split('.')[0] for n in sorted(ovh))}, {rate}/h)"
            if len(ovh) < len(ready):
                lane += f", {len(ready) - len(ovh)} out for reputation"
            elif out & set(ready.values()):
                lane += ", every OVH IP has a reputation block but the lane keeps them"
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
