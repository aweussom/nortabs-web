import { APP_VERSION } from './version.js';

let _data = null;
const _byArtistId = new Map();
const _bySongId = new Map();
const _byTabId = new Map();

export async function loadCatalog() {
  if (_data) return _data;
  const res = await fetch(`catalog.json?v=${APP_VERSION}`);
  if (!res.ok) throw new Error(`Failed to load catalog.json: ${res.status}`);
  _data = await res.json();
  for (const [letter, bucket] of Object.entries(_data.letters ?? {})) {
    for (const artist of bucket.artists) {
      _byArtistId.set(artist.id, { artist, letter });
      for (const song of artist.songs) {
        _bySongId.set(song.id, { song, artist, letter });
        for (const tab of song.tabs) {
          _byTabId.set(tab.id, { tab, song, artist, letter });
        }
      }
    }
  }
  return _data;
}

export async function loadEnrichment() {
  try {
    const res = await fetch(`enrichment.json?v=${APP_VERSION}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getCatalogData() {
  return _data;
}

export function getCrawledLetters() {
  return _data?.letters ? Object.keys(_data.letters) : [];
}

export function getArtistsForLetter(letter) {
  return _data?.letters?.[letter.toLowerCase()]?.artists ?? null;
}

export function getArtist(id) {
  return _byArtistId.get(id) ?? null;
}

export function getSong(id) {
  return _bySongId.get(id) ?? null;
}

export function getTab(id) {
  return _byTabId.get(id) ?? null;
}
