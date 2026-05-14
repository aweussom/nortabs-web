import { getTab } from '../catalog.js';
import {
  isInFavorites,
  toggleFavorite,
  getSongbooks,
  getSongbooksContaining,
  addToSongbook,
  removeFromSongbook,
  createSongbook,
  getPlaybackDuration,
  setPlaybackDuration,
  getPlaybackStartY,
  setPlaybackStartY,
} from '../storage.js';
import { escapeHtml } from '../util.js';
import * as playback from '../playback.js';

let _keyHandler = null;
let _scrollListener = null;

function renderHeart(tabId) {
  return isInFavorites(tabId) ? '♥' : '♡';
}

function renderPicker(tabId) {
  const all = getSongbooks();
  const containing = new Set(getSongbooksContaining(tabId).map(s => s.id));
  const rows = all.map(sb => `
    <label>
      <input type="checkbox" data-songbook="${escapeHtml(sb.id)}" ${containing.has(sb.id) ? 'checked' : ''}>
      ${escapeHtml(sb.name)}
    </label>
  `).join('');
  return `
    <details class="songbook-picker">
      <summary>Legg til i sangbok</summary>
      <div class="songbook-picker-body">
        ${rows}
        <button class="new-songbook-btn">+ Ny sangbok…</button>
      </div>
    </details>
  `;
}

function formatRemaining(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} sek igjen`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (sec === 0) return `${min} min igjen`;
  return `${min} min ${sec} sek igjen`;
}

export function render(state, root) {
  const result = getTab(state.route.id);
  if (!result) {
    root.innerHTML = `<p><a href="#/">&larr; Letters</a></p><p>Tab not found.</p>`;
    return;
  }
  renderTabUI(root, result, {
    href: `#/song/${result.song.id}`,
    label: result.song.name,
  });
}

/**
 * Renders the full tab UI (heart, picker, body, playback HUD) into `root`.
 * Used by /tab/:id route AND by /song/:id when the song has exactly one tab
 * — in the latter case `backLink` points to the artist, skipping the otherwise
 * useless "song with 1 tab" intermediate page without changing the URL.
 */
export function renderTabUI(root, refs, backLink) {
  const { tab, song, artist } = refs;
  const chords = Array.isArray(tab.chordnames) && tab.chordnames.length
    ? `<p class="chords">Chords: ${escapeHtml(tab.chordnames.join(' '))}</p>`
    : '';

  root.innerHTML = `
    <p><a href="${escapeHtml(backLink.href)}">&larr; ${escapeHtml(backLink.label)}</a></p>
    <div class="tab-header">
      <h1>${escapeHtml(artist.name)} &mdash; ${escapeHtml(song.name)}</h1>
      <button class="heart" id="heart-btn" title="Legg til/fjern fra Favoritter">${renderHeart(tab.id)}</button>
      <button id="play-btn" title="Start auto-scroll fra gjeldende posisjon">▶ Auto-scroll</button>
    </div>
    ${renderPicker(tab.id)}
    ${chords}
    <pre class="tab-body">${escapeHtml(tab.body || '')}</pre>
    <div id="playback-hud" data-phase="idle">
      <div class="hud-time" id="hud-time"></div>
      <div class="hud-controls" id="hud-controls"></div>
    </div>
  `;

  const heartBtn = root.querySelector('#heart-btn');
  heartBtn.addEventListener('click', () => {
    toggleFavorite(tab.id);
    heartBtn.textContent = renderHeart(tab.id);
    rerenderPicker(root, tab.id);
  });

  wirePicker(root, tab.id);
  wirePlayback(root, tab.id);
}

function rerenderPicker(root, tabId) {
  const old = root.querySelector('.songbook-picker');
  if (!old) return;
  const wasOpen = old.open;
  old.outerHTML = renderPicker(tabId);
  const fresh = root.querySelector('.songbook-picker');
  if (wasOpen) fresh.open = true;
  wirePicker(root, tabId);
}

function wirePicker(root, tabId) {
  for (const cb of root.querySelectorAll('.songbook-picker input[type="checkbox"]')) {
    cb.addEventListener('change', () => {
      const sbId = cb.dataset.songbook;
      if (cb.checked) addToSongbook(sbId, tabId);
      else removeFromSongbook(sbId, tabId);
      const heartBtn = root.querySelector('#heart-btn');
      if (heartBtn) heartBtn.textContent = renderHeart(tabId);
    });
  }
  const newBtn = root.querySelector('.songbook-picker .new-songbook-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const name = prompt('Navn på sangbok:');
      if (!name || !name.trim()) return;
      const sbId = createSongbook(name.trim());
      addToSongbook(sbId, tabId);
      rerenderPicker(root, tabId);
    });
  }
}

