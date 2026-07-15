// DNS-over-HTTPS TXT lookup against Cloudflare's own resolver. Mirrors the
// reasoning in backend/internal/dnscheck/dnscheck.go (a public resolver is
// more reliable for this than whatever resolver the runtime would use by
// default) - Workers have no raw UDP/TCP DNS socket access at all, so DoH
// is the only option here, not just the more reliable one.
export interface DNSLookupResult {
  found: boolean;
  values: string[];
}

export async function lookupTXT(name: string, fetchImpl: typeof fetch = fetch): Promise<DNSLookupResult> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");

  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/dns-json" } });
  if (!res.ok) {
    throw new Error(`DoH query failed: ${res.status}`);
  }
  const body = (await res.json()) as { Answer?: { data: string }[] };
  const values = (body.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, ""));
  return { found: values.length > 0, values };
}
