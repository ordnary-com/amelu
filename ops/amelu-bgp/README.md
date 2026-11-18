**Deleted 2026-11-17.** Lagrange never carried our IPv4 /24; the block now goes out through Vultr (../rtr1-ams/, ../rtr1-par/). The VM is gone and wg-quick@bgp on marduk is disabled; the routing rule moved to own-block.service there.

# amelu-bgp

Router for Amelu's own sending block, 89.106.70.0/24 (leased from noez,
service #88486), announced from AS218905 together with 2a06:9801:f90::/48.
Hetzner cx23 in nbg1, 49.13.196.113, root via `~/.ssh/amelu_fleet`. Server
name `rtr1-nbg`, DNS and rDNS `rtr1.nbg.net.ordnary.com` (was `amelu-bgp`).

```
internet <-> Lagrange (AS209735) <-> GRE <-> amelu-bgp (89.106.70.1) <-> WireGuard <-> marduk (89.106.70.x)
```

| File | On the server |
|---|---|
| `30-lagrange.netdev`, `30-lagrange.network` | `/etc/systemd/network/` GRE to Lagrange, table 100 and the routing rules |
| `31-own.netdev`, `31-own.network` | `/etc/systemd/network/` dummy `own0` with 89.106.70.1 and 2a06:9801:f90::1 |
| `10-keep-foreign.conf` | `/etc/systemd/networkd.conf.d/` so networkd leaves wg-quick's route alone |
| `bird.conf` | `/etc/bird/bird.conf` BGP to Lagrange, exports only our two prefixes |
| `marduk.conf` | `/etc/wireguard/marduk.conf` routes the /24 (except .1) to marduk |
| `90-router.conf` | `/etc/sysctl.d/` IP forwarding |

marduk's side is `ops/marduk/wg-bgp.conf` (`/etc/wireguard/bgp.conf`): rule
`from 89.106.70.0/24 lookup 30`, default route through the tunnel. The
WireGuard private keys live next to the configs on each server
(`/etc/wireguard/*.key`) and are not in the repo.

Route object and ROA for 89.106.70.0/24 are managed by noez (ASN tab in
their panel). Keep their "Nexthop routing" off: that would announce the
block from noez's AS12586. Lagrange builds its prefix filter from IRR
(rr.ntt.net), so a new route object can take up to a day to be accepted.

Checks: `birdc show protocols`, `wg show`, `ip rule`, and
`curl --interface 89.106.70.2 https://ifconfig.me` on marduk.
