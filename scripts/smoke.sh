#!/usr/bin/env bash
#
# Integration smoke suite — formalizes the manual verification matrices
# (security phases 1-6) as a scripted flow against `bun run preview`.
#
# Usage:  scripts/smoke.sh [base-url]
#         default base-url: http://localhost:4173
#
# Covers: security headers, Origin/CSRF gates, key lifecycle (set/status/
# change/remove + guard refusals), connection add via form action with
# legacy-cookie migration, cookie-name and attribute assertions, and the
# S3 dispatcher error shapes. Exit code 0 = all assertions passed.

set -u

BASE="${1:-http://localhost:4173}"
JAR="$(mktemp)"
BODY="$(mktemp)"
HDR="$(mktemp)"
PASS=0
FAIL=0
STRONG_KEY="smoke-Key-$(date +%s)"

cleanup() { rm -f "$JAR" "$BODY" "$HDR"; }
trap cleanup EXIT

# --- helpers ---------------------------------------------------------------

# assert_eq <label> <expected> <actual>
assert_eq() {
	if [ "$2" = "$3" ]; then
		PASS=$((PASS + 1)); echo "  ok: $1"
	else
		FAIL=$((FAIL + 1)); echo "  FAIL: $1"
		echo "        expected: [$2]"
		echo "        actual:   [$3]"
	fi
}

# assert_contains <label> <needle> <haystack>
assert_contains() {
	case "$3" in
		*"$2"*) PASS=$((PASS + 1)); echo "  ok: $1" ;;
		*) FAIL=$((FAIL + 1)); echo "  FAIL: $1 — missing [$2] in [$(echo "$3" | head -c 200)]" ;;
	esac
}

# post_json <jar-in> <jar-out> <path> <json-body> [origin]
# Prints response body (captured from the -o file); headers land in $HDR.
post_json() {
	local jin="$1" jout="$2" path="$3" data="$4" origin="${5:-$BASE}"
	curl -s -b "$jin" -c "$jout" -D "$HDR" -o "$BODY" \
		-X POST -H "Origin: $origin" -H "Content-Type: application/json" \
		-d "$data" "$BASE$path"
	cat "$BODY"
}

# post_origin <jar> <path> <json-body> <origin>  — body to stdout, code in $CODE
post_origin() {
	CODE=$(curl -s -b "$1" -o "$BODY" -w "%{http_code}" \
		-X POST -H "Origin: $4" -H "Content-Type: application/json" \
		-d "$3" "$BASE$2")
}

# cookie_value <name> — from $JAR; empty string when absent
cookie_value() {
	awk -v n="$1" '$6 == n { print $7; exit }' "$JAR"
}

# has_cookie <name> — "yes"/"no"
has_cookie() {
	if awk -v n="$1" '$6 == n { found=1; exit } END { exit found ? 0 : 1 }' "$JAR"; then
		echo yes
	else
		echo no
	fi
}

# --- 1. security headers on a page GET --------------------------------------

echo "== security headers =="
curl -s -D "$HDR" -o /dev/null "$BASE/"
HEADERS="$(cat "$HDR" | tr '[:upper:]' '[:lower:]')"
assert_contains "CSP frame-ancestors none" "frame-ancestors 'none'" "$HEADERS"
assert_contains "X-Frame-Options DENY" "x-frame-options: deny" "$HEADERS"
assert_contains "nosniff" "x-content-type-options: nosniff" "$HEADERS"
assert_contains "Referrer-Policy" "strict-origin-when-cross-origin" "$HEADERS"

# --- 2. fresh visitor state --------------------------------------------------

echo "== fresh visitor =="
rm -f "$JAR"
STATUS="$(post_json "$JAR" "$JAR" /api/keys/status '{}')"
assert_contains "no cookie key" '"hasCookieKey":false' "$STATUS"
assert_contains "no env key leak" '"hasEnvKey":false' "$STATUS"

# --- 3. Origin gate ----------------------------------------------------------

echo "== origin gate =="
CODE=$(curl -s -o "$BODY" -w "%{http_code}" -X POST \
	-H "Content-Type: application/json" -d '{}' "$BASE/api/keys/status")
assert_eq "missing Origin -> 403" "403" "$CODE"
assert_contains "missing Origin message" "Missing Origin header" "$(cat "$BODY")"

