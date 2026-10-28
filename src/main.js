// Amethyst: processo principal (janela, biblioteca, arquivos de vídeo).
const { app, BrowserWindow, ipcMain, dialog, protocol, session, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Readable } = require('stream');
const library = require('./library');
const updater = require('./updater');
require('./renderer/lyrics'); // AmethystLyrics.parse para arquivos .lrc

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
]);

if (process.platform === 'win32') app.setAppUserModelId('Amethyst');
// Desenho pela placa de vídeo e sem "economia" quando a janela fica atrás de outra
// (a pontuação e a TV precisam continuar rodando com o notebook minimizado).
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// --selftest=<pasta>: abre com dados temporários, passa por todas as telas tirando prints e fecha.
const selftestArg = process.argv.find((a) => a.startsWith('--selftest'));
const selftestDir = selftestArg ? (selftestArg.split('=')[1] || path.join(app.getPath('temp'), 'amethyst-selftest')) : null;
if (selftestDir) app.setPath('userData', path.join(selftestDir, 'userdata'));

// Log de erros em %APPDATA%\Amethyst\amethyst.log (para mandar quando algo der errado).
let logFile = null;
function log(...parts) {
  const line = new Date().toISOString() + ' ' + parts.map((p) => (p instanceof Error ? p.stack : String(p))).join(' ') + '\n';
  try { fs.appendFileSync(logFile || path.join(app.getPath('userData'), 'amethyst.log'), line); } catch { /* sem disco */ }
}
process.on('uncaughtException', (e) => log('[main]', e));
process.on('unhandledRejection', (e) => log('[main]', e));

let win = null;
let tv = null;
let upd = null;

// Teste do atualizador numa cópia separada: --update-test=<pasta> procura, baixa e instala sozinho;
// a cópia reaberta com --update-done=<pasta> só anota a versão e fecha.
const argDir = (flag) => { const a = process.argv.find((x) => x.startsWith(flag + '=')); return a ? a.slice(flag.length + 1) : null; };
const updateTestDir = argDir('--update-test'), updateDoneDir = argDir('--update-done');
if (updateTestDir || updateDoneDir) app.setPath('userData', path.join(updateTestDir || updateDoneDir, 'userdata'));
let store = null;

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv',
  '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.flv': 'video/x-flv', '.jpg': 'image/jpeg'
};

// media://video/<id> e media://thumb/<id> — só serve arquivos que estão na biblioteca.
async function handleMedia(request) {
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/+/, '');
  let file = null;
  if (url.hostname === 'video') {
    const song = store.data.songs.find((s) => s.id === id);
    if (song) file = song.path;
  } else if (url.hostname === 'thumb' && /^[a-f0-9]{40}$/.test(id)) {
    file = path.join(store.thumbDir, id + '.jpg');
  }
  if (!file) return new Response('not found', { status: 404 });

  let stat;
  try { stat = await fsp.stat(file); } catch { return new Response('not found', { status: 404 }); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    end = Math.min(end, stat.size - 1);
    const stream = fs.createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1)
      }
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Content-Length': String(stat.size) }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#060709', title: 'Amethyst', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, spellcheck: false
    }
  });
  win.setMenu(null);
  win.on('closed', () => { win = null; if (tv) tv.close(); });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  logConsole(win.webContents, 'tela');
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

function logConsole(wc, name) {
  wc.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') log('[' + name + ' ' + e.level + ']', e.message, (e.sourceId || '') + ':' + (e.lineNumber || ''));
  });
  wc.on('render-process-gone', (e, d) => log('[' + name + ' caiu]', d.reason));
}

