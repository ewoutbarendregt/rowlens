#!/usr/bin/env bash
# Safe parser tests only: never run the production apply command here.
set -euo pipefail
helper="$(cd "$(dirname "$0")/.." && pwd)/fix-production-kernel-054.sh"
passed=0
valid='Inst linux-modules-6.8.0-149-generic (6.8.0-149.149 Ubuntu:24.04/noble-updates [amd64])
Inst linux-image-6.8.0-149-generic (6.8.0-149.149 Ubuntu:24.04/noble-updates [amd64])
Inst linux-image-virtual [6.8.0-147.147] (6.8.0-149.149 Ubuntu:24.04/noble-updates [amd64])
Inst linux-tools-common [6.8.0-147.147] (6.8.0-149.149 Ubuntu:24.04/noble-updates [all])
Conf linux-image-virtual (6.8.0-149.149 Ubuntu:24.04/noble-updates [amd64])'
accept() { printf '%s\n' "$1" | bash "$helper" --validate-plan; passed=$((passed+1)); }
reject() {
  if printf '%s\n' "$1" | bash "$helper" --validate-plan 2>/dev/null; then
    printf 'Unexpected acceptance: %s\n' "$2" >&2; exit 1
  fi
  passed=$((passed+1))
}
accept "$valid"
accept '0 upgraded, 0 newly installed, 0 to remove.'
reject "$valid
Inst docker-ce (5:29.9.3 Ubuntu [amd64])" 'unrelated host update'
reject "$valid
Remv linux-image-6.8.0-147-generic [6.8.0-147.147]" 'fallback removal'
reject 'Inst linux-image-virtual (6.8.0-150.150 Ubuntu [amd64])' 'unreviewed version'
reject "$valid
Inst linux-image-virtual (6.8.0-149.149 Ubuntu [amd64])" 'duplicate operation'
reject 'Conf openssh-server (1:9.6p1-3ubuntu13.20 Ubuntu [amd64])' 'unrelated configure'
reject 'Inst linux-image-virtual:arm64 (6.8.0-149.149 Ubuntu [arm64])' 'wrong architecture'
reject 'Inst linux-image-virtual' 'missing version'
manifest=$(bash "$helper" --manifest)
[[ $(printf '%s\n' "$manifest" | wc -l | tr -d ' ') == 4 ]]
[[ $(printf '%s\n' "$manifest" | awk 'length($1)==64 {count++} END {print count}') == 4 ]]
passed=$((passed+1))
bash -n "$helper"
printf '%s kernel maintenance safety checks passed\n' "$passed"
