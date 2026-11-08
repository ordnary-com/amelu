#!/usr/bin/env python3
"""
Reports how many messages each sender domain sent over the last 24 hours to
the Amelu API, so the dashboard can show it against the plan's daily limit
(POST /internal/jobs/sending-stats, backend/internal/handlers/sending_stats.go).

Stalwart doesn't expose its throttle counters, so this counts the way the
sender guard does (amelu-sender-guard.py): distinct queue ids per sender
domain on the remote queue in Stalwart's log. Bounces and DMARC reports
(mailer-daemon, postmaster@, noreply-dmarc) aren't counted.

Runs every 15 minutes from /etc/cron.d/amelu-sending-stats, with
SENDING_STATS_SECRET from /etc/amelu-sending-stats/env.

It also reports 14 days of history per sender domain for the dashboard's
delivery charts: messages sent, recipients delivered, deferred (4xx) and
rejected (5xx) per UTC day, the most common rejection reasons of the last 7
days, and messages sent per sender address. Finished days are counted once
and cached in DAY_CACHE; only today is read again on every run.

It also reports each sending IP's results for the dashboard's "Sending
network" page: its group and state from amelu-ip-pools' status file, and per
IP delivered, deferred (4xx) and rejected (5xx) recipients and connection
errors over 24 hours and 7 days. Deliveries are tied to an IP through the
queue id's last connect, as amelu-ip-pools' reputation watch does.

  amelu-sending-stats.py --dry-run   print the counts, send nothing
  amelu-sending-stats.py             report
"""
import collections, datetime, glob, hashlib, hmac, json, os, re, sys, time, urllib.request

LOGS = "/var/log/stalwart/stalwart.*"
URL = "https://api.amelu.org/internal/jobs/sending-stats"
PATH = "/internal/jobs/sending-stats"
STATUS_FILE = "/var/lib/amelu-ip-pools/status.json"
WEEK_CACHE = "/var/lib/amelu-sending-stats/ips-7d.json"
OUTCOME = re.compile(r"\((delivery\.(?:connect|connect-error|delivered|rcpt-to-rejected|message-rejected))\)")
LOCAL_IP = re.compile(r"localIp = ([0-9.]+)")
CODE = re.compile(r"code = (\d)\d\d")
DAY_CACHE = "/var/lib/amelu-sending-stats/days"
HISTORY_DAYS, REASON_DAYS, TOP_REASONS = 14, 7, 5
SKIP_SENDERS = ("noreply-dmarc", "noreply-tls", "postmaster@", "mailer-daemon")
DETAILS = re.compile(r'details = "((?:[^"\\]|\\.)*)"')
REJECTED = re.compile(r"\((delivery\.(?:rcpt-to-rejected|message-rejected))\)")


def count(since):
    fr = re.compile(r'from = "([^"]*)"')
    qid = re.compile(r"queueId = (\d+)")
    msgs = collections.defaultdict(set)
    cutoff = since.strftime("%Y-%m-%dT%H:%M:%S")
    for path in sorted(glob.glob(LOGS))[-2:]:
        for line in open(path, errors="replace"):
            if line[:19] < cutoff or 'queueName = "remote"' not in line:
                continue
            m, q = fr.search(line), qid.search(line)
            if not m or not q or "@" not in m.group(1):
                continue
            sender = m.group(1).lower()
            if sender.startswith(("noreply-dmarc", "postmaster@", "mailer-daemon")):
                continue
            msgs[sender.split("@", 1)[1]].add(q.group(1))
    return {dom: len(ids) for dom, ids in msgs.items()}


