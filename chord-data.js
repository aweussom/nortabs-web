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
  F:   {
    // Visegrep default: x on the deep E, B and high-E share a small fret-1
    // mini-barre with the index finger. Tommy: "F-Dur tar jeg nesten alltid
    // med X på dyp E".
    positions: [-1, 3, 3, 2, 1, 1],
    barre: { fret: 1, from: 4, to: 5 },
    label: 'vise',
    alt: {
      positions: [1, 3, 3, 2, 1, 1],
      barre: { fret: 1, from: 0, to: 5 },
      label: 'barré',
    },
  },
  'F#':{ positions: [2, 4, 4, 3, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  G:   { positions: [3, 2, 0, 0, 0, 3] },
  'G#':{ positions: [4, 6, 6, 5, 4, 4], lowestFret: 4, barre: { fret: 4, from: 0, to: 5 } },
  A:   { positions: [-1, 0, 2, 2, 2, 0] },
  Bb:  {
    // Visegrep default: 4-string, mute low E and A, mini-barre on the
    // top four strings (D-G-B at fret 3, plus the high-E shifts to fret 1
    // via a separate fingering — index for the high-E, ring-finger 3-string
    // barre for D-G-B). Tommy: "Bb som 4-streng er også bra".
    positions: [-1, -1, 3, 3, 3, 1],
    barre: { fret: 3, from: 2, to: 4 },
    label: 'vise',
    alt: {
      positions: [-1, 1, 3, 3, 3, 1],
      barre: { fret: 1, from: 1, to: 5 },
      label: 'barré',
    },
  },
  H:   { positions: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },

  // --- Minor ---
  Am:   { positions: [-1, 0, 2, 2, 1, 0] },
  Bbm:  { positions: [-1, 1, 3, 3, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  Hm: {
    // Visegrep default: open A string in the bass, mute the low E.
    // Technically Hm/A (A is the b7 over B-minor → also reads as Hm7
    // without the B root), but sits cleanly in folk/vise contexts and
    // avoids the A-shape barre. Tommy: "klinger faktisk ganske greit".
    positions: [-1, 0, 4, 4, 3, 2],
    label: 'vise',
    alt: {
      positions: [-1, 2, 4, 4, 3, 2],
      barre: { fret: 2, from: 1, to: 5 },
      label: 'barré',
    },
  },
  Cm:   {
    // Default: A-shape barre at fret 3. Tommy: "C-moll KAN tas som
    // 4-streng i nødsfall" — barre is still the right default; the
    // 4-string version is offered as an alt for the player who can't
    // (yet) barre.
    positions: [-1, 3, 5, 5, 4, 3],
    lowestFret: 3,
    barre: { fret: 3, from: 1, to: 5 },
    label: 'barré',
    alt: {
      positions: [-1, -1, 5, 5, 4, 3],
      lowestFret: 3,
      barre: { fret: 3, from: 2, to: 3 },
      label: 'vise',
    },
  },
  'C#m':{ positions: [-1, 4, 6, 6, 5, 4], lowestFret: 4, barre: { fret: 4, from: 1, to: 5 } },
  Dm:   { positions: [-1, -1, 0, 2, 3, 1] },
  Em:   { positions: [0, 2, 2, 0, 0, 0] },
  Fm:   {
    // Visegrep default: 4-string, mute low E and A. Tommy: "F-moll også
    // som 4-streng".
    positions: [-1, -1, 3, 1, 1, 1],
    barre: { fret: 1, from: 3, to: 5 },
    label: 'vise',
    alt: {
      positions: [1, 3, 3, 1, 1, 1],
      barre: { fret: 1, from: 0, to: 5 },
      label: 'barré',
    },
  },
  'F#m': {
    // Visegrep default: 4-string, mute low E and A, partial mini-barre on
    // the top three strings at fret 2. Tommy: "Din variant ser bra ut".
    positions: [-1, -1, 4, 2, 2, 2],
    barre: { fret: 2, from: 3, to: 5 },
    label: 'vise',
    alt: {
      positions: [2, 4, 4, 2, 2, 2],
      lowestFret: 2,
      barre: { fret: 2, from: 0, to: 5 },
      label: 'barré',
    },
  },
  Gm:   { positions: [3, 5, 5, 3, 3, 3], lowestFret: 3, barre: { fret: 3, from: 0, to: 5 } },
  'G#m':{ positions: [4, 6, 6, 4, 4, 4], lowestFret: 4, barre: { fret: 4, from: 0, to: 5 } },

  // --- Dominant 7 ---
  A7:  { positions: [-1, 0, 2, 0, 2, 0] },
  Bb7: { positions: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  H7:  { positions: [-1, 2, 1, 2, 0, 2] },
  C7:  { positions: [-1, 3, 2, 3, 1, 0] },
  'C#7':{ positions: [-1, 4, 6, 4, 6, 4], lowestFret: 4, barre: { fret: 4, from: 1, to: 5 } },
  D7:  { positions: [-1, -1, 0, 2, 1, 2] },
  Eb7: { positions: [-1, 6, 8, 6, 8, 6], lowestFret: 6, barre: { fret: 6, from: 1, to: 5 } },
  E7:  { positions: [0, 2, 0, 1, 0, 0] },
  E9:  { positions: [0, 2, 0, 1, 3, 2] },
  F7:  { positions: [1, 3, 1, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#7':{ positions: [2, 4, 2, 3, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  G7:  { positions: [3, 2, 0, 0, 0, 1] },
  A7sus4: { positions: [-1, 0, 2, 0, 3, 0] },

  // --- Minor 7 ---
  Am7:  { positions: [-1, 0, 2, 0, 1, 0] },
  Hm7:  { positions: [-1, 2, 0, 2, 0, 2] },
  Cm7:  { positions: [-1, 3, 5, 3, 4, 3], lowestFret: 3, barre: { fret: 3, from: 1, to: 5 } },
  'C#m7':{ positions: [-1, 4, 6, 4, 5, 4], lowestFret: 4, barre: { fret: 4, from: 1, to: 5 } },
  Dm7:  { positions: [-1, -1, 0, 2, 1, 1] },
  Em7:  { positions: [0, 2, 0, 0, 0, 0] },
  Fm7:  { positions: [1, 3, 1, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#m7':{ positions: [2, 4, 2, 2, 2, 2], lowestFret: 2, barre: { fret: 2, from: 0, to: 5 } },
  Gm7:  { positions: [3, 5, 3, 3, 3, 3], lowestFret: 3, barre: { fret: 3, from: 0, to: 5 } },
  'G#m7':{ positions: [4, 6, 4, 4, 4, 4], lowestFret: 4, barre: { fret: 4, from: 0, to: 5 } },

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
  Hsus4: { positions: [-1, 2, 4, 4, 5, 2], lowestFret: 2, barre: { fret: 2, from: 1, to: 5 } },
  Aadd9: { positions: [-1, 0, 2, 4, 2, 0] },
  Cadd9: { positions: [-1, 3, 2, 0, 3, 0] },
  Dadd9: { positions: [2, 0, 0, 2, 3, 0] },
  Emaj7: { positions: [0, 2, 1, 1, 0, 0] },

  // --- 6th chords ---
  G6: { positions: [3, 2, 0, 0, 0, 0] },
  A6: { positions: [-1, 0, 2, 2, 2, 2] },

  // --- Minor extras ---
  Ebm: { positions: [-1, 6, 8, 8, 7, 6], lowestFret: 6, barre: { fret: 6, from: 1, to: 5 } },

  // --- Power chords (root + 5th + octave on low strings) ---
  E5:  { positions: [0, 2, 2, -1, -1, -1] },
  A5:  { positions: [-1, 0, 2, 2, -1, -1] },
  H5:  { positions: [-1, 2, 4, 4, -1, -1] },
  C5:  { positions: [-1, 3, 5, 5, -1, -1] },
  D5:  { positions: [-1, -1, 0, 2, 3, -1] },
  G5:  { positions: [3, 5, 5, -1, -1, -1] },

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
  Bsus4: 'Hsus4', B5: 'H5',
  'G/B': 'G/H',
  // Enharmonics: pick the spelling more common in the catalog as canonical,
  // alias the other in. (See chord-data audit in PLAN.md / commit history.)
  'A#': 'Bb', 'A#m': 'Bbm', 'A#7': 'Bb7',
  'D#': 'Eb', 'D#m': 'Ebm', 'D#7': 'Eb7',
  Ab: 'G#', Abm: 'G#m', 'Abm7': 'G#m7',
  Db: 'C#', Dbm: 'C#m', 'Dbm7': 'C#m7', 'Db7': 'C#7',
  Gb: 'F#', Gbm: 'F#m', 'Gbm7': 'F#m7', 'Gb7': 'F#7',
  // "Xmaj" with no number is just the X major triad. nortabs.net uploaders
  // occasionally write Gmaj where they mean G; alias the bare-suffix case.
  Cmaj: 'C', Dmaj: 'D', Emaj: 'E', Fmaj: 'F', Gmaj: 'G', Amaj: 'A', Hmaj: 'H',
  Bmaj: 'H',
  // Some uploaders use a capital-M suffix as shorthand for "major 7" (more
  // usual conventions are "maj7" or the triangle "Δ"). Empirical check
  // 2026-05-16: 18 tabs have BOTH "EM" and "Em" as distinct chord names,
  // 8 tabs do the same with AM/Am — that's evidence the uploaders treat
  // them as different chords, not typos. So "XM" = "Xmaj7" universally.
  // These specific aliases override the generic case-fold rule that would
  // otherwise lowercase "EM" → "Em".
  CM: 'Cmaj7', DM: 'Dmaj7', EM: 'Emaj7', FM: 'Fmaj7',
  GM: 'Gmaj7', AM: 'Amaj7', HM: 'Hmaj7', BM: 'Hmaj7',
};

/**
 * Normalise common spelling slips before lookup. The chord root (one
 * letter, optionally followed by # or b) keeps its case; everything else
 * lowercases. Catches uploader typos like "EM" → "Em", "AM" → "Am",
 * "DSUS4" → "Dsus4".
 */
function caseNormalize(name) {
  if (!name) return name;
  const isAccidental = name.length > 1 && (name[1] === '#' || name[1] === 'b');
  const rootLen = isAccidental ? 2 : 1;
  return name.slice(0, rootLen) + name.slice(rootLen).toLowerCase();
}

/**
 * Look up the fingering for a chord name. Three-stage fallback:
 *   1. Direct match (with alias normalisation).
 *   2. Case-normalised match — uploader typos like "EM"/"AM" resolve to
 *      Em/Am here.
 *   3. Slash-chord with a bass note we don't have a diagram for:
 *      strip the bass and look up the base chord. Visegrep-friendly —
 *      "Am/E" renders as the Am shape since the bass-note difference
 *      is the kind of "weird stuff" beginners can ignore.
 * Returns null only when even the base chord is unknown to us.
 */
export function getChordFingering(name) {
  if (!name) return null;
  // Stage 1: direct
  const direct = CHORD_FINGERINGS[ALIASES[name] ?? name];
  if (direct) return direct;
  // Stage 2: case-normalised suffix
  const normalized = caseNormalize(name);
  if (normalized !== name) {
    const viaCase = CHORD_FINGERINGS[ALIASES[normalized] ?? normalized];
    if (viaCase) return viaCase;
  }
  // Stage 3: slash chord, strip the bass note
  const slashIdx = name.indexOf('/');
  if (slashIdx > 0) {
    const base = caseNormalize(name.slice(0, slashIdx));
    return CHORD_FINGERINGS[ALIASES[base] ?? base] ?? null;
  }
  return null;
}
