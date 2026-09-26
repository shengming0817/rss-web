#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 2 || $1 != --tag || -z $2 ]]; then
  echo 'usage: pnpm image:mdm --tag IMAGE' >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker buildx build --load --provenance=false -f "$root/deploy/mdm/Dockerfile" --tag "$2" "$root"
