-- AI helper AI2 (z_ai_helper/AI-HELPER-SPEC.md): an assistant message can carry
--   question   { text, options[] }        — ask_user: buttons the user picks from
--   proposal   { roomId, filter, changes, onlyIds, description, lines[] }
--              — a change waiting for Apply (bigger than the auto-apply limit)
--   proposal_status  'pending' | 'applied' | 'cancelled'
--   batch_id   the ai_batches row it applied (Undo reverts that batch)
--   changed    the "BC-03: dy 720 → 900" lines that were applied
--   undone_at  when Undo ran

alter table public.ai_messages
  add column if not exists question        jsonb,
  add column if not exists proposal        jsonb,
  add column if not exists proposal_status text check (proposal_status in ('pending', 'applied', 'cancelled')),
  add column if not exists batch_id        uuid references public.ai_batches(id) on delete set null,
  add column if not exists changed         jsonb,
  add column if not exists undone_at       timestamptz;
