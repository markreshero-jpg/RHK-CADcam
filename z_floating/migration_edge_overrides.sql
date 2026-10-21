-- Hand-edited edge bands, kept apart from the resolved part rows (2026-10-21).
-- Before this, every persisted edge flag was re-applied on re-resolve as if it
-- were a manual edit, so rule-driven edging (e.g. FLOAT taping gable ends) never
-- reached a cabinet that had already been resolved once.
--
-- Keyed by the editor's part id: case_<part_key>, tk_<part_key>_<sort>,
-- int_<part_type>_<sort>, zone_<zoneKey> → { top, bottom, left, right }.
alter table cabinet_instances
  add column if not exists edge_overrides jsonb not null default '{}'::jsonb;
