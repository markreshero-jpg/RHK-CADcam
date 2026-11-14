# Offline mode — spec

Status: **Step 1 built 2026-11-14, save light checked by Mark.** **Step 1b (clash flag) built 2026-11-14, check pending.** **Step 2 (open jobs with no signal) built 2026-11-14, check pending.** Step 3 not started.

## Why

On site with patchy reception, markups and CAD were lost. Every annotation write went
straight to Supabase, and a failed save was only `console.error`'d — no retry, no local copy,
no warning. The work vanished on the next reload.

Goal: like Google Sheets offline. Edits are kept on the device first and sent when there's
signal. You can always see whether the server has them. Later you can open a job with no
signal at all.

## Locked decisions

1. **Local first, then server.** Every write is put in a queue on the device (IndexedDB
   `rhk-offline` / store `outbox`) before it is sent. It leaves the queue only when the server
   accepts it. Nothing is ever dropped silently.
2. **One queue entry per row.** Later changes to the same row fold into the one waiting
   (`src/lib/offline/outboxCore.ts` `mergeOp`): an edit after an add becomes the add, a delete
   beats anything, an add after a delete (undo) replaces it. The queue stays small however long
   you're offline.
3. **IDs are made on the device** (`crypto.randomUUID()`), so new items exist straight away
   and don't wait on the server.
4. **Adds are sent as upserts** (`onConflict: id`, `defaultToNull: false`). Re-sending after a
   timeout that actually got through is harmless.
5. **Network failure versus refusal.** supabase-js `status 0` or a fetch error means no
   signal. The item stays queued and is retried. Any other error means the server refused it.
   It stays queued, shows red, and keeps retrying. A bad row in a batch is retried on its own
   so it doesn't hold up the rest.
6. **Retry triggers:** the browser `online` event, the tab coming back to the front, the save
   light being clicked, and a backing-off timer (2 s doubling to 60 s).
7. **Conflicts: the last change wins** (like Sheets), and each clash is logged so someone can
   check it (step 1b).
8. **The save light** sits top right of the canvas menu bar (`SaveStatusBadge`). It shows
   Saved / Saving… / Offline — n waiting / n not saved, and clicking it retries now. While
   anything is waiting and the service worker isn't installed, closing or reloading the tab
   asks first (with the worker, a reload opens the offline copy).
9. **Waiting changes reapply on open.** When a room opens, changes still queued on this device
   from an earlier visit are laid over what the server sent (`applyPending`), then sent.
10. **Undo/redo of CAD goes through the queue too** (`useCanvasHistory`), so it works with no
    signal.

## Steps

### Step 1 — save queue for CAD + markups ✅ built 2026-11-14

- `src/lib/offline/outboxCore.ts`: pure merge / overlay / network-error rules, with tests in
  `__tests__/outboxCore.test.ts`.
- `src/lib/offline/outbox.ts`: IndexedDB queue, flusher, status store `useOutboxStatus`.
- Routed through it, for `room_annotations` only: the CAD tool store (`DB_ANNOT_STORE`),
  `dbInsertAnnotation`, `dbUpdateAnnotation`, `dbDeleteAnnotations`, the item-CAD
  "copy to cabinet" (`CabinetCad`), and undo/redo.
- `CanvasClient` runs `initOutbox()` and lays the waiting changes over loaded annotations.
- Verify script: `z_plan_automation/verify-offline-o1.mjs`. It (A) draws offline then
  reconnects in the same tab, and (B) draws offline, closes the tab and reopens online. All
  pass.
- Tutorial: `offline_save_light`.

**Not covered yet:**
- Cabinets, walls, fixtures and benchtops still write straight to Supabase. Those writes need
  the server-side resolver, so they come in step 3.
- Creating new CAD layers (`job_cad_layers`) and library item CAD also aren't queued.
- ~~A page reload with no signal won't load the page.~~ Fixed by step 2.

### Step 1b — clash flag ✅ built 2026-11-14 (check pending)

Locked decisions:
- **The server stamps `updated_at`.** Trigger `room_annotations_touch` sets it to `now()` on
  every insert and update. Undo used to write a row back with its old time, so the client's
  value couldn't be trusted.
- **Baseline = the version this device last saw.** `outbox.track()` records each row's
  `updated_at` when it loads. Every accepted save returns the new `updated_at`
  (`.select('id, updated_at')`), which becomes the next baseline. A queue entry keeps the
  baseline from the device's *first* change to that row (`OutboxEntry.base`). New rows have
  none, so they aren't checked.
- **Check before sending** (`checkClashes` in `outbox.ts`, rules in `checkClash` in
  `outboxCore.ts`). One `select *` covers every queued row that has a baseline:
  - Server version differs from the baseline: **changed**. Their row is saved in the clash
    record and mine still goes in.
  - The row is gone and I edited it: **restored**. My full row (from the screen, via
    `outbox.setLookup`) is upserted back.
  - The row is gone and the device has no full row for it: **lost**. My patch is saved in the
    clash record and nothing is sent.
  - Both of us deleted it: no clash.
  - Each entry is checked once. Its baseline is cleared after the check, so a retry doesn't log
    the same clash twice.
- **Clash records** go in table `annotation_clashes`, with the same job-access rules as
  markups. It holds kind, `my_op`, theirs, mine and `their_updated_at`; `resolved_at` null
  means still open. Migration: `z_offline/migration_o1b_clashes.sql`, applied.
- **UI.**
  - A **⚠ n to check** button sits next to the save light.
  - It opens `ClashPanel`, where each clash has Show (selects the item) plus:
    - changed: **Use theirs** or **Keep mine** (or Keep deleted).
    - restored: **Delete it** or **Keep mine**.
    - lost: **OK**.
  - Resolving goes through the offline queue (`outbox.patch('annotation_clashes', …)`).
  - On the canvas, an amber dashed box with a "!" marks each clashed item. It's display layer
    item `annot_clash` (Annotations group, on by default) and is never printed.
