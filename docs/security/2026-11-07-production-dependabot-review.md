# Production deployment and Dependabot security review — 2026-11-07

## Subsequent package-level correction

The audit's CVE-page status was incomplete: follow-up verifies signed **6.8.0-149.149** packages
in ordinary noble-updates, with the relevant fix in the downloaded modules changelog. The server
still runs 147 until an approved install/reboot. See [the concrete remediation plan](bug-054-kernel-remediation.md).
Do not treat the historical in-progress wording below as proof that an updates repair is unavailable.

## Outcome

Our registration release is deployed as **sha-a47111c**. No Dependabot PR was merged into it.
The security review found existing maintenance issues, including a **vendor-confirmed critical
IPv4/TCP kernel advisory** affecting this host's Ubuntu/kernel family. This is independent of
Dependabot. Do not interpret successful deployment or the absence of bot merges as a clean
security bill of health.

This was a read-only assessment, apart from the separately requested normal RowLens deployment
and closing unwanted bot proposals. No host upgrade, firewall change, service reconfiguration,
shared-container restart, exploit attempt, production test account or test email was performed.

## Deployment evidence

- Lower documentation PR [#158](https://github.com/ewoutbarendregt/rowlens/pull/158) merged as
  ca0b7af with its branch retained. Registration PR [#159](https://github.com/ewoutbarendregt/rowlens/pull/159)
  retargeted to main; squash-only log conflicts resolved by preserving the reviewed feature tree.
- Final PR CI [42403762182](https://github.com/ewoutbarendregt/rowlens/actions/runs/42403762182)
  passed all eight checks. Merge **a47111cf8e431fc8661f39f50ea5eb2e35edba35** passed main CI
  [42404700506](https://github.com/ewoutbarendregt/rowlens/actions/runs/42404700506) and image build
  [42404700521](https://github.com/ewoutbarendregt/rowlens/actions/runs/42404700521).
- Deploy [42405660947](https://github.com/ewoutbarendregt/rowlens/actions/runs/42405660947)
  succeeded **2026-11-07 19:20 UTC**. Both RowLens web/worker run sha-a47111c with zero restarts.
  Readiness reports that version with DB ok; unified auth remains enabled.
- Migration **0025**, **26 total**. Before/after: **6 accounts, 6 memberships, 4 sessions, 5 videos,
  13 compatibility people (7 unlinked), 10 seats, 8 angles, 1 platform administrator**.
  No fabricated historical registration: registration count is zero and there are zero pending
  club applications.
  Direct app-role SELECT/INSERT on registration and EXECUTE on the private helper are denied.
- Public signup form checked on **1000x540 Chromium and iPhone 13 WebKit**, including WVIJburg,
  explicit No club, disabled incomplete submission and no horizontal overflow. No OTP was sent.
- All **5** shared-container IDs/start times/images exactly match preflight; trustable website,
  API health and AudioScribe returned **200**. No .env/installed compose edit or repeat bootstrap.
- Known release-please run 42404700571 failed only because Actions cannot create PRs; this did
  not affect the green CI/images/deploy. Authenticated signup/mail round-trip remains user review.

## What Dependabot actually did

Eight PRs, **#72–#79**, proposed Node/Python image, GitHub Action and development-tool updates.
All had null merged timestamps. None is an ancestor introduced by a Dependabot merge in the
production history checked; production image revision labels pointed to our dd71f78 release
before this deployment and now to our a47111c release. No dependency manifest, lockfile or
Dockerfile changed between those two own releases. The worker's complete image filesystem layer
list is identical across the two tags; the new web image was scanned separately as well.

The eight proposals were **closed without merging or deleting branches** at Ewout's instruction.
Repository auto-merge is **false**, automated security-update PRs were already disabled and the
Dependabot secret store has **0 entries**. Existing version-update scheduling remains in
`.github/dependabot.yml`: this review rejects acceptance, not security monitoring. Do not claim
that all future proposals have been disabled. Agents must not accept external/bot proposals or
interpret a generic own-release instruction as permission to merge them.

CI runs on GitHub-hosted `ubuntu-latest`, uses `pull_request` (not `pull_request_target`) and
read-only repository permissions for PR checks. Publishing requires push to main; deployment is
manual and restricted to the repository owner. Dependabot-triggered PR checks do not receive
ordinary Actions secrets; that agrees with [GitHub's restrictions](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions).
No route from these unmerged proposals to the production SSH deployment was found. This does
not amount to cryptographic proof against all possible supplier/account compromise.

## Method and inventory

- Audited the actual running image exports locally; **no scanner was installed on production**.
  Only image layers were exported, not container writable layers, mounted media, environment
  secrets or database contents. Scanning ran without network access, Docker socket or privileges;
  local mounts were read-only. CVE database download used an isolated local cache only.
- Scanner: **Anchore Grype v0.121.2**, image digest
  `sha256:6a36234da13f9faa327306ac0b3dab3405cfa2b4eb20c8f904125a8707863913`.
  Valid database **v6.1.10**, built **2026-11-07 06:18:48 UTC**.
- npm production audit: **131 dependencies**, **2 moderate**, **0 high/critical**. Production
  Python dependency audit: **5 dependencies, no known vulnerabilities**. These language audits
  exclude system libraries and globally installed npm tooling; image findings below cover more.
- Host: Ubuntu **24.04.4**, running kernel **6.8.0-147-generic**; Docker **29.2.1** / Go **1.25.6**,
  containerd **2.2.1**, runc **1.3.4**. Web: Node **22.23.4**, Alpine **3.24.4**; worker:
  Python **3.12.16**, Debian **13.7**, system FFmpeg **7.1.5** plus OpenCV-bundled FFmpeg **8.1.1**.
  PostgreSQL **16.15**. Node reports its bundled zlib as **1.3.1-e00f703**, distinct from Alpine zlib.
- TCP listeners: public **22/80/443**, DNS loopback only. No published RowLens DB/app/Docker API
  TCP port observed. All three RowLens PID 1 processes run non-root, with zero effective
  capabilities and `docker-default` AppArmor. No Docker socket mount or privileged container;
  worker has no default outbound route. These reduce exposure, not eliminate component bugs.

## Scanner totals — package matches, not proven exploitable flaws

| Target | Critical | High | Medium | Low | Other | Critical unique IDs |
|---|---:|---:|---:|---:|---:|---:|
| Current web | 1 | 10 | 17 | 1 | 0 | 1 |
| Worker, identical old/new filesystem | 11 | 326 | 314 | 25 | 177 | 3 |
| RowLens DB | 1 | 0 | 4 | 0 | 0 | 1 |
| Host installed packages/current kernel | 30 | 741 | 5094 | 1427 | 50 | 15 |

Raw host inventory initially produced **27,559** matches, including removed packages with only
configuration records and inactive kernels. Filtering **583 installed packages** and then the
**579-package current-kernel inventory** reduced this to **7,342**, with **30 critical package
matches for 15 kernel advisory IDs**. Source-package matches can cover features not loaded or
configured. These numbers are not counts of independent, remotely reachable vulnerabilities.
The report deliberately does not mark the active kernel clean after filtering old kernels.

Raw JSON, image exports and scanner metadata remain under `/tmp/rowlens-security-audit` on the
operator's laptop; no raw image, dependency cache, media or private user data is committed.

## Prioritised findings

### P0: existing kernel IPv4/TCP advisory needs owner-directed response

**CVE-2026-98432**: the current kernel is in Ubuntu Noble's affected family. Canonical classifies
it as critical and describes potential remote code execution in IPv4 TCP handling; Noble's fix
is still in progress. This matters to a host with public TCP services and cannot be dismissed
as an unused optional NFS driver. No exploit was attempted and compromise was not established.
See [Canonical's advisory, status and mitigation](https://ubuntu.com/security/CVE-2026-98432).

The vendor describes filtering IPv4 TCP packets carrying IP header options as a partial temporary
mitigation. Applying/persisting firewall rules needs a separate exact-command approval and must
respect the existing firewall manager and Docker forwarding/container namespaces. UFW is active
(`ENABLED=yes`); the nftables service is inactive. The vendor's example assumes a different
firewall-management setup, so it must not simply be pasted or used to enable nftables here. The vendor
explicitly does not claim complete protection. No rule, sysctl or reboot was applied by this audit;
no unreviewed distribution/kernel switch is proposed as an automatic repair.

The other 14 critical current-kernel IDs are enumerated below. Some concern NFS/RDMA/Ceph/SMB,
which were not observed as loaded services/modules; that is not proof of universal non-reachability.
XFRM modules are loaded, and [CVE-2026-68426](https://ubuntu.com/security/CVE-2026-68426) also has
critical vendor priority and an outstanding Noble fix. Review actual feature use and Canonical's
updates rather than treating all package warnings as automatically exploitable or irrelevant.

### P1: image and media-decoder maintenance must be reviewed manually

- **Alpine zlib 1.3.2-r1** in web/DB is flagged for **CVE-2026-4738**, fixed in **1.4-r0**. The
  upstream issue involves contributed infback9 code; upstream cautions that its critical rating
  overstates the observed impact. That prevents a claim of confirmed application RCE, but newer
  zlib also contains other security fixes. Plan controlled image patching and library-use review.
  [Upstream release notes](https://github.com/madler/zlib/releases/tag/v1.4).
- **FFmpeg CVE-2026-75143** accounts for nine repeated critical worker package matches. Debian
  marks the installed 7.1.5 series vulnerable and postpones its stable-branch fix. The specific
  issue uses the async/RIST network reader; our commands accept generated local file paths, the
  worker has no default route, and no RIST streaming was configured. Direct exploitation was
  not demonstrated. Other image decoder findings, including bundled OpenCV libraries, still
  deserve attention because approved users supply media. A future change should review patched
  codecs, an explicit local-protocol allowlist and sandbox/resource restrictions with media tests.
  [Debian tracking](https://security-tracker.debian.org/tracker/CVE-2026-75143).
- **libtiff CVE-2026-52490** concerns the `tiffcrop` utility, which is absent from the worker;
  Debian classifies it as a minor stable-release issue. **libxml2 CVE-2026-6653** is also a minor
  Debian issue despite the scanner's critical metadata. Neither has a proven RowLens exploit
  path in this review; neither was silently suppressed from the inventory.
  [TIFF tracking](https://security-tracker.debian.org/tracker/CVE-2026-52490),
  [XML tracking](https://security-tracker.debian.org/tracker/CVE-2026-6653).
- All **10 high web matches** are located in globally installed **npm tooling**, not the RowLens
  runtime application dependency tree. They involve nine unique advisory IDs. The service starts
  Node, not npm. Removing unnecessary package-manager tooling from the runtime image is a
  useful reviewed hardening option; package presence alone does not prove a public HTTP exploit.

### P1: shared Docker maintenance is behind upstream security releases

Docker **29.2.1** is older than releases containing subsequent security fixes. The read-only
APT simulation also lists Docker/containerd and other host updates; `linux-image-virtual` is
held back. Its cache dates from November 5–6; no `apt update`, upgrade, removal or restart ran.
Review [Docker's current security release notes](https://docs.docker.com/engine/release-notes/29/)
and plan shared-service maintenance with explicit approval and rollback/availability checks.

The installed runc 1.3.4 falls inside a later advisory's version range, but the maintainer explicitly
says **GHSA-xjvp-4fhw-gc47 is not exploitable through Docker**. Do not misreport that particular
match as an established Docker container escape.
[Maintainer advisory](https://github.com/opencontainers/runc/security/advisories/GHSA-xjvp-4fhw-gc47).
The installed OpenSSH **1:9.6p1-3ubuntu13.20** matches the Noble fix in
[USN-8928-1](https://ubuntu.com/security/notices/USN-8928-1); a generic upstream version string
alone would have produced a misleading SSH warning.

### P2: application dependencies contain two moderate advisories

`glob 13.0.6` and `minimatch 10.2.6` are transitive dependencies of `@fastify/static`. RowLens
uses `wildcard: true`; the plugin's affected glob-expansion path is in the alternative branch,
and no user-supplied glob patterns or AbortSignals were found. No direct public exploit path was
confirmed. Keep these in a separately approved dependency update instead of merging a bot PR.
[Glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Current-kernel critical advisory inventory

| Advisory | Affected area from upstream record |
|---|---|
| [CVE-2026-63825](https://ubuntu.com/security/CVE-2026-63825) | gcov: use atomic counter updates to fix concurrent access crashes |
| [CVE-2026-64523](https://ubuntu.com/security/CVE-2026-64523) | net/handshake: Take a long-lived file reference at submit |
| [CVE-2026-68426](https://ubuntu.com/security/CVE-2026-68426) | xfrm: fix stale skb->prev after async crypto steals a GSO segment |
| [CVE-2026-89530](https://ubuntu.com/security/CVE-2026-89530) | svcrdma: Reject inline replies that overflow the pull-up buffer |
| [CVE-2026-89652](https://ubuntu.com/security/CVE-2026-89652) | ceph: bound copied dentry name length in NFS export get_name |
| [CVE-2026-89659](https://ubuntu.com/security/CVE-2026-89659) | NFSD: Prevent client use-after-free during delegation revoke |
| [CVE-2026-89708](https://ubuntu.com/security/CVE-2026-89708) | nfsd: RCU-protect cl_cb_session to fix use-after-free on session teardown |
| [CVE-2026-90037](https://ubuntu.com/security/CVE-2026-90037) | NFSD: Prevent client use-after-free during close_lru reaping |
| [CVE-2026-90162](https://ubuntu.com/security/CVE-2026-90162) | ksmbd: defer publishing granted locks to prevent UAF/double-free race |
| [CVE-2026-93221](https://ubuntu.com/security/CVE-2026-93221) | nfsd: convert nfsd_net boolean flags to unsigned long flags word |
| [CVE-2026-98365](https://ubuntu.com/security/CVE-2026-98365) | RDMA/rxe: Fix integer overflow in mr_check_range() leading to OOB access |
| [CVE-2026-98432](https://ubuntu.com/security/CVE-2026-98432) | ipv4: free inet_opt and ireq_opt after an RCU grace period |
| [CVE-2026-98621](https://ubuntu.com/security/CVE-2026-98621) | net: gue: reject invalid REMCSUM offsets |
| [CVE-2026-98725](https://ubuntu.com/security/CVE-2026-98725) | nvmet-auth: fix out-of-bounds write in nvmet_auth_challenge() |
| [CVE-2026-98805](https://ubuntu.com/security/CVE-2026-98805) | tipc: prevent GCM nonce reuse on peer key changes |

## Limits and next action

This is a provenance, package/advisory, exposure and configuration review, not a penetration test
or incident-response investigation. It does not prove that every vulnerability is reachable, that
an exploit occurred, or that no compromise exists. Other apps were checked for unchanged identity
and public health, not fully audited internally. No live exploit or actual email/signup test ran.

Prioritise the confirmed kernel advisory and shared-maintenance plan with Ewout. Any firewall,
Docker/host/package update or reboot requires showing the exact commands/diff and obtaining the
separate approval required by AGENTS.md. Any application/image patch is our own reviewed PR with
regression and isolation tests; do not automatically accept external/bot proposals.
