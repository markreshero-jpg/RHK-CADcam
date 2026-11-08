-- AI helper AI5 (z_ai_helper/AI-HELPER-SPEC.md):
--   shop_settings.ai_rules — the shop's conventions, sent with every AI message
--     (Settings › AI helper; admins edit, everyone reads — the shop_settings policies).
--   projects.ai_notes      — this job's notes for the AI (Job properties), sent while
--     the job is open (job access policies).
-- Seeded from the conventions Claude Code had in memory (2026-11-08).

alter table public.shop_settings add column if not exists ai_rules text;
alter table public.projects add column if not exists ai_notes text;

update public.shop_settings set ai_rules = $rules$RHK shop conventions — the AI follows these on every job. Keep it short: it's sent with every message.

- Fillers sit on the kick; only end panels go to the floor. 50 filler at inner drawers / pull-outs against a wall. BFK = side-on board-thickness strip; BFKW = face filler.
- Overheads never get finger pulls (handle none), even on finger-pull jobs; their under panel is set back 20. Overhead back scribe 0.
- A wall cabinet boxed in by walls both sides gets a filler each side — never a carcass straight to a wall.
- Benchtops: a separate top per wall, joint edges at the corners. Never drawn as cabinets.
- Inner drawer fronts are edged all 4 sides.
- Every room's drawings carry: appliances (not drawn) labelled, colour callouts, TBC clouds on the Questions for Client layer, and site notes in a SITE NOTES box.
- The spec block is colours and thicknesses only; site info goes in SITE NOTES.
- Plan markup: an X on an edge = edge it; "ne" / "n/e" = no edge; a crossed-out dimension with a number = the new size.
- Never delete CAD someone drew.$rules$
where ai_rules is null;
