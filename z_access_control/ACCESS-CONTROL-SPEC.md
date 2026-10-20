# Access control — admin vs tester

Status: **Phase 1 + 2 done 2026-10-13; Phase 3 (online presence) built 2026-10-20.** Phase 1 = roles + RLS (migration
`access_control_roles`); Phase 2 = Settings → Users tab (migration
`access_control_users_admin`). Both applied to the live project; app code in the
working tree.

## Why

Every table had `anon` (and `authenticated`) "allow everything" policies. The anon
key ships in the browser bundle, so the login screen only gated the UI: anyone with
the URL could read/write the whole database. We needed a tester login that sees one
test job and can't touch the library or other jobs.

## Locked decisions

1. **No anonymous access.** No `anon` policies anywhere in `public`. Never re-add
   them (automation signs in instead — see below).
2. **Roles** live in `public.user_roles (user_id, role)`: `admin` | `tester`. A login
   with no row is treated as a tester with no jobs. All logins existing on
   2026-10-13 were made admins.
3. **Job access** for testers: `public.project_access (user_id, project_id)`.
   Admins see every job.
4. **Job data** (everything reachable from a project) — policy `job_access`:
   `(select is_admin()) or can_access_<parent>(fk)`. Helper functions
   (SECURITY DEFINER, `search_path=''`) walk the chain:
   project ← room ← cabinet / benchtop ← joint instance; project ← nest job.
5. **Projects**: testers select/update their assigned job; only admins insert or
   delete projects.
6. **Library / shop settings** (everything else) — `library_read` for any login,
   `admin_write` for admins. Testers can use the library in their job, can't change it.
7. **Storage** model buckets: public read unchanged, upload/update/delete admin-only.
8. `v_nest_parts` is `security_invoker` so the optimiser respects the same rules.
9. **App gating is cosmetic**; RLS is the enforcement. `proxy.ts` redirects
   testers away from `/settings`, `/library`, `/projects/new`,
   `/shape-editor-test`. UI hides: Settings + New Project (home), delete project,
   library right-click menu (canvas sidebar), Save to library, Save as preset,
   Save as shop defaults. Use `fetchRole()` (`src/lib/role.ts`, server) or
   `useIsAdmin()` (`src/lib/useRole.ts`, client).
10. **Automation** (z_plan_automation, headless Chrome) signs in as an admin
    account from `.env.local` (`AUTOMATION_EMAIL` / `AUTOMATION_PASSWORD`): Node
    scripts call `signInWithPassword`; the dev-only `x-dev-automation` header now
    makes `proxy.ts` sign the browser in (it used to skip auth).
11. **Out of scope:** the `sanding` schema still has open `public` policies + anon
    grants. Not used by this app — probably a sanding-cell integration. Decide
    separately before locking it down.

12. **Settings → Users** (`app/settings/UsersClient.tsx`, admins only): per login
    toggle can-sign-in (`allowed_emails`), set Admin/Tester (`user_roles`), tick
    jobs for testers (`project_access`). Lists logins via `admin_list_users()`
    (SECURITY DEFINER, admin-only). Creating logins stays in the Supabase
    dashboard (no service-role key in the app). You can't change your own role
    or allowlist entry in the UI; the `keep_one_admin` trigger blocks removing
    the last admin.

13. **Online presence** (Phase 3, 2026-10-20; migration `online_presence`,
    `migration_online_presence.sql`): every signed-in tab joins the **private**
    Realtime channel `online-users` (`src/lib/presence.ts`, started by
    `src/components/PresenceTracker.tsx` in the root layout), keyed by user id,
    tracking `{email, path, online_at}` and re-tracking on navigation. RLS on
    `realtime.messages` lets any login read + write presence on that one topic
    (joining needs read). So testers technically receive the list too; only the
    admin UI shows it: Settings → Users green dot + Online column (job › room or
    page per open tab). No history is kept: closed tab = gone within seconds.

## Rule for new tables

Every new `public` table must get policies in the same change:
- hangs off a job → `job_access` using the right `can_access_*` helper
  (add a helper if it's a new parent type);
- shared library / settings → `library_read` + `admin_write`.

Tables without a policy are invisible to everyone (RLS on) — including automation.

## Operations

Add a tester: create the login in Supabase → Authentication → Users ("Auto
Confirm User" ticked), then Settings → Users: tick Can sign in, set Tester,
tick their jobs. SQL equivalent:

```sql
insert into allowed_emails (email) values ('tester@example.com');
insert into user_roles (user_id, role)
  select id, 'tester' from auth.users where email = 'tester@example.com';
insert into project_access (user_id, project_id)
  select u.id, '<project uuid>' from auth.users u where u.email = 'tester@example.com';
```

Remove: delete the user in the dashboard (cascades the role + access rows) and
delete the `allowed_emails` row. Existing sessions last up to ~1 hour.

Rollback: `rollback_access_control.sql` (back to allow-everything, incl. anon).

## Files

- `migration_access_control.sql` — what was applied (`access_control_roles`).
- `rollback_access_control.sql`
