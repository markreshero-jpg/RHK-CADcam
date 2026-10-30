-- IC3a (2026-10-30): item CAD on the Cabinet Edit modal's Side tab. Library rows
-- gain view 'side' (front = 'elevation', top = 'plan', side = 'side').
-- room_annotations.sheet_view already allows 'front' | 'side' | 'top'.
ALTER TABLE library_cad DROP CONSTRAINT library_cad_view_check;
ALTER TABLE library_cad ADD CONSTRAINT library_cad_view_check CHECK (view = ANY (ARRAY['elevation'::text, 'plan'::text, 'side'::text]));
