#!/usr/bin/env bash
# Non-interactive E2E tests against the live GearUp API.
set -euo pipefail

BASE_URL="${BASE_URL:-https://gearup-api.vercel.app}"
PASS=0
FAIL=0
SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  SKIP: $1"; SKIP=$((SKIP + 1)); }

assert_http() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label (expected HTTP $expected, got $actual)"
  fi
}

assert_paginated() {
  local label="$1"
  local json="$2"
  if echo "$json" | python3 -c "
import json, sys
payload = json.load(sys.stdin).get('data', {})
items = payload.get('items')
meta = payload.get('meta', {})
ok = isinstance(items, list) and all(k in meta for k in ('total', 'page', 'limit', 'totalPages'))
sys.exit(0 if ok else 1)
" 2>/dev/null; then
    pass "$label"
  else
    fail "$label"
  fi
}

assert_json_true() {
  local label="$1"
  local json="$2"
  local expr="$3"
  if echo "$json" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ok = bool(d${expr})
sys.exit(0 if ok else 1)
" 2>/dev/null; then
    pass "$label"
  else
    fail "$label"
    echo "$json" | python3 -m json.tool 2>/dev/null | head -20 || true
  fi
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"
  local url="${BASE_URL}${path}"
  local args=(-sS -w $'\n%{http_code}' -X "$method" "$url" -H "Content-Type: application/json")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer ${token}")
  [[ -n "$body" ]] && args+=(-d "$body")
  local raw
  raw="$(curl "${args[@]}")"
  LAST_HTTP="$(echo "$raw" | tail -n1)"
  LAST_JSON="$(echo "$raw" | sed '$d')"
}

json_field() {
  echo "$LAST_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
val = d${2}
print('' if val is None else val)
" 2>/dev/null || true
}

section() {
  echo ""
  echo "=== $1 ==="
}

section "GearUp API E2E — ${BASE_URL}"

section "Public"
api GET "/health"
assert_http "GET /health" "200" "$LAST_HTTP"
assert_json_true "health success" "$LAST_JSON" "['success']"

api GET "/"
assert_http "GET /" "200" "$LAST_HTTP"

api GET "/api/categories?page=1&limit=10"
assert_http "GET /api/categories" "200" "$LAST_HTTP"
assert_paginated "categories paginated" "$LAST_JSON"
assert_json_true "categories list" "$LAST_JSON" "['data']['items'] and len(d['data']['items']) > 0"

api GET "/api/gear?limit=5"
assert_http "GET /api/gear" "200" "$LAST_HTTP"

api GET "/api/nonexistent"
assert_http "404 format" "404" "$LAST_HTTP"
assert_json_true "404 success=false" "$LAST_JSON" "['success'] is False"

section "Auth"
api POST "/api/auth/login" '{"email":"admin@gearup.com","password":"Admin@12345"}'
assert_http "admin login" "200" "$LAST_HTTP"
ADMIN_TOKEN="$(json_field "$LAST_JSON" "['data']['token']")"
[[ -n "$ADMIN_TOKEN" ]] && pass "admin token received" || fail "admin token received"

api POST "/api/auth/login" '{"email":"provider@gearup.com","password":"Provider@123"}'
assert_http "provider login" "200" "$LAST_HTTP"
PROVIDER_TOKEN="$(json_field "$LAST_JSON" "['data']['token']")"
[[ -n "$PROVIDER_TOKEN" ]] && pass "provider token received" || fail "provider token received"

api POST "/api/auth/login" '{"email":"customer@gearup.com","password":"Customer@123"}'
assert_http "customer login" "200" "$LAST_HTTP"
CUSTOMER_TOKEN="$(json_field "$LAST_JSON" "['data']['token']")"
[[ -n "$CUSTOMER_TOKEN" ]] && pass "customer token received" || fail "customer token received"
CUSTOMER_UID="$(echo "$CUSTOMER_TOKEN" | python3 -c "
import base64, json, sys
p = sys.stdin.read().strip().split('.')[1]
p += '=' * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p))['userId'])
")"

api POST "/api/auth/login" '{"email":"bad@test.com","password":"wrong"}'
assert_http "bad login 401" "401" "$LAST_HTTP"

api POST "/api/auth/register" '{}'
assert_http "register validation 400" "400" "$LAST_HTTP"

section "Customer"
api GET "/api/auth/me" "" "$CUSTOMER_TOKEN"
assert_http "GET /api/auth/me" "200" "$LAST_HTTP"

api GET "/api/profile" "" "$CUSTOMER_TOKEN"
assert_http "GET /api/profile" "200" "$LAST_HTTP"

