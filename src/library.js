// Biblioteca: varre as pastas, entende "Artista - Música" e guarda tudo em library.json.
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.mpg', '.mpeg', '.flv']);

// Pastas com estes nomes viram o gênero das músicas dentro delas.
const FOLDER_GENRES = {
  'sertanejo': 'Sertanejo', 'sertanejo universitario': 'Sertanejo', 'mpb': 'MPB', 'samba': 'Samba', 'pagode': 'Pagode',
  'axe': 'Axé', 'forro': 'Forró', 'funk': 'Funk', 'rock': 'Rock', 'rock nacional': 'Rock Nacional',
  'pop': 'Pop', 'gospel': 'Gospel', 'internacional': 'Internacional', 'nacional': 'Nacional', 'brega': 'Brega',
  'arrocha': 'Arrocha', 'piseiro': 'Piseiro', 'reggae': 'Reggae', 'rap': 'Rap', 'hip hop': 'Hip Hop',
  'country': 'Country', 'romantica': 'Românticas', 'romanticas': 'Românticas', 'anos 80': 'Anos 80',
  'anos 90': 'Anos 90', 'flashback': 'Flashback', 'infantil': 'Infantil', 'bossa nova': 'Bossa Nova',
  'jovem guarda': 'Jovem Guarda', 'pop rock': 'Pop Rock', 'eletronica': 'Eletrônica', 'latina': 'Latina'
};

// Tags do MusicBrainz → gênero em português (a primeira que aparecer, pela ordem de votos).
const MB_GENRES = [
  [/sertanejo/, 'Sertanejo'], [/^mpb$|música popular brasileira|musica popular brasileira/, 'MPB'], [/bossa nova/, 'Bossa Nova'],
  [/pagode/, 'Pagode'], [/samba/, 'Samba'], [/ax[ée]/, 'Axé'], [/forr[óo]/, 'Forró'], [/piseiro|pisadinha/, 'Piseiro'],
  [/arrocha/, 'Arrocha'], [/brega/, 'Brega'], [/funk carioca|baile funk|brazilian funk/, 'Funk'], [/jovem guarda/, 'Jovem Guarda'],
  [/gospel|christian|worship|cristã/, 'Gospel'], [/heavy metal|metal/, 'Metal'], [/punk/, 'Punk'], [/pop rock/, 'Pop Rock'],
  [/rock/, 'Rock'], [/k-pop|kpop/, 'K-Pop'], [/latin|reggaeton/, 'Latina'], [/reggae/, 'Reggae'], [/hip hop|hip-hop/, 'Hip Hop'],
  [/rap/, 'Rap'], [/r&b|rnb|rhythm and blues/, 'R&B'], [/soul/, 'Soul'], [/funk/, 'Funk'], [/disco/, 'Disco'],
  [/country/, 'Country'], [/blues/, 'Blues'], [/jazz/, 'Jazz'], [/electronic|house|techno|edm|dance/, 'Eletrônica'],
  [/folk/, 'Folk'], [/indie/, 'Indie'], [/pop/, 'Pop']
];

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

// "01 - Tim Maia - Azul da Cor do Mar (Karaokê).mp4" → { artist: "Tim Maia", title: "Azul da Cor do Mar" }
function parseName(file) {
  let base = path.basename(file, path.extname(file));
  base = base.replace(/_/g, ' ')
    .replace(/[\[(][^\])]*(karaok[eê]|kara[oô]k[eê]|playback|instrumental|lyrics?|letra|vers[aã]o|version|hd|1080p|720p|4k)[^\])]*[\])]/gi, '')
    .replace(/\b(karaok[eê]|playback)\b/gi, '')
    .replace(/^\s*\d{1,4}\s*[-.)]\s*/, '')
    .replace(/\s{2,}/g, ' ').trim();
  const parts = base.split(/\s+[-–—|]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
  return { artist: null, title: base || path.basename(file) };
}

