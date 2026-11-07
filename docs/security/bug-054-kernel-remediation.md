# BUG-054: pinned production kernel repair

Status: **completed and verified** after explicit owner approval.

## Completed production repair — 2026-11-07 20:17 UTC

Ewout explicitly approved the pinned kernel update and whole-server reboot. After an initial
unsuccessful authentication attempt, the retried native Terminal operation exited 0 and scheduled
the reboot. Fresh SSH confirms **6.8.0-149-generic**, a changed boot ID, all four packages at
**6.8.0-149.149**, retained 147 image/initrd and an empty dpkg audit. All **8** containers returned
on their same images; Docker/UFW are active. RowLens readiness is **sha-a47111c**, DB ok; all
aggregate counts and permission checks match the pre-reboot baseline, including **26 migrations**.
Five public HTTP checks pass: readiness, trustable.nl, API health, AudioScribe and signup club
listing (WVIJburg). No production signup/email was sent. BUG-054 is fixed for this host; BUG-055
and other maintenance findings remain open. No staging host was checked or modified.

The following records the reviewed plan and pre-execution evidence.

## Corrected vendor evidence

The earlier audit relied on the CVE page's in-progress status. A subsequent package-level check
found the fix in the ordinary **noble-updates** archive, without enabling proposed or replacing the
Ubuntu release/kernel family. Both a fresh Ubuntu amd64 resolver and the production mirror offer
**6.8.0-149.149**. The downloaded, checksum-verified modules package's own changelog contains
`ipv4: free inet_opt and ireq_opt after an RCU grace period` in that version's changes.

Sources:
- [Canonical changelog for 6.8.0-149.149](https://changelogs.ubuntu.com/changelogs/pool/main/l/linux/linux_6.8.0-149.149/changelog)
- [Ubuntu package archive](https://packages.ubuntu.com/noble-updates/linux-image-6.8.0-149-generic)
- [Canonical's repair guidance](https://ubuntu.com/blog/fixes-available-in-proposed-pocket-for-cve-2026-98432)

The older guidance described proposed qualification testing; current signed archive metadata and
the actual package establish availability in updates. Do not use the older CVE status alone to
assert that no repair exists. No firewall workaround or disabling MPTCP is needed for this plan.

## Exact scope and production simulation

All four target package versions are **6.8.0-149.149**:

| Package | Proposed operation |
|---|---|
| linux-image-6.8.0-149-generic | Install signed kernel image |
| linux-modules-6.8.0-149-generic | Install its modules |
| linux-image-virtual | Upgrade the existing kernel meta-package |
| linux-tools-common | Upgrade its matching dependency |

Actual production APT simulation: **2 new packages, 2 upgrades, 0 removals; 63 packages untouched**.
The helper refuses a different package/version, a removal, an unexpected OS/kernel, incomplete
package transactions, insufficient boot space or running containers without restart policies.
It verifies the four downloaded .deb SHA-256 values against the reviewed canonical archive
payloads before installation. No proposed repository, Docker upgrade, distro/HWE switch or
unrelated package upgrade is allowed. `apt-get update` refreshes metadata, not other software.

## Exact commands for approval

From this reviewed checkout, copy the helper only after approval:

```bash
scp scripts/admin/fix-production-kernel-054.sh trustable-prod:/opt/rowlens/fix-production-kernel-054.sh
ssh -t trustable-prod "su -c 'bash /opt/rowlens/fix-production-kernel-054.sh apply'"
```

The second command needs the existing root password in the **hidden native Terminal prompt**,
never in chat, an environment variable or command-line argument. The operator checks that the
uploaded helper checksum matches the reviewed local file before launching it.

Reviewed helper SHA-256:

```
bee5a5fe794a08b60be5b085ebdd6541143b0296df461711a7cedd249323c4d1
```

The helper's actual package installation is pinned:

```bash
apt-get --yes --no-remove --no-install-recommends -o "Dir::Cache::archives=$stage" install \
  linux-image-virtual=6.8.0-149.149 \
  linux-image-6.8.0-149-generic=6.8.0-149.149 \
  linux-modules-6.8.0-149-generic=6.8.0-149.149 \
  linux-tools-common=6.8.0-149.149
```

Before that it refreshes authenticated APT metadata, validates a new dry run, stages the four
reviewed payloads in a root-private `/var/tmp/rowlens-kernel-149.*` directory, backs up GRUB and
package inventory under `/opt/rowlens/backups/kernel-149-*`, and marks the old 147 kernel manual
so it remains available. It never runs autoremove. The full source is
`scripts/admin/fix-production-kernel-054.sh`; these are not abbreviated substitute instructions.

After successful install it validates all target versions, both new boot files, the retained old
kernel, GRUB syntax and that its first boot entry selects 149. Only then it schedules:

```bash
shutdown -r +1 'Approved kernel update for BUG-054; all hosted applications will briefly restart.'
```

This **reboots the whole shared server**, briefly interrupting RowLens, trustable.nl and
AudioScribe, including any active work there. All eight currently running containers use
`unless-stopped`, and Docker/UFW are enabled at boot. Kernel installation/boot checks can fail;
in that case the helper stops before scheduling a reboot. It does not promise zero downtime.

## Verification and recovery

Before execution capture boot ID, current service images/IDs, health URLs and database aggregate
counts without exporting secrets/media. After the reboot verify:

1. Fresh SSH succeeds, boot ID changed and `uname -r` is **6.8.0-149-generic**.
2. All four installed packages are 6.8.0-149.149. Old 147 boot files remain available.
3. Docker and UFW are active; all eight containers return on their **same image tags**.
4. RowLens readiness is sha-a47111c/DB ok, still 26 migrations and the same retained data/authority.
5. trustable.nl, API health and AudioScribe return 200; public RowLens signup still works.

Do not close BUG-054 merely because installation succeeded: the patched kernel must be running.
This fixes this advisory, not every other outstanding scanner/maintenance finding in BUG-055.

If SSH fails to return after the reboot, use the hosting provider's console/recovery access and
select **6.8.0-147-generic** from GRUB's advanced entries. The previous kernel and backed-up GRUB
configuration are retained. This is a manual recovery path, not a tested automatic boot rollback;
provider-console access should be available before authorizing the reboot. Any additional repair
beyond this plan needs its own reviewed commands/approval.

## Checks completed before requesting approval

- Actual production **read-only** helper check and independent APT simulation pass with exactly
  the four reviewed operations, no removals and all running-container restart policies checked.
- Fresh canonical Ubuntu amd64 metadata agrees with the production mirror. Downloaded payloads:
  **4/4 SHA-256 matches**; the modules package's extracted changelog contains the relevant fix.
- **10/10** local safety parser checks pass: reject unrelated install/configure, wrong version,
  wrong architecture, missing version, duplicate operation and fallback removal.
- Bash syntax and ShellCheck pass in an isolated local Ubuntu container. Parser checks are added
  to CI; CI never invokes `apply` or changes a host.
- No production package/cache/firewall/boot change or reboot has occurred. A Docker container
  cannot boot-test this replacement host kernel; no equivalent VM boot acceptance test was run.
