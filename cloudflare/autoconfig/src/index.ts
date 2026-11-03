// Mail client setup for Amelu mailboxes (wrangler.jsonc, docs/AUTOCONFIG.md).
//
//   GET  /mail/config-v1.1.xml?emailaddress=...         Thunderbird (and the
//        /.well-known/autoconfig/mail/config-v1.1.xml   well-known variant)
//   POST /autodiscover/autodiscover.xml                 Outlook (POX)
//   GET  /profile.mobileconfig?email=...&name=...       Apple configuration profile
//
// Nothing here is secret: every response is the same server settings with
// the address filled in. Passwords are never part of it; the client asks.
// Calendars and contacts are Stalwart's CalDAV and CardDAV on the same host.

const MAIL_HOST = "marduk.mx.amelu.org";
const IMAP_PORT = 993;
const SMTP_PORT = 465;
const DAV_URL = `https://${MAIL_HOST}`;

// Loose on purpose: just enough to keep it an address and keep markup out.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    if (path === "/mail/config-v1.1.xml" || path === "/.well-known/autoconfig/mail/config-v1.1.xml") {
      return xml(thunderbird(validEmail(url.searchParams.get("emailaddress"))));
    }
    if (path === "/autodiscover/autodiscover.xml") {
      const body = request.method === "POST" ? await request.text() : "";
      const email = validEmail(/<EMailAddress>\s*([^<\s]+)\s*<\/EMailAddress>/i.exec(body)?.[1] ?? null);
      return xml(outlook(email));
    }
    if (path === "/profile.mobileconfig") {
      const email = validEmail(url.searchParams.get("email"));
      if (!email) return new Response("A valid email parameter is required.\n", { status: 400 });
      const name = (url.searchParams.get("name") ?? "").slice(0, 100);
      return new Response(await apple(email, name), {
        headers: {
          "Content-Type": "application/x-apple-aspen-config",
          "Content-Disposition": `attachment; filename="${email.replace(/[^a-z0-9.@-]/gi, "_")}.mobileconfig"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "/") return Response.redirect("https://amelu.org/", 302);
    return new Response("Not found\n", { status: 404 });
  },
};

function validEmail(value: string | null): string | null {
  const v = value?.trim().toLowerCase() ?? "";
  return v.length <= 254 && EMAIL.test(v) ? v : null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function xml(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

// Thunderbird: with no address, %EMAILADDRESS% lets the client fill it in.
function thunderbird(email: string | null): string {
  const user = email ? esc(email) : "%EMAILADDRESS%";
  const domain = email ? esc(email.split("@")[1]) : "amelu.org";
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="amelu.org">
    <domain>${domain}</domain>
    <displayName>Amelu</displayName>
    <displayShortName>Amelu</displayShortName>
    <incomingServer type="imap">
      <hostname>${MAIL_HOST}</hostname>
      <port>${IMAP_PORT}</port>
      <socketType>SSL</socketType>
      <username>${user}</username>
      <authentication>password-cleartext</authentication>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>${MAIL_HOST}</hostname>
      <port>${SMTP_PORT}</port>
      <socketType>SSL</socketType>
      <username>${user}</username>
      <authentication>password-cleartext</authentication>
    </outgoingServer>
    <documentation url="https://amelu.org/docs">
      <descr lang="en">Amelu mail setup</descr>
    </documentation>
  </emailProvider>
  <addressBook type="carddav">
    <username>${user}</username>
    <authentication>http-basic</authentication>
    <serverURL>${DAV_URL}/dav/card/</serverURL>
  </addressBook>
  <calendar type="caldav">
    <username>${user}</username>
    <authentication>http-basic</authentication>
    <serverURL>${DAV_URL}/dav/cal/</serverURL>
  </calendar>
</clientConfig>
`;
}

function outlook(email: string | null): string {
  const login = email ? `<LoginName>${esc(email)}</LoginName>` : "";
  const protocol = (type: string, port: number, extra: string) => `
      <Protocol>
        <Type>${type}</Type>
        <Server>${MAIL_HOST}</Server>
        <Port>${port}</Port>
        <DomainRequired>off</DomainRequired>
        ${login}
        <SPA>off</SPA>
        ${extra}
        <AuthRequired>on</AuthRequired>
      </Protocol>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>${protocol("IMAP", IMAP_PORT, "<SSL>on</SSL>")}${protocol("SMTP", SMTP_PORT, "<Encryption>SSL</Encryption><UsePOPAuth>off</UsePOPAuth><SMTPLast>off</SMTPLast>")}
    </Account>
  </Response>
</Autodiscover>
`;
}

// A stable UUID per address and purpose, so installing the profile again
// replaces the earlier one instead of adding a second account.
async function uuid(seed: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

async function apple(email: string, name: string): Promise<string> {
  const e = esc(email);
  const id = `org.amelu.mail.${email.replace(/[^a-z0-9]/g, ".")}`;
  const [profileUuid, accountUuid, calUuid, cardUuid] = await Promise.all(
    ["profile", "account", "caldav", "carddav"].map((purpose) => uuid(purpose + ":" + email)),
  );
  const principal = `/dav/pal/${encodeURIComponent(email)}/`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>EmailAccountDescription</key><string>${e}</string>
      <key>EmailAccountName</key><string>${esc(name)}</string>
      <key>EmailAccountType</key><string>EmailTypeIMAP</string>
      <key>EmailAddress</key><string>${e}</string>
      <key>IncomingMailServerAuthentication</key><string>EmailAuthPassword</string>
      <key>IncomingMailServerHostName</key><string>${MAIL_HOST}</string>
      <key>IncomingMailServerPortNumber</key><integer>${IMAP_PORT}</integer>
      <key>IncomingMailServerUseSSL</key><true/>
      <key>IncomingMailServerUsername</key><string>${e}</string>
      <key>OutgoingMailServerAuthentication</key><string>EmailAuthPassword</string>
      <key>OutgoingMailServerHostName</key><string>${MAIL_HOST}</string>
      <key>OutgoingMailServerPortNumber</key><integer>${SMTP_PORT}</integer>
      <key>OutgoingMailServerUseSSL</key><true/>
      <key>OutgoingMailServerUsername</key><string>${e}</string>
      <key>OutgoingPasswordSameAsIncomingPassword</key><true/>
      <key>PayloadDescription</key><string>Mail account ${e}</string>
      <key>PayloadDisplayName</key><string>${e}</string>
      <key>PayloadIdentifier</key><string>${id}.account</string>
      <key>PayloadType</key><string>com.apple.mail.managed</string>
      <key>PayloadUUID</key><string>${accountUuid}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PreventMove</key><false/>
      <key>SMIMEEnabled</key><false/>
    </dict>
    <dict>
      <key>CalDAVAccountDescription</key><string>${e}</string>
      <key>CalDAVHostName</key><string>${MAIL_HOST}</string>
      <key>CalDAVPort</key><integer>443</integer>
      <key>CalDAVPrincipalURL</key><string>${principal}</string>
      <key>CalDAVUseSSL</key><true/>
      <key>CalDAVUsername</key><string>${e}</string>
      <key>PayloadDescription</key><string>Calendar for ${e}</string>
      <key>PayloadDisplayName</key><string>Calendar: ${e}</string>
      <key>PayloadIdentifier</key><string>${id}.caldav</string>
      <key>PayloadType</key><string>com.apple.caldav.account</string>
      <key>PayloadUUID</key><string>${calUuid}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
    <dict>
      <key>CardDAVAccountDescription</key><string>${e}</string>
      <key>CardDAVHostName</key><string>${MAIL_HOST}</string>
      <key>CardDAVPort</key><integer>443</integer>
      <key>CardDAVPrincipalURL</key><string>${principal}</string>
      <key>CardDAVUseSSL</key><true/>
      <key>CardDAVUsername</key><string>${e}</string>
      <key>PayloadDescription</key><string>Contacts for ${e}</string>
      <key>PayloadDisplayName</key><string>Contacts: ${e}</string>
      <key>PayloadIdentifier</key><string>${id}.carddav</string>
      <key>PayloadType</key><string>com.apple.carddav.account</string>
      <key>PayloadUUID</key><string>${cardUuid}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Sets up ${e} in Mail, Calendar and Contacts. You enter the password when you install it.</string>
  <key>PayloadDisplayName</key><string>Amelu mail: ${e}</string>
  <key>PayloadIdentifier</key><string>${id}</string>
  <key>PayloadOrganization</key><string>Amelu</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${profileUuid}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
}
