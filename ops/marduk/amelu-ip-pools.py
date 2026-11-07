#!/usr/bin/env python3
"""
Picks the outbound IP per sender on marduk (see devlogs 2026-11-01,
2026-11-04 and 2026-11-07).

Three groups of OVH additional IPs, by how much we trust the sender:
  system      amelu.org's own mail (password resets, invitations)
  newdomains  domains created in the last NEW_DAYS days
  trusted     everyone else
so a new account that sends spam can only hurt the newdomains IPs. Each
group is a Stalwart connection strategy; the x:MtaOutboundStrategy
connection expression picks one by sender domain.

An IP only joins its group once it is bound on marduk, is an A record of
marduk.mx.amelu.org (customer SPF is "mx -all") and its PTR and outN name
point at each other. A group with no usable IP falls back to trusted; with
no trusted IP everything goes out from marduk's own IP ('default').

It also watches each source IP's reputation: it reads Stalwart's log from
where it left off, finds remote rejections that blame the sending IP
(blacklists, Yahoo's TSS codes, Outlook's "banned sending IP", or "blocked"
with IP wording three times in an hour) and takes that IP out of its group
for DEGRADE_HOURS, longer each time it happens again, unless that would
empty the group.

Runs every 10 minutes from cron.

  amelu-ip-pools.py --dry-run   print the decision, change nothing
  amelu-ip-pools.py --off       send everything from marduk's own IP again
"""
import base64, datetime, json, os, re, socket, sys, urllib.request

JMAP = "http://127.0.0.1:8080/jmap"
MX_HOST = "marduk.mx.amelu.org"
GROUPS = {
    "system": {"out4.mx.amelu.org": "51.89.39.34"},
    "trusted": {"out1.mx.amelu.org": "51.89.60.60", "out2.mx.amelu.org": "51.89.60.49", "out5.mx.amelu.org": "51.89.2.193"},
    # out6 holds new domains until out3, out7 and out8 are live; then it moves to trusted.
    "newdomains": {"out3.mx.amelu.org": "51.89.76.2", "out6.mx.amelu.org": "51.89.1.228",
                   "out7.mx.amelu.org": "51.89.102.29", "out8.mx.amelu.org": "51.89.76.15"},
}
# Spares, not in any group yet: out9 51.89.85.197, out10 51.89.85.192, out11 51.89.76.0
# (a .0 address some receivers refuse, so the last one to use).
DESCRIPTIONS = {
    "system": "amelu.org's own mail (amelu-ip-pools)",
    "trusted": "Established and paying senders (amelu-ip-pools)",
    "newdomains": "Domains created in the last days (amelu-ip-pools)",
}
NEW_DAYS = 7
OWN_DOMAINS = ["amelu.org"]
ROUTE = {"match": {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}}, "else": "'mx'"}
NOT_LOCAL = {"if": "is_local_domain(rcpt_domain)", "then": "false"}
TUNNEL_CAP = "noez tunnel cap"
OVH_CAP = "OVH lane warm-up cap"
# Messages an hour over all sending IPs, by days since the OVH IPs first sent.
WARMUP = [60, 120, 250, 500, 800, 1200]
SINCE_FILE = "/var/lib/amelu-ip-pools/ovh-since"
SEEN_FILE = "/var/lib/amelu-ip-pools/seen-in-mx.json"
# Receivers cache marduk.mx (TTL 3600) for their SPF check, so a new IP waits
# until every cache has it; sending from it earlier fails customer SPF.
MX_GRACE = datetime.timedelta(hours=2)
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


def bound(ip):
    try:
        with socket.socket() as sock:
            sock.bind((ip, 0))
        return True
    except OSError:
        return False


