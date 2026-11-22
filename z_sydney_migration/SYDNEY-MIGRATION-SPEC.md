# Move Supabase to Sydney — spec

**Status:** MOVED 2026-11-22. Live site + this PC use the Sydney project `peqhxkesukmizvtsvweo` (`ap-southeast-2`), Vercel functions `syd1`. Old Singapore project `xivrjteialwqmleahkfq` kept as the fallback, to be paused, then deleted after ~1 week. See "Move log" at the end.

## Why

Every Supabase call takes ~240 ms (measured 2026-10-26). The app is DB-latency bound,
not compute bound (a cabinet resolve is ~1 ms; its DB round trips are seconds), so this
is the biggest remaining speed-up for the WHOLE app — page loads, cabinet saves, the
optimiser drill sync (147 cabinets ≈ 28 s), everything. Adelaide → Singapore is the
problem; Adelaide → Sydney is a few tens of ms.

## Current state (checked 2026-10-26)

| Item | Value |
| --- | --- |
| Project | `RHK-CADcam`, ref `xivrjteialwqmleahkfq` |
| Region | `ap-southeast-1` (Singapore) — target `ap-southeast-2` (Sydney) |
| Postgres | 17.6 |
| Database size | 35 MB |
| Auth users | 8 (incl. automation account `automation@rhk.local`) |
| Storage | 5 public buckets, 13 files, < 1 MB: `company-assets` (0), `fixture-models` (3), `hinge-models` (3), `accessory-models` (4), `slide-models` (3) |
| Edge functions | none |
| Extensions | plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault |
| App config | only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (all code reads env — no hardcoded ref in `src/`/`app/`) |
| Vercel | functions ran in the default `iad1` (Washington DC) until 2026-11-21 (confirmed: auth log caller IPs were AWS us-east; main menu 3.3–4.2 s to first byte). **Interim: `vercel.json` `regions: ["sin1"]`** — next to the Singapore database. Change to `syd1` at the switch (step 8). |

