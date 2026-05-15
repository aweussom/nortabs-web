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
  C:   { positions: [-1, 3, 2, 0, 1, 0] },
  'C#':{ positions: [-1, 4, 6, 6, 6, 4], lowestFret: 4, barre: { fret: 4, from: 1, to: 5 } },
  D:   { positions: [-1, -1, 0, 2, 3, 2] },
  Eb:  { positions: [-1, 6, 8, 8, 8, 6], lowestFret: 6, barre: { fret: 6, from: 1, to: 5 } },
  E:   { positions: [0, 2, 2, 1, 0, 0] },
  F:   { positions: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#':{ positions: [2, 4, 4, 3, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  G:   { positions: [3, 2, 0, 0, 0, 3] },
  'G#':{ positions: [4, 6, 6, 5, 4, 4], lowestFret: 4, barre: { fret: 4, from: 0, to: 5 } },
  A:   { positions: [-1, 0, 2, 2, 2, 0] },
  Bb:  { positions: [-1, 1, 3, 3, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  H:   { positions: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },

  // --- Minor ---
  Am:   { positions: [-1, 0, 2, 2, 1, 0] },
  Bbm:  { positions: [-1, 1, 3, 3, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  Hm:   { positions: [-1, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
  Cm:   { positions: [-1, 3, 5, 5, 4, 3], lowestFret: 3, barre: { fret: 3, from: 1, to: 5 } },
  'C#m':{ positions: [-1, 4, 6, 6, 5, 4], lowestFret: 4, barre: { fret: 4, from: 1, to: 5 } },
  Dm:   { positions: [-1, -1, 0, 2, 3, 1] },
  Em:   { positions: [0, 2, 2, 0, 0, 0] },
  Fm:   { positions: [1, 3, 3, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#m':{ positions: [2, 4, 4, 2, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  Gm:   { positions: [3, 5, 5, 3, 3, 3], lowestFret: 3, barre: { fret: 3, from: 0, to: 5 } },
  'G#m':{ positions: [4, 6, 6, 4, 4, 4], lowestFret: 4, barre: { fret: 4, from: 0, to: 5 } },

  // --- Dominant 7 ---
  A7:  { positions: [-1, 0, 2, 0, 2, 0] },
  Bb7: { positions: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  H7:  { positions: [-1, 2, 1, 2, 0, 2] },
  C7:  { positions: [-1, 3, 2, 3, 1, 0] },
  D7:  { positions: [-1, -1, 0, 2, 1, 2] },
  E7:  { positions: [0, 2, 0, 1, 0, 0] },
  F7:  { positions: [1, 3, 1, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#7':{ positions: [2, 4, 2, 3, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  G7:  { positions: [3, 2, 0, 0, 0, 1] },

  // --- Minor 7 ---
  Am7:  { positions: [-1, 0, 2, 0, 1, 0] },
  Hm7:  { positions: [-1, 2, 0, 2, 0, 2] },
  Dm7:  { positions: [-1, -1, 0, 2, 1, 1] },
  Em7:  { positions: [0, 2, 0, 0, 0, 0] },
  'F#m7':{ positions: [2, 4, 2, 2, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },

  // --- Major 7 ---
  Cmaj7: { positions: [-1, 3, 2, 0, 0, 0] },
  Dmaj7: { positions: [-1, -1, 0, 2, 2, 2] },
  Fmaj7: { positions: [-1, -1, 3, 2, 1, 0] },
  Gmaj7: { positions: [3, 2, 0, 0, 0, 2] },
  Amaj7: { positions: [-1, 0, 2, 1, 2, 0] },
  Hmaj7: { positions: [-1, 2, 4, 3, 4, 2], barre: { fret: 2, from: 1, to: 5 } },

  // --- Suspended + add ---
  Asus2: { positions: [-1, 0, 2, 2, 0, 0] },
  Asus4: { positions: [-1, 0, 2, 2, 3, 0] },
  Csus2: { positions: [-1, 3, 0, 0, 1, 3] },
  Csus4: { positions: [-1, 3, 3, 0, 1, 1] },
  Dsus2: { positions: [-1, -1, 0, 2, 3, 0] },
  Dsus4: { positions: [-1, -1, 0, 2, 3, 3] },
  Esus4: { positions: [0, 2, 2, 2, 0, 0] },
  Gsus4: { positions: [3, 3, 0, 0, 1, 3] },
  Cadd9: { positions: [-1, 3, 2, 0, 3, 0] },
  Emaj7: { positions: [0, 2, 1, 1, 0, 0] },

  // --- Minor extras ---
  Ebm: { positions: [-1, 6, 8, 8, 7, 6], lowestFret: 6, barre: { fret: 6, from: 1, to: 5 } },

  // --- Power chords (root + 5th + octave on low strings) ---
  E5: { positions: [0, 2, 2, -1, -1, -1] },
  A5: { positions: [-1, 0, 2, 2, -1, -1] },
  D5: { positions: [-1, -1, 0, 2, 3, -1] },
  G5: { positions: [3, 5, 5, -1, -1, -1] },

  // --- Common slash chords ---
  'D/F#': { positions: [2, 0, 0, 2, 3, 2] },
  'C/G':  { positions: [3, 3, 2, 0, 1, 0] },
  'G/H':  { positions: [-1, 2, 0, 0, 0, 3] },
};

// Maps non-canonical spellings to canonical entries:
//   - Norwegian "B/Bm/B7" → "H/Hm/H7" (Nordic visegrep convention).
//   - Enharmonic equivalents: A# = Bb, D# = Eb, Ab = G#, Db = C#, Gb = F#.
//     One canonical entry per pair; the alternate name aliases in.
// Choice of canonical name follows what's more common in the catalog:
//   Bb (779) > A# (122) → Bb canonical
//   Eb (299) > D# (192) → Eb canonical
//   G# (233) > Ab (189) → G# canonical
//   F# (613) > Gb (~0) → F# canonical
//   C# (280) > Db (~0) → C# canonical
const ALIASES = {
  // English B-naming → Norwegian H-naming
  B: 'H', Bm: 'Hm', B7: 'H7', Bmaj7: 'Hmaj7', Bm7: 'Hm7',
  'G/B': 'G/H',
  // Enharmonics
  'A#': 'Bb', 'A#m': 'Bbm', 'A#7': 'Bb7',
  'D#': 'Eb',
  Ab: 'G#', Abm: 'G#m',
  Db: 'C#', Dbm: 'C#m',
  Gb: 'F#', Gbm: 'F#m',
};

/**
 * Look up the fingering for a chord name. Two-stage fallback:
 *   1. Direct match (with alias normalisation).
 *   2. Slash-chord with a bass note we don't have a diagram for:
 *      strip the bass and look up the base chord. Visegrep-friendly —
 *      "Am/E" renders as the Am shape since the bass-note difference
 *      is the kind of "weird stuff" beginners can ignore.
 * Returns null only when even the base chord is unknown to us.
 */
export function getChordFingering(name) {
  if (!name) return null;
  const direct = CHORD_FINGERINGS[ALIASES[name] ?? name];
  if (direct) return direct;
  const slashIdx = name.indexOf('/');
  if (slashIdx > 0) {
    const base = name.slice(0, slashIdx);
    return CHORD_FINGERINGS[ALIASES[base] ?? base] ?? null;
  }
  return null;
}