// ---------- Tela da TV (segundo monitor) ----------
// A TV é a tela escolhida em Configurações; sem escolha, a maior tela deitada que não seja a do notebook.
function externalDisplay() {
  if (!win || win.isDestroyed()) return null;
  const here = screen.getDisplayMatching(win.getBounds());
  const others = screen.getAllDisplays().filter((d) => d.id !== here.id);
  const chosen = others.find((d) => String(d.id) === String(store.data.settings.tvDisplay));
  if (chosen) return chosen;
  const area = (d) => d.size.width * d.size.height * (d.size.width >= d.size.height ? 2 : 1);
  return others.sort((a, b) => area(b) - area(a))[0] || null;
}
function listDisplays() {
  const here = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const auto = externalDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id), name: d.label || ('Tela ' + (i + 1)), width: d.size.width, height: d.size.height,
    control: d.id === here.id, auto: !!auto && auto.id === d.id
  }));
}
function moveTvTo(display) {
  if (!tv || !display) return;
  const wasFull = tv.isFullScreen();
  const go = () => {
    const b = display.bounds;
    tv.setBounds({ x: b.x + 40, y: b.y + 40, width: Math.min(1280, b.width - 80), height: Math.min(720, b.height - 80) });
    if (wasFull) tv.setFullScreen(true);
  };
  if (wasFull) { tv.once('leave-full-screen', () => setTimeout(go, 100)); tv.setFullScreen(false); } else go();
}
function tvStatus() {
  send('tv:status', { open: !!tv, external: !!externalDisplay(), fullscreen: !!(tv && tv.isFullScreen()) });
}
function openTv() {
  if (tv) { tv.focus(); return; }
  const ext = externalDisplay();
  const b = ext ? ext.bounds : null;
  tv = new BrowserWindow({
    x: b ? b.x + 40 : undefined, y: b ? b.y + 40 : undefined, width: 1280, height: 720,
    backgroundColor: '#000000', title: 'Amethyst — TV', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'tv-preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, spellcheck: false
    }
  });
  tv.setMenu(null);
  logConsole(tv.webContents, 'tv');
  tv.loadFile(path.join(__dirname, 'renderer', 'tv.html'));
  tv.once('ready-to-show', () => { tv.show(); if (ext) tv.setFullScreen(true); tvStatus(); if (win) win.focus(); });
  tv.on('enter-full-screen', tvStatus);
  tv.on('leave-full-screen', tvStatus);
  tv.on('closed', () => { tv = null; if (win) tvStatus(); });
  tvStatus();
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