async function walk(dir, out, depth = 0) {
  if (depth > 8) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

async function open(userData) {
  const file = path.join(userData, 'library.json');
  const thumbDir = path.join(userData, 'thumbs');
  await fsp.mkdir(thumbDir, { recursive: true });

  let data = { version: 1, folders: [], songs: [], artists: {}, history: [], settings: {} };
  try { data = Object.assign(data, JSON.parse(await fsp.readFile(file, 'utf8'))); } catch { /* primeira vez */ }
  data.settings = Object.assign({ scoreMode: 'mic', micId: '', sensitivity: 50, singer: '' }, data.settings);

  let timer = null;
  // Salvamentos em fila: dois ao mesmo tempo disputariam o mesmo arquivo temporário.
  let saving = Promise.resolve();
  const write = async () => {
    const tmp = file + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(data));
    await fsp.rename(tmp, file);
  };
  const store = {
    data, thumbDir,
    save() {
      clearTimeout(timer);
      saving = saving.then(write, write);
      return saving;
    },
    saveSoon() { clearTimeout(timer); timer = setTimeout(() => store.save(), 1500); },

    async scan(progress) {
      const found = [];
      for (const folder of data.folders) {
        progress && progress({ kind: 'scan', text: 'Procurando vídeos em ' + folder });
        await walk(folder, found);
      }
      const old = new Map(data.songs.map((s) => [s.id, s]));
      // Lê o tamanho/data de vários arquivos ao mesmo tempo (HD externo e rede ficam bem mais rápidos).
      const stats = new Array(found.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(32, found.length) }, async () => {
        while (next < found.length) { const i = next++; try { stats[i] = await fsp.stat(found[i]); } catch { stats[i] = null; } }
      }));
      const songs = [];
      for (let i = 0; i < found.length; i++) {
        const f = found[i], st = stats[i];
        if (!st) continue;
        const id = hash(f.toLowerCase());
        const prev = old.get(id);
        const parsed = parseName(f);
        const root = data.folders.find((r) => f.toLowerCase().startsWith(r.toLowerCase()));
        const rel = root ? path.relative(root, path.dirname(f)) : '';
        const dirs = rel ? rel.split(path.sep) : [];
        // Sem "Artista - Música" no nome: usa a pasta do arquivo como artista, se houver uma.
        const folderArtist = dirs.length && !FOLDER_GENRES[norm(dirs[dirs.length - 1])] ? dirs[dirs.length - 1] : null;
        const folderGenre = dirs.map((d) => FOLDER_GENRES[norm(d)]).find(Boolean) || null;
        const song = Object.assign({
          id, plays: 0, fav: false, lastPlayed: 0, duration: 0, thumb: null, unsupported: false, edited: false, genre: null
        }, prev, {
          path: f, file: path.basename(f), size: st.size, mtime: st.mtimeMs, folderGenre
        });
        if (!song.edited) {
          song.title = parsed.title;
          song.artist = parsed.artist || folderArtist || 'Artista desconhecido';
        }
        if (prev && prev.mtime !== st.mtimeMs) { song.thumb = null; song.unsupported = false; }
        songs.push(song);
      }
      songs.sort((a, b) => a.artist.localeCompare(b.artist, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'));
      data.songs = songs;
      for (const s of songs) {
        const a = data.artists[s.artist] = data.artists[s.artist] || { genre: null, source: null };
        if (!a.genre && s.folderGenre) { a.genre = s.folderGenre; a.source = 'pasta'; }
      }
      progress && progress({ kind: 'done', text: songs.length + ' vídeos encontrados' });
      await store.save();
    },

    async updateSong(id, patch) {
      const s = data.songs.find((x) => x.id === id);
      if (!s) return;
      const allowed = ['title', 'artist', 'genre', 'fav'];
      for (const k of allowed) if (k in patch) s[k] = patch[k];
      if ('title' in patch || 'artist' in patch) s.edited = true;
      if (s.artist && !data.artists[s.artist]) data.artists[s.artist] = { genre: null, source: null };
      store.saveSoon();
      return s;
    },
    async setArtistGenre(artist, genre) {
      data.artists[artist] = Object.assign(data.artists[artist] || {}, { genre: genre || null, source: 'manual' });
      store.saveSoon();
      return data.artists[artist];
    },
    async played(id) {
      const s = data.songs.find((x) => x.id === id);
      if (s) { s.plays = (s.plays || 0) + 1; s.lastPlayed = Date.now(); store.saveSoon(); }
    },
    async addHistory(entry) {
      data.history.unshift(Object.assign({ at: Date.now() }, entry));
      data.history = data.history.slice(0, 200);
      await store.save();
    },

    // Busca o gênero dos artistas sem gênero no MusicBrainz (1 pedido por segundo, regra deles).
    async fetchGenres(progress) {
      const names = Object.keys(data.artists).filter((n) => !data.artists[n].genre && !data.artists[n].mbChecked && n !== 'Artista desconhecido');
      let i = 0;
      for (const name of names) {
        i++;
        progress && progress({ kind: 'genres', text: `Buscando gênero ${i}/${names.length}: ${name}` });
        try {
          const url = 'https://musicbrainz.org/ws/2/artist/?fmt=json&limit=1&query=' + encodeURIComponent('artist:"' + name.replace(/"/g, '') + '"');
          let res;
          for (let attempt = 0; attempt < 4; attempt++) {
            res = await fetch(url, { headers: { 'User-Agent': 'Amethyst-Karaoke/1.0.0 (+https://github.com/ruan2311/amethyst)', Accept: 'application/json' } });
            if (res.status !== 503) break;
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
          if (res.ok) {
            const json = await res.json();
            const a = json.artists && json.artists[0];
            if (a && a.score >= 85) {
              const tags = (a.tags || []).concat(a.genres || []).sort((x, y) => (y.count || 0) - (x.count || 0)).map((t) => t.name.toLowerCase());
              let genre = null;
              for (const t of tags) { const hit = MB_GENRES.find(([re]) => re.test(t)); if (hit) { genre = hit[1]; break; } }
              if (genre) Object.assign(data.artists[name], { genre, source: 'musicbrainz' });
            }
            data.artists[name].mbChecked = true;
          }
        } catch { /* sem internet: tenta de novo outro dia */ }
        await new Promise((r) => setTimeout(r, 1100));
      }
      progress && progress({ kind: 'done', text: names.length ? 'Gêneros atualizados' : 'Nenhum artista sem gênero para buscar' });
      await store.save();
    }
  };
  return store;
}

module.exports = { open, parseName };
