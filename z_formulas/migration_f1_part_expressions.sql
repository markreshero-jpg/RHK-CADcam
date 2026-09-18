-- ============================================================
-- Formulas F1 (applied 2026-08-13): per-part formulas on standard
-- (resolver-emitted) parts.
--
-- cabinet_instances.part_expressions jsonb:
--   { "<stable part id>": { "sw"?: "<formula>", "sh"?: "<formula>", "sd"?: "<formula>" } }
--
-- Slots are the display-box size slots (same space as part_pos_overrides
-- sw/sh/sd). The formula text is the source of truth; computed values are
-- cached into part_pos_overrides by the resolve-time hook
-- (src/lib/formula/partExpressions.ts) so every existing consumer — 3D view,
-- Overrides tab, optimiser snapshot — keeps reading plain numbers.
-- Custom parts are NOT stored here: they keep cabinet_custom_parts.expressions.
-- ============================================================

alter table cabinet_instances
  add column if not exists part_expressions jsonb not null default '{}'::jsonb;
