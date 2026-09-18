# HANDOFF — G-code Post-Processor Defects (Anderson EVO49)

**Status:** Ready for implementation
**Scope:** G-code export / post-processor module only. No schema changes. No changes to the resolver, nester, or any L1–L5 cascade logic.
**Priority:** High — current output does not load on the machine.

---

## 1. Background

A posted program from RHK-CADcam (`RHK6539_Whiteboard16_01.nc`) failed to load on the Anderson EVO49. A known-good program posted by PlanIt for a near-identical part (`R980101N.anc`, same 758 × 339 panel, same drill/route structure) loads and runs correctly.

Byte-level comparison of the two files identified four defects that block loading, plus five secondary defects that produce incorrect or unsafe motion. All are in the post-processor's text-emission layer — the toolpath geometry itself was correct.

A hand-corrected version of the file (`RHK6539_Whiteboard16_01.anc`) has been verified as loading correctly on the machine. **Use both files as fixtures** (see §5).

### Reference files

| File | Role |
|---|---|
| `R980101N.anc` | Gold reference — PlanIt output, known-good on the machine |
| `RHK6539_Whiteboard16_01.nc` | Failing RHK-CADcam output |
| `RHK6539_Whiteboard16_01.anc` | Hand-corrected, verified working |

Place these under `fixtures/gcode/` (or the existing fixture location — read the codebase first and follow whatever convention is already there).

---

## 2. Before writing any code

1. Read the live codebase and locate the post-processor module and any existing G-code emission helpers.
2. Identify where the output string is assembled and where it is written to disk / handed to the browser download.
3. Confirm whether a comment-emission helper already exists, or whether comment strings are interpolated inline at each call site. This determines the shape of fix D1.
4. Report what you found and the proposed file layout **before** implementing. Do not restructure existing modules — these changes are additive.

---

## 3. Defects — blocking (file will not load)

### D1. Output encoding: must be 7-bit ASCII with CRLF line endings

**Observed:** the failing file is UTF-8 with bare LF line endings (0 carriage returns across 119 lines). The gold reference is pure ASCII with CRLF on all 142 lines.

The EVO49's Osai/Fanuc-family controller expects DOS-style CRLF. With bare LF it either treats the whole program as a single block or throws a format alarm at the first line.

**Fix:**
- Emit `\r\n` as the line terminator everywhere in the post-processor. Do not rely on `os.EOL` or the platform default — the file may be generated on any host and must always be CRLF.
- Encode the final buffer as ASCII. No BOM.
- Any byte > 127 anywhere in the output is a hard error (see §4, the validator).

### D2. Non-ASCII characters leaking into comments

**Observed:** UTF-8 em-dashes (`E2 80 94`) on three lines:

```
(Drilling — 3 gang group(s) over 1 band(s) of 400.mm, Anderson M88/M89)
(Roughing pass — leave onion skin)
(Separation pass — cut through onion skin)
```

These almost certainly come from template strings authored in an editor with smart-punctuation substitution.

**Fix:** add a comment sanitiser (see D3 — same function). It must transliterate or strip all non-ASCII: em/en dash → `-`, curly quotes → straight, ellipsis → `...`, non-breaking space → space, everything else outside 0x20–0x7E dropped.

### D3. Unbalanced parentheses inside comments

**Observed:**

```
(Drilling — 3 gang group(s) over 1 band(s) of 400.mm, Anderson M88/M89)
```

G-code comments are delimited by `(` `)` and do not nest. The controller closes the comment at the `)` after `group(s`, then parses ` over 1 band(s) of 400.mm, Anderson M88/M89)` as executable code — `O`, `v`, `e`, `r` are not valid addresses, so it alarms.

Note the gold reference contains `(JOB NUMBER (1491.5)` and survives, because the stray bracket is an *opening* one. Only stray closing brackets terminate the comment early. Strip both regardless.

**Fix:** route every comment through a single `emitComment(text: string): string` helper that:
- strips `(` and `)` from the content entirely (replace with nothing, or with `-` if a separator reads better)
- applies the ASCII transliteration from D2
- collapses newlines and tabs to spaces
- truncates to the controller's max comment length (confirm this; assume 60 chars if unknown)
- wraps the result in a single `(` … `)`

No comment may be emitted anywhere in the post-processor except through this helper.

### D4. `G0` emitted inside an active canned cycle

**Observed:**

```
G98 G81 Z3.5 R20. F11200.
G0 X12.25 Y-182. Z3.5      ← cancels G81
X70.5 Y-453.75 Z3.5
```

G00 is modal group 01; a group 01 code cancels an active canned cycle (group 09). Gold reference correctly emits bare position words for repeat holes:

```
G98 G81 Z-0.2 R36.5 F3000.
X617.75 Y-476. Z-0.2
X546. Y-233. Z4.5
```

**Consequence:** only the first hole of each gang group is drilled. Every subsequent line becomes a rapid move to hole depth — a rapid plunge into the sheet with a stationary drill block. This is a crash, not just a wrong part.

**Fix:** in the drill-cycle emitter, only the block that *opens* the cycle carries the motion mode. Repeat positions emit position words only (`X… Y… Z…`). Add an assertion in the emitter: once a canned cycle is open, refuse to emit any group-01 code (`G00`–`G03`) until `G80`.

---

## 4. Defects — secondary (loads, but wrong or unsafe)

### D5. Router feed rate applied to drill cycles

**Observed:** `G98 G81 Z3.5 R20. F11200.` — gold reference uses `F3000.` for drilling and reserves the high feeds for routing (`F6000.` lead-in, `F28000.` cutting).

