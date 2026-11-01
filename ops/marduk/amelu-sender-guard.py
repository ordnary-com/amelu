#!/usr/bin/env python3
"""
Pauses sending for domains that send cold outreach from marduk, before it
costs every customer their Gmail delivery (see devlog 2026-10-31).

Runs hourly from cron. Over the last 24 hours of Stalwart's log it counts,
per sender domain on the remote queue: distinct recipient domains, Gmail
"unusual rate of unsolicited mail" refusals, refusals for recipients that
don't exist (5.1.1) and policy/spam refusals (5.7.1). A domain that trips a
rule gets emailSend disabled on every mailbox with default permissions,
the customer gets docs/emails/sending-paused, and abuse@amelu.org gets a
summary. Restore from the backup in the state file.

  amelu-sender-guard.py --dry-run   print what would happen, change nothing
  amelu-sender-guard.py             enforce
"""
import base64, collections, datetime, glob, json, os, re, smtplib, sys, urllib.request
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

ETC = "/etc/amelu-sender-guard"
STATE = "/var/lib/amelu-sender-guard/state.json"
LOGS = "/var/log/stalwart/stalwart.*"
JMAP = "http://127.0.0.1:8080/jmap"
FROM = "Amelu <abuse@amelu.org>"
ADMIN = "abuse@amelu.org"
SMTP_IP = "141.95.52.66"  # marduk's own IP, so amelu.org's "mx" SPF passes
NEVER = {"amelu.org", "google.com"}


def rules(d):
    """Why a domain counts as cold outreach; empty means it doesn't.
    Backtested on 28 Oct - 1 Nov 2026: catches thecasto.site,
    dalychebbi.tech, stasiorfg.com, answer-ai.cv and outreach.eur3duty.com,
    and none of the normal senders (apollo-gaming.com had 90 Gmail refusals
    from the shared-IP limit, but to 5 recipient domains)."""
    r, why = len(d["rdoms"]), []
    if r >= 40:
        why.append(f"{r} recipient domains")
    if r >= 10 and d["unknown"] >= 3:
        why.append(f"{d['unknown']} recipients that don't exist")
    if r >= 10 and d["policy"] >= 5:
        why.append(f"{d['policy']} policy or spam refusals")
    if r >= 8 and d["gmail"] >= 25:
        why.append(f"{d['gmail']} Gmail 'unsolicited' refusals")
    return why


def collect(since):
    fr = re.compile(r'from = "([^"]*)"')
    to = re.compile(r'to = "([^"]+)"|to = \["([^"]+)"')
    qid = re.compile(r"queueId = (\d+)")
    stats = collections.defaultdict(lambda: dict(msgs=set(), rdoms=set(), gmail=0, unknown=0, policy=0))
    cutoff = since.strftime("%Y-%m-%dT%H:%M:%S")
    files = sorted(glob.glob(LOGS))[-2:]
    for path in files:
        for line in open(path, errors="replace"):
            if line[:19] < cutoff or 'queueName = "remote"' not in line:
                continue
            m = fr.search(line)
            if not m or "@" not in m.group(1):
                continue
            sender = m.group(1).lower()
            dom = sender.split("@", 1)[1]
            if dom in NEVER or sender.startswith(("noreply-dmarc", "postmaster@", "mailer-daemon")):
                continue
            d = stats[dom]
            q = qid.search(line)
            if q:
                d["msgs"].add(q.group(1))
            t = to.search(line)
            if t:
                d["rdoms"].add((t.group(1) or t.group(2)).lower().rsplit("@", 1)[-1])
            if "unusual rate of unsolicited" in line:
                d["gmail"] += 1
            if "(delivery.dsn-perm-fail)" in line or "(delivery.rcpt-to-rejected)" in line:
                if re.search(r"5\.1\.1|does not exist|no such user|user unknown|mailbox unavailable|invalid recipient|address rejected", line, re.I):
                    d["unknown"] += 1
                elif re.search(r"5\.7\.1|blocked|policy|spam|blacklist|blocklist|reputation", line, re.I):
                    d["policy"] += 1
    return stats


