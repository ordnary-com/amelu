# rtr2-ams

iFog router for 89.106.70.0/24 (AS218905), set up 2026-11-18. iFog VPS
Amsterdam 512MB G2, Debian 11, 118.91.187.58 / 2a0c:9a40:2711:111::107e,
`rtr2.ams.net.ordnary.com`, root via `~/.ssh/amelu_fleet` (password login off).

- BIRD: direct session to iFog AS34927 at 118.91.187.1, exports only the /24.
  iFog's own session also tries IPv6 (2a0c:9a40:2711:111::1); we don't run it.
- WireGuard 172.31.75.0/30 to marduk (wg-quick@ifog there, table 31).
- iFog does not block port 25: SMTP from 89.106.70.3 through this router
  reached Gmail, Yahoo and Outlook on 2026-11-18.
- Debian 11 is past its support window and security.debian.org no longer
  serves it (the security lines in sources.list are commented out). Upgrade to
  Debian 13 or reinstall before relying on it long term.