app.whenReady().then(async () => {
  if (updateDoneDir) {
    fs.writeFileSync(path.join(updateDoneDir, 'versao-depois.txt'), app.getVersion());
    return app.quit();
  }
  logFile = path.join(app.getPath('userData'), 'amethyst.log');
  log('Amethyst', app.getVersion(), 'iniciado');
  store = await library.open(app.getPath('userData'));
  if (selftestDir) {
    const media = path.join(selftestDir, 'videos');
    if (fs.existsSync(media) && !store.data.folders.includes(media)) store.data.folders.push(media);
  }
  protocol.handle('media', handleMedia);

  // Microfone liberado só para a própria interface do app.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const own = (details.requestingUrl || '').startsWith('file://');
    cb(own && (permission === 'media' || permission === 'fullscreen'));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) =>
    (origin || '').startsWith('file://') && (permission === 'media' || permission === 'fullscreen'));

  // Aba do YouTube: navegador comum (sem "Electron" na identificação), sem microfone nem notificações.
  const yt = session.fromPartition('persist:youtube');
  yt.setUserAgent(yt.getUserAgent().replace(/\s(Electron|amethyst)\/\S+/gi, ''));
  yt.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'fullscreen'));
  yt.setPermissionCheckHandler((wc, permission) => permission === 'fullscreen');

  // Popups do YouTube viram navegação na própria aba.
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\/(www\.|m\.)?youtube\.com\//.test(url)) contents.loadURL(url);
        else if (/^https?:/.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
    }
  });

  ipcMain.handle('lib:get', () => store.data);
  ipcMain.handle('lib:addFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Escolha a pasta com os vídeos de karaokê', properties: ['openDirectory', 'multiSelections'] });
    if (r.canceled || !r.filePaths.length) return store.data;
    for (const f of r.filePaths) if (!store.data.folders.includes(f)) store.data.folders.push(f);
    await store.scan((p) => send('lib:progress', p));
    return store.data;
  });
  ipcMain.handle('lib:removeFolder', async (_, folder) => {
    store.data.folders = store.data.folders.filter((f) => f !== folder);
    await store.scan((p) => send('lib:progress', p));
    return store.data;
  });
  ipcMain.handle('lib:rescan', async () => { await store.scan((p) => send('lib:progress', p)); return store.data; });
  // Devolvem só o que mudou (mandar a biblioteca inteira a cada clique pesa com milhares de músicas).
  ipcMain.handle('lib:updateSong', (_, id, patch) => store.updateSong(id, patch));
  ipcMain.handle('lib:setArtistGenre', (_, artist, genre) => store.setArtistGenre(artist, genre));
  ipcMain.handle('lib:played', async (_, id) => { await store.played(id); });
  ipcMain.handle('lib:addHistory', async (_, entry) => { await store.addHistory(entry); return store.data.history; });
  ipcMain.handle('lib:clearHistory', async () => { store.data.history = []; await store.save(); return store.data.history; });
  ipcMain.handle('lib:saveSettings', async (_, settings) => { store.data.settings = Object.assign(store.data.settings, settings); await store.save(); });
  ipcMain.handle('lib:fetchGenres', async () => { await store.fetchGenres((p) => send('lib:progress', p)); return store.data; });
  ipcMain.handle('lib:saveThumb', async (_, id, dataUrl, duration) => {
    const song = store.data.songs.find((s) => s.id === id);
    if (!song) return null;
    if (dataUrl) {
      const buf = Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      await fsp.writeFile(path.join(store.thumbDir, id + '.jpg'), buf);
      song.thumb = true;
    } else {
      song.thumb = false;
      song.unsupported = true;
    }
    if (duration) song.duration = Math.round(duration);
    store.saveSoon();
    return song;
  });
  // Melodia analisada de cada música (barrinhas de tom), guardada em userData/analysis.
  const analysisDir = path.join(app.getPath('userData'), 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  ipcMain.handle('lib:getAnalysis', async (_, id) => {
    const song = store.data.songs.find((s) => s.id === id);
    if (!song || !/^[a-f0-9]{40}$/.test(id)) return null;
    try {
      const a = JSON.parse(await fsp.readFile(path.join(analysisDir, id + '.json'), 'utf8'));
      return a.mtime === song.mtime ? a : null; // vídeo trocado: analisa de novo
    } catch { return null; }
  });
  ipcMain.handle('lib:saveAnalysis', async (_, id, data) => {
    const song = store.data.songs.find((s) => s.id === id);
    if (!song || !/^[a-f0-9]{40}$/.test(id)) return;
    await fsp.writeFile(path.join(analysisDir, id + '.json'), JSON.stringify(Object.assign({}, data, { mtime: song.mtime })));
  });
  // ---------- letras ----------
  // Ordem: letra editada/baixada no app (userData/lyrics) → arquivo .lrc com o mesmo nome do vídeo.
  const lyricsDir = path.join(app.getPath('userData'), 'lyrics');
  fs.mkdirSync(lyricsDir, { recursive: true });
  const songOf = (id) => (/^[a-f0-9]{40}$/.test(id) ? store.data.songs.find((s) => s.id === id) : null);
  ipcMain.handle('lyrics:get', async (_, id) => {
    const song = songOf(id);
    if (!song) return null;
    try { return JSON.parse(await fsp.readFile(path.join(lyricsDir, id + '.json'), 'utf8')); } catch { /* sem letra salva */ }
    const lrc = song.path.replace(/\.[^.\\/]+$/, '') + '.lrc';
    try { return Object.assign(globalThis.AmethystLyrics.parse(await fsp.readFile(lrc, 'utf8')), { offset: 0, source: 'arquivo .lrc' }); } catch { return null; }
  });
  ipcMain.handle('lyrics:save', async (_, id, data) => {
    if (!songOf(id)) return;
    const file = path.join(lyricsDir, id + '.json');
    if (!data) { await fsp.rm(file, { force: true }); return; }
    await fsp.writeFile(file, JSON.stringify({ synced: data.synced || null, plain: data.plain || [], offset: +data.offset || 0, source: data.source || 'manual', aligned: !!data.aligned }));
  });
  // LRCLIB (lrclib.net): base aberta de letras, muitas com o tempo de cada linha.
  ipcMain.handle('lyrics:fetch', async (_, id) => {
    const song = songOf(id);
    if (!song) return null;
    const q = new URLSearchParams({ track_name: song.title });
    if (song.artist && song.artist !== 'Artista desconhecido') q.set('artist_name', song.artist);
    try {
      const res = await fetch('https://lrclib.net/api/search?' + q, { headers: { 'User-Agent': 'Amethyst/' + app.getVersion() + ' (https://github.com/ruan2311/amethyst)' } });
      if (!res.ok) return null;
      const list = (await res.json()).filter((x) => !x.instrumental && (x.syncedLyrics || x.plainLyrics));
      if (!list.length) return null;
      // Prefere letra sincronizada e com duração parecida com a do vídeo.
      const score = (x) => (x.syncedLyrics ? 0 : 1000) + (song.duration && x.duration ? Math.abs(x.duration - song.duration) : 50);
      list.sort((a, b) => score(a) - score(b));
      const best = list[0];
      return Object.assign(globalThis.AmethystLyrics.parse(best.syncedLyrics || best.plainLyrics), { offset: 0, source: 'LRCLIB' });
    } catch { return null; }
  });
  ipcMain.handle('app:showFile', (_, id) => {
    const song = store.data.songs.find((s) => s.id === id);
    if (song) shell.showItemInFolder(song.path);
  });
  ipcMain.handle('app:version', () => app.getVersion());

  // ---------- atualizações ----------
  upd = updater.create({
    userData: app.getPath('userData'), log,
    onChange: (st) => send('update:status', st),
    getAuto: () => store.data.settings.autoUpdate !== false
  });
  ipcMain.handle('update:status', () => upd.status());
  ipcMain.handle('update:check', () => upd.check(true));
  ipcMain.handle('update:download', () => upd.download());
  ipcMain.handle('update:install', async () => { await store.save(); return upd.install(); });
  ipcMain.handle('update:auto', async (_, on) => { store.data.settings.autoUpdate = !!on; await store.save(); if (on) upd.check(false); return upd.status(); });

  ipcMain.handle('tv:open', () => openTv());
  ipcMain.handle('tv:close', () => { if (tv) tv.close(); });
  ipcMain.handle('tv:status', () => tvStatus());
  ipcMain.handle('tv:displays', () => listDisplays());
  ipcMain.handle('tv:setDisplay', async (_, id) => {
    store.data.settings.tvDisplay = id || '';
    await store.save();
    moveTvTo(externalDisplay());
    tvStatus();
    return listDisplays();
  });
  ipcMain.on('tv:fullscreen', () => { if (tv) tv.setFullScreen(!tv.isFullScreen()); });
  ipcMain.on('tv:cmd', (_, cmd) => { if (tv && !tv.isDestroyed()) tv.webContents.send('tv:cmd', cmd); });
  ipcMain.on('tv:event', (_, ev) => send('tv:event', ev));
  screen.on('display-added', tvStatus);
  screen.on('display-removed', tvStatus);

  if (updateTestDir) {
    // Sem janela: procura, baixa e instala, e a cópia reaberta anota a versão nova.
    const st = await upd.check(true);
    fs.writeFileSync(path.join(updateTestDir, 'versao-antes.txt'), app.getVersion() + ' -> ' + (st.latest || 'nada') + ' (' + st.state + ')');
    if (st.state === 'available') await upd.download();
    if (upd.status().state === 'ready') return upd.install(['--update-done=' + updateTestDir]);
    fs.writeFileSync(path.join(updateTestDir, 'erro.txt'), JSON.stringify(upd.status()));
    return app.quit();
  }
  createWindow();
  upd.start();
  if (selftestDir) runSelftest();
});

