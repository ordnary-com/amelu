# Webmail (webmail.amelu.org)

Roundcube, for the people who *use* a mailbox. They sign in with their full
address and mailbox password; Roundcube talks IMAP, SMTP and Sieve to
Stalwart, so there is no Amelu session or account logic in between.

## Where it runs

On the mail host marduk (141.95.52.66, root via `~/.ssh/amelu_fleet`), in
`/opt/amelu-webmail`:

| Piece | What |
| --- | --- |
| `compose.yml` | `roundcube/roundcubemail:1.6.x-apache` (SQLite in the `db` volume) and `nginx:alpine` |
| `config/custom.inc.php` | Amelu branding (`product_name`, `skin_logo`), `des_key`, Sieve host, TLS verification for IMAP/SMTP. Mode 644, the web server reads it |
| `config/amelu-logo.png` | The logo, mounted into `skins/elastic/images/` (Apache only serves the skin and plugin folders, a top-level `images/` gives 404) |
| `plugins/amelu_theme/` | A one-file plugin that loads `amelu.css` after the skin: every Elastic rule using the skin's light blue `#37beff`, recoloured to Amelu blue `#0043ce` (dark mode: `#4d84ff` text, `#0051fe` fills). `regenerate.sh` rebuilds it from the container's compiled CSS; run it after a Roundcube upgrade |
| `nginx/webmail.conf` | TLS on 8443 with the host's Let's Encrypt certificate (`/etc/letsencrypt` bind-mounted), proxying to Roundcube with `Host: webmail.amelu.org`; resolves the container name per request so a recreated Roundcube container is picked up |

Mail settings come from the compose environment: IMAP `ssl://marduk.mx.amelu.org:993`,
SMTP `ssl://marduk.mx.amelu.org:465` with the user's own credentials, Sieve
`tls://marduk.mx.amelu.org:4190`. The public name is used on purpose: it is
the name on the certificate, so verification stays on.

`webmail.amelu.org` is the Worker `amelu-webmail` (`cloudflare/webmail`),
a thin proxy to `https://marduk.mx.amelu.org:8443`. It forwards the request
as-is with `X-Forwarded-Host`/`X-Forwarded-Proto`, rewrites a `Location`
that names the origin, and nothing else. Port 8443 is open in ufw; the
certificate is what protects it.

## Operating it

```bash
ssh root@141.95.52.66 -i ~/.ssh/amelu_fleet -o IdentitiesOnly=yes -o IdentityAgent=none
cd /opt/amelu-webmail
docker compose ps                 # state
docker compose logs -f roundcube  # Roundcube logs to stdout
docker compose pull && docker compose up -d   # update (bump the image tag in compose.yml first)
```

Certificate renewals: certbot's deploy hook
`/etc/letsencrypt/renewal-hooks/deploy/webmail-nginx.sh` reloads nginx, next
to the existing `stalwart-cert.sh`.

Config changes: edit `config/custom.inc.php`, then `docker compose restart
roundcube`. After an image upgrade also run
`bash plugins/amelu_theme/regenerate.sh` so the colour overrides match the new skin CSS. Keep `des_key` as it is; changing it logs everyone out.

Worker changes: `pnpm deploy:webmail` from the repo root.

## The Go API's `/api/webmail/*`

The API also has a JMAP-backed mail surface (`backend/internal/handlers/webmail*.go`,
cookie `amelu_webmail`, table `webmail_sessions`): sign-in by opening a JMAP
session as the user, then folders, messages, flags, blobs, drafts, send,
identity, vacation and password. It was built for an in-house client that
was dropped in favour of Roundcube; it stays as the base for a mailbox
portal or mobile app. Nothing in production calls it today.
