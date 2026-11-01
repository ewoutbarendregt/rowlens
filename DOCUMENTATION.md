# DOCUMENTATION

Agent work log, newest first.

## 2026-11-01 — Confirmations in the page instead of browser popups

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/ui/ConfirmInline.tsx, src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/sessions/SessionPage.tsx, src/client/styles.css, e2e/{drawing,upload}.spec.ts, BUILD.md
**Summary**: Ewout (screenshot of the browser's "localhost:5174 says" dialog, in English): the confirmation must be in the page. All three `window.confirm`s (whole note, drawing, video) now ask inline where they were clicked, NL/EN. E2E fails on any browser dialog and checks that Cancel deletes nothing.
**Prompts used**: "deze confirmatie moet niet als popup gebeuren, maar in de pagina zelf".

## 2026-11-01 — Video display name: [session]-[#]-[start]-[length]

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/db/{schema.ts,migrations/0005_video_seq_recorded_at.sql}, src/server/api/{uploads,sessions,videos}.ts (+ upload db test), src/client/sessions/{displayName.ts,displayName.test.ts,SessionPage.tsx,VideoPage.tsx}, worker/src/rowlens_worker/video/{probe,process}.py, worker/tests/test_probe.py, e2e/{helpers,upload.spec}.ts, BUILD.md
**Summary**: Ewout wants videos named `[sessienaam]-[#]-[tijdstip start]-[lengte]`. A read-only look at his iPhone uploads showed two times in the file: `creation_time` = when it was sent (18:08 the next day), Apple's creationdate = filming start (09:48); the worker now stores the latter as `recorded_at`. Videos get a fixed number per session. Checked locally: `Zaterdag CX4+-2-09:48-0:07`.
**Prompts used**: "de displaynaam van de video moet worden [sessienaam]-[#]-[tijdstip start]-[lengte]".

## 2026-11-01 — Delete a whole note: every drawing and remark at a frame (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/api/annotations.ts (+ db tests), src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/styles.css, e2e/drawing.spec.ts, BUILD.md
**Summary**: Ewout: a whole note must be deletable with all its drawings and remarks. New `DELETE /api/videos/:id/frames/:frame/annotations` (one transaction, only that frame of that video, RLS; other clubs 404) and a red "Notitie verwijderen" button with a confirmation in each section. Tests: only the frame's items go, other frames and videos stay, other clubs can't; E2E deletes a whole note and checks after a reload.
**Prompts used**: "je moet de hele notitie kunnen verwijderen met alle tekeningen en opmerkingen".

## 2026-11-01 — Frame sections: click to jump and select, explanation always open (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{notes,drawing}.spec.ts, BUILD.md
**Summary**: Ewout's feedback on the local build: clicking a frame's section should jump there and show it selected; the drawing labels were too big; the explanation field should always be open. Done: whole section clickable (seek without scrolling the page away on a phone), selected = the frame on screen, smaller chips, an open field per section (edit in place, empty + save removes), the name as its own field. Checked locally on laptop and iPhone; E2E covers click-to-select and the open field (5× without a flake).
**Prompts used**: "als ik in de sectie van een frame klik, dan moet de video direct naar het bijbehorende moment springen en moet de selectie 'selected' zijn. de aanduidingen van de tekenelementen zijn wel groot en het tekstveld voor de uitleg moet gewoon altijd beschikbaar zijn, niet achter een button".

## 2026-11-01 — Deploy script: a first deploy can no longer skip migrations (BUG-009)

**Session**: claude/fix/deploy-migrate-detect
**Changed**: infra/deploy/rowlens-deploy, infra/deploy/test/{run.sh,stub/docker}, BUGS.md, TEST.md
**Summary**: CI's rehearsal on #97 failed: the first deploy skipped the migrations because `compose config` ran without ROWLENS_TAG (no release.env yet), newer Compose refused, and the suppressed error read as "no migrate service". Now the tag is passed and a config failure stops the deploy. Stub suite 77 passed (2 of the new checks fail on the old script); rehearsal passed. Production unaffected so far (release.env exists there); the server's copy of the script is updated with install.sh at the next approved deploy.
**Prompts used**: none (found by CI while working on #97).
## 2026-11-01 — One entry per frame: drawings and their explanation together (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/notes/{NotesPanel.tsx,moments.ts,moments.test.ts,strings.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{drawing,notes}.spec.ts, BUILD.md
**Summary**: Ewout, trying drawing locally: several drawings on one frame should be one note, with room for an explanation. The list now groups per frame: drawings as chips with their own ×, the explanation (added with "Uitleg toevoegen" or edited in the entry), one marker per frame. Data model unchanged. Checked locally on laptop and iPhone sizes; E2E covers two drawings + explanation = one entry.
**Prompts used**: "als er in 1 frame meerdere figuren zijn getekend, moet dat maar 1 note opleveren. in de note moet je dan ook extra uitleg kunnen geven".

## 2026-11-01 — Drawing lines, arrows and angles at a frame (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/api/annotations.ts (+ db test), src/client/drawing/{geometry.ts,geometry.test.ts,DrawingLayer.tsx,DrawTools.tsx}, src/client/notes/{NotesPanel.tsx,name.ts,strings.ts}, src/client/player/Player.tsx (overlay), src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/drawing.spec.ts, BUILD.md, TEST.md
**Summary**: PR 7 of the upload plan, built and tried on the local stack. Line, arrow and angle (degrees in picture pixels, with an arc) drawn by taps on a paused frame, stored as picture fractions, rendered in an SVG that scales like the video so they stay on the picture at any size. Trying it on an iPhone-sized WebKit showed the tools were too far from the picture (below the notes): they moved into the player's toolbar, and choosing one scrolls the picture into view.
**Prompts used**: "Yes, start PR 7"; "Yes, PR 7 locally".

## 2026-11-01 — Local development stack: iterate on the laptop

**Session**: claude/chore/local-dev
**Changed**: infra/compose/docker-compose.dev.yml (worker, port 5434), apps/web/{vite.config.ts,.env.example}, apps/web/src/server/{config.ts,config.test.ts} (API_PORT wins), package.json (dev:up, dev, dev:down), .claude/launch.json, CLAUDE.md, BUILD.md
**Summary**: Ewout wants to iterate locally and deploy later. The whole app now runs on the laptop: Postgres and the worker in Docker, the web app with hot reload on :5174 (his RowLens port; trustable.nl's local stack keeps 5173/5433). Verified the full flow locally (code → session → portrait upload → worker 0.9 s → player with notes). Found on the way: the preview pane sets PORT for the process, so the server took the front end's port; API_PORT now wins. The old RowLens preview server on 5174 (demo era) was stopped and replaced.
**Prompts used**: "ik wil graag itereren op mijn local machine, pas later deployen we weer"; "5147 is toch de rowlens demo".

## 2026-11-01 — Laptop layout for portrait video; 30 fps for phone clips on a 600 Hz grid

**Session**: claude/fix/laptop-portrait-layout
**Changed**: apps/web/src/client/{styles.css,player/Player.tsx,sessions/VideoPage.tsx}, worker/src/rowlens_worker/video/probe.py, worker/tests/test_probe.py, docs/adr/0007, BUGS.md, BUILD.md, TEST.md
**Summary**: Ewout's laptop screenshot: a portrait video as a narrow strip with controls stretched below, in a low window (~540 px), and "31.58 fps". Portrait video now gets three zones on laptops (video tall left, controls beside, notes right); the quality switch moved into the player; softer slider focus. The worker now prefers a common average rate (the clip was 29.99 on average but r_frame_rate 600/19, so 5 % of its frames were duplicates). Checked at 1000×540, 1440×860, 1920×1000 and iPhone.
**Prompts used**: "this does not look good on the laptop" (with screenshot).

## 2026-11-01 — iPhone portrait video fixed; side-by-side video page on laptops

**Session**: claude/fix/ios-player-half
**Changed**: apps/web/src/client/styles.css, src/client/player/{Player.tsx,usePlayer.ts}, src/client/sessions/VideoPage.tsx, src/server/media/store.test.ts, BUGS.md, BUILD.md, TEST.md
**Summary**: Ewout saw only the top half of the picture on his iPhone: Safari ignored `height: 100%` inside the aspect-ratio stage, so portrait video overflowed and was clipped (BUG-005; reproduced in WebKit). The stage now takes the video's shape with a height cap, the video is positioned inside it. His second request: on a laptop the notes needed scrolling; the video page is now two columns from 1000 px (sticky player, scrolling notes). PR 7 (drawing) is parked on its branch meanwhile. Also fixed a flaky store test (BUG-006).
**Prompts used**: "ik zie op de iphone niet het hele beeld, alleen de bovenste helft"; "also on the laptop, the controls and the comments are not visible on the same pageview, i have to scroll down to see the comments. can we have a bit of ux design around this".

## 2026-11-01 — Notes pinned to a frame (#59); lost frame steps fixed (BUG-004)

**Session**: claude/feat/59-frame-notes
**Changed**: apps/web/src/server/db/{schema.ts,migrations/0004_annotations.sql}, src/server/api/annotations.ts (+ db test), src/server/app.ts, src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/player/{Player.tsx,usePlayer.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{notes.spec.ts,helpers.ts,player.spec.ts}, docs/adr/0007, docs/privacy/processors.md, BUILD.md, TEST.md, BUGS.md
**Summary**: PR 6 of the upload plan: an `annotation` table (notes now, drawings next) with RLS and a same-club key; notes API; notes panel with markers on the scrub bar, jump, edit, delete, remembered name. The new E2E exposed a real player bug: quick frame steps were lost when a stale `seeked` cleared the pending target (fixed, with a regression test that fails 12/12 on the old code). Drizzle-kit ordered the new FK before its unique key; reordered by hand.
**Prompts used**: "Yes, start PR 6".

## 2026-11-01 — Smaller renditions: no near-duplicates, bitrate capped to the source (#47)

**Session**: claude/fix/47-rendition-size
**Changed**: worker/src/rowlens_worker/video/{probe,transcode}.py, worker/tests/{test_probe,test_transcode}.py, docs/adr/0007, BUILD.md, TEST.md, BUGS.md
**Summary**: The first real clip on production (576p, 0.76 Mbit/s, 8 MB) produced 27 MB of renditions: a near-identical play-1080 next to play-540, and uncapped CRF. Now play-1080 only from 720p up, and capped CRF (≤ 1.5× the source bitrate, ceilings scaled by frame rate). Measured in the worker image: 3.3× → 1.7× for that kind of clip; 4K60 HEVC → 0.14×.
**Prompts used**: "yes" (to fixing both findings from the production clip).

## 2026-11-01 — Player on the club's own videos (#49, #52)

**Session**: claude/feat/49-player-own-videos
**Changed**: apps/web/src/server/api/videos.ts (+ unit and db tests), src/server/app.ts, src/client/player/Player.tsx (poster, startFrame, onFrame), src/client/sessions/{VideoPage.tsx,SessionPage.tsx,strings.ts}, src/client/{App.tsx,styles.css}, apps/web/{vitest.config.ts,playwright.config.ts}, e2e/upload.spec.ts, api/uploads.db.test.ts, .github/workflows/ci.yml, docs/adr/0007, BUILD.md, TEST.md
**Summary**: PR 5 of the upload plan. Renditions and posters streamed with byte ranges behind the guard and RLS; a video page with the frame-accurate player, 540p/1080p switch at the same frame, posters in the session list. Edge E2E now runs Chrome to play H.264 and checks exact steps on the worker's output. Fixed along the way: the player overflowed phone screens (also on the demo page); db test files now run one at a time (the media-cap test raced with files adding videos).
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Worker: job queue, probe and transcode (#47, #33, #48)

**Session**: claude/feat/47-worker-transcode
**Changed**: worker/src/rowlens_worker/{__main__,config,db,errors,media,queue}.py, worker/src/rowlens_worker/video/{probe,transcode,process}.py, worker/tests/*, worker/{pyproject.toml,uv.lock,Dockerfile}, apps/web/src/server/db/{schema.ts,migrations/0003_jobs_video_metadata.sql,jobs.db.test.ts}, apps/web/src/server/api/{uploads,sessions}.ts (+ upload test), apps/web/src/client/sessions/{SessionPage.tsx,strings.ts}, apps/web/Dockerfile, apps/web/e2e/upload.spec.ts, infra/compose/docker-compose.{prod,edge}.yml, infra/deploy/test/rehearse.sh, .github/workflows/ci.yml, docs/adr/{0007,0008}, docs/privacy/processors.md, BUILD.md, TEST.md
**Summary**: PR 4 of the upload plan. Postgres job queue with a SECURITY DEFINER claim (RLS shows one club at a time), enqueued with the upload's completion. Python worker probes (fps, rotation, VFR heuristic), transcodes once into CFR H.264 play-1080/play-540 with ~0.25 s closed GOPs and strips location metadata, writes a poster, reports progress and retries with backoff. Session page shows processing and video facts. Verified in the edge stack and on a synthetic 4K60 HEVC portrait clip.
**Prompts used**: "Yes, start PR 4".

## 2026-11-01 — Sessions and resumable upload (#45, #46, #44 minimal, #50)

**Session**: claude/feat/45-upload
**Changed**: apps/web/src/server/api/{sessions,uploads,route-helpers}.ts (+ tests), src/server/media/{store,sniff}.ts (+ tests), src/server/db/schema.ts, db/migrations/0002_sessions_videos.sql, src/server/{app,config}.ts, src/server/pilot/gate.ts (configurable attempts), src/client/sessions/*, src/client/{App.tsx,pages/HomePage.tsx,pilot/strings.ts,styles.css}, e2e/{upload.spec.ts,helpers.ts,server.ts}, apps/web/{package.json,.env.example}, infra/compose/docker-compose.{prod,edge,dev}.yml, infra/deploy/test/rehearse.sh, docs/adr/{0006,0002}, docs/privacy/processors.md, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md, .gitignore
**Summary**: PR 3 of the upload plan. Sessions with videos; our own tus server checks size, type, session, the 30 GB cap (reserved at creation) and the 85 % disk pause before taking bytes, resumes from the on-disk offset and rejects non-videos by magic bytes. Phone UI with camera per file, progress, resume and delete. ADR-0006 amended: a directory instead of MinIO (no longer maintained). Screenshots on a phone viewport led to two UI fixes (progress width, no retry for refused files).
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Pilot access code (#84)

**Session**: claude/feat/84-access-code
**Changed**: apps/web/src/server/pilot/{code,token,gate,code-cli}.ts (+ tests), src/server/rate-limit.ts (+ test), src/server/api/club.ts (+ db test), src/server/db/migrations/0001_pilot_club.sql, src/server/{app,config,main}.ts (+ tests), src/client/{api.ts,pilot/*,pages/HomePage.tsx,styles.css}, e2e/{pilot.spec.ts,server.ts,env.ts,edge.spec.ts}, apps/web/{package.json,.env.example}, infra/compose/docker-compose.edge.yml, docs/runbooks/server-setup.md, BUILD.md, TEST.md
**Summary**: PR 2 of the upload plan: a shared access code opens the pilot club until login exists. Signed 30-day cookie, scrypt-hashed code, rate limits, Origin check on every state-changing request, and guarded routes that look exactly like unknown ones. NL/EN gate page with the pilot notice. Also fixed #86's CI (BUG-001): E2E now runs against a migrated Testcontainers Postgres.
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Database layer (#31): roles, migrations, withTenant, RLS tests

**Session**: claude/feat/31-database
**Changed**: apps/web/src/server/db/{schema,client,tenant,migrate,migrate-cli}.ts, db/migrations/0000_init.sql, db/test/{global-setup,fixtures}.ts, db/{tenant,schema,readiness}.db.test.ts, apps/web/src/server/{config,config.test,main}.ts, apps/web/{package.json,vitest.config.ts,tsconfig.json,tsconfig.build.json,drizzle.config.ts,.env.example}, package.json, pnpm-workspace.yaml (allowBuilds), pnpm-lock.yaml, .prettierignore, infra/compose/docker-compose.{prod,edge}.yml (migrate service, DATABASE_URL), infra/deploy/test/rehearse.sh, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: First PR of the upload + manual analysis plan Ewout approved (prod behind an access code; lines/angles, notes, stroke marking). Drizzle + pg with two roles: migrations as `rowlens_owner`, the app as `rowlens_app` (no BYPASSRLS, owns nothing), and `withTenant` setting the club per transaction. First table `club` with RLS. Tested against a real Postgres via Testcontainers, behind the Caddy mirror, and in the deploy rehearsal. Next deploy needs `ROWLENS_APP_DB_PASSWORD` on the server and the compose file reinstalled (runbook), with approval. Also created #84 (access code) and #85 (stroke marking).
**Prompts used**: "I want to start with the basic fucntionality first, the upload and manual analysis of a video"; answers: lines/arrows/angles, notes pinned to a frame, mark strokes; "Prod behind an access code"; "Ok go for it".

## 2026-11-01 — Deployed sha-94af6b0: player demo live on production

**Session**: claude/docs/deploy-player-demo-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PR #81 merged; trustable-prod: rowlens web → sha-94af6b0 (deploy run 41309728753)
**Summary**: On Ewout's request ("Deploy to prod", demo included) merged #81 after green CI, built sha-94af6b0 with the player demo, and deployed it with the public check on. The deploy took the first real pre-deploy DB dump. Verified: https://trustable.nl/projects/rowlens/demo/player serves 7 synthetic clips with range requests; in the browser over the internet the first frame was ready in 159 ms and 50/50 steps were exact (median 16 ms). trustable.nl, its API and AudioScribe still 200; disk 47 %. Development continues locally; deploys only on request.
**Prompts used**: "Deploy to prod".

## 2026-11-01 — Player demo enabled in production images

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/Dockerfile (demo-media stage, VITE_FEATURE_PLAYER_DEMO build arg), .github/workflows/{images,ci}.yml, BUILD.md, DOCUMENTATION.md
**Summary**: Ewout asked to deploy and chose to include the player demo. The image can now generate the synthetic demo clips in a build stage (no laptop files) and build the SPA with the demo flag; main's images do so. Verified locally on linux/amd64: page 200, 7 clips, range requests 206, image 143 MB. Off by default in the Dockerfile; CI keeps proving the off state has no demo code.
**Prompts used**: "Deploy to prod" → chose "Placeholder + player demo".

## 2026-11-01 — Player demo (#51 spike): frame-accurate player, demo clips, measurements

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/src/client/player/{frames,usePlayer,useHoldRepeat,strings}.ts, Player.tsx (+ frames.test.ts), apps/web/src/client/pages/{PlayerDemoPage,HomePage}.tsx, apps/web/src/client/{App.tsx,features.ts,vite-env.d.ts,styles.css}, apps/web/vite.config.ts (unreachable-chunk drop, API_PORT), apps/web/e2e/{player.spec.ts,smoke.spec.ts,tsconfig.json}, apps/web/{tsconfig.json,package.json}, scripts/demo-media/{generate.sh,Dockerfile}, package.json (demo:media), .gitignore, .dockerignore, .claude/launch.json, .github/workflows/ci.yml, docs/adr/0007-upload-transcode-playback.md, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Built the core player locally behind a build flag: 0.25/0.5/1×, ±1 frame, ±0.1/1 s with hold-to-repeat, loop in/out, fullscreen with an iPhone fallback, keyboard, and a demo page with start/step measurements on generated clips that show their frame number. Desktop results: 0 wrong frames, ~16 ms per step, loop within 2 frames, identical across GOP variants. Testing found and fixed four bugs (loop overshoot, ms-rounded timestamps, stale step target, demo code in prod bundle). Also: home page shows "v" only for semver. No deploy (local-only iteration).
**Prompts used**: "lets iterate locally first without the deployments to the server"; "Player demo first".

## 2026-11-01 — RowLens public at trustable.nl/projects/rowlens; no staging environment (#24, #26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, scripts/github/backlog.toml (staging story removed), .github/workflows/deploy.yml (input text), FEATURES.md, DOCUMENTATION.md; GitHub: trustable.nl#377 merged into develop, release trustable.nl#378 (v0.19.1) merged into main; rowlens issues #24, #26 closed, #27 closed as not planned
**Summary**: Released the Caddy route through trustable.nl's pipeline (develop → its staging deploy → main → its prod deploy). https://trustable.nl/projects/rowlens/ now serves RowLens sha-1acc1a2; trustable.nl, its API and AudioScribe verified 200, RowLens containers unaffected by trustable's redeploy. trustable's ci-regression check fails on every release since May (Playwright can't install Chromium on the ubuntu 26.04 runner) and was not a blocker. Ewout pointed out that the trustable staging redeploy wasn't asked for: RowLens has **no staging** — local dev and prod only; staging plans removed.
**Prompts used**: "Yes, release it"; "why are we deploying to staging, i did not ask for that. we will have a local dev version and prod on trustable.nl only".

## 2026-11-01 — First production deploy (sha-1acc1a2) and stack merged to main (#26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PRs #67–#71 merged into main (merge commits), issues #23 and #25 closed; on trustable-prod: Compose project `rowlens` (web + db), volume rowlens_db_data, network rowlens_internal, rowlens-web attached to trustable_proxy, /opt/rowlens/state/{current-tag,release.env}
**Summary**: Merged the stacked PRs in order. Deleting #67's branch made GitHub close #68 rather than retarget it; restored the branch, reopened #68 and merged the rest by retargeting each to main first (lesson: in a stack, retarget before merging and delete branches only at the end). The images workflow pushed sha-1acc1a2, and the deploy workflow (public check off, since trustable.nl#377 isn't merged) brought up web + db: healthy, reachable from trustable's Caddy via the `rowlens-web` alias, no registry credentials left, trustable containers untouched. Open: release-please can't create PRs (repo setting), merged branches not yet deleted, Dependabot #72/#73 propose Node 26 / Python 3.15 against our pins.
**Prompts used**: "Yes, merge them"; "It's green, merge"; "Approve #26".

## 2026-11-01 — install.sh run on trustable-prod: deploy script installed, CI key restricted (#25)

**Session**: claude/feat/25-manual-deploy
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens/bin/rowlens-deploy, /opt/rowlens/docker-compose.yml, /opt/rowlens/state/, the gh-actions-rowlens line in /home/deploy/.ssh/authorized_keys (backup authorized_keys.bak-20261101T115732Z)
**Summary**: Ran the approved infra/deploy/install.sh. Installed files match the repo by sha256; the CI key now only runs rowlens-deploy (verified: status allowed; arbitrary/chained commands, shell, invalid tag and port forwarding refused). Other keys, /opt/trustable and all trustable containers unchanged. No RowLens containers yet.
**Prompts used**: "Approve install.sh".

## 2026-11-01 — #25 Manual deploy: images on main, workflow_dispatch deploy, server script with rollback

**Session**: claude/feat/25-manual-deploy (stacked on claude/docs/23-server-setup-runbook)
**Changed**: .github/workflows/{images,deploy,ci}.yml, infra/deploy/{rowlens-deploy,install.sh,known_hosts}, infra/deploy/test/{run.sh,rehearse.sh,stub/docker}, infra/compose/docker-compose.prod.yml (now web + db), apps/web/Dockerfile (APP_VERSION build arg), docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: Merges to main now build and push sha-tagged images; deploying is a manual, owner-only workflow that SSHes with the CI key into a forced-command script (`rowlens-deploy`) on the server, which pulls with the run's short-lived token, backs up the DB, migrates, starts, checks that web runs the new tag and is ready, and rolls back otherwise. Covered by 71 stubbed checks, a mutation check and a real-Docker rehearsal, all in CI. Nothing installed on the server yet (install.sh needs approval).
**Prompts used**: "Build #25 deploy".

## 2026-11-01 — /opt/rowlens and .env created on trustable-prod (#23)

**Session**: claude/docs/23-server-setup-runbook
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens (created by Ewout with su), /opt/rowlens/{media,.docker}/, /opt/rowlens/.env
**Summary**: Ewout created /opt/rowlens as root via `su` (no sudo for deploy, no root SSH). I added media/ and .docker/ and generated .env on the server (password never printed). /opt/trustable untouched, disk unchanged at 46 %. Still pending: merging trustable.nl#377. Ewout has since set the ROWLENS_SSH_PRIVATE_KEY secret.
**Prompts used**: "i have the password for root, not deploy"; the user's pasted `su -c 'install -d …'` session output.

## 2026-11-01 — Server setup started: deploy key installed, Caddy route PR opened (#23, #24)

**Session**: claude/docs/23-server-setup-runbook (stacked on claude/test/22-local-edge-stack)
**Changed**: docs/runbooks/server-setup.md (new), BUILD.md, DOCUMENTATION.md; on trustable-prod: /home/deploy/.ssh/authorized_keys (+1 key `gh-actions-rowlens`, backup authorized_keys.bak-20261101-rowlens); local: ~/.ssh/rowlens_deploy{,.pub}; trustable.nl repo: PR #377 (Caddyfile, VERSION 0.19.1, DOCUMENTATION.md)
**Summary**: Executed the approved shared-component changes. The new CI deploy key is installed and verified, existing keys and all trustable containers unaffected. The Caddy route PR is open against trustable.nl develop and not merged. Not done: /opt/rowlens (needs sudo, which deploy can't use without a password), the GitHub secret (the agent may not write secret stores), and .env; the commands for Ewout are in the runbook.
**Prompts used**: "Approve both" (approval of #23 and #24 exactly as shown).

## 2026-11-01 — Local edge stack: RowLens behind a Caddy mirroring trustable.nl (#22, partial)

**Session**: claude/test/22-local-edge-stack (stacked on claude/feat/19-web-app-skeleton)
**Changed**: infra/caddy/{rowlens.caddy,edge.Caddyfile,standin.Caddyfile}, infra/compose/docker-compose.edge.yml, apps/web/e2e/{edge.spec.ts,env.ts,smoke.spec.ts}, apps/web/playwright.config.ts, apps/web/package.json, package.json, .github/workflows/ci.yml, docs/adr/0003-base-path.md, BUILD.md, CLAUDE.md, TEST.md, scripts/github/backlog.toml (#46)
**Summary**: Added a local stack where rowlens-web runs behind a copy of trustable.nl's Caddyfile that imports the exact route proposed in #24, with stand-ins for AudioScribe and the trustable.nl site, plus Playwright edge tests and a CI job. Found that Caddy's body limit is only a backstop and that trustable.nl's Permissions-Policy blocks the microphone for RowLens; both recorded in ADR-0003.
**Prompts used**: "can I test locally before deploying to prod?" → "Yes, add it" (a local Caddy stack that mirrors the prod route).

## 2026-11-01 — #19 Web app skeleton: Fastify + React SPA under the base path

**Session**: claude/feat/19-web-app-skeleton (stacked on claude/chore/17-phase-0-foundation)
**Changed**: apps/web/src/server/{app,config,health,main}.ts (+ tests), apps/web/src/client/** (React SPA), apps/web/src/shared/base-path.ts (moved from src/config), apps/web/{index.html,vite.config.ts,playwright.config.ts,e2e/smoke.spec.ts,tsconfig*.json,src/client/tsconfig.json,Dockerfile,package.json,public/favicon.svg}, eslint.config.js, .github/workflows/ci.yml, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Replaced the placeholder HTTP server with the real web tier: Fastify serving health/readiness, a JSON API 404, strict CSP and the Vite-built React SPA with fallback, all under BASE_PATH, with a build-time base path checked at startup. Added Playwright smoke tests (desktop + mobile Chromium) to CI; they caught a non-canonical home link, fixed via a trailing-slash router basename.
**Prompts used**: "Yes, start sprint 1" (sprint plan in docs/phase-0/summary.md; first item #19).

## 2026-11-01 — Phase 0 decisions recorded

**Session**: claude/chore/17-phase-0-foundation
**Changed**: docs/adr/0002, 0003, 0004, 0006, 0010, 0011, docs/adr/README.md, docs/phase-0/summary.md, docs/privacy/processors.md, BUILD.md, CLAUDE.md, infra/compose/docker-compose.prod.yml, scripts/github/backlog.toml; GitHub issues #2, #18, #25, #27, #30, #32, #35, #36, #37, #46, #64
**Summary**: Recorded Ewout's Phase 0 decisions: MinIO on local disk with a 30 GB hard media cap and uploads paused at 85 % disk; no video backup during the pilot; sender rowlens@trustable.nl via Resend; subpath now, own host before club 2; logs only (no error tracker); no branch protection (free private plan), so deploys become a manual workflow_dispatch; LLM provider deferred to M2. ADR-0006 accepted; backlog and issues synced.
**Prompts used**: Answers to structured decision questions in the session (storage "Local disk for now", backups "No video backup yet", sender "rowlens@trustable.nl", origin "Subpath now, move before club 2", media cap "30 GB", errors "Logs only for now", GitHub "No protection, by convention", LLM "Defer to M2").

## 2026-11-01 — Phase 0: server inspection, ADRs, repo scaffold, CI, backlog

**Session**: claude/chore/17-phase-0-foundation
**Changed**: CLAUDE.md, README.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/phase-0/server-inspection.md, docs/phase-0/summary.md, docs/adr/0000–0011, docs/analysis/perspective-rules.md, docs/privacy/processors.md, apps/web/** (base-path module, placeholder server, tests, Dockerfile), worker/** (pyproject, stroke_rate metric, tests, Dockerfile), infra/compose/docker-compose.{dev,prod}.yml, .github/** (CI, release, templates, dependabot), scripts/github/** (backlog bootstrap), root tooling config
**Summary**: Base path is `/projects/rowlens` (changed from the kick-off prompt's `/projects/rowing` at Ewout's request mid-session). Read-only inspection of trustable-prod and the AudioScribe/trustable deploy setup; proposed architecture in 10 ADRs; scaffolded the monorepo with a tested base-path module and a first analysis metric so CI has real targets; created labels, milestones and the M0/M1 backlog (M2/M3 as epics) on GitHub. Nothing deployed; no server changes.
**Prompts used**: the RowLens kick-off prompt (Phase 0 section: "1. Read-only inspection of the server and the AudioScribe deployment … 5. Present a short summary: findings, decisions needing my input, risks, and the proposed first sprint.") pasted as the opening message of the session; mid-session: "contrary to the original prompt, do not use trustable.nl/projects/rowing but trustable.nl/projects/rowlens".
