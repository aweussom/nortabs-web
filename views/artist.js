import { getArtist } from '../catalog.js';
import { escapeHtml } from '../util.js';

export function render(state, root) {
  const result = getArtist(state.route.id);
  if (!result) {
    root.innerHTML = `<p><a href="#/">&larr; Letters</a></p><p>Artist not found.</p>`;
    return;
  }
  const { artist, letter } = result;
  root.innerHTML = `
    <p><a href="#/letter/${escapeHtml(letter)}">&larr; ${escapeHtml(letter.toUpperCase())}</a></p>
    <h1>${escapeHtml(artist.name)}</h1>
    ${artist.songs.length === 0
      ? '<p>No songs.</p>'
      : `<ul>${artist.songs.map(s => `<li><a href="#/song/${s.id}">${escapeHtml(s.name)} <span class="muted">(${s.tabs.length})</span></a></li>`).join('')}</ul>`}
  `;
}