async function runSelftest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => log('[selftest]', e));
  const mark = async (name) => log('[selftest] passo', name, 't=' + Math.round(await js('performance.now()')));
  const shot = async (name) => fs.writeFileSync(path.join(selftestDir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  // Mede travadas (tarefas > 50 ms) e o tempo para desenhar as telas.
  await js(`window.__lt=[];new PerformanceObserver((l)=>l.getEntries().forEach((e)=>window.__lt.push(Math.round(e.startTime)+'+'+Math.round(e.duration)))).observe({type:'longtask',buffered:true});
    window.__frame=()=>new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r))); 0;`);
  await wait(6000);
  await shot('1-biblioteca'); await mark('1-biblioteca');
  if (process.argv.includes('--melody')) {
    // Checa o caminho real da análise: WAV gerado em memória → decodeAudioData → Web Worker.
    const r = await js(`(async () => {
      const sr = 22050, secs = 12, n = sr * secs, mel = [67, 69, 71, 74, 71, 69, 67, 64, 62, 67, 69, 71];
      const pcm = new Int16Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { const m = mel[Math.floor(i / sr)]; const f = 440 * 2 ** ((m - 69) / 12); ph += 2 * Math.PI * f / sr;
        let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(h * ph) / h; pcm[i] = v * 6000 * ((i % sr) < sr * 0.9 ? 1 : 0); }
      const buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf), w = (o, s) => [...s].forEach((c, k) => d.setUint8(o + k, c.charCodeAt(0)));
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
      d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
      new Int16Array(buf, 44).set(pcm);
      const t0 = performance.now();
      const audio = await new OfflineAudioContext(1, 1, 11025).decodeAudioData(buf);
      const worker = new Worker('melody-worker.js');
      const res = await new Promise((ok, bad) => { worker.onmessage = (e) => e.data.result && ok(e.data.result); worker.onerror = (e) => bad(new Error('worker: ' + e.message)); worker.postMessage({ id: 1, samples: audio.getChannelData(0).slice(), sr: audio.sampleRate }); });
      const hits = mel.filter((m, k) => res.notes.some((x) => x.s <= k + 0.45 && x.e > k + 0.45 && x.m % 12 === m % 12)).length;
      return { sr: audio.sampleRate, ms: Math.round(performance.now() - t0), notas: res.notes.length, acertos: hits + '/' + mel.length, tom: res.key.name };
    })()`);
    log('[selftest] melodia', JSON.stringify(r));
    return app.quit();
  }
  if (process.argv.includes('--quick')) {
    await js(`document.getElementById('tvBtn').click()`); await wait(3500);
    if (tv) fs.writeFileSync(path.join(selftestDir, '2-tv.png'), (await tv.webContents.capturePage()).toPNG());
    return app.quit();
  }
  const perf = await js(`(async()=>{const out={};let t=performance.now();
    document.querySelector('[data-tab=songs]').click(); await __frame(); out.todasAsMusicas=Math.round(performance.now()-t);
    t=performance.now(); document.querySelector('[data-tab=artists]').click(); await __frame(); out.artistas=Math.round(performance.now()-t);
    const inp=document.getElementById('search'); t=performance.now(); inp.value='banda 12'; inp.dispatchEvent(new Event('input'));
    await new Promise((r)=>setTimeout(r,150)); await __frame(); out.busca=Math.round(performance.now()-t-140);
    inp.value=''; inp.dispatchEvent(new Event('input')); await new Promise((r)=>setTimeout(r,200));
    document.querySelector('[data-tab=songs]').click(); await __frame();
    const m=document.querySelector('.main'); t=performance.now(); for(let i=0;i<20;i++){m.scrollTop+=1500; await __frame();} out.rolagem20telas=Math.round(performance.now()-t);
    out.linhasDesenhadas=document.querySelectorAll('.row').length; out.musicas=document.querySelector('.sub') && document.querySelectorAll('.lhead .sub')[0].textContent;
    m.scrollTop=0; return out;})()`);
  log('[selftest] desempenho', JSON.stringify(perf));
  await js(`document.querySelector('[data-tab=songs]').click()`); await wait(800); await shot('2-musicas');
  await js(`document.querySelector('[data-tab=genres]').click()`); await wait(800); await shot('3-generos');
  await js(`document.querySelector('[data-tab=songs]').click(); document.getElementById('singer').value='Teste'; document.querySelector('[data-action=enqueue]') && document.querySelector('[data-action=enqueue]').click()`);
  await wait(500);
  await js(`document.querySelector('[data-action=sing]') && document.querySelector('[data-action=sing]').click()`);
  await wait(5000); await shot('4-palco'); await mark('4-palco');
  await js(`document.querySelector('[data-mode=fake]').click(); document.querySelector('[data-action=finish]').click()`);
  await wait(3000); await shot('5-nota');
  await js(`document.querySelector('[data-nav=youtube]').click()`); await wait(9000); await shot('6-youtube'); await mark('6-youtube');
  await js(`document.querySelector('[data-nav=settings]').click()`); await wait(2500); await shot('7-config'); await mark('7-config');
  // Modo TV
  const tvShot = async (name) => { if (tv) fs.writeFileSync(path.join(selftestDir, name + '.png'), (await tv.webContents.capturePage()).toPNG()); };
  log('[selftest] telas', JSON.stringify(listDisplays()));
  await js(`document.getElementById('tvBtn').click()`); await wait(4000);
  await tvShot('8-tv-espera'); await mark('8-tv-espera');
  await js(`document.querySelector('[data-nav=library]').click(); document.querySelector('[data-tab=songs]').click()`); await wait(600);
  await js(`document.getElementById('singer').value='Ana'; document.querySelectorAll('[data-action=enqueue]')[2].click(); document.querySelector('[data-mode=mic]') && 0`);
  await wait(400);
  await js(`document.getElementById('singer').value='Bruno'; document.querySelector('[data-action=sing]').click()`);
  await wait(1500); await tvShot('9-tv-apresentacao');
  await wait(3200); await tvShot('10-tv-video'); await mark('10-tv-video'); await shot('11-notebook-com-tv');
  await js(`document.querySelector('[data-action=finish]').click()`); await wait(3500); await tvShot('12-tv-nota');
  await js(`document.querySelector('[data-nav=settings]').click()`); await wait(2000); await shot('13-config-tv');
  log('[selftest] travadas >50ms (início+duração ms)', JSON.stringify(await js('window.__lt')));
  log('[selftest] fim');
  app.quit();
}

app.on('window-all-closed', async () => { if (store) await store.save(); app.quit(); });
