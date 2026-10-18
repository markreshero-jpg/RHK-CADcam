// Word-wrap for SVG labels (no DOM measuring): splits on spaces so each line
// fits `maxWidth` at an estimated glyph width. Words are never split — one word
// wider than the item runs a little past it rather than reading "dishwash / er".
// Used by fixture labels (plan + elevation).

/** Average glyph width as a fraction of the font size (sans-serif, mixed case). */
const CHAR_W = 0.58

export function wrapLabel(text: string, maxWidth: number, fontSize: number): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_W)))
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue
    if (!line) line = word
    else if ((line + ' ' + word).length <= perLine) line += ' ' + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}
