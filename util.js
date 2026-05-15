export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Some nortabs.net tab bodies arrive with pre-rendered HTML markup the
 * site uses to highlight ChordPro-style notation: chord names wrapped in
 * `<span class="chopro_chord">…</span>`, optional `<strong>` labels, and
 * chorus blocks in `<div class="chopro_chorus">…</div>`. We display tab
 * bodies as escaped text in a <pre>, so the user would otherwise see
 * literal "<span class=…>Bb</span>" strings.
 *
 * Strategy: strip only those three specific wrappers, keeping their
 * text content and the existing whitespace that drives chord-over-lyric
 * column alignment. Other angle-bracketed snippets (`<Capo 2>`, `<half
 * note>`, etc.) are left untouched — they're directives or notation,
 * not HTML.
 *
 * Survey at time of writing: 634 of 7652 tabs (~8%) use chopro_chord
 * spans; ~240 use the other markers (sometimes nested with chopro spans).
 */
export function cleanTabBody(body) {
  if (!body) return body;
  return body
    .replace(/<span class="chopro_chord">([^<]*)<\/span>/gi, '$1')
    .replace(/<\/?strong>/gi, '')
    .replace(/<div class="chopro_chorus">/gi, '')
    .replace(/<\/div>/gi, '');
}
