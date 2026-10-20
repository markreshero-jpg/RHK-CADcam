-- z_floating F3: top-level Vanity library category (next to Base / Wall / Tall)
-- with Drawers + Doors under it, mirroring Base. Holds vanity-sized starting
-- points, floating (rule_overrides.FLOAT) or floor-standing. Data only.
INSERT INTO cabinet_categories (name, parent_id, sort_order, active)
SELECT 'Vanity', NULL, 3, true
WHERE NOT EXISTS (SELECT 1 FROM cabinet_categories WHERE name = 'Vanity' AND parent_id IS NULL);

INSERT INTO cabinet_categories (name, parent_id, sort_order, active)
SELECT c.name, v.id, c.sort_order, true
FROM (VALUES ('Drawers', 0), ('Doors', 1)) AS c(name, sort_order)
CROSS JOIN (SELECT id FROM cabinet_categories WHERE name = 'Vanity' AND parent_id IS NULL) v
WHERE NOT EXISTS (SELECT 1 FROM cabinet_categories x WHERE x.parent_id = v.id AND x.name = c.name);
