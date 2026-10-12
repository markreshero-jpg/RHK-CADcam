-- Benchtop Phase 4 — shape-true resolver output.
-- Applied as migration `benchtop_p4_resolved_pieces`.
--
-- piece:   1-based piece number when the top is split by join lines (null = whole top).
-- outline: shaped piece outline, mm, in the part's own frame (null = rectangle).
-- meta:    order / quoting detail — area, lineal mm per profile, cutouts, joins,
--          waterfall joint (see src/lib/benchtop-resolver/types.ts BenchtopPartMeta).
-- Roles waterfall_panel + apron_strip are new values of the existing text column.

alter table benchtop_resolved_parts
  add column if not exists piece   integer,
  add column if not exists outline jsonb,
  add column if not exists meta    jsonb;