The feed selection is pulling from the routing tool's feed rather than the drill tool's. Trace where feed is resolved per operation and confirm it keys off the tool assigned to that operation, not a job-level or last-set value.

### D6. Missing pre-positioning move before tool change

**Observed (failing):**
```
T101
G59
M13 S18000
G43 H11 Z36.5
```

**Gold reference:**
```
G0 G59 G90 X80.5 Y-325.75
T101
G0 G59 G90 X429.4 Y-340. M13 S18000
G43 H11 Z36.5
G0 Z26.5
```

The reference positions the gantry, *then* calls the tool, *then* moves to the lead-in with spindle start in the same block. Some ATC configurations alarm if the gantry is not positioned before the T-word.

**Fix:** emit the tool-change sequence as a fixed template matching the reference. The pre-position coordinate should be a machine-profile config value, not hardcoded and not derived from the toolpath.

### D7. Number formatter emits double decimal points

**Observed:** `(DIAMETER: 5..)` and `(DRILL TOOL: V 5.MM)`. Gold reference: `(DIAMETER: 5.)` and `(V 5MM)`.

A value already formatted with a trailing `.` is being passed to a template that appends another. Fix the formatter so trailing-decimal handling happens in exactly one place. This is cosmetic inside comments but the same formatter feeds coordinate words — verify it cannot produce `X12..5` in a motion block.

### D8. File extension must be configurable, and default to `.anc`

The machine's known-good file is `.anc`. Current output is `.nc`. The extension is a controller/file-browser convention, not a format — but the browser may filter on it.

**Fix:** add `fileExtension` to the machine profile config, default `anc`. Do not hardcode.

### D9. Retract plane inconsistency

**Observed:** the failing file drills with `R20.` while routing clears at `Z36.5`. With the table at Z0 and 16.5 mm material, R20 leaves only 3.5 mm of clearance above the sheet. The gold reference uses `R36.5` — material thickness + 20 mm.

**Fix:** derive the drill retract plane as `materialThickness + drillClearance`, with `drillClearance` a machine-profile config value defaulting to 20. Confirm with Pencil before changing existing behaviour — this may be deliberate.

---

## 5. Post-export validator (new)

Add a validator that runs on every posted program **before** it is written or offered for download. It must live in the service layer (callable independently of UI, per the agent-readiness principle) and hard-fail on any violation.

Checks:

| # | Check | Severity |
|---|---|---|
| V1 | No byte > 127 anywhere in the output | Error |
| V2 | Every line terminated with CRLF; no bare LF or bare CR | Error |
| V3 | No BOM | Error |
| V4 | Comment brackets balanced; no `(` or `)` inside comment content | Error |
| V5 | No group-01 G-code (`G00`–`G03`) between a canned-cycle open (`G8x`) and its `G80` | Error |
| V6 | Every canned cycle opened is closed by a `G80` before program end | Error |
| V7 | No coordinate word containing two decimal points, or a bare `.` with no digits | Error |
| V8 | File opens with `%` and closes with `M30` followed by `%` | Error |
| V9 | Feed rate on any drill cycle within the configured drill feed range | Warning |
| V10 | Comment length within controller limit | Warning |

Errors block export and surface to the user with the offending line number and content. Warnings surface but allow export.

---

## 6. Tests

There is currently no test runner configured — two test files exist but no vitest/jest dependency and no `test` script. **Install vitest and add the `test` script as part of this work**, or the validator is untestable and this whole fix is unverifiable.

Required tests:

1. **Golden-file test:** post the RHK6539 part from its stored definition and assert the output matches `RHK6539_Whiteboard16_01.anc` byte-for-byte (modulo the timestamp comment line).
2. **Validator unit tests:** one per check V1–V10, each with a crafted failing input and a passing input.
3. **Regression test:** feed `RHK6539_Whiteboard16_01.nc` (the original broken file) to the validator and assert it reports exactly V1, V2, V4 and V5.
4. **Gold reference test:** feed `R980101N.anc` to the validator and assert zero errors. If the validator flags the file the machine demonstrably accepts, the validator is wrong, not the file.

Test 4 is the important one — it prevents the validator drifting away from what the controller actually tolerates.

---

## 7. Milestones and check-in points

**M1 — Codebase audit.** Report the post-processor structure, where comments and lines are emitted, and the proposed file layout. **Stop and check in.**

**M2 — Encoding and comment emission (D1, D2, D3).** Comment helper, CRLF/ASCII output. Green on tests 1 and 4.

**M3 — Canned cycle and tool change (D4, D6).** Drill-cycle emitter refactor, tool-change template, machine-profile config for pre-position and extension (D8). **Stop and check in** — this changes emitted motion.

**M4 — Formatter and feed resolution (D5, D7).** Confirm feed resolution reads from the operation's assigned tool.

**M5 — Validator and test harness (§5, §6).** Wire into the export path as a hard gate.

**D9 (retract plane) is deferred** pending confirmation from Pencil.

---

## 8. Out of scope — do not touch

- `loadCabinetInput` or any resolver logic
- The five-level cascade
- Toolpath geometry generation — the coordinates in the failing file were correct
- The nester / Panel Optimiser
- `part_operations` schema
- Any existing component rebuild. All changes here are additive.

---

## 9. Open questions for Pencil

1. Is the `LOAD: Material face UP` convention in the failing file correct? The gold reference is face DOWN. If fixturing is face-down, every drill Z in the posted program is on the wrong side of the panel.
2. Confirm the exact controller model on the EVO49 so the machine profile can be named correctly and the comment-length limit confirmed.
3. Is the R20 retract plane (D9) deliberate, or should it follow the reference's `thickness + 20`?
