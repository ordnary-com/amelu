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
    if "--dry-run" in sys.argv:
        for dom, n in sorted(counts.items(), key=lambda x: -x[1])[:20]:
            print(f"{n:6d}  {dom}")
        for ip in (net or {}).get("ips", []):
            print(ip["name"].split(".")[0], ip["ip"], ip["group"], ip["state"], "24h", ip["last24h"], "7d", ip["last7d"])
        return
    ts = str(int(time.time()))
    sig = hmac.new(os.environ["SENDING_STATS_SECRET"].encode(), f"POST {PATH}.{ts}".encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(URL, data=json.dumps({"domains": counts, "network": net}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Amelu-Internal-Signature": f"{ts}.{sig}",
                                          "User-Agent": "amelu-sending-stats"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(now.isoformat(timespec="seconds"), r.status, len(counts), "domains", flush=True)


if __name__ == "__main__":
    main()
