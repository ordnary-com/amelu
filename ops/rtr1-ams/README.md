# rtr1-ams

Vultr router for 89.106.70.0/24 (AS218905), built 2026-11-17 as rtr3-ams and renamed to rtr1-ams the same night (after iFog and Melbicom were cancelled). Vultr vc2-1c-1gb,
Amsterdam, Debian 13, 95.179.130.20 / 2a05:f480:1400:d7f:5400:7ff:fe0f:9d25,
`rtr1.ams.net.ordnary.com`, root via `~/.ssh/amelu_fleet`.

BGP to Vultr's route server: 169.254.169.254 AS64515, multihop 2, MD5
password in `/etc/bird/vultr-password(.conf)` (copy in
`~/.config/ordnary/vultr-bgp.pass`). Vultr reads the session details from the
instance metadata (`curl 169.254.169.254/v1.json`, key `bgp`). After BGP is
enabled on the account, the instance has to be restarted from the Vultr portal.
Exports only the /24; IPv6 not set up.

```
internet <-> Vultr (AS20473) <-> rtr1-ams (enp1s0) <-> WireGuard 172.31.73.0/30 <-> marduk (89.106.70.x)
```

| File | On the server |
|---|---|
| `bird.conf` | `/etc/bird/bird.conf` |
| `marduk.conf` | `/etc/wireguard/marduk.conf` (wg-quick@marduk), routes the /24 to marduk |
| `nftables.conf` | `/etc/nftables.conf`: SSH, ICMP, WireGuard and BGP in; forwards only the /24 |
| `90-router.conf` | `/etc/sysctl.d/` IP forwarding |

marduk's side is `ops/marduk/wg-vultr.conf` (wg-quick@vultr): table 30
default via rtr1-ams at metric 50, so the block leaves through Vultr; rtr1-par
(metric 60) takes over when rtr1-ams stops answering.

Status 2026-11-17 23:25 CET: session Established, 66 of 333 RIS peers see the
/24 via AS20473 within minutes, HTTPS and ICMP from/to 89.106.70.2 work.
Outbound port 25 is blocked by Vultr until they lift it (ticket).

Checks: `birdc show protocols all vultr4`, `wg show`, and on marduk
`curl --interface 89.106.70.2 https://ifconfig.me`.
