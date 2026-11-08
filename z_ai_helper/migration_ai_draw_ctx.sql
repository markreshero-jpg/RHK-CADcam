-- AI helper AI4 (z_ai_helper/AI-HELPER-SPEC.md): a drawing that stops to ask the
-- user something (kick height, tall height, D/W type…) keeps what it was reading
-- on the question message, so the answer carries the drawing on:
--   draw = { path, fileName, notes, qa: [{ q, a }] }

alter table public.ai_messages add column if not exists draw jsonb;
