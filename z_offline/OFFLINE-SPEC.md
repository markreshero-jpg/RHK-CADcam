# Offline mode — spec

Status: **Step 1 built 2026-11-14 (check pending on site).** Steps 2–3 not started.

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
7. **Conflicts: the last change wins** (like Sheets). Step 1b adds a flag so you can check a
   clash (see below).
8. **The save light** sits top right of the canvas menu bar (`SaveStatusBadge`). It shows
   Saved / Saving… / Offline — n waiting / n not saved, and clicking it retries now. While
   anything is waiting, closing or reloading the tab asks first.
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
- A page **reload with no signal won't load the page**. That's step 2. The light warns before
  leaving while changes are waiting.

### Step 1b — clash flag (next, small)

When a queued patch is sent, compare the row's server `updated_at` with the value it had when
the edit was made. If someone else changed it in between, still apply the edit (last change
wins) but log the clash and show a "check" marker on the item.

### Step 2 — open jobs with no signal

- A **"Take offline"** button per job. It downloads the job's rooms, walls, cabinets, worked-out
  parts, fixtures, benchtops, annotations and CAD layers into IndexedDB.
- A service worker stores the app's own files (JS / CSS / fonts), so `/canvas/[roomId]` loads
  with no signal. The canvas page is server-rendered today, so it needs a client path that
  loads from IndexedDB when the server can't be reached.
- Auth: keep the last session so you stay signed in offline. Writes go out once the token
  refreshes.
- Matches Sheets: you have to open the job (or take it offline) **before** losing signal.

### Step 3 — full cabinet editing offline (later, big)

Run the resolver in the browser against the cached library, and queue cabinet / wall /
fixture / benchtop writes through the same outbox, with the persisted resolved parts
recomputed on sync.

## Tutorials

| Lesson id | Covers |
|---|---|
| `offline_save_light` | Save light states, working on site with no signal (step 1) |
