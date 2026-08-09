#!/bin/sh
set -eu

fail() {
  echo "rss-web edge configuration is invalid" >&2
  exit 1
}

required() {
  eval "value=\${$1-}"
  [ -n "$value" ] || fail
}

valid_host() {
  value=$1
  [ "${#value}" -le 253 ] || return 1
  printf '%s\n' "$value" | awk -F. '
    NF == 0 { exit 1 }
    {
      for (i = 1; i <= NF; i++) {
        if ($i == "" || length($i) > 63 || $i !~ /^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/) {
          if (length($i) != 1 || $i !~ /^[A-Za-z0-9]$/) exit 1
        }
      }
    }
  '
}

valid_port() {
  case $1 in
    ''|0|*[!0-9]*|0*) return 1 ;;
  esac
  [ "$1" -le 65535 ] 2>/dev/null
}

for name in \
  RSS_WEB_TENANT_ID \
  RSS_WEB_PRIMARY_HOST \
  RSS_WEB_PRIMARY_PORT \
  RSS_WEB_ADMIN_HOST \
  RSS_WEB_ADMIN_PORT
do
  required "$name"
done

printf '%s\n' "$RSS_WEB_TENANT_ID" | grep -Eq \
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' || fail
[ "$RSS_WEB_TENANT_ID" != '00000000-0000-0000-0000-000000000000' ] || fail

valid_host "$RSS_WEB_PRIMARY_HOST" || fail
valid_host "$RSS_WEB_ADMIN_HOST" || fail
valid_port "$RSS_WEB_PRIMARY_PORT" || fail
valid_port "$RSS_WEB_ADMIN_PORT" || fail

[ "$RSS_WEB_PRIMARY_HOST:$RSS_WEB_PRIMARY_PORT" != \
  "$RSS_WEB_ADMIN_HOST:$RSS_WEB_ADMIN_PORT" ] || fail
