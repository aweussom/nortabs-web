/**
 * Fingerings for the most common open-position guitar chords.
 *
 * `positions` is a 6-element array, low E to high E:
 *   -1 = muted, 0 = open, n>0 = fret number.
 *
 * `lowestFret` (optional, default 1) shifts the diagram up the neck for
 * chords played higher than the first three frets.
 *
 * `barre` (optional, { fret, from, to }) draws a horizontal pill across
 * strings `from`..`to` (0-indexed, low-E to high-E).
 *
 * Coverage strategy: hit the ~30 most common chord shapes in
 * Norwegian guitar tabs. Anything not here falls back to plain text in
 * the foldout — graceful degradation, no broken diagrams.
 *
 * Naming convention: Norwegian/German "H" = English B (B-natural). Since
 * the target audience is Norwegian visetradisjon-spillere, we use H/Hm/H7
 * as the canonical names — the chord diagram is labelled with the Nordic
 * name. Tabs that use English "B/Bm/B7" are aliased into the same
 * diagrams so they still resolve. Bb (B-flat) is unambiguous in both
 * naming systems and lives under its own entries.
 */

export const CHORD_FINGERINGS = {
  // --- Major (open + barre) ---
  C:  { positions: [-1, 3, 2, 0, 1, 0] },
  D:  { positions: [-1, -1, 0, 2, 3, 2] },
  E:  { positions: [0, 2, 2, 1, 0, 0] },
  F:  { positions: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  G:  { positions: [3, 2, 0, 0, 0, 3] },
  A:  { positions: [-1, 0, 2, 2, 2, 0] },
  H:  { positions: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bb: { positions: [-1, 1, 3, 3, 3, 1], barre: { fret: 1, from: 1, to: 5 } },

  // --- Minor ---
  Am:  { positions: [-1, 0, 2, 2, 1, 0] },
  Hm:  { positions: [-1, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
  Bbm: { positions: [-1, 1, 3, 3, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  Cm:  { positions: [-1, 3, 5, 5, 4, 3], lowestFret: 3, barre: { fret: 3, from: 1, to: 5 } },
  Dm:  { positions: [-1, -1, 0, 2, 3, 1] },
  Em:  { positions: [0, 2, 2, 0, 0, 0] },
  Fm:  { positions: [1, 3, 3, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Gm:  { positions: [3, 5, 5, 3, 3, 3], lowestFret: 3, barre: { fret: 3, from: 0, to: 5 } },

  // --- Dominant 7 ---
  A7:  { positions: [-1, 0, 2, 0, 2, 0] },
  H7:  { positions: [-1, 2, 1, 2, 0, 2] },
  Bb7: { positions: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  C7:  { positions: [-1, 3, 2, 3, 1, 0] },
  D7:  { positions: [-1, -1, 0, 2, 1, 2] },
  E7:  { positions: [0, 2, 0, 1, 0, 0] },
  F7:  { positions: [1, 3, 1, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  G7:  { positions: [3, 2, 0, 0, 0, 1] },

  // --- Minor 7 ---
  Am7: { positions: [-1, 0, 2, 0, 1, 0] },
  Dm7: { positions: [-1, -1, 0, 2, 1, 1] },
  Em7: { positions: [0, 2, 0, 0, 0, 0] },

  // --- Major 7 ---
  Cmaj7: { positions: [-1, 3, 2, 0, 0, 0] },
  Dmaj7: { positions: [-1, -1, 0, 2, 2, 2] },
  Fmaj7: { positions: [-1, -1, 3, 2, 1, 0] },
  Gmaj7: { positions: [3, 2, 0, 0, 0, 2] },
  Amaj7: { positions: [-1, 0, 2, 1, 2, 0] },
  Hmaj7: { positions: [-1, 2, 4, 3, 4, 2], barre: { fret: 2, from: 1, to: 5 } },

  // --- Suspended ---
  Asus2: { positions: [-1, 0, 2, 2, 0, 0] },
  Asus4: { positions: [-1, 0, 2, 2, 3, 0] },
  Dsus2: { positions: [-1, -1, 0, 2, 3, 0] },
  Dsus4: { positions: [-1, -1, 0, 2, 3, 3] },
  Esus4: { positions: [0, 2, 2, 2, 0, 0] },

  // --- Common slash chords ---
  'D/F#': { positions: [2, 0, 0, 2, 3, 2] },
  'C/G':  { positions: [3, 3, 2, 0, 1, 0] },
  'G/H':  { positions: [-1, 2, 0, 0, 0, 3] },
};

// English-convention names map to the Norwegian-canonical entries above.
// G/B is the same chord as G/H; the slash-bass note is just renamed.
const ALIASES = {
  B: 'H',
  Bm: 'Hm',
  B7: 'H7',
  Bmaj7: 'Hmaj7',
  'G/B': 'G/H',
};

export function getChordFingering(name) {
  if (!name) return null;
  const resolved = ALIASES[name] ?? name;
  return CHORD_FINGERINGS[resolved] ?? null;
}
