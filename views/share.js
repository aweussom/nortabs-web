import { importSharedSongbook } from '../storage.js';
import { getTab } from '../catalog.js';
import { escapeHtml } from '../util.js';

export function render(state, root) {
  const { shareName, tab_ids } = state.route;

  const rows = tab_ids.map(tid => {
    const r = getTab(tid);
    if (!r) return `<li class="missing"><span class="muted">Tab #${tid} (mangler i katalog)</span></li>`;
    const { tab, song, artist } = r;
    return `<li><a href="#/tab/${tab.id}">${escapeHtml(artist.name)} &mdash; ${escapeHtml(song.name)}</a></li>`;
  }).join('');

  const missing = tab_ids.filter(tid => !getTab(tid)).length;

  root.innerHTML = `
    <p><a href="#/">&larr; Hjem</a></p>
    <h1>${escapeHtml(shareName)}</h1>
    <p class="muted">Delt sangbok &mdash; ${tab_ids.length} ${tab_ids.length === 1 ? 'tab' : 'tabs'}${missing > 0 ? `, ${missing} mangler i katalogen` : ''}.</p>
    ${tab_ids.length === 0
      ? '<p>Lenken inneholder ingen tabs.</p>'
      : `<ol class="songbook-tabs">${rows}</ol>`}
    <p>
      <button id="save-btn">Lagre til mine sangbøker</button>
    </p>
  `;

  root.querySelector('#save-btn').addEventListener('click', () => {
    if (tab_ids.length === 0) {
      alert('Tom sangbok, ingenting å lagre.');
      return;
    }
    const id = importSharedSongbook(shareName, tab_ids);
    location.hash = `#/songbook/${encodeURIComponent(id)}`;
  });
}
