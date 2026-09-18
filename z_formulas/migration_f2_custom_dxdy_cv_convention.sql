-- F2 (2026-08-16): custom parts adopt the CV standard-part convention.
-- Before: dx = height, dy = width (side/front orientations).
-- After:  dy = length (with the grain — the vertical for standing panels),
--         dx = width (across the grain), matching every resolver part.
-- Code change in the same commit: customPartBox.ts customExtents/
-- customFieldForExtent mappings swapped for 'side'/'front' — so geometry is
-- unchanged when values and mapping swap together. 'flat' parts already read
-- correctly (length across X in dy) and are untouched.
-- part_shape_overrides had zero custom-part rows at migration time (verified),
-- so no sizeSlots/baseAtSave metas needed rewriting.

UPDATE cabinet_custom_parts
SET dx = dy,
    dy = dx,
    expressions = CASE
      WHEN expressions IS NULL THEN NULL
      ELSE (
        SELECT coalesce(
          jsonb_object_agg(
            CASE key WHEN 'dx' THEN 'dy' WHEN 'dy' THEN 'dx' ELSE key END,
            value
          ), '{}'::jsonb)
        FROM jsonb_each(expressions)
      )
    END
WHERE orientation IN ('side', 'front');
