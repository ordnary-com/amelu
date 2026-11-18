#!/bin/sh
# Keeps table 30 (traffic from 89.106.70.0/24) pointed at routers that answer.
# Each exit is "device gateway metric"; an exit whose router stops answering
# three pings in a row loses its route, and gets it back once it answers again.
# Order of preference comes from the metrics: rtr2-ams 40 (iFog, the only exit
# without a port 25 block), rtr1-ams 50, rtr1-par 60.
EXITS="ifog 172.31.75.1 40
vultr 172.31.73.1 50
par 172.31.74.1 60"
while true; do
  echo "$EXITS" | while read dev gw metric; do
    if ping -c 3 -i 0.3 -W 1 -I "$dev" "$gw" >/dev/null 2>&1; then
      ip route replace default via "$gw" dev "$dev" table 30 metric "$metric" 2>/dev/null
    elif ip route show table 30 | grep -q "dev $dev "; then
      ip route del default via "$gw" dev "$dev" table 30 metric "$metric" 2>/dev/null
      logger -t bgp-exit-check "exit $dev ($gw) not answering, route removed"
    fi
  done
  sleep 10
done
