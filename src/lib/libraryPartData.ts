// Hand-drawn part operations + part comments / labels that travel with a cabinet
// (z_wot/WOT-KIT-SPEC.md K0). On a placed cabinet they're keyed by the stable part
// id — `custom_<uuid>` for custom parts, which changes with every copy. A library
// definition has no part rows, so there a custom part is referenced by its index in
// the definition's custom_parts snapshot: `custom_@<i>`.
//
// Only hand-owned ops travel. Generated rows (seam / hinge / slide drilling,
// master-slave fires — parameters.generated) are rebuilt by seamDrillSync.

export type PartOpRow = Record<string, unknown>

// Columns that tie a row to one cabinet / one materialised part / another op.
const DROP_COLS = ['id', 'created_at', 'updated_at', 'source_cabinet_id', 'source_part_id',
  'master_operation_id', 'slave_part_id'] as const

const LIB_PREFIX = 'custom_@'

export function isGeneratedOp(op: PartOpRow): boolean {
  const params = op.parameters as Record<string, unknown> | null | undefined
  return !!params?.generated
}

// Rewrite a part key; `null` = the part isn't carried (op / entry dropped).
type KeyMap = (key: string) => string | null

function stripOp(op: PartOpRow): PartOpRow {
  const out: PartOpRow = { ...op }
  for (const c of DROP_COLS) delete out[c]
  return out
}

function mapOps(ops: PartOpRow[], mapKey: KeyMap, extra: PartOpRow = {}): PartOpRow[] {
  const out: PartOpRow[] = []
  for (const op of ops) {
    if (isGeneratedOp(op)) continue
    const key = mapKey(String(op.source_part_key ?? ''))
    if (!key) continue
    out.push({ ...stripOp(op), ...extra, source_part_key: key })
  }
  return out
}

function mapKeyed(m: Record<string, string> | null | undefined, mapKey: KeyMap): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(m ?? {})) {
    const key = mapKey(k)
    if (key) out[key] = v
  }
  return out
}

// Instance → definition: `custom_<uuid>` → `custom_@<index in customIds>`.
export function toLibraryKey(customIds: string[]): KeyMap {
  const idx = new Map(customIds.map((id, i) => [id, i]))
  return key => {
    if (key.startsWith(LIB_PREFIX)) return null
    if (!key.startsWith('custom_')) return key
    const i = idx.get(key.slice('custom_'.length))
    return i == null ? null : `${LIB_PREFIX}${i}`
  }
}

// Definition → instance: `custom_@<i>` → `custom_<newIds[i]>`.
export function fromLibraryKey(newIds: string[]): KeyMap {
  return key => {
    if (!key.startsWith(LIB_PREFIX)) return key.startsWith('custom_') ? null : key
    const id = newIds[Number(key.slice(LIB_PREFIX.length))]
    return id ? `custom_${id}` : null
  }
}

// Instance → instance (copy / paste): old custom ids → new ones.
export function remapCustomKey(idMap: Map<string, string>): KeyMap {
  return key => {
    if (!key.startsWith('custom_')) return key
    const id = idMap.get(key.slice('custom_'.length))
    return id ? `custom_${id}` : null
  }
}

export function opsForLibrary(ops: PartOpRow[], customIds: string[]): PartOpRow[] {
  return mapOps(ops, toLibraryKey(customIds))
}

export function opsForInstance(ops: PartOpRow[], cabinetId: string, mapKey: KeyMap): PartOpRow[] {
  return mapOps(ops, mapKey, { source_cabinet_id: cabinetId })
}

export function keyedForLibrary(m: Record<string, string> | null | undefined, customIds: string[]) {
  return mapKeyed(m, toLibraryKey(customIds))
}

export function keyedForInstance(m: Record<string, string> | null | undefined, mapKey: KeyMap) {
  return mapKeyed(m, mapKey)
}
