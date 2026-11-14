'use strict';
/**
 * Fast & Robust Multi-Tier Lyrics Engine for Armuse.
 * 
 * Tiers:
 * 1. Cache: Disk cache lookup (persisted per slugified artist + title).
 * 2. Parallel LRCLIB:
 *    - Strict /api/get (clean title & artist + real album + duration)
 *    - Specific /api/search (track_name + artist_name)
 *    - General /api/search (combined keyword query)
 * 3. Kugou Public LRC API:
 *    - Instant fallback for J-Pop, anime, Asian, instrumental & pop tracks.
 * 
 * Features:
 * - Automatically resolves track metadata from raw track (custom/meta) or hydrated track
 * - Smart query cleaner (strips track numbers, (Official Audio), [MV], feat., remaster tags)
 * - Auto-extracts "Artist - Title" if metadata is bundled in title
 * - Safe timeouts (3.5s max per tier) to never freeze the UI
 * - Never permanently locks failed queries into cache
 */

const fsp = require('fs/promises');
const path = require('path');

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}

function resolveTrackMeta(track) {
  if (!track) return { title: '', artist: '', album: '', duration: 0 };
  const custom = track.custom || {};
  const meta = track.meta || {};
  const title = custom.title || meta.title || track.title || '';
  const artist = custom.artist || meta.artist || custom.albumArtist || meta.albumArtist || track.artist || track.albumArtist || '';
  const album = custom.album || meta.album || track.album || '';
  const duration = track.duration || meta.duration || 0;
  return { title, artist, album, duration };
}

function cleanTitle(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // Strip leading track numbers like "01 - ", "01. ", "1. ", "01 "
  s = s.replace(/^\d+[\s.\-_]+/g, '');
  // Strip file extensions (.mp3, .flac, etc.)
  s = s.replace(/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i, '');
  // Remove common YouTube / release noise tags:
  s = s.replace(/[([{\uff08\u3010](?:official\s*(?:video|audio|music\s*video|lyric\s*video|mv)?|video\s*klip|music\s*video|lyric\s*video|audio|mv|visualizer|remastered(?:\s*\d{4})?|remaster|live(?:\s*\d{4})?)[)\]}\uff09\u3011]/gi, '');
  // Strip feat / ft inside brackets or standalone
  s = s.replace(/[([{\uff08\u3010]\s*(?:feat|ft|featuring)\.?\s*[^)\]}\uff09\u3011]+[)\]}\uff09\u3011]/gi, '');
  s = s.replace(/\s+(?:feat|ft|featuring)\.?\s+.+$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

function cleanArtist(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  const lower = s.toLowerCase();
  if (['artis tidak dikenal', 'unknown artist', '不明なアーティスト', 'unknown', 'various artists'].includes(lower)) {
    return '';
  }
  s = s.replace(/\s+(?:feat|ft|featuring)\.?\s+.+$/i, '');
  return s.trim();
}

function cacheFile(dir, rawTrack, customQuery) {
  const norm = resolveTrackMeta(rawTrack);
  const key = customQuery
    ? 'q_' + slug(customQuery)
    : slug(cleanArtist(norm.artist)) + '-' + slug(cleanTitle(norm.title));
  return path.join(dir, (key || 'track') + '.json');
}

async function getCached(dir, rawTrack, customQuery) {
  try {
    const f = cacheFile(dir, rawTrack, customQuery);
    const raw = await fsp.readFile(f, 'utf8');
    const data = JSON.parse(raw);
    return data;
  } catch (_) {
    return null;
  }
}

async function setCached(dir, rawTrack, customQuery, data) {
  if (!data || !data.found) return; // Do not cache failed queries permanently
  try {
    await fsp.mkdir(dir, { recursive: true });
    const f = cacheFile(dir, rawTrack, customQuery);
    const tmp = f + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(data));
    await fsp.rename(tmp, f);
  } catch (_) {}
}

