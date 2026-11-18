# rtr1-par

Second Vultr router for 89.106.70.0/24 (AS218905), built 2026-11-17 next to
rtr1-ams. Vultr vc2-1c-1gb, Paris, Debian 13, 45.32.147.108 /
2001:19f0:6801:1925:5400:7ff:fe0f:a3d5, `rtr1.par.net.ordnary.com`, root via
`~/.ssh/amelu_fleet` (password login off). Same setup as ../rtr1-ams/: BIRD to
169.254.169.254 AS64515 (multihop, MD5 from the same Vultr account password),
WireGuard 172.31.74.0/30 to marduk (wg-quick@par there).

Failover on marduk: `bgp-exit-check.service` pings both routers over their
tunnels every 10 s and keeps table 30's default routes in line: rtr1-ams
metric 50, rtr1-par metric 60. Tested
2026-11-17: with rtr1-ams's route removed, traffic from 89.106.70.2 left through
Paris and HTTPS answered with 89.106.70.2. Inbound needs no failover: both
routers announce the /24, so Vultr routes to whichever is up.