GEAR_ID="$(curl -sS "${BASE_URL}/api/gear?available=true&limit=30" | python3 -c "
import json, sys
items = json.load(sys.stdin).get('data', {}).get('items', [])
for item in items:
    if int(item.get('stock', 0) or 0) > 0 and item.get('status') == 'AVAILABLE':
        print(item['id'])
        break
" 2>/dev/null || true)"

if [[ -z "$GEAR_ID" ]]; then
  skip "rental flow (no gear with stock)"
else
  DATES="$(python3 -c "
from datetime import datetime, timedelta, timezone
start = datetime.now(timezone.utc).date() + timedelta(days=30)
end = start + timedelta(days=3)
print(f'{start.isoformat()}T00:00:00.000Z|{end.isoformat()}T00:00:00.000Z')
")"
  START_DATE="${DATES%%|*}"
  END_DATE="${DATES##*|}"

  api POST "/api/rentals" \
    "{\"items\":[{\"gearItemId\":\"${GEAR_ID}\",\"quantity\":1}],\"startDate\":\"${START_DATE}\",\"endDate\":\"${END_DATE}\"}" \
    "$CUSTOMER_TOKEN"
  if [[ "$LAST_HTTP" == "201" ]]; then
    pass "create rental"
    RENTAL_ID="$(json_field "$LAST_JSON" "['data']['id']")"
  else
    fail "create rental (HTTP $LAST_HTTP)"
    RENTAL_ID=""
  fi

  if [[ -n "${RENTAL_ID:-}" ]]; then
    api GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN"
    assert_http "GET rental detail" "200" "$LAST_HTTP"

    api GET "/api/rentals?page=1&limit=10" "" "$CUSTOMER_TOKEN"
    assert_http "GET rentals list" "200" "$LAST_HTTP"
    echo "$LAST_JSON" | python3 -c "
import json, sys
uid = '''$CUSTOMER_UID'''
payload = json.load(sys.stdin).get('data', {})
orders = payload.get('items', [])
meta = payload.get('meta', {})
bad = [o['id'] for o in orders if o.get('customerId') != uid]
if bad or 'total' not in meta or 'page' not in meta:
    sys.exit(1)
" && pass "rentals paginated and scoped to customer" || fail "rentals paginated and scoped to customer"

    api GET "/api/payments?page=1&limit=10" "" "$CUSTOMER_TOKEN"
    assert_http "GET payment history" "200" "$LAST_HTTP"
    assert_paginated "payments paginated" "$LAST_JSON"

    api POST "/api/payments/create" "{\"rentalOrderId\":\"${RENTAL_ID}\"}" "$CUSTOMER_TOKEN"
    if [[ "$LAST_HTTP" == "200" || "$LAST_HTTP" == "201" ]]; then
      pass "create payment"
      PAY_URL="$(json_field "$LAST_JSON" "['data']['url']")"
      [[ -n "$PAY_URL" ]] && pass "payment url returned" || fail "payment url returned"
    else
      fail "create payment (HTTP $LAST_HTTP)"
    fi
  fi
fi

section "Provider"
api GET "/api/provider/orders?page=1&limit=10" "" "$PROVIDER_TOKEN"
assert_http "GET provider orders" "200" "$LAST_HTTP"
assert_paginated "provider orders paginated" "$LAST_JSON"

if [[ -n "${RENTAL_ID:-}" ]]; then
  api PATCH "/api/provider/orders/${RENTAL_ID}" '{"status":"CONFIRMED"}' "$PROVIDER_TOKEN"
  assert_http "confirm rental" "200" "$LAST_HTTP"
fi

section "Admin"
api GET "/api/admin/users?page=1&limit=10" "" "$ADMIN_TOKEN"
assert_http "GET admin users" "200" "$LAST_HTTP"
assert_paginated "admin users paginated" "$LAST_JSON"

api GET "/api/admin/gear?page=1&limit=10" "" "$ADMIN_TOKEN"
assert_http "GET admin gear" "200" "$LAST_HTTP"
assert_paginated "admin gear paginated" "$LAST_JSON"

api GET "/api/admin/rentals?page=1&limit=10" "" "$ADMIN_TOKEN"
assert_http "GET admin rentals" "200" "$LAST_HTTP"
assert_paginated "admin rentals paginated" "$LAST_JSON"

section "Authorization"
api GET "/api/admin/users" "" "$CUSTOMER_TOKEN"
assert_http "customer cannot access admin" "403" "$LAST_HTTP"

api GET "/api/provider/gear" "" "$CUSTOMER_TOKEN"
assert_http "customer cannot access provider gear" "403" "$LAST_HTTP"

section "Swagger"
SWAGGER_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}/api/docs")"
assert_http "GET /api/docs" "200" "$SWAGGER_HTTP"

section "Summary"
echo ""
echo "Passed: $PASS  Failed: $FAIL  Skipped: $SKIP"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