- **Not covered:** cabinets etc. (step 3). Edits made by the AI helper count as "someone
  else", which is correct.
- Tests: `outboxCore.test.ts` (checkClash). Headless: `verify-offline-o1b.mjs`. It covers
  online drags making no clash, both of us moving an item (changed, then Use theirs), and one
  of us deleting it (restored, then Delete it). All pass.

### Step 2 — open jobs with no signal ✅ built 2026-11-14 (check pending)

How it works, and the decisions locked with it:

- **Service worker** `public/sw.js`. Production only; in dev, set localStorage `rhk.sw=1`.
  It's registered by `src/components/ServiceWorkerSetup.tsx` in the root layout. `sw.js` and
  `/offline*` are left out of the proxy's login check, because they're static shells with no
  job data. `next.config` sends `sw.js` no-cache so a deploy updates it.
  - `rhk-shell`: the two offline pages (`/offline`, `/offline/canvas`) plus every
    `/_next/static` file their HTML references. A page is stored only after all its files are,
    so the copy always hangs together. It's refreshed at most every 5 min on page loads, and
    immediately after Take offline. That's how a new deploy reaches the device.
  - `rhk-static`: `/_next/static/*` (hashed), fixture/hardware models and the favicon.
    Cache-first, saved as they're used. Parts of the app first opened online on this device
    (3D, editors) are then available offline as well.
  - `rhk-data`: every Supabase read (REST GET, public storage), network-first with an 8 s
    timeout. The cached copy is served when there's no signal. This covers every loader the
    canvas runs (resolved parts, materials, settings, library…) without touching any of them.
    Writes are never intercepted.
  - **Pages:** network-first. `/canvas/<room>` that can't load (no signal, or 15 s with bad
    reception) goes to `/offline/canvas?room=<room>`. Any other page goes to `/offline`.
- **Room copies** are stored in IndexedDB `rhk-offline` → `rooms` (`src/lib/offline/roomCache.ts`;
  both stores share `src/lib/offline/idb.ts`, DB version 2).
  - The canvas saves its room 2 s after any change, and again on leaving the page
    (`useRoomSnapshot`). The copy covers project, room, walls, cabinets, benchtops, fixtures,
    annotations and CAD layers.
  - Annotations are saved with the clash baseline the device last saw (`outbox.knownStamp`), so
    edits on the offline copy don't raise false clashes.
- **Offline canvas** `app/offline/canvas/page.tsx` is a static page. It loads the copy and
  renders the normal `CanvasClient` with `offlineCopy`. An amber banner says *Offline copy,
  saved …*, with **Rooms on this device** and, once online, **Back online: open live**.
  CAD and markups save through the queue as usual.
- **Rooms on this device** `app/offline/page.tsx` lists every copy by job, with Remove.
- **Take offline** (`app/TakeOfflineButton.tsx`) is on each job card in the dashboard.
  - It opens each live room in turn in a hidden full-size iframe, `/canvas/<room>?warm=1`.
  - The canvas waits until its requests have been idle for 2.5 s (at least 4 s, at most 45 s;
    in-flight count from `netWatch`). It then saves its copy and posts `rhk-warm-done` to the
    job page. Every read it made has been cached by the service worker along the way.
  - The button then shows **On this device: n rooms** and refreshes the offline pages.
  - After that the button reads **Offline: n of m rooms** (amber while some are missing) or
    **Offline: all n rooms**. In the job's room list, each room with a copy on this device has a
    green **Offline** tag (hover shows when it was saved).
- **Lost-write warning** (`src/lib/offline/netWatch.ts`, the fetch passed to the browser
  Supabase client). Any write that fails for lack of signal and isn't in the queue (cabinets,
  walls, fixtures… which come in step 3) shows **✕ n not saved (needs signal)** in red next to
  the save light. Those used to be lost without anyone knowing.
- **Sign out** asks first if changes are waiting. It then empties the queue (it must never send
  under another login), the room copies and `rhk-data`.
- **Auth offline:** the session cookie stays. supabase-js retries token refresh and doesn't sign
  you out on a network error. `presence.ts` no longer treats a failed `getUser` as a sign-out,
  which had raced the session join and thrown.
- **Like Sheets:** a room must be opened (or taken offline) on the device **before** losing
  signal.

Tests: headless `z_plan_automation/verify-offline-o2.mjs`, against a production server
(`next build` + `next start -p 3002`). It takes the page **and the service worker** offline
over CDP, reusing one CDP session per worker (the offline setting belongs to the session). It
covers: log in → Take offline (4 rooms) → no signal → `/canvas/<room>` opens the copy with its
cabinets → draw a box → reload, copy and box still there → `/` shows Rooms on this device →
signal back → live page, box reaches the server. All pass. The ✕ lost-write pill has not been
exercised by a test yet.

Not covered: cabinet / wall / fixture editing offline (step 3). Reads first made after the last
online visit aren't in `rhk-data`. Old `rhk-static` files aren't pruned yet (they're small and
hashed).

### Step 3 — full cabinet editing offline (later, big)

Run the resolver in the browser against the cached library, and queue cabinet / wall /
fixture / benchtop writes through the same outbox, with the persisted resolved parts
recomputed on sync.

## Tutorials

| Lesson id | Covers |
|---|---|
| `offline_save_light` | Save light states, working on site with no signal (step 1); step `clash` = the ⚠ list (1b); steps `take` + `open` = Take offline and opening with no signal (2) |