post_origin "$JAR" /api/keys/status '{}' "https://evil.example"
assert_eq "cross-origin -> 403" "403" "$CODE"
assert_contains "cross-origin message" "Cross-origin request rejected" "$(cat "$BODY")"

post_origin "$JAR" /api/keys/status '{}' "not-a-url"
assert_eq "malformed Origin -> 403" "403" "$CODE"

# Referer fallback passes when host matches
CODE=$(curl -s -b "$JAR" -o "$BODY" -w "%{http_code}" -X POST \
	-H "Referer: $BASE/dashboard" -H "Content-Type: application/json" \
	-d '{}' "$BASE/api/keys/status")
assert_eq "Referer fallback -> 200" "200" "$CODE"

# --- 4. key set: __Host- name + attributes -----------------------------------

echo "== key set =="
# Preview runs the worker in prod mode, so the __Host- names apply.
SET="$(post_json "$JAR" "$JAR" /api/keys/set "{\"key\":\"$STRONG_KEY\"}")"
assert_contains "set succeeds" '"success":true' "$SET"
assert_eq "__Host-s3-key present" "yes" "$(has_cookie __Host-s3-key)"
KEY_VAL="$(cookie_value __Host-s3-key)"
assert_eq "key value round-trips" "$STRONG_KEY" "$KEY_VAL"
SETC="$(grep -i "^set-cookie: __Host-s3-key=" "$HDR" | head -1 | tr '[:upper:]' '[:lower:]')"
assert_contains "HttpOnly" "httponly" "$SETC"
assert_contains "Secure" "secure" "$SETC"
assert_contains "SameSite=Strict" "samesite=strict" "$SETC"

# weak keys rejected (phase 2 policy)
WEAK="$(post_json "$JAR" "$JAR" /api/keys/set '{"key":"short"}')"
assert_contains "weak key length rejected" "at least 16" "$WEAK"
WEAK="$(post_json "$JAR" "$JAR" /api/keys/set '{"key":"aaaaaaaaaaaaaaaaaaaa"}')"
assert_contains "single-class key rejected" "3 of" "$WEAK"

# --- 5. connection add via form action (legacy migration) --------------------

echo "== connection add + legacy migration =="
rm -f "$JAR"
# Simulate a visitor with pre-phase-6 plain-name cookies. The secure flag
# is FALSE so curl also sends them over http:// preview servers.
HOST_ONLY="$(printf '%s' "$BASE" | sed 's|.*://||;s|:[0-9]*$||')"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$HOST_ONLY" "FALSE" "/" "FALSE" "0" "s3-connections" "JUNK" >> "$JAR"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$HOST_ONLY" "FALSE" "/" "FALSE" "0" "s3-key" "JUNK" >> "$JAR"

ACTION="$(curl -s -b "$JAR" -c "$JAR" -D "$HDR" -X POST \
	"$BASE/dashboard/connections/new?/add" -H "Origin: $BASE" \
	--data-urlencode "name=smoke-tmp" \
	--data-urlencode "type=s3" \
	--data-urlencode "accessKeyId=AKIASMOKE0000000000" \
	--data-urlencode "secretAccessKey=smoke-secret-0000000000000000000000" \
	--data-urlencode "region=us-east-1")"
assert_contains "form action redirects" '"type":"redirect"' "$ACTION"
assert_eq "__Host-s3-connections set" "yes" "$(has_cookie __Host-s3-connections)"
assert_eq "visitor key provisioned" "yes" "$(has_cookie __Host-s3-key)"
assert_eq "legacy s3-connections cleared" "no" "$(has_cookie s3-connections)"
assert_eq "legacy s3-key cleared" "no" "$(has_cookie s3-key)"
LEGACY_CLEAR="$(grep -ci "^set-cookie: s3-connections=;" "$HDR")"
assert_eq "legacy cookie Max-Age=0 clear" "1" "$LEGACY_CLEAR"

# dashboard renders the migrated connection (decrypt round-trip);
# the name appears 3x in the card markup (title + two links)
DASH="$(curl -s -b "$JAR" "$BASE/dashboard")"
COUNT="$(printf '%s' "$DASH" | grep -o "smoke-tmp" | wc -l | tr -d ' ')"
assert_eq "dashboard decrypts migrated connection" "3" "$COUNT"