def ip_results(since, files):
    """localIp -> messages, delivered, deferred, rejected, connectErrors since the cutoff."""
    qid = re.compile(r"queueId = (\d+)")
    conn, out = {}, collections.defaultdict(lambda: {"messages": set(), "delivered": 0, "deferred": 0, "rejected": 0, "connectErrors": 0})
    cutoff = since.strftime("%Y-%m-%dT%H:%M:%S")
    for path in files:
        for line in open(path, errors="replace"):
            if line[:19] < cutoff or 'queueName = "remote"' not in line:
                continue
            ev, q = OUTCOME.search(line), qid.search(line)
            if not ev or not q:
                continue
            kind, local = ev.group(1), LOCAL_IP.search(line)
            if kind == "delivery.connect" and local:
                conn[q.group(1)] = local.group(1)
            ip = local.group(1) if local else conn.get(q.group(1))
            if not ip or ip == "0.0.0.0":
                continue
            r = out[ip]
            r["messages"].add(q.group(1))
            if kind == "delivery.delivered":
                r["delivered"] += 1
            elif kind == "delivery.connect-error":
                r["connectErrors"] += 1
            elif kind in ("delivery.rcpt-to-rejected", "delivery.message-rejected"):
                code = CODE.search(line)
                r["rejected" if code and code.group(1) == "5" else "deferred"] += 1
    return {ip: {**r, "messages": len(r["messages"])} for ip, r in out.items()}


def reason_text(line):
    """A rejection's message, without the ids and numbers that make every one unique."""
    m = DETAILS.search(line)
    if not m:
        return None
    text = m.group(1).replace("\\n", " ").replace('\\"', '"')
    text = text.split("Message: ", 1)[-1]
    text = re.sub(r"\b[0-9a-f]{8,}\b|\b\d{4,}\b|\[[0-9.]+\]|<[^>]*>", "#", text, flags=re.I)
    # Providers append their own trace ids (163.com: "gzga-mx-mtada-g1-9,_____wD3jx..."): long tokens with a digit.
    text = " ".join("#" if len(tok) > 12 and re.search(r"\d", tok) else tok for tok in text.split())
    return re.sub(r"\s+", " ", text).strip()[:140] or None


def day_stats(path):
    """Per sender domain and address: what one day's log says happened to its mail."""
    fr, qid = re.compile(r'from = "([^"]*)"'), re.compile(r"queueId = (\d+)")
    msgs, addr_msgs = collections.defaultdict(set), collections.defaultdict(set)
    counts = collections.defaultdict(lambda: {"delivered": 0, "deferred": 0, "rejected": 0, "reasons": collections.Counter()})
    for line in open(path, errors="replace"):
        if 'queueName = "remote"' not in line:
            continue
        m, q = fr.search(line), qid.search(line)
        if not m or not q or "@" not in m.group(1):
            continue
        sender = m.group(1).lower()
        if sender.startswith(SKIP_SENDERS):
            continue
        dom = sender.split("@", 1)[1]
        msgs[dom].add(q.group(1))
        addr_msgs[sender].add(q.group(1))
        if "(delivery.delivered)" in line:
            counts[dom]["delivered"] += 1
        elif REJECTED.search(line):
            code = CODE.search(line)
            if code and code.group(1) == "5":
                counts[dom]["rejected"] += 1
                reason = reason_text(line)
                if reason:
                    counts[dom]["reasons"][reason] += 1
            else:
                counts[dom]["deferred"] += 1
    domains = {}
    for dom in set(msgs) | set(counts):
        c = counts[dom]
        domains[dom] = {"sent": len(msgs[dom]), "delivered": c["delivered"], "deferred": c["deferred"], "rejected": c["rejected"],
                        "reasons": dict(c["reasons"].most_common(20))}
    return {"domains": domains, "senders": {a: len(ids) for a, ids in addr_msgs.items()}}


