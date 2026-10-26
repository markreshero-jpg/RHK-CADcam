# Move Supabase to Sydney — spec

**Status:** planned, not started (written 2026-10-26). Mark: "we'll do it later".

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
| Vercel | no `vercel.json` → functions probably run in the default `iad1` (Washington DC) — check |

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
   `.env.local` (Claude) and Vercel env vars (Mark), set Vercel → Settings → Functions
   → Region = `syd1`, redeploy.
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