# extract the connection id for later assertions
CONN_ID="$(printf '%s' "$DASH" | grep -o 'connections/[0-9a-f-]\{36\}' | head -1 | cut -d/ -f2)"
assert_eq "connection id extractable" "yes" "$([ -n "$CONN_ID" ] && echo yes || echo no)"

# --- 6. S3 dispatcher error shapes -------------------------------------------

echo "== s3 dispatcher error shapes =="
# Unknown op -> 404 with JSON error
post_origin "$JAR" /api/s3/notAnOp '{}' "$BASE"
assert_eq "unknown op -> 404" "404" "$CODE"
# Malformed JSON -> 400 (after Origin passes)
CODE=$(curl -s -b "$JAR" -o "$BODY" -w "%{http_code}" -X POST \
	-H "Origin: $BASE" -H "Content-Type: application/json" \
	-d 'not-json' "$BASE/api/s3/listBuckets")
assert_eq "malformed JSON -> 400" "400" "$CODE"
assert_contains "malformed JSON message" "Invalid JSON body" "$(cat "$BODY")"
# Valid JSON, bogus connection -> AppError surfaced verbatim (200 envelope)
BOGUS="$(post_json "$JAR" "$JAR" /api/s3/listBuckets '{"connectionId":"nope"}')"
assert_contains "bogus connection -> AppError message" "Connection not found" "$BOGUS"
# folder delete must be routed (it used to fall through to the 404 default)
BFD="$(post_json "$JAR" "$JAR" /api/s3/deleteFolder '{"connectionId":"nope","bucket":"b","folderPrefix":"x/"}')"
assert_contains "deleteFolder op routed (not 404)" "Connection not found" "$BFD"
# move/copy + details + ACL-toggle ops are routed
for OP in moveObjects makePrivate getObjectDetails; do
	OPR="$(post_json "$JAR" "$JAR" "/api/s3/$OP" '{"connectionId":"nope","bucket":"b","key":"k","destPrefix":"","mode":"move"}')"
	assert_contains "$OP op routed" "Connection not found" "$OPR"
done

# --- 7. key rotation over existing data ---------------------------------------

echo "== key rotation =="
# Legacy visitors reuse their legacy key value for continuity (ISSUE-004
# fix), so the data's current key is the legacy jar value, not STRONG_KEY.
NEW_KEY="rotated-Key-$(date +%s)"
CHG="$(post_json "$JAR" "$JAR" /api/keys/change "{\"currentKey\":\"JUNK\",\"newKey\":\"$NEW_KEY\"}")"
assert_contains "rotation succeeds" '"success":true' "$CHG"
# data still decrypts under the new key
BOGUS2="$(post_json "$JAR" "$JAR" /api/s3/listBuckets '{"connectionId":"nope"}')"
assert_contains "data intact after rotation" "Connection not found" "$BOGUS2"
# wrong current key refused
WRONG="$(post_json "$JAR" "$JAR" /api/keys/change '{"currentKey":"wrong-key-wrong-key-99","newKey":"another-Key-9999"}')"
assert_contains "wrong current key refused" "decrypt connections with the current key" "$WRONG"

# --- 8. remove-key guard + full cleanup ---------------------------------------

echo "== remove guard + cleanup =="
REFUSE="$(post_json "$JAR" "$JAR" /api/keys/remove '{}')"
assert_contains "remove refused while data exists" "Cannot remove the encryption key" "$REFUSE"

# delete the connection via form action (a form field is required so curl
# sends multipart/form-data — SvelteKit rejects the empty urlencoded POST
# with 415 Unsupported Media Type)
DEL="$(curl -s -b "$JAR" -c "$JAR" -X POST \
	"$BASE/dashboard/connections/$CONN_ID?/delete" -H "Origin: $BASE" \
	--data-urlencode "submit=1")"
CONN_GONE="$(curl -s -b "$JAR" "$BASE/dashboard" | grep -o "smoke-tmp" | wc -l | tr -d ' ')"
assert_eq "connection deleted" "0" "$CONN_GONE"

# now remove succeeds and clears both __Host- names
RM="$(post_json "$JAR" "$JAR" /api/keys/remove '{}')"
assert_contains "remove succeeds after cleanup" '"success":true' "$RM"
assert_eq "__Host-s3-key removed" "no" "$(has_cookie __Host-s3-key)"
assert_eq "__Host-s3-connections removed" "no" "$(has_cookie __Host-s3-connections)"

# --- summary ------------------------------------------------------------------

echo
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
