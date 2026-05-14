import { getSong } from '../catalog.js';
import { escapeHtml } from '../util.js';
import { renderTabUI } from './tab.js';

export function render(state, root) {
  const result = getSong(state.route.id);
  if (!result) {
    root.innerHTML = `<p><a href="#/">&larr; Letters</a></p><p>Song not found.</p>`;
    return;
  }
  const { song, artist } = result;

  // Single-tab songs render the tab UI inline — the URL stays `#/song/:id`,
  // and the back-link skips straight to the artist. Avoids a useless
  // "1 of 1" intermediate page without breaking URL sharing.
  if (song.tabs.length === 1) {
    const tab = song.tabs[0];
    renderTabUI(root, { tab, song, artist }, {
      href: `#/artist/${artist.id}`,
      label: artist.name,
    });
    return;
  }

  root.innerHTML = `
    <p><a href="#/artist/${artist.id}">&larr; ${escapeHtml(artist.name)}</a></p>
    <h1>${escapeHtml(song.name)}</h1>
    ${song.tabs.length === 0
      ? '<p>No tabs.</p>'
      : `<ul>${song.tabs.map(t => {
          const by = t.uploaded_by_name ? ` by ${escapeHtml(t.uploaded_by_name)}` : '';
          return `<li><a href="#/tab/${t.id}">Tab #${t.id}${by}</a></li>`;
        }).join('')}</ul>`}
  `;
}
