**Cancelled 2026-11-17** (Melbicom never allowed our /24 as a source). DNS removed, wg-quick@ams on marduk disabled. Kept for reference.

# rtr2-ams

Second Amsterdam router for 89.106.70.0/24 (AS218905), at Melbicom.
Cloud Server KVM-1-EU, Ubuntu 24.04, 213.183.59.146, root via
`~/.ssh/amelu_fleet`. DNS `rtr2.ams.net.ordnary.com`; no IPv6 ordered.

BGP to Melbicom AS56630 on 213.183.59.1, directly connected on eth0
(session accepted 2026-11-17). Since 2026-11-17 17:05 CET it announces
89.106.70.0/24 (`bird.conf`, `/etc/bird/bird.conf`); the prefix was seen by
19 RIS collectors within minutes, while Lagrange still doesn't carry the v4
prefix.

```
internet <-> Melbicom (AS56630) <-> rtr2-ams (eth0) <-> WireGuard <-> marduk (89.106.70.x)
```

| File | On the server |
|---|---|
| `bird.conf` | `/etc/bird/bird.conf` BGP to Melbicom, exports only the /24 |
| `marduk.conf` | `/etc/wireguard/marduk.conf` (wg-quick@marduk) routes the /24 to marduk, 172.31.72.1/30 |
| `90-router.conf` | `/etc/sysctl.d/` IP forwarding |

marduk's side is `ops/marduk/wg-ams.conf` (`/etc/wireguard/ams.conf`): it
owns the default route of table 30, so traffic from the block leaves here;
the Lagrange tunnel (wg-bgp.conf) keeps a metric 200 fallback in table 30.

Open: Melbicom drops packets leaving eth0 with a 89.106.70.x source
(anti-spoofing on the port), so inbound reaches marduk but nothing comes
back. They have to allow the /24 as source. Also rDNS for 213.183.59.146
and outbound port 25, both at Melbicom.

Checks: `birdc show protocols all melbicom4`, `wg show`, and
`curl --interface 89.106.70.2 https://ifconfig.me` on marduk.
