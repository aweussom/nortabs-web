/**
 * Minimal SVG renderer for guitar-chord fingering diagrams.
 *
 * Input shape (see chord-data.js):
 *   positions: [low-E, A, D, G, B, high-E]
 *     -1  → muted (× above the nut)
 *      0  → open  (○ above the nut)
 *     >0  → fret number (filled dot at that fret)
 *   lowestFret (optional, default 1): which fret to render at the top of the
 *     diagram. >1 means the position shifts up the neck and the fret number
 *     is labelled on the left ("3fr"). Used for barre chords like B-major.
 *   barre (optional): { fret, from, to } — render a horizontal pill across
 *     strings `from`..`to` (0-indexed, low-E to high-E) at the given fret.
 *
 * Returns a detached <svg> element ready to append to the DOM.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 80;
const H = 100;
const PAD_X = 14;
const PAD_TOP = 24;
const PAD_BOTTOM = 8;
const FRETS = 4;
const STRINGS = 6;

const stringSpacing = (W - 2 * PAD_X) / (STRINGS - 1);
const fretSpacing = (H - PAD_TOP - PAD_BOTTOM) / FRETS;

function el(name, attrs = {}, text) {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

export function renderChordSvg(name, fingering) {
  const { positions, lowestFret = 1, barre } = fingering;
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chord-diagram',
    role: 'img',
    'aria-label': `Akkorddiagram for ${name}`,
  });

  svg.appendChild(el('text', {
    x: W / 2, y: 14,
    'text-anchor': 'middle',
    class: 'chord-diagram__label',
  }, name));

  if (lowestFret > 1) {
    svg.appendChild(el('text', {
      x: PAD_X - 4,
      y: PAD_TOP + fretSpacing / 2 + 3,
      'text-anchor': 'end',
      class: 'chord-diagram__fret-label',
    }, `${lowestFret}fr`));
  }

  for (let s = 0; s < STRINGS; s++) {
    const x = PAD_X + s * stringSpacing;
    svg.appendChild(el('line', {
      x1: x, y1: PAD_TOP, x2: x, y2: H - PAD_BOTTOM,
      class: 'chord-diagram__string',
    }));
  }

  for (let f = 0; f <= FRETS; f++) {
    const y = PAD_TOP + f * fretSpacing;
    svg.appendChild(el('line', {
      x1: PAD_X, y1: y, x2: W - PAD_X, y2: y,
      class: f === 0 && lowestFret === 1
        ? 'chord-diagram__nut'
        : 'chord-diagram__fret',
    }));
  }

  if (barre) {
    const fretRel = barre.fret - lowestFret + 1;
    if (fretRel >= 1 && fretRel <= FRETS) {
      const y = PAD_TOP + (fretRel - 0.5) * fretSpacing;
      const xFrom = PAD_X + barre.from * stringSpacing;
      const xTo = PAD_X + barre.to * stringSpacing;
      svg.appendChild(el('rect', {
        x: xFrom - 4,
        y: y - 4,
        width: xTo - xFrom + 8,
        height: 8,
        rx: 4,
        class: 'chord-diagram__barre',
      }));
    }
  }

  for (let s = 0; s < STRINGS; s++) {
    const x = PAD_X + s * stringSpacing;
    const fret = positions[s];
    if (fret === -1) {
      svg.appendChild(el('text', {
        x, y: PAD_TOP - 4,
        'text-anchor': 'middle',
        class: 'chord-diagram__mute',
      }, '×'));
    } else if (fret === 0) {
      svg.appendChild(el('circle', {
        cx: x, cy: PAD_TOP - 8, r: 3,
        class: 'chord-diagram__open',
      }));
    } else {
      const fretRel = fret - lowestFret + 1;
      if (fretRel >= 1 && fretRel <= FRETS) {
        svg.appendChild(el('circle', {
          cx: x,
          cy: PAD_TOP + (fretRel - 0.5) * fretSpacing,
          r: 4.5,
          class: 'chord-diagram__dot',
        }));
      }
    }
  }

  return svg;
}
