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

Volume alone never pauses anyone: an app sending sign-up codes to a few
hundred qq.com users looks like that too. A domain that reaches REVIEW_RCPTS
distinct recipients in 24 hours only gets reported to abuse@amelu.org, once
every REVIEW_DAYS days, for a person to decide.

  amelu-sender-guard.py --dry-run       print what would happen, change nothing
  amelu-sender-guard.py --backtest 14   replay the rules over the last 14 log days
  amelu-sender-guard.py                 enforce
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
REVIEW_RCPTS = 100
REVIEW_DAYS = 7


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
    if r >= 10 and d["gmail"] >= 25:
        why.append(f"{d['gmail']} Gmail 'unsolicited' refusals")
    return why


def collect(since, files=None):
    fr = re.compile(r'from = "([^"]*)"')
    # A queued message lists every recipient: to = ["a@x", "b@y"]; per-recipient events use to = "a@x".
    to = re.compile(r'to = \[([^\]]*)\]|to = "([^"]+)"')
    addr = re.compile(r'"([^"]+@[^"]+)"')
    qid = re.compile(r"queueId = (\d+)")
    stats = collections.defaultdict(lambda: dict(msgs=set(), rcpts=set(), rdoms=set(), gmail=0, unknown=0, policy=0))
    cutoff = since.strftime("%Y-%m-%dT%H:%M:%S") if since else ""
    submitted = set()
    for path in files or sorted(glob.glob(LOGS))[-2:]:
        for line in open(path, errors="replace"):
            if line[:19] < cutoff:
                continue
            if "(queue.authenticated-message-queued)" in line:
                q = qid.search(line)
                if q:
                    submitted.add(q.group(1))
                continue
            if 'queueName = "remote"' not in line:
                continue
            m = fr.search(line)
            if not m or "@" not in m.group(1):
                continue
            sender = m.group(1).lower()
            dom = sender.split("@", 1)[1]
            q = qid.search(line)
            if dom in NEVER or sender.startswith(("noreply-dmarc", "mailer-daemon")):
                continue
            # The server's own bounces and reports also leave as postmaster@; only count what a person submitted.
            if sender.startswith("postmaster@") and not (q and q.group(1) in submitted):
                continue
            d = stats[dom]
            if q:
                d["msgs"].add(q.group(1))
            t = to.search(line)
            if t:
                rcpts = addr.findall(t.group(1)) if t.group(1) is not None else [t.group(2)]
                for r in rcpts:
                    r = r.lower()
                    d["rcpts"].add(r)
                    d["rdoms"].add(r.rsplit("@", 1)[-1])
            if "unusual rate of unsolicited" in line:
                d["gmail"] += 1
            if "(delivery.dsn-perm-fail)" in line or "(delivery.rcpt-to-rejected)" in line:
                if re.search(r"5\.1\.1|does not exist|no such user|user unknown|mailbox unavailable|invalid recipient|address rejected", line, re.I):
                    d["unknown"] += 1
                elif re.search(r"5\.7\.1|blocked|policy|spam|blacklist|blocklist|reputation", line, re.I):
                    d["policy"] += 1
    return stats


def review(d):
    """Worth a person's look, never a reason to pause on its own."""
    n = len(d["rcpts"])
    return [f"{n} distinct recipients"] if n >= REVIEW_RCPTS else []


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
    # A failed notice must not stop the run: the pause and the state file matter more.
    try:
        with smtplib.SMTP(SMTP_IP, 25, local_hostname="marduk.mx.amelu.org", source_address=(SMTP_IP, 0), timeout=30) as s:
            s.send_message(m, from_addr=ADMIN.split("<")[-1].strip(">"), to_addrs=to)
    except (OSError, smtplib.SMTPException) as e:
        print(f"could not mail {', '.join(to)}: {e}", flush=True)


def backtest(days):
    files = sorted(glob.glob(LOGS))[-days:]
    for path in files:
        for dom, d in sorted(collect(None, [path]).items()):
            why, look = rules(d), review(d)
            if why or look:
                kind = "PAUSE " if why else "REVIEW"
                print(f"{path.rsplit('.', 1)[1]} {kind} {dom}: {len(d['msgs'])} messages, {len(d['rcpts'])} recipients, "
                      f"{len(d['rdoms'])} domains ({'; '.join(why or look)})")


def main():
    if "--backtest" in sys.argv:
        backtest(int(sys.argv[sys.argv.index("--backtest") + 1]))
        return
    dry = "--dry-run" in sys.argv
    now = datetime.datetime.now(datetime.timezone.utc)
    state = json.load(open(STATE)) if os.path.exists(STATE) else {"paused": {}}
    state.setdefault("reviewed", {})
    allow = set()
    if os.path.exists(f"{ETC}/allow.txt"):
        allow = {l.strip().lower() for l in open(f"{ETC}/allow.txt") if l.strip() and not l.startswith("#")}

    hits, looks = [], []
    for dom, d in sorted(collect(now - datetime.timedelta(hours=24)).items()):
        if dom in allow or dom in state["paused"]:
            continue
        why = rules(d)
        if why:
            hits.append((dom, d, why))
            continue
        look = review(d)
        last = state["reviewed"].get(dom)
        if look and (not last or now - datetime.datetime.fromisoformat(last) > datetime.timedelta(days=REVIEW_DAYS)):
            looks.append((dom, d, look))

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

    if looks:
        lines = [f"{dom}: {len(d['msgs'])} messages to {len(d['rcpts'])} recipients at {len(d['rdoms'])} domains in 24h, "
                 f"{d['unknown']} unknown recipients, {d['policy']} policy refusals ({'; '.join(look)})" for dom, d, look in looks]
        if dry:
            for l in lines:
                print("WOULD REPORT", l)
        else:
            for dom, _, _ in looks:
                state["reviewed"][dom] = now.isoformat()
            json.dump(state, open(STATE, "w"), indent=1)
            mail([ADMIN], f"Sender guard: {len(looks)} domain(s) to look at",
                 "Nothing was paused. These domains sent to many recipients in the last 24 hours; check whether it looks legitimate:\n\n" +
                 "\n".join(f"- {l}" for l in lines) +
                 f"\n\nTo stop one, disable emailSend on its mailboxes or add it to the guard's rules. To silence a domain for good, add it to {ETC}/allow.txt.\n")
            for l in lines:
                print("REPORTED", l, flush=True)

    if report:
        mail([ADMIN], f"Sender guard paused {len(report)} domain(s)",
             "The sender guard on marduk paused sending for:\n\n" + "\n".join(f"- {r}" for r in report) +
             f"\n\nBackups and reasons: {STATE}. To restore a domain, set each account's permissions back from its backup and remove it from the state file.\n")
    if dry and not hits and not looks:
        print("nothing to pause or report")


if __name__ == "__main__":
    main()
