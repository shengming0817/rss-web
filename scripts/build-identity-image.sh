#!/usr/bin/env bash
# Keep the public package entry thin: fixed Git input + the ordinary Docker build.
set -euo pipefail
if [[ $# != 2 || $1 != --tag || -z $2 ]]; then
  echo 'usage: pnpm image:identity --tag IMAGE' >&2
  exit 2
fi
root="$(/usr/bin/git rev-parse --show-toplevel)"
revision="$(/usr/bin/git -C "$root" rev-parse HEAD)"
if [[ -n "$(/usr/bin/git -C "$root" status --porcelain)" ]]; then
  echo 'image requires clean HEAD' >&2
  exit 1
fi
/usr/bin/git -C "$root" archive "$revision" | docker buildx build --platform linux/amd64 --load --provenance=false \
  -f deploy/identity/Dockerfile --tag "$2" --build-arg "RSS_IDENTITY_WEB_REVISION=$revision" -
test "$(/usr/bin/git -C "$root" rev-parse HEAD)" = "$revision"
test -z "$(/usr/bin/git -C "$root" status --porcelain)"
