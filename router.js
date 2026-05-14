function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    const v = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

export function parseHash() {
  const raw = location.hash.slice(1);
  const qIdx = raw.indexOf('?');
  const path = qIdx < 0 ? raw : raw.slice(0, qIdx);
  const query = qIdx < 0 ? {} : parseQuery(raw.slice(qIdx + 1));

  const parts = path.split('/').filter(Boolean).map(p => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  if (parts.length === 0) return { name: 'home' };

  const [head, arg] = parts;
  if (head === 'letter' && arg) return { name: 'letter', letter: arg.toLowerCase() };
  if (head === 'artist' && arg) return { name: 'artist', id: Number(arg) };
  if (head === 'song' && arg) return { name: 'song', id: Number(arg) };
  if (head === 'tab' && arg) return { name: 'tab', id: Number(arg) };
  if (head === 'songbooks') return { name: 'songbooks' };
  if (head === 'songbook' && arg) return { name: 'songbook', id: arg };
  if (head === 'share') {
    const ids = (query.ids || '').split(',').map(Number).filter(n => Number.isFinite(n));
    return { name: 'share', shareName: query.name || 'Delt sangbok', tab_ids: ids };
  }
  return { name: 'home' };
}

export function startRouter(onChange) {
  window.addEventListener('hashchange', () => onChange(parseHash()));
  onChange(parseHash());
}
