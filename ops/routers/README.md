# BGP health endpoint

`bgp-health.py` runs on rtr1-ams, rtr2-ams and rtr1-par. `GET :9180/healthz`
answers 200 while at least one upstream session from `/etc/default/bgp-health`
(`ops/<router>/bgp-health.env`) is Established, 503 otherwise. It reads BIRD
through `birdc -r` as a DynamicUser in group `bird`.

ordnary.com/status checks it every minute from the Network group in Airplane
(Status > Structure): Amsterdam 1 = rtr1-ams, Amsterdam 2 = rtr2-ams,
Paris = rtr1-par. Two failed checks in a row mark the router down.

Install or update on a router:

    scp ops/routers/bgp-health.py root@<router>:/usr/local/bin/bgp-health
    scp ops/routers/bgp-health.service root@<router>:/etc/systemd/system/
    scp ops/<router>/bgp-health.env root@<router>:/etc/default/bgp-health
    ssh root@<router> 'chmod 755 /usr/local/bin/bgp-health && systemctl daemon-reload && systemctl enable --now bgp-health'

Port 9180 is open in each router's `nftables.conf`.