def history(now):
    today = now.date()
    days = [(today - datetime.timedelta(days=i)).isoformat() for i in range(HISTORY_DAYS - 1, -1, -1)]
    os.makedirs(DAY_CACHE, exist_ok=True)
    per_day = {}
    for day in days:
        path = f"/var/log/stalwart/stalwart.{day}"
        if not os.path.exists(path):
            continue
        cache = os.path.join(DAY_CACHE, day + ".json")
        if day != today.isoformat() and os.path.exists(cache):
            per_day[day] = json.load(open(cache))
            continue
        per_day[day] = day_stats(path)
        if day != today.isoformat():
            json.dump(per_day[day], open(cache, "w"))
    for old in os.listdir(DAY_CACHE):
        if old[:10] < days[0]:
            os.remove(os.path.join(DAY_CACHE, old))
    domains, senders = {}, {}
    reason_days = set(days[-REASON_DAYS:])
    for i, day in enumerate(days):
        stats = per_day.get(day)
        if not stats:
            continue
        for dom, d in stats["domains"].items():
            h = domains.setdefault(dom, {k: [0] * len(days) for k in ("sent", "delivered", "deferred", "rejected")} | {"reasons": collections.Counter()})
            for k in ("sent", "delivered", "deferred", "rejected"):
                h[k][i] = d[k]
            if day in reason_days:
                h["reasons"].update(d["reasons"])
        for addr, n in stats["senders"].items():
            senders.setdefault(addr, [0] * len(days))[i] = n
    for h in domains.values():
        h["reasons"] = [{"text": t, "count": n} for t, n in h["reasons"].most_common(TOP_REASONS)]
    return {"days": days, "domains": domains, "senders": senders}


def week_results(now):
    """The 7-day numbers read a week of logs, so they're refreshed at most hourly."""
    try:
        cached = json.load(open(WEEK_CACHE))
        if now - datetime.datetime.fromisoformat(cached["at"]) < datetime.timedelta(hours=1):
            return cached["ips"]
    except (OSError, ValueError, KeyError):
        pass
    ips = ip_results(now - datetime.timedelta(days=7), sorted(glob.glob(LOGS))[-8:])
    os.makedirs(os.path.dirname(WEEK_CACHE), exist_ok=True)
    json.dump({"at": now.isoformat(), "ips": ips}, open(WEEK_CACHE, "w"))
    return ips


def network(now):
    try:
        status = json.load(open(STATUS_FILE))
    except (OSError, ValueError):
        return None
    day = ip_results(now - datetime.timedelta(hours=24), sorted(glob.glob(LOGS))[-2:])
    week = week_results(now)
    empty = {"messages": 0, "delivered": 0, "deferred": 0, "rejected": 0, "connectErrors": 0}
    return {"statusAt": status.get("updatedAt"),
            "ips": [{**ip, "last24h": day.get(ip["ip"], empty), "last7d": week.get(ip["ip"], empty)} for ip in status.get("ips", [])]}


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    counts = count(now - datetime.timedelta(hours=24))
    net = network(now)
    hist = history(now)
    if "--dry-run" in sys.argv:
        for dom, n in sorted(counts.items(), key=lambda x: -x[1])[:20]:
            print(f"{n:6d}  {dom}")
        for ip in (net or {}).get("ips", []):
            print(ip["name"].split(".")[0], ip["ip"], ip["group"], ip["state"], "24h", ip["last24h"], "7d", ip["last7d"])
        print("history:", hist["days"][0], "to", hist["days"][-1], len(hist["domains"]), "domains", len(hist["senders"]), "senders")
        for dom, h in sorted(hist["domains"].items(), key=lambda x: -sum(x[1]["sent"]))[:5]:
            print(f"  {dom}: sent {h['sent'][-7:]} rejected {h['rejected'][-7:]} reasons {[r['text'][:50] for r in h['reasons'][:2]]}")
        return
    ts = str(int(time.time()))
    sig = hmac.new(os.environ["SENDING_STATS_SECRET"].encode(), f"POST {PATH}.{ts}".encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(URL, data=json.dumps({"domains": counts, "network": net, "history": hist}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Amelu-Internal-Signature": f"{ts}.{sig}",
                                          "User-Agent": "amelu-sending-stats"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(now.isoformat(timespec="seconds"), r.status, len(counts), "domains", flush=True)


if __name__ == "__main__":
    main()