def jmap(calls):
    user, pw = os.environ["STALWART_RECOVERY_ADMIN"].split(":", 1)
    req = urllib.request.Request(JMAP, data=json.dumps({"using": ["urn:ietf:params:jmap:core"], "methodCalls": calls}).encode(),
                                 headers={"Authorization": "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode(), "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))["methodResponses"]


def accounts(dom):
    ids = jmap([["x:Domain/query", {"filter": {"name": dom}}, "0"]])[0][1].get("ids", [])
    if not ids:
        return []
    acc = jmap([["x:Account/query", {"filter": {"domainId": ids[0]}}, "0"]])[0][1].get("ids", [])
    if not acc:
        return []
    return jmap([["x:Account/get", {"ids": acc, "properties": ["name", "permissions"]}, "0"]])[0][1].get("list", [])


def pause(accs):
    upd = {a["id"]: {"permissions": {"@type": "Merge", "disabledPermissions": {"emailSend": True}, "enabledPermissions": {}}}
           for a in accs if a["permissions"].get("@type") == "Inherit"}
    if upd:
        r = jmap([["x:Account/set", {"update": upd}, "0"]])[0][1]
        if r.get("notUpdated"):
            raise RuntimeError(f"Stalwart refused: {r['notUpdated']}")
    return sorted(upd)


def mail(to, subject, text, html=None):
    m = EmailMessage()
    m["From"], m["To"], m["Reply-To"], m["Subject"] = FROM, ", ".join(to), ADMIN, subject
    m["Date"], m["Message-ID"] = formatdate(), make_msgid(domain="amelu.org")
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    with smtplib.SMTP(SMTP_IP, 25, local_hostname="marduk.mx.amelu.org", source_address=(SMTP_IP, 0), timeout=30) as s:
        s.send_message(m, from_addr=ADMIN.split("<")[-1].strip(">"), to_addrs=to)


def main():
    dry = "--dry-run" in sys.argv
    now = datetime.datetime.now(datetime.timezone.utc)
    state = json.load(open(STATE)) if os.path.exists(STATE) else {"paused": {}}
    allow = set()
    if os.path.exists(f"{ETC}/allow.txt"):
        allow = {l.strip().lower() for l in open(f"{ETC}/allow.txt") if l.strip() and not l.startswith("#")}

    hits = []
    for dom, d in sorted(collect(now - datetime.timedelta(hours=24)).items()):
        why = rules(d)
        if why and dom not in allow and dom not in state["paused"]:
            hits.append((dom, d, why))

    report = []
    for dom, d, why in hits:
        accs = accounts(dom)
        line = f"{dom}: {len(d['msgs'])} messages to {len(d['rdoms'])} domains in 24h ({'; '.join(why)}); mailboxes: {', '.join(a['name'] for a in accs) or 'none'}"
        if dry:
            print("WOULD PAUSE", line)
            continue
        paused = pause(accs)
        state["paused"][dom] = {"at": now.isoformat(), "why": why, "backup": accs, "paused": paused}
        json.dump(state, open(STATE, "w"), indent=1)
        to = [f"{a['name']}@{dom}" for a in accs if a["id"] in paused]
        if to:
            text = open(f"{ETC}/sending-paused.txt").read().split("\n", 2)[2].replace("{{DOMAIN}}", dom)
            html = open(f"{ETC}/sending-paused.html").read().replace("{{DOMAIN}}", dom)
            mail(to, f"Outgoing email from {dom} is paused", text, html)
        report.append(line)
        print("PAUSED", line, flush=True)

    if report:
        mail([ADMIN], f"Sender guard paused {len(report)} domain(s)",
             "The sender guard on marduk paused sending for:\n\n" + "\n".join(f"- {r}" for r in report) +
             f"\n\nBackups and reasons: {STATE}. To restore a domain, set each account's permissions back from its backup and remove it from the state file.\n")
    if dry and not hits:
        print("nothing to pause")


if __name__ == "__main__":
    main()