function wirePlayback(root, tabId) {
  const playBtn = root.querySelector('#play-btn');
  const hud = root.querySelector('#playback-hud');
  const hudTime = root.querySelector('#hud-time');
  const hudControls = root.querySelector('#hud-controls');

  function estimateIdleRemaining() {
    const endY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (endY <= 0) return 0;
    const remainingPx = Math.max(0, endY - window.scrollY);
    const total = getPlaybackDuration(tabId);
    return (remainingPx / endY) * total;
  }

  function renderHud(phase) {
    hud.dataset.phase = phase;
    if (phase === 'idle') {
      hudTime.textContent = formatRemaining(estimateIdleRemaining());
      hudControls.innerHTML = `<button data-action="start">▶ Start</button>`;
    } else if (phase === 'countdown') {
      hudControls.innerHTML = `<button data-action="cancel">Avbryt</button>`;
    } else if (phase === 'playing') {
      hudControls.innerHTML = `
        <button data-action="slower" title="Tregere (←)">−</button>
        <button data-action="faster" title="Raskere (→)">+</button>
        <button data-action="pause">⏸ Pause</button>
      `;
    } else if (phase === 'paused') {
      hudControls.innerHTML = `
        <button data-action="slower" title="Tregere (←)">−</button>
        <button data-action="faster" title="Raskere (→)">+</button>
        <button data-action="resume">▶ Fortsett</button>
      `;
    }
  }

  function renderTopButton(phase) {
    if (phase === 'idle') {
      playBtn.textContent = '▶ Auto-scroll';
      playBtn.disabled = false;
    } else if (phase === 'countdown') {
      playBtn.disabled = true;
    } else if (phase === 'playing') {
      playBtn.textContent = '⏸ Pause';
      playBtn.disabled = false;
    } else if (phase === 'paused') {
      playBtn.textContent = '▶ Fortsett';
      playBtn.disabled = false;
    }
  }

  const onCountdown = (n) => {
    if (n > 0) {
      hudTime.textContent = `Klargjør… ${n}`;
      playBtn.textContent = `Klargjør… ${n}`;
      playBtn.disabled = true;
    } else {
      hudTime.textContent = formatRemaining(playback.getRemainingSeconds() ?? 0);
    }
  };

  let lastPersistedSpeed = null;
  const onTick = (remaining, speed) => {
    hudTime.textContent = formatRemaining(remaining);
    // Persist only when speed has actually changed (i.e. user adjusted it).
    // During constant-speed glide, tick fires at 60Hz but speed is unchanged
    // — no need to spam localStorage.
    if (speed !== lastPersistedSpeed) {
      lastPersistedSpeed = speed;
      const total = Math.round(
        (document.documentElement.scrollHeight - window.innerHeight) / speed
      );
      if (Number.isFinite(total) && total > 5) setPlaybackDuration(tabId, total);
    }
  };

  const onPhaseChange = (phase) => {
    renderHud(phase);
    renderTopButton(phase);
  };

  const onStop = () => {
    renderHud('idle');
    renderTopButton('idle');
  };

  function startPlayback() {
    const endY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    // If we're at the bottom (e.g. just finished a playback), restore the last
    // user-chosen start position before starting again. Fallback to top.
    if (window.scrollY >= endY - 2) {
      const savedY = getPlaybackStartY(tabId);
      const restoreY = (savedY != null && savedY < endY) ? savedY : 0;
      window.scrollTo(0, restoreY);
    }
    // Remember the position the user is starting from — this becomes the
    // restore point next time playback reaches the bottom.
    setPlaybackStartY(tabId, Math.round(window.scrollY));
    const duration = getPlaybackDuration(tabId);
    const started = playback.start(duration, { onCountdown, onTick, onStop, onPhaseChange });
    if (!started) alert('Ingenting å scrolle — du er allerede på bunnen.');
  }

  // Click on the top button OR HUD: figure out action from current phase.
  playBtn.addEventListener('click', () => {
    const phase = playback.getPhase();
    if (phase === 'idle') startPlayback();
    else if (phase === 'playing') playback.pause();
    else if (phase === 'paused') playback.resume();
    else if (phase === 'countdown') playback.stop();
  });

  hud.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (action === 'start') startPlayback();
    else if (action === 'pause') playback.pause();
    else if (action === 'resume') playback.resume();
    else if (action === 'cancel') playback.stop();
    else if (action === 'slower') playback.scaleSpeed(0.85);
    else if (action === 'faster') playback.scaleSpeed(1.18);
  });

  _keyHandler = (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const phase = playback.getPhase();
    if (phase !== 'playing' && phase !== 'paused') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      playback.scaleSpeed(0.85);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      playback.scaleSpeed(1.18);
    }
  };
  window.addEventListener('keydown', _keyHandler);

  // Update idle-time estimate as the user scrolls manually.
  let scrollRaf = null;
  _scrollListener = () => {
    if (playback.getPhase() !== 'idle') return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (playback.getPhase() === 'idle') {
        hudTime.textContent = formatRemaining(estimateIdleRemaining());
      }
    });
  };
  window.addEventListener('scroll', _scrollListener, { passive: true });

  renderHud('idle');
}

export function teardownTabBindings() {
  if (_keyHandler) {
    window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
  if (_scrollListener) {
    window.removeEventListener('scroll', _scrollListener);
    _scrollListener = null;
  }
  if (playback.isActive()) playback.stop();
}