def usable(ips, mx, seen):
    """The IPs receivers will accept: bound here, in customer SPF long enough, with forward-confirmed reverse DNS."""
    now = datetime.datetime.now(datetime.timezone.utc)
    ready = {}
    for name, ip in ips.items():
        if ip not in mx:
            continue
        first = datetime.datetime.fromisoformat(seen.setdefault(ip, now.isoformat()))
        try:
            ptr = socket.gethostbyaddr(ip)[0].rstrip(".").lower()
            forward = set(socket.gethostbyname_ex(name)[2])
        except OSError:
            continue
        if now - first >= MX_GRACE and ptr == name and forward == {ip} and bound(ip):
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
    news, sources = [], {ip for g in GROUPS.values() for ip in g.values()}
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
                news.append(f"{ip} out of its group until {until:%Y-%m-%d %H:%M} UTC: {reason}")
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

    try:
        seen = json.load(open(SEEN_FILE))
    except (OSError, ValueError):
        # First run (2026-11-07): only these were in marduk.mx before today.
        seen = {ip: "2026-11-04T00:00:00+00:00" for ip in ("141.95.52.66", "51.89.39.34", "51.89.2.193", "51.89.1.228") if ip in mx}
    seen = {ip: t for ip, t in seen.items() if ip in mx}
    pools, notes = {}, []
    if not off:
        for group, ips in GROUPS.items():
            ready = usable(ips, mx, seen)
            ok = {n: ip for n, ip in ready.items() if ip not in out}
            if ready and not ok:
                notes.append(f"every {group} IP has a reputation block but the group keeps them")
            if ready:
                pools[group] = ok or ready
    rate = warmup_rate(dry) if pools else None
    if not dry:
        os.makedirs(os.path.dirname(SEEN_FILE), exist_ok=True)
        json.dump(seen, open(SEEN_FILE, "w"), indent=1)

    if "trusted" in pools:
        doms = new_domains()
        match = {"0": {"if": either("sender_domain", OWN_DOMAINS), "then": "'system'" if "system" in pools else "'trusted'"}}
        if doms and "newdomains" in pools:
            match["1"] = {"if": either("sender_domain", doms), "then": "'newdomains'"}
        connection = {"match": match, "else": "'trusted'"}
        state = "; ".join(f"{g}: {', '.join(n.split('.')[0] for n in sorted(pools[g]))}" for g in GROUPS if g in pools)
        state += f"; {len(doms)} new domains" + ("" if "newdomains" in pools else " (on trusted, no newdomains IP)")
        state += f"; {rate}/h" + "".join(f"; {n}" for n in notes)
    else:
        connection = {"match": {}, "else": "'default'"}
        state = "marduk's own IP" + ("" if off else " (no usable trusted IP)")
        pools = {}
    # The tunnel is gone; its cap stays disabled so nothing counts against it.
    tunnel_cap = {"match": {}, "else": "false"}
    send_cap = {"match": {"0": NOT_LOCAL}, "else": "true"}

    cur = jmap([["x:MtaOutboundStrategy/get", {"ids": ["singleton"]}, "0"],
                ["x:MtaConnectionStrategy/get", {}, "1"],
                ["x:MtaOutboundThrottle/get", {}, "2"]])
    strategy = cur[0][1]["list"][0]
    existing = {s["name"]: s for s in cur[1][1]["list"]}
    throttles = cur[2][1]["list"]
    tcap = next((t for t in throttles if t["description"].startswith(TUNNEL_CAP)), None)
    ocap = next((t for t in throttles if t["description"].startswith(OVH_CAP)), None)

    calls = []
    if strategy["connection"] != connection or strategy["route"] != ROUTE:
        calls.append(["x:MtaOutboundStrategy/set", {"update": {"singleton": {"connection": connection, "route": ROUTE}}}, "s"])
    if tcap and (tcap["match"] != tunnel_cap or tcap["enable"]):
        calls.append(["x:MtaOutboundThrottle/set", {"update": {tcap["id"]: {"match": tunnel_cap, "enable": False}}}, "t"])
    for group, ips in pools.items():
        source = {str(i): {"ehloHostname": n, "sourceIp": ip} for i, (n, ip) in enumerate(sorted(ips.items()))}
        fields = {"description": DESCRIPTIONS[group], "ehloHostname": sorted(ips)[0], "sourceIps": source}
        if group not in existing:
            calls.append(["x:MtaConnectionStrategy/set", {"create": {group: {"name": group, **fields}}}, "o" + group])
        elif existing[group]["sourceIps"] != source or existing[group]["ehloHostname"] != fields["ehloHostname"]:
            calls.append(["x:MtaConnectionStrategy/set", {"update": {existing[group]["id"]: fields}}, "o" + group])
    if rate:
        cap = {"enable": True, "description": f"{OVH_CAP}: {rate} messages per hour over all sending IPs, grows daily (amelu-ip-pools)",
               "key": {}, "match": send_cap, "rate": {"count": rate, "period": 3600000}}
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
    # Strategies and caps first, so the connection expression never names a strategy that isn't there.
    calls.sort(key=lambda c: c[2] == "s")
    for r in jmap(calls):
        res = r[1]
        if r[0].endswith("/error") or res.get("notCreated") or res.get("notUpdated"):
            raise SystemExit(f"Stalwart refused: {r}")
    jmap([["x:Action/set", {"create": {"a": {"@type": "ReloadSettings"}}}, "0"]])
    print(f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} set: {state}", flush=True)


if __name__ == "__main__":
    main()
