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

  amelu-sending-stats.py --dry-run   print the counts, send nothing
  amelu-sending-stats.py             report
"""
import collections, datetime, glob, hashlib, hmac, json, os, re, sys, time, urllib.request

LOGS = "/var/log/stalwart/stalwart.*"
URL = "https://api.amelu.org/internal/jobs/sending-stats"
PATH = "/internal/jobs/sending-stats"


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


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    counts = count(now - datetime.timedelta(hours=24))
    if "--dry-run" in sys.argv:
        for dom, n in sorted(counts.items(), key=lambda x: -x[1]):
            print(f"{n:6d}  {dom}")
        return
    ts = str(int(time.time()))
    sig = hmac.new(os.environ["SENDING_STATS_SECRET"].encode(), f"POST {PATH}.{ts}".encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(URL, data=json.dumps({"domains": counts}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Amelu-Internal-Signature": f"{ts}.{sig}",
                                          "User-Agent": "amelu-sending-stats"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(now.isoformat(timespec="seconds"), r.status, len(counts), "domains", flush=True)


if __name__ == "__main__":
    main()
