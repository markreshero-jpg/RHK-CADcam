// ============================================================
// G-code fixture loading. These are real machine files, so they are read as
// BYTES and only decoded as latin1 (a 1:1 byte↔char map) — never as utf8,
// which would silently repair the very encoding defects under test.
// ============================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('./fixtures/gcode/', import.meta.url))

/** Raw bytes of a G-code fixture. */
export function fixtureBytes(name: string): Buffer {
  return readFileSync(dir + name)
}

/**
 * A G-code fixture as a string, byte-for-byte (latin1). Every CR, LF and
 * >127 byte is preserved so encoding assertions mean what they say.
 */
export function fixture(name: string): string {
  return fixtureBytes(name).toString('latin1')
}

/** PlanIt output, known-good on the Anderson EVO49. The calibration reference. */
export const GOLD = 'R980101N.anc'
/** RHK-CADcam output that failed to load on the machine. */
export const BROKEN = 'RHK6539_Whiteboard16_01.nc'
/** Hand-corrected version of BROKEN, verified loading on the machine. */
export const FIXED = 'RHK6539_Whiteboard16_01.anc'
