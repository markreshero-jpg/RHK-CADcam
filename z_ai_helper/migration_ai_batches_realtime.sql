-- AI helper (z_ai_helper/AI-HELPER-SPEC.md): other people with the room open see an AI
-- change without reloading. A canvas listens for new ai_batches rows of its room
-- (Realtime postgres_changes, which applies the table's RLS — job access only) and
-- reloads the cabinets in it.

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ai_batches') then
    alter publication supabase_realtime add table public.ai_batches;
  end if;
end $$;
