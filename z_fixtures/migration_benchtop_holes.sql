-- z_fixtures gap 1: benchtop cutouts to the CNC. Applied live 2026-10-18.
alter table benchtop_resolved_parts add column if not exists holes jsonb;
comment on column benchtop_resolved_parts.holes is 'Sink / cooktop cutouts (mm, part frame like outline) on worktop + subtop panels; cut on the CNC for board tops (z_fixtures gap 1).';
