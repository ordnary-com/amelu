#!/bin/sh
# Opens a `cloudflared access tcp` tunnel to Postgres, then starts the API.
#
# Containers can't use Hyperdrive, and pg1-nbg has no public Postgres port:
# the database is only reachable through its Cloudflare Tunnel behind an
# Access service token. The container opens that tunnel itself and the API
# connects to 127.0.0.1 as if Postgres ran next to it.
#
# Without PG_TUNNEL_HOSTNAME the API starts directly (DATABASE_URL is used
# as is).
set -eu

if [ -z "${PG_TUNNEL_HOSTNAME:-}" ]; then
  exec "$@"
fi

LOCAL_PG_PORT="${LOCAL_PG_PORT:-5432}"
: "${CF_ACCESS_CLIENT_ID:?CF_ACCESS_CLIENT_ID is required}"
: "${CF_ACCESS_CLIENT_SECRET:?CF_ACCESS_CLIENT_SECRET is required}"

cloudflared access tcp \
  --hostname "${PG_TUNNEL_HOSTNAME}" \
  --url "127.0.0.1:${LOCAL_PG_PORT}" \
  --service-token-id "${CF_ACCESS_CLIENT_ID}" \
  --service-token-secret "${CF_ACCESS_CLIENT_SECRET}" &
TUNNEL_PID=$!
trap 'kill -TERM "${TUNNEL_PID}" 2>/dev/null || true' TERM INT

# The API opens its pool at startup and exits if nothing listens yet.
i=0
until nc -z 127.0.0.1 "${LOCAL_PG_PORT}" 2>/dev/null; do
  i=$((i + 1))
  if [ "${i}" -gt 60 ] || ! kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    echo "[entrypoint] tunnel to ${PG_TUNNEL_HOSTNAME} did not come up" >&2
    exit 1
  fi
  sleep 0.5
done

exec "$@"
