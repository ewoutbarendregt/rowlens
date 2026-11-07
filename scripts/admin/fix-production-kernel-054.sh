#!/usr/bin/env bash
# BUG-054. Operator-only, reviewed one-off for Ubuntu Noble amd64 on trustable-prod.
# check is read-only. apply requires separately approved root access and schedules a host reboot.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
umask 077
readonly target_version=6.8.0-149.149 target_kernel=6.8.0-149-generic old_kernel=6.8.0-147-generic
packages=(linux-image-virtual linux-image-6.8.0-149-generic linux-modules-6.8.0-149-generic linux-tools-common)
specs=()
for package in "${packages[@]}"; do specs+=("$package=$target_version"); done
fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
manifest() {
  cat <<'HASHES'
a775d2722cc556ca3e27cb35886c7a8f601ee6e308dbe2ea166d1548b2eb11d4  linux-image-virtual_6.8.0-149.149_amd64.deb
b8757670b7ec8aead358d4fba420064b9f31d344c3393548105aca2b3956d2ab  linux-image-6.8.0-149-generic_6.8.0-149.149_amd64.deb
5bc3ca74124d8da40206a21221d088d5a2505ae7facb593bab87ca42fda91063  linux-modules-6.8.0-149-generic_6.8.0-149.149_amd64.deb
e4e50ac074b033e2a3ebe7c1ba1d960697464ec82de0bb2ba9aad3ed6fb707a4  linux-tools-common_6.8.0-149.149_all.deb
HASHES
}
# Allow only the four reviewed package operations/version; never remove anything.
validate_plan() {
  local operation package rest seen=' '
  while read -r operation package rest; do
    case "$operation" in
      Remv) printf 'Package removal refused\n' >&2; return 1 ;;
      Inst|Conf)
        package=${package%:amd64}
        case "$package" in
          linux-image-virtual|linux-image-6.8.0-149-generic|linux-modules-6.8.0-149-generic|linux-tools-common) ;;
          *) printf 'Unreviewed package: %s\n' "$package" >&2; return 1 ;;
        esac
        [[ "$rest" == *"($target_version "* ]] || { printf 'Unreviewed version\n' >&2; return 1; }
        if [[ "$operation" == Inst ]]; then
          [[ "$seen" != *" $package "* ]] || { printf 'Duplicate package operation\n' >&2; return 1; }
          seen+="$package "
        fi
        ;;
    esac
  done
}
installed_version() { dpkg-query -W -f='${db:Status-Abbrev} ${Version}' "$1"; }
main() {
  local mode=$1 plan stage backup_dir first_boot_line container policy containers
  [[ "$mode" != apply || "$(id -u)" == 0 ]] || fail 'apply needs root via the hidden su prompt'
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && "$(dpkg --print-architecture)" == amd64 ]] || fail 'Unexpected OS/architecture'
  if [[ "$(uname -r)" == "$target_kernel" ]]; then printf 'Target kernel already running; no change.\n'; return; fi
  [[ "$(uname -r)" == "$old_kernel" ]] || fail 'Unexpected running kernel; review again'
  [[ "$(installed_version "linux-image-$old_kernel")" == 'ii  6.8.0-147.147' ]] || fail 'Known old kernel must remain installed'
  [[ -f "/boot/vmlinuz-$old_kernel" && -f "/boot/initrd.img-$old_kernel" ]] || fail 'Old boot files missing'
  [[ -z "$(dpkg --audit)" ]] || fail 'Incomplete package transaction'
  [[ ! -e /run/systemd/shutdown/scheduled ]] || fail 'Another shutdown/reboot is already scheduled'
  [[ "$(df -Pk /boot | awk 'NR==2 {print $4}')" -ge 1048576 ]] || fail 'Less than 1 GiB free for boot files'
  grep -qx 'GRUB_DEFAULT=0' /etc/default/grub || fail 'Unexpected GRUB default; review boot selection'
  systemctl is-enabled --quiet docker.service || fail 'Docker is not enabled at boot'
  containers=$(docker ps -q)
  [[ -n "$containers" ]] || fail 'No running containers; review service state'
  while IFS= read -r container; do
    policy=$(docker inspect "$container" --format '{{.HostConfig.RestartPolicy.Name}}')
    [[ "$policy" == always || "$policy" == unless-stopped ]] || fail 'A running container will not automatically restart'
  done <<< "$containers"
  if [[ "$mode" == apply ]]; then apt-get update; fi
  plan=$(apt-get -s --no-remove --no-install-recommends install "${specs[@]}")
  printf '%s\n' "$plan"
  printf '%s\n' "$plan" | validate_plan || fail 'APT plan differs from approved scope'
  [[ "$mode" == apply ]] || return 0
  stage=$(mktemp -d /var/tmp/rowlens-kernel-149.XXXXXX)
  # APT authenticates its archive metadata; the additional hashes pin the reviewed payloads.
  (cd "$stage" && apt-get download "${specs[@]}" && manifest | sha256sum --check --strict)
  backup_dir="/opt/rowlens/backups/kernel-149-$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 700 "$backup_dir"
  install -m 600 /boot/grub/grub.cfg "$backup_dir/grub.cfg"
  dpkg-query -W > "$backup_dir/packages-before.txt"
  apt-mark manual "linux-image-$old_kernel"
  apt-get --yes --no-remove --no-install-recommends -o "Dir::Cache::archives=$stage" install "${specs[@]}"
  for package in "${packages[@]}"; do
    [[ "$(installed_version "$package")" == "ii  $target_version" ]] || fail 'Target package verification failed; no reboot'
  done
  [[ "$(installed_version "linux-image-$old_kernel")" == 'ii  6.8.0-147.147' ]] || fail 'Old kernel missing; no reboot'
  [[ -s "/boot/vmlinuz-$target_kernel" && -s "/boot/initrd.img-$target_kernel" ]] || fail 'Target boot files missing; no reboot'
  grub-script-check /boot/grub/grub.cfg
  first_boot_line=$(grep -m1 -E '^[[:space:]]*linux[[:space:]]' /boot/grub/grub.cfg)
  [[ "$first_boot_line" == *"vmlinuz-$target_kernel"* ]] || fail 'New kernel is not first boot entry; no reboot'
  printf 'Approved kernel installed and boot files checked. Reboot in one minute. Old kernel retained.\n'
  shutdown -r +1 'Approved kernel update for BUG-054; all hosted applications will briefly restart.'
}
case "${1:-}" in
  --validate-plan) validate_plan ;;
  --manifest) manifest ;;
  check|apply) [[ $# == 1 ]] || fail 'Unexpected arguments'; main "$1" ;;
  *) printf 'Usage: %s check|apply\n' "$0" >&2; exit 64 ;;
esac
