-- KS1 (2026-11-03): manual kick seams for a joined kick run (applied as kick_runs_manual_seams).
-- split_mode 'manual': face_splits = face seam positions (mm from the run's left end),
-- sub_splits = sub front seams; the kick back is the sub front mirrored (L - x).
alter table kick_runs add column if not exists face_splits numeric[];
alter table kick_runs add column if not exists sub_splits numeric[];
alter table kick_runs drop constraint if exists kick_runs_split_mode_chk;
alter table kick_runs add constraint kick_runs_split_mode_chk
  check (split_mode = any (array['equal'::text, 'exact'::text, 'manual'::text]));