async function fetchFastLyrics(rawTrack, customQuery) {
  const norm = resolveTrackMeta(rawTrack);
  let title = customQuery ? '' : cleanTitle(norm.title);
  let artist = customQuery ? '' : cleanArtist(norm.artist);
  let album = (!norm.album || ['tanpa album', 'no album', 'アルバムなし', 'single', 'lagu lepas'].includes(norm.album.toLowerCase())) ? '' : norm.album;
  const duration = norm.duration ? Math.round(norm.duration) : null;

  if (!customQuery && !artist && title.includes(' - ')) {
    const p = title.split(' - ');
    artist = p[0].trim();
    title = p.slice(1).join(' - ').trim();
  }

  const queryStr = customQuery || ((artist ? artist + ' ' : '') + title).trim();
  if (!queryStr) return { found: false };

  // Tier 1 & 2: LRCLIB (Parallel Exact + Search + General Query)
  try {
    const tasks = [];
    if (!customQuery && title) {
      // 1. Exact LRCLIB GET
      tasks.push((async () => {
        const p = new URLSearchParams({ track_name: title, artist_name: artist });
        if (album) p.set('album_name', album);
        if (duration) p.set('duration', String(duration));
        const res = await fetch('https://lrclib.net/api/get?' + p.toString(), {
          headers: { 'User-Agent': 'Armuse/1.0 (Desktop Music Player)' },
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const j = await res.json();
          if (j.syncedLyrics || j.plainLyrics || j.instrumental) return { source: 'LRCLIB (Exact)', data: j };
        }
        return null;
      })().catch(() => null));

      // 2. Specific LRCLIB Search
      tasks.push((async () => {
        const p = new URLSearchParams({ track_name: title });
        if (artist) p.set('artist_name', artist);
        const res = await fetch('https://lrclib.net/api/search?' + p.toString(), {
          headers: { 'User-Agent': 'Armuse/1.0 (Desktop Music Player)' },
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length) {
            let best = list.find((x) => x.syncedLyrics && duration && Math.abs(x.duration - duration) <= 3);
            if (!best) best = list.find((x) => x.syncedLyrics);
            if (!best) best = list[0];
            if (best && (best.syncedLyrics || best.plainLyrics || best.instrumental)) {
              return { source: 'LRCLIB', data: best };
            }
          }
        }
        return null;
      })().catch(() => null));
    }

    // 3. General LRCLIB Query Search
    tasks.push((async () => {
      const res = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(queryStr), {
        headers: { 'User-Agent': 'Armuse/1.0 (Desktop Music Player)' },
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          let best = list.find((x) => x.syncedLyrics && duration && Math.abs(x.duration - duration) <= 3);
          if (!best) best = list.find((x) => x.syncedLyrics);
          if (!best) best = list[0];
          if (best && (best.syncedLyrics || best.plainLyrics || best.instrumental)) {
            return { source: 'LRCLIB (Search)', data: best };
          }
        }
      }
      return null;
    })().catch(() => null));

    const results = await Promise.all(tasks);
    const match = results.find(Boolean);
    if (match) {
      const j = match.data;
      return {
        found: true,
        source: match.source,
        synced: j.syncedLyrics || null,
        plain: j.plainLyrics || null,
        instrumental: !!j.instrumental,
        trackName: j.trackName,
        artistName: j.artistName
      };
    }
  } catch (_) {}

  // Tier 3: Kugou Fallback (High coverage timed LRC)
  try {
    const sUrl = 'http://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent(queryStr) + '&page=1&pagesize=5&clientver=&platform=WebFilter';
    const res = await fetch(sUrl, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const list = (data.data && data.data.lists) || [];
    if (list.length) {
      const hash = list[0].FileHash;
      const cUrl = 'http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=' + hash;
      const cres = await fetch(cUrl, { signal: AbortSignal.timeout(3000) });
      const cdata = await cres.json();
      const cand = cdata.candidates && cdata.candidates[0];
      if (cand) {
        const dUrl = 'http://lyrics.kugou.com/download?ver=1&client=pc&id=' + cand.id + '&accesskey=' + cand.accesskey + '&fmt=lrc&charset=utf8';
        const dres = await fetch(dUrl, { signal: AbortSignal.timeout(3000) });
        const ddata = await dres.json();
        if (ddata.content) {
          const lrc = Buffer.from(ddata.content, 'base64').toString('utf8');
          return {
            found: true,
            source: 'Kugou',
            synced: lrc,
            plain: null,
            instrumental: false,
            trackName: cand.song || list[0].SongName,
            artistName: cand.singer || list[0].SingerName
          };
        }
      }
    }
  } catch (_) {}

  return { found: false };
}

async function get({ track, cacheDir, online = false, query = null }) {
  if (!track) return { found: false };

  // 1. Check local cache first
  const cached = await getCached(cacheDir, track, query);
  if (cached && cached.found) {
    return { ...cached, fromCache: true };
  }

  // 2. If offline request and not cached, return not found
  if (!online) {
    return { found: false };
  }

  // 3. Fast Online Search
  try {
    const data = await fetchFastLyrics(track, query);
    if (data && data.found) {
      await setCached(cacheDir, track, query, data);
      return { ...data, fromCache: false };
    }
    return { found: false };
  } catch (err) {
    return { found: false, error: err.message || String(err) };
  }
}

module.exports = { get, fetchFastLyrics, resolveTrackMeta, cleanTitle, cleanArtist };
