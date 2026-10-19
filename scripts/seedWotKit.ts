// Prints the SQL that writes the WOT / WOT-COMBI library rows from
// src/lib/wotKit.ts (z_wot K4). Run: npx tsx scripts/seedWotKit.ts > out.sql
import { WOT_LIBRARY, WOT_CONTENTS } from '../src/lib/wotKit'

const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
// Oven / combi fronts on the panel fronts: link_z = (580 + 18 + 2) − depth / 2
// (default tall depth + door; the anchor is a fixed point).
const FRONT = 600

const sql: string[] = []
for (const [name, lib] of Object.entries(WOT_LIBRARY)) {
  const contents = WOT_CONTENTS[name as keyof typeof WOT_CONTENTS]
  const contentsSql = `(SELECT COALESCE(jsonb_agg(x.item ORDER BY x.ord), '[]'::jsonb) FROM (VALUES ${contents.map((c, i) =>
    `(${i}, (SELECT jsonb_build_object('fixture_catalog_id', id, 'anchor', jsonb_build_object('kind', 'point', 'link_x', ${c.link_x}, 'link_z', ${FRONT} - depth / 2, 'yaw', 0, 'z', ${c.z})) FROM fixture_catalog WHERE name = '${c.name}' LIMIT 1))`,
  ).join(', ')}) AS x(ord, item))`
  const set = `assembly_class = 'tall', default_dx = 636, default_dy = 2100, default_dz = 580,
  preserve_dx = false, preserve_dy = false, preserve_dz = false,
  has_carcass = false, has_internal = false, has_face = false, has_toekick = false,
  face_grid = '{}'::jsonb, internal_grid = NULL, rule_overrides = '{}'::jsonb,
  custom_parts = ${q(lib.custom_parts)}, part_operations = ${q(lib.part_operations)},
  part_comments = ${q(lib.part_comments)}, kit = ${q(lib.kit)},
  contents = ${contentsSql},
  description = ${`'${lib.description.replace(/'/g, "''")}'`}`
  sql.push(`INSERT INTO cabinet_definitions (name, assembly_class, construction_method_id, default_dx, default_dy, default_dz,
  is_library_item, active, category_id, subcategory_id, top_type, toe_type, carcase_joints, material_overrides,
  hardware_overrides, toekick_overrides, drawerbox_overrides, exposed_interior, sort_order, no_cnc)
SELECT '${name}', 'tall', construction_method_id, 636, 2100, 580, true, true, category_id, subcategory_id, top_type, toe_type,
  carcase_joints, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false, sort_order + 1, false
FROM cabinet_definitions WHERE name = 'UBO' AND NOT EXISTS (SELECT 1 FROM cabinet_definitions WHERE name = '${name}');`)
  sql.push(`UPDATE cabinet_definitions SET ${set}\nWHERE name = '${name}';`)
}
console.log(sql.join('\n\n'))
