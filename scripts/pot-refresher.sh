#!/bin/sh
# Auto-refreshes the YouTube poToken for Lavalink's youtube-source (WEB/WEBEMBEDDED).
# Mints a fresh {poToken, visitorData} pair from the bgutil provider and pushes it to
# Lavalink's POST /youtube route (hot-swap, no restart). Loops so it also survives token
# expiry and Lavalink restarts. bgutil owns the fragile BotGuard logic; this is only glue.
# ponytail: shell+curl+jq, not a Node app. add-when: bgutil field names change on a major bump.
set -u

BGUTIL_URL="${BGUTIL_URL:-http://bgutil-provider:4416}"
LAVALINK_URL="${LAVALINK_URL:-http://lavalink:2333}"
REFRESH_INTERVAL="${POT_REFRESH_INTERVAL:-1800}"

if [ -z "${LAVALINK_PASSWORD:-}" ]; then
  echo "[pot-refresher] LAVALINK_PASSWORD is required" >&2
  exit 1
fi

refresh() {
  resp=$(curl -fsS -m 30 -X POST "$BGUTIL_URL/get_pot" \
    -H 'Content-Type: application/json' -d '{}') || return 1
  pot=$(printf '%s' "$resp" | jq -r '.poToken // empty')
  vd=$(printf '%s' "$resp" | jq -r '.contentBinding // empty')
  [ -n "$pot" ] && [ -n "$vd" ] || return 1
  # jq -nc builds the body safely (no manual escaping of token material).
  curl -fsS -m 30 -X POST "$LAVALINK_URL/youtube" \
    -H "Authorization: $LAVALINK_PASSWORD" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg p "$pot" --arg v "$vd" '{poToken:$p, visitorData:$v}')" || return 1
  echo "[pot-refresher] pushed fresh poToken + visitorData to Lavalink"
}

echo "[pot-refresher] starting; interval=${REFRESH_INTERVAL}s"
while true; do
  if refresh; then
    sleep "$REFRESH_INTERVAL"
  else
    echo "[pot-refresher] refresh failed; keeping last-known-good, retry in 30s" >&2
    sleep 30
  fi
done
