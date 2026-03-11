#!/usr/bin/env bash
set -e

URL="${URL:-http://localhost:4445/api/rate-limit/test}"
COUNT="${COUNT:-30}"
CONCURRENCY="${CONCURRENCY:-1}"

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "Stress test the rate limit test endpoint (no search engines hit)."
  echo ""
  echo "Env vars:"
  echo "  URL          Endpoint (default: http://localhost:4445/api/rate-limit/test)"
  echo "  COUNT        Number of requests (default: 30)"
  echo "  CONCURRENCY  Parallel requests (default: 1)"
  echo ""
  echo "Server must have LOGGER=debug for /api/rate-limit/test to respond."
  echo "Example: COUNT=50 CONCURRENCY=5 $0"
  exit 0
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi

echo "Stress test: $COUNT requests, concurrency $CONCURRENCY"
echo "URL: $URL"
echo ""

_do_one() {
  local i="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "$i $code"
}

export URL
export -f _do_one

if [[ "$CONCURRENCY" -eq 1 ]]; then
  for i in $(seq 1 "$COUNT"); do
    _do_one "$i"
  done
else
  seq 1 "$COUNT" | xargs -P "$CONCURRENCY" -I {} bash -c '_do_one "$1"' _ {}
fi | tee /tmp/rate-limit-stress.$$.out

echo ""
echo "--- Summary ---"
ok=$(grep -c " 200$" /tmp/rate-limit-stress.$$.out 2>/dev/null) || ok=0
rate_limited=$(grep -c " 429$" /tmp/rate-limit-stress.$$.out 2>/dev/null) || rate_limited=0
other=$((COUNT - ok - rate_limited))
echo "200 OK:        $ok"
echo "429 Too Many:  $rate_limited"
echo "Other:         $other"
rm -f /tmp/rate-limit-stress.$$.out