**Re-check 2026-11-22** (Mark asked what's needed to start): database 69 MB, 125 public
tables, 8 auth users, storage now **232 files / 149 MB in 7 buckets** — `benchtop-textures`
178, `share-3d` 33, `slide-models` 6, `ai-uploads` 5, `accessory-models` 4,
`fixture-models` 3, `hinge-models` 3 — so step 6 is a scripted copy, not by hand, and
the stored-URL count below must be redone (stone photos, share links).
**Free plan** (Mark): 2 running projects max, so the Resident Hero CRM project is paused
for the hour (paused projects don't count; one-click restore for 90 days). No
"restore to a new project" on free → dump + restore (step 3 before the day is moot).
Phones: offline queues must be sent before the freeze; Take offline copies re-saved after.
Shared 3D links (`share-3d`) carry the old address → check whether they can be kept.
Do the SynologyDrive backup first (same tools + password; its test restore is a rehearsal).

**Prep done 2026-11-22:**
- Tools: EDB's PostgreSQL installer / zip downloads return 403 from this PC, so `pg_dump` /
  `pg_restore` / `psql` **18.6** come from pgAdmin 4 (winget `PostgreSQL.pgAdmin`):
  `%LOCALAPPDATA%\Programs\pgAdmin 4\runtime\`. No Docker / Supabase CLI — use these directly.
- Connection (free plan = no IPv4 direct host): **session pooler**
  `aws-1-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.xivrjteialwqmleahkfq`,
  `sslmode=require` (`aws-0-…` answers "tenant not found"). Password: `.db-password.txt`
  in the repo root (git-ignored, Mark reset it 2026-11-22) → `PGPASSWORD`, never echoed.
- **First full backup** in `C:\Users\mark\SynologyDrive\RHK-CADcam Backups\2026-11-22\`:
  `rhk-cadcam-full.dump` (`pg_dump -Fc --no-owner`, 8.5 MB, 125 public + 27 auth + 10 storage
  tables of data, 201 policies, 29 functions), `roles.sql`, `storage\<bucket>\…` (all 232
  files, 148.7 MB, sizes checked against `storage.objects`), `storage-objects.tsv`.
- Old ref inside the data (rows per table, from the dump): `cabinet_instances` **492**,
  `internal_parts` **134** (inside jsonb), `room_fixtures` 16, `hardware_slides` 6,
  `ai_batches` 5, `hardware_accessories` 4, `fixture_catalog` 3, `hardware_hinges` 1,
  `hardware_hinge_plates` 1 — so step 5 is a sweep of every text / jsonb column, not the
  short table below.
- Shared 3D links are safe: `/share/3d/<room>/<token>` is on the app's own domain and builds
  the file address from `NEXT_PUBLIC_SUPABASE_URL`, so they work once `share-3d` is
  re-uploaded at the same paths.
- Still to do after the move: nightly scheduled backup + retention (connection changes).

### Gotcha: stored URLs carry the old project ref

21 rows store FULL public storage URLs
(`https://xivrjteialwqmleahkfq.supabase.co/storage/v1/object/public/...`):

| Table | Column(s) | Rows |
| --- | --- | --- |
| fixture_catalog | model_url | 2 |
| room_fixtures | model_url | 10 |
| hardware_accessories | model_url | 4 |
| hardware_hinge_plates | model_plate_url | 1 |
| hardware_hinges | model_combined_url, model_cup_url | 1 |
| hardware_slides | model_url | 3 |
| materials.texture_path, shop_settings.company_logo_url | — | 0 today |

After the move these must be rewritten to the new ref (step 5), or the 3D models 404.
Re-run the count first — new uploads may have added rows. (Future-proofing idea, not
required: store bucket paths, build the URL from env.)

## Locked decisions

- **New project + copy.** Supabase cannot change a project's region in place
  (docs: "Change Project Region" → create a new project and migrate).
- **Same organisation, same plan**, region **Sydney (ap-southeast-2)**.
- **Move Vercel functions to Sydney (`syd1`) at the same time** — server-rendered
  pages (e.g. the optimiser's `page.tsx` loads) otherwise still cross the Pacific.
- **Old project paused, not deleted**, for ~1 week as a fallback.
- **Edit freeze** from the dump to the env switch — nothing edited in that window
  survives (it lands in Singapore).

## Plan

**Before the day**
1. Pick a quiet time (~1 hour). Tell users: no editing during the window; everyone
   logs in again afterwards (new project = new JWT secret / keys).
2. Install tools on the PC: Supabase CLI (`npm i -g supabase` or scoop) — this PC has
   no `pg_dump`/`psql`/CLI today. CLI `db dump` needs Docker Desktop; if that's a
   hassle, install the PostgreSQL 17 client tools instead and use `pg_dump` directly.
3. Check the plan: if paid with physical backups, Dashboard → Backups → **Restore to a
   new project** may do steps 4–5 in one go — use it if it offers Sydney.
4. Note dashboard-only settings to copy by hand: Auth → URL configuration (site URL,
   redirect URLs), email templates / SMTP, any auth providers, API settings
   (max rows = 1000 default — the app now pages past it), database password.
5. Check whether anything else talks to this project (e.g. the rhk-crm side) — it
   would need its keys updated too.

**On the day**
1. **Create** the Sydney project (Claude can do this via the Supabase MCP once Mark
   confirms the cost). Save the DB password.
2. **Freeze** — users out; optionally set the old DB read-only
   (`alter database postgres set default_transaction_read_only = true`).
3. **Dump** the old project (Supabase CLI, per the "Backup and restore using the CLI"
   guide): `roles.sql`, `schema.sql`, `data.sql` (`--use-copy --data-only`). The data
   dump includes `auth` (users, so logins keep their passwords) and storage metadata.
4. **Restore** into the new project (`psql` with the session-pooler connection string,
   `session_replication_role = replica` for the data file so triggers/FKs don't fire
   mid-load). Check the restore log — only extension "already exists" noise is OK.
5. **Rewrite stored URLs**: `update <table> set <col> = replace(<col>,
   'xivrjteialwqmleahkfq.supabase.co', '<newref>.supabase.co')` for every row in the
   gotcha table above (+ a final `ilike '%xivrjteialwqmleahkfq%'` sweep across all text
   / jsonb columns).
6. **Storage files**: storage metadata comes over in the dump, but NOT the files.
   Re-upload the 13 objects to the same bucket + path (small script with the service
   key, or by hand in the dashboard). Buckets must exist and stay public.
7. **Verify the copy**: row counts per table match the old project
   (`pg_stat_user_tables` after `vacuum analyze`), RLS enabled on every table that had
   it (see `access-control` notes — roles admin/tester, no anon), policies present,
   RPCs present (`persist_resolved_cabinet` etc.).
8. **Switch**: update `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   `.env.local` (Claude) and Vercel env vars (Mark), change `vercel.json` `regions` from
   `sin1` to `syd1` (Claude), redeploy.
9. **Smoke test**: log in (Mark + automation account), open RHK6581 Lee Smith, open a
   cabinet editor + save, room 3D (fixture / hinge models load), optimiser
   nest + drilling + G-code. Re-measure a call (target: tens of ms vs 240 ms).
10. **Repoint tooling**: Supabase MCP project ref, any `z_plan_automation` scripts
    (they read `.env.local`, so nothing to change there), memory notes that name the
    old ref.
11. **Pause** the Singapore project. Delete after ~1 week with no issues.

**Rollback**: put the old URL + key back in Vercel/`.env.local`, redeploy, un-freeze the
old DB (`... set default_transaction_read_only = false`). Anything edited in the new
project after the switch would be lost — so decide within the first hour.

## Progress

- [ ] Before-the-day checks (tools, plan, dashboard settings, other clients)
- [ ] Migration day (steps 1–11)
- [ ] Old project deleted

## Move log (2026-11-22)

- Free plan: CRM paused by Mark; Sydney project created via MCP ($0). Its DB password is in `.db-password-sydney.txt` (git-ignored); pooler `aws-0-ap-southeast-2.pooler.supabase.com:5432`, user `postgres.peqhxkesukmizvtsvweo`.
- How it was copied (scripts + logs in `C:Toolshk-move`, dumps also in the SynologyDrive backup `2026-11-22move`): `pg_dump --schema-only --no-owner -n public -n sanding -n supabase_migrations` → psql (13 expected errors: schema public exists, supabase_admin default privileges); data: `auth.users`, `auth.identities`, `storage.buckets` + the three schemas, `--data-only`, loaded with `session_replication_role = replica` in one transaction; the 24 `storage.objects` + 2 `realtime.messages` policies and `supabase_realtime` ← `public.ai_batches` re-created by hand (they live outside the dumped schemas); `storage.objects` rows NOT copied — the 232 files were downloaded from old and uploaded to new through the API as the automation admin (md5 checked against the eTag).
- Checked before the switch: 138 tables, identical counts and md5 of every row (`compare.sh`); policies / functions / triggers / indexes / grants identical; old ref rewritten in 9 columns (662 rows, generic sweep of text + json columns, `rewrite-urls.sh`), none left; API as automation returns the same counts; one call 57 ms vs 197 ms.
- **Gotchas hit:** (1) a 49 MB plain dump written straight into the SynologyDrive folder came out with blocks of NUL bytes — dump to a local folder, verify, then copy. (2) `pg_dump -t` makes `-n` a no-op — schema and single-table dumps must be separate runs. (3) Vercel: a "Secret" env var named `NEXT_PUBLIC_*` can't be switched to Config — delete and re-add. (4) The anon key shown in chat was masked on Mark's screen, so dots were pasted into Vercel — hand keys over in a file (`vercel-values.txt`) or have him copy from the Supabase dashboard.
- `sanding` schema (9 tables, Mark's old sanding project, unused) was copied across; nothing else reads this database.
- Old settings for rollback: `.env.local.singapore`.
