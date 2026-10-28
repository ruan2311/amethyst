// Amethyst: interface (biblioteca, fila, palco, pontuação, YouTube, configurações).
(function () {
  const api = window.amethyst;
  const { VoiceScorer, drawTrail } = window.AmethystScoring;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; };
  const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const NO_GENRE = 'Sem gênero';
  // Nota com vírgula quando é quebrada: 87.5 → "87,5".
  const fmtScore = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

  const ICON = {
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="FILL" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    star: (on) => `<svg width="28" height="28" viewBox="0 0 24 24" fill="${on ? '#fff' : 'none'}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`
  };

  const S = {
    lib: null, view: 'library', tab: 'artists', artist: null, genre: null, coll: null, query: '',
    queue: [], current: null, mode: 'mic', lastResult: null, micOk: false, ytScoring: false, ytTitle: '',
    tv: false, tvExternal: false, tvT: 0, tvD: 0, tvPaused: true, ytOnTv: false
  };
  const scorer = new VoiceScorer();
  const video = $('video');

  // ---------- utilidades ----------
  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  const hueOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 230 + (h % 120); };
  const gradCache = new Map();
  const gradOf = (s) => {
    let g = gradCache.get(s);
    if (!g) { const h = hueOf(s); g = `linear-gradient(135deg,hsl(${h},75%,58%),hsl(${h - 40},70%,26%))`; gradCache.set(s, g); }
    return g;
  };
  const initials = (n) => String(n).split(/[\s&.,-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const genreOf = (s) => s.genre || (S.lib.artists[s.artist] && S.lib.artists[s.artist].genre) || NO_GENRE;
  const thumbUrl = (s) => `media://thumb/${s.id}?v=${Math.round(s.mtime || 0)}`;
  // Capa como <img loading=lazy>: só baixa a miniatura quando ela aparece na tela.
  const coverHTML = (s, extra = '') => s.thumb
    ? `<span class="cov"${extra}><img src="${thumbUrl(s)}" loading="lazy" decoding="async" alt=""></span>`
    : `<span class="cov"${extra} style="background:${gradOf(s.artist)}">${esc(initials(s.artist))}</span>`;
  let byIdFor = null, byId = new Map();
  const songById = (id) => {
    if (byIdFor !== S.lib.songs) { byId = new Map(S.lib.songs.map((s) => [s.id, s])); byIdFor = S.lib.songs; }
    return byId.get(id);
  };
  // Texto de busca de cada música, calculado uma vez só.
  const searchKey = (s) => s._k || (s._k = norm(s.title + ' ' + s.artist + ' ' + s.file));

  // Lista longa em blocos: desenha 120 itens e mais 120 quando a rolagem chega perto do fim.
  function fillChunked(container, items, renderItem, chunk = 120) {
    if (container._obs) container._obs.disconnect();
    let done = 0;
    const sentinel = document.createElement('div');
    sentinel.className = 'sentinel';
    const more = () => {
      const html = items.slice(done, done + chunk).map((x) => renderItem(x, done++)).join('');
      sentinel.insertAdjacentHTML('beforebegin', html);
      if (done >= items.length) { sentinel.remove(); if (container._obs) container._obs.disconnect(); }
    };
    container.appendChild(sentinel);
    more();
    if (done < items.length) {
      container._obs = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(); },
        { root: document.querySelector('.main'), rootMargin: '900px' });
      container._obs.observe(sentinel);
    }
  }
  const singerName = () => ($('singer').value.trim() || 'Convidado');

  // ---------- navegação ----------
  const cele = window.AmethystCelebrate.create($('rCele')); // festa da nota (tela de resultado)
  function go(view) {
    if (S.view === 'youtube' && view !== 'youtube' && S.ytScoring) ytScoreStop(false);
    // Saindo da aba YouTube: pausa o vídeo de lá para não gastar processador escondido.
    if (S.view === 'youtube' && view !== 'youtube' && webview) webview.executeJavaScript("document.querySelectorAll('video').forEach((v)=>v.pause())").catch(() => {});
    S.view = view;
    if (view !== 'score') cele.stop();
    for (const v of ['library', 'youtube', 'player', 'score', 'settings']) $('v-' + v).hidden = v !== view;
    document.querySelectorAll('.nav[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === view || (view === 'score' && b.dataset.nav === 'player')));
    document.querySelectorAll('.nav[data-coll]').forEach((b) => b.classList.toggle('on', view === 'library' && S.coll === b.dataset.coll));
    if (view === 'youtube') { ensureWebview(); $('ytKaraoke').checked = S.lib.settings.ytKaraoke !== false; renderYtBars(); }
    if (view === 'settings') renderSettings();
    if (view === 'library') renderLibrary();
    $('app').querySelector('.main').scrollTop = 0;
  }

  // ---------- biblioteca ----------
  function filteredSongs() {
    let list = S.lib.songs;
    const q = norm(S.query.trim());
    if (q) list = list.filter((s) => searchKey(s).includes(q));
    if (S.artist) list = list.filter((s) => s.artist === S.artist);
    if (S.genre) list = list.filter((s) => genreOf(s) === S.genre);
    if (S.coll === 'fav') list = list.filter((s) => s.fav);
    if (S.coll === 'top') list = list.filter((s) => s.plays > 0).sort((a, b) => b.plays - a.plays);
    if (S.coll === 'recent') list = list.filter((s) => s.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 50);
    return list;
  }

  function renderHero() {
    const h = new Date().getHours();
    $('greet').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + '! Quem abre o show?';
    if (renderHero.for !== S.lib.songs) { renderHero.artists = new Set(S.lib.songs.map((s) => s.artist)).size; renderHero.for = S.lib.songs; }
    const artists = renderHero.artists;
    $('heroStats').textContent = `${S.lib.songs.length} vídeos · ${artists} artistas · ${S.queue.length} na fila`;
  }

  function renderLibrary() {
    renderHero();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === S.tab && !S.coll));
    const body = $('libBody');
    if (!S.lib.folders.length) {
      body.innerHTML = `<div class="onboard"><h2>Vamos montar sua biblioteca</h2>
        <p class="note">Escolha a pasta onde ficam seus vídeos de karaokê. O ideal é que os arquivos tenham o nome no formato <b>Artista - Música</b>.</p>
        <button class="btn pri" data-action="addFolder">Escolher pasta de vídeos</button></div>`;
      return;
    }
    if (!S.lib.songs.length) {
      body.innerHTML = `<div class="onboard"><h2>Nenhum vídeo encontrado</h2><p class="note">As pastas escolhidas não têm vídeos (mp4, mkv, webm, avi…).</p>
        <div class="row-btns"><button class="btn pri" data-action="addFolder">Adicionar outra pasta</button><button class="btn gho" data-action="rescan">Procurar de novo</button></div></div>`;
      return;
    }
    const showList = S.query.trim() || S.coll || S.artist || S.genre || S.tab === 'songs';
    if (!showList && S.tab === 'artists') return renderArtists(body);
    if (!showList && S.tab === 'genres') return renderGenres(body);
    renderSongList(body);
  }

  function renderArtists(body) {
    const map = new Map();
    for (const s of S.lib.songs) { const a = map.get(s.artist) || { name: s.artist, n: 0, thumb: null }; a.n++; if (!a.thumb && s.thumb) a.thumb = s; map.set(s.artist, a); }
    const arr = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    body.innerHTML = `<div><h1 class="t">Artistas</h1><p class="sub">${arr.length} artistas · ${S.lib.songs.length} vídeos</p></div>
      <div class="grid" style="margin-top:16px"></div>`;
    fillChunked(body.querySelector('.grid'), arr, (a) => {
      const g = (S.lib.artists[a.name] && S.lib.artists[a.name].genre) || NO_GENRE;
      const ava = a.thumb ? `<span class="ava"><img src="${thumbUrl(a.thumb)}" loading="lazy" decoding="async" alt=""></span>`
        : `<span class="ava" style="background:radial-gradient(70% 70% at 70% 25%,hsl(${hueOf(a.name)},80%,62%),transparent 75%),${gradOf(a.name)}">${esc(initials(a.name))}</span>`;
      return `<button class="card" data-artist="${esc(a.name)}">${ava}
        <span><span class="cn">${esc(a.name)}</span><span class="cm">${esc(g)} · ${a.n} ${a.n > 1 ? 'músicas' : 'música'}</span></span></button>`;
    });
  }

  function renderGenres(body) {
    const map = new Map();
    for (const s of S.lib.songs) { const g = genreOf(s); const e = map.get(g) || { name: g, n: 0, artists: new Set() }; e.n++; e.artists.add(s.artist); map.set(g, e); }
    const arr = [...map.values()].sort((a, b) => (a.name === NO_GENRE) - (b.name === NO_GENRE) || b.n - a.n);
    const missing = map.has(NO_GENRE);
    body.innerHTML = `<div class="lhead"><div><h1 class="t">Gêneros</h1><p class="sub">Vêm do nome das pastas, do MusicBrainz ou do que você definir no artista</p></div>
      ${missing ? '<button class="btn gho" data-action="fetchGenres">Buscar gêneros que faltam</button>' : ''}</div>
      <div class="grid" style="margin-top:16px">${arr.map((g) => `<button class="card" data-genre="${esc(g.name)}">
        <span class="gen" style="background:${g.name === NO_GENRE ? 'linear-gradient(135deg,#2a2d38,#121318)' : gradOf(g.name)}">${esc(g.name)}</span>
        <span class="cm">${g.n} músicas · ${g.artists.size} artistas</span></button>`).join('')}</div>`;
  }

  function renderSongList(body) {
    const list = filteredSongs();
    let title = 'Todas as músicas', extra = '';
    if (S.artist) {
      title = S.artist;
      const g = (S.lib.artists[S.artist] && S.lib.artists[S.artist].genre) || '';
      extra = `<label class="gsel">Gênero do artista <input type="text" id="artistGenre" list="genreList" value="${esc(g)}" placeholder="${NO_GENRE}"></label>
        <datalist id="genreList">${allGenres().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
    } else if (S.genre) title = S.genre;
    else if (S.coll === 'fav') title = 'Favoritas';
    else if (S.coll === 'top') title = 'Mais cantadas';
    else if (S.coll === 'recent') title = 'Recentes';
    if (S.query.trim()) title = (S.artist || S.genre ? title + ' · ' : '') + `Resultados para “${S.query.trim()}”`;
    const mins = Math.round(list.reduce((t, s) => t + (s.duration || 0), 0) / 60);
    const back = S.artist || S.genre || S.coll ? `<button class="back" data-action="clearFilter">${ICON.back}Voltar</button>` : '';
    const empty = S.coll === 'fav' ? 'Nenhuma favorita ainda. Toque no coração de uma música.' :
      S.coll ? 'Ninguém cantou nada ainda.' : 'Nada encontrado. Que tal procurar na aba YouTube?';
    body.innerHTML = `<div class="lhead"><div>${back}<h1 class="t">${esc(title)}</h1>
      <p class="sub">${list.length} ${list.length === 1 ? 'música' : 'músicas'}${mins ? ' · ' + mins + ' min' : ''}</p></div>
      <div class="row-btns">${extra}${list.length ? '<button class="btn gho" data-action="queueAll">Pôr tudo na fila</button>' : ''}</div></div>
      <div class="list" style="margin-top:16px">${list.length ? '' : `<div class="empty" style="margin:16px">${empty}</div>`}</div>`;
    fillChunked(body.querySelector('.list'), list, (s, i) => `<div class="row" data-id="${s.id}">
        <span class="num">${i + 1}</span>
        ${coverHTML(s)}
        <div class="rt"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
        ${kindOf(s) === 'clip' ? '<span class="chip">Clipe</span>' : ''}
        ${s.unsupported ? '<span class="chip warn" title="Este formato ainda não é suportado">formato?</span>' : ''}
        <span class="chip">${esc(genreOf(s))}</span>
        <span class="dur">${s.duration ? fmt(s.duration) : ''}</span>
        <button class="ibtn sm ${s.fav ? 'on' : ''}" data-action="fav" aria-label="Favorita">${ICON.heart.replace('FILL', s.fav ? 'currentColor' : 'none')}</button>
        <button class="ibtn sm" data-action="edit" aria-label="Editar">${ICON.edit}</button>
        <button class="ibtn" data-action="enqueue" aria-label="Adicionar à fila" title="Adicionar à fila">${ICON.plus}</button>
        <button class="btn pri" data-action="sing">${ICON.play}Cantar</button></div>`);
    const ag = $('artistGenre');
    if (ag) ag.addEventListener('change', async () => { S.lib.artists[S.artist] = await api.setArtistGenre(S.artist, ag.value.trim()); toast('Gênero salvo'); });
  }

  function allGenres() {
    const base = ['Sertanejo', 'MPB', 'Samba', 'Pagode', 'Axé', 'Forró', 'Funk', 'Rock', 'Rock Nacional', 'Pop', 'Gospel', 'Internacional', 'Românticas', 'Brega', 'Piseiro', 'Reggae', 'Rap', 'Flashback', 'Infantil'];
    const set = new Set(base);
    S.lib.songs.forEach((s) => { const g = genreOf(s); if (g !== NO_GENRE) set.add(g); });
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // ---------- fila ----------
  function renderQueue() {
    $('qCount').textContent = S.queue.length + ' na fila';
    $('queueBadge').hidden = !S.queue.length;
    $('queueBadge').textContent = S.queue.length;
    $('qStart').hidden = !S.queue.length;
    $('queueList').innerHTML = S.queue.map((q, i) => `<div class="q ${i === 0 ? 'first' : ''}" data-qi="${i}">
      ${coverHTML(q.song)}
      <div class="rt"><b>${esc(q.song.title)}</b><span>${esc(q.song.artist)}</span></div>
      <span class="who" title="${esc(q.singer)}">${esc(q.singer)}</span>
      ${i > 0 ? `<button class="ibtn sm" data-action="qUp" aria-label="Subir na fila">${ICON.up}</button>` : ''}
      <button class="ibtn sm" data-action="qRemove" aria-label="Tirar da fila">${ICON.x}</button></div>`).join('') ||
      '<div class="empty">Fila vazia. Digite quem vai cantar e use o + numa música.</div>';
    tvQueue();
    const h = S.lib.history.slice(0, 12);
    $('histList').innerHTML = h.map((x) => `<div class="hist"><span>${esc(x.singer)} · ${esc(x.title)}</span><b>${fmtScore(x.total)}%</b></div>`).join('') ||
      '<p class="note">As notas aparecem aqui.</p>';
    if (S.view === 'library') renderHero();
  }
  function enqueue(song, singer) {
    S.queue.push({ song, singer: singer || singerName() });
    if (S.lib.settings.scoreMode === 'manual') melody.get(song); // já deixa a melodia pronta
    renderQueue();
    toast(`${song.title} entrou na fila (${S.queue[S.queue.length - 1].singer})`);
  }
  function nextInQueue() {
    if (!S.queue.length) { toast('A fila está vazia'); return; }
    const q = S.queue.shift();
    renderQueue();
    if (q.song.yt) return playYoutube(q.song, q.singer);
    startSong(q.song, q.singer);
  }

  // ---------- palco ----------
  async function ensureMic() {
    try {
      await scorer.start(S.lib.settings.micId, S.lib.settings.sensitivity);
      setMic(true);
      return true;
    } catch (e) {
      setMic(false);
      return false;
    }
  }
  function setMic(ok) {
    S.micOk = ok;
    const c = $('micChip');
    c.classList.toggle('ok', ok); c.classList.toggle('bad', !ok);
    c.querySelector('span').textContent = ok ? 'Microfone pronto' : 'Microfone não encontrado';
  }
  function setMode(mode) {
    S.mode = mode;
    document.querySelectorAll('.seg [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('micPanel').hidden = mode !== 'mic';
    $('fakePanel').hidden = mode !== 'fake';
    $('manualPanel').hidden = mode !== 'manual';
  }

  // ---------- modo sem detecção ----------
  // Enquanto não há como ouvir os microfones: a nota ao vivo é simulada e,
  // perto do fim, o app pergunta ao operador qual nota dar.
  const sim = {
    reset() { this.total = 0; this.goal = rnd(72, 90); this.chosen = null; this.asked = false; this.phase = Math.random() * 10; },
    step() {
      const goal = this.chosen == null ? this.goal : this.chosen;
      this.total = Math.max(0, Math.min(100, this.total + (goal - this.total) * 0.03 + (Math.random() - 0.5) * 1.4));
      this.phase += 0.35;
    },
    midi() { return Math.sin(this.phase * 0.4) > 0.85 ? null : 57 + 6 * Math.sin(this.phase) + 3 * Math.sin(this.phase * 2.3); }
  };
  sim.reset();
  // Barra discreta no rodapé: não bloqueia nada, dá para continuar mexendo no app.
  function askScore() {
    if (!S.current) return;
    sim.asked = true;
    $('sbTitle').textContent = `Nota para ${S.current.singer}`;
    $('sbSong').textContent = S.current.song.title;
    $('sbInput').value = '';
    $('scoreBar').hidden = false;
  }
  const kbars = new window.KaraokeBars($('kbCanvas'), { window: 4 });
  kbars.run(() => !document.hidden && S.view === 'player' && S.mode === 'manual' && !!S.current);
  function hideScoreBar() { $('scoreBar').hidden = true; }
  function pickScore(v) {
    sim.chosen = v;
    hideScoreBar();
    toast(`Nota ${fmtScore(v)}% guardada para o fim da música`);
  }
  // Campo livre: aceita nota quebrada com vírgula ou ponto (87,5 ou 87.5) e envia no Enter.
  $('sbInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = parseFloat(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v)) { toast('Digite um número de 0 a 100'); return; }
    pickScore(Math.round(Math.max(0, Math.min(100, v)) * 10) / 10);
  });

  // ---------- melodia do vídeo (barrinhas no tom certo) ----------
  // Lê o áudio do vídeo, acha a melodia numa thread separada e guarda o resultado,
  // então cada música é analisada uma vez só.
  const melody = {
    mem: new Map(), jobs: [], running: false, worker: null, waiting: new Map(), seq: 0,
    // urgent: a música que vai tocar agora passa na frente das que estão na fila.
    get(song, urgent) {
      if (this.mem.has(song.id)) return Promise.resolve(this.mem.get(song.id));
      return new Promise((resolve) => {
        const at = this.running ? 1 : 0;
        let i = this.jobs.findIndex((j) => j.song.id === song.id);
        if (i < 0) { this.jobs.push({ song, done: [] }); i = this.jobs.length - 1; }
        this.jobs[i].done.push(resolve);
        if (urgent && i > at) this.jobs.splice(at, 0, this.jobs.splice(i, 1)[0]);
        this.pump();
      });
    },
    async pump() {
      if (this.running || !this.jobs.length) return;
      this.running = true;
      const job = this.jobs[0];
      let res = null;
      try { res = await api.getAnalysis(job.song.id); if (!res) res = await this.analyze(job.song); } catch { res = null; }
      this.mem.set(job.song.id, res);
      this.jobs.shift();
      job.done.forEach((f) => f(res));
      this.running = false;
      setTimeout(() => this.pump(), 300);
    },
    async analyze(song) {
      if (song.unsupported || song.size > 700 * 1024 * 1024) return null;
      const buf = await (await fetch(`media://video/${song.id}`)).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 11025);
      const audio = await ctx.decodeAudioData(buf); // já vem em 11 kHz (suficiente para melodia)
      const n = audio.length, chans = audio.numberOfChannels, mono = new Float32Array(n);
      for (let c = 0; c < chans; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / chans; }
      const result = await this.run(mono, audio.sampleRate);
      if (result) api.saveAnalysis(song.id, result);
      return result;
    },
    run(samples, sr) {
      if (!this.worker) {
        try {
          this.worker = new Worker('melody-worker.js');
          this.worker.onmessage = (e) => { const w = this.waiting.get(e.data.id); if (w && (e.data.result || e.data.error)) { this.waiting.delete(e.data.id); w(e.data.result || null); } };
          this.worker.onerror = () => { this.worker = 'off'; this.waiting.forEach((w) => w(null)); this.waiting.clear(); };
        } catch { this.worker = 'off'; }
      }
      // Plano B: sem thread separada, analisa aqui mesmo (leva ~1 s por música).
      if (this.worker === 'off') return Promise.resolve(window.AmethystMelody ? window.AmethystMelody.analyze(samples, sr) : null);
      const id = ++this.seq;
      return new Promise((resolve) => { this.waiting.set(id, resolve); this.worker.postMessage({ id, samples, sr }, [samples.buffer]); });
    }
  };
  // Relógio do vídeo para as barras: o vídeo daqui ou, sem prévia, o tempo da TV estimado.
  const songClock = () => (video.getAttribute('src') ? video.currentTime : S.tvT + (S.tvPaused ? 0 : (performance.now() - (S.tvTAt || 0)) / 1000));
  function applyMelody(song) {
    S.melody = null;
    if (S.mode !== 'manual') return;
    $('kbInfo').textContent = 'Analisando a música…';
    melody.get(song, true).then((res) => {
      if (!S.current || S.current.song !== song) return;
      if (res && res.notes.length >= 8) {
        S.melody = res;
        kbars.setTrack(res, songClock);
        if (S.tv) api.tvCmd({ type: 'melody', id: song.id, res });
        $('kbInfo').textContent = `Tom: ${res.key.name}${res.bpm ? ' · ' + res.bpm + ' BPM' : ''}`;
      } else $('kbInfo').textContent = 'Melodia não encontrada: barras simuladas';
    });
  }

  // ---------- letras (videoclipes) ----------
  const L = window.AmethystLyrics;
  const kindOf = (s) => s.kind || s.kindAuto || 'karaoke';
  const fmtOff = (o) => ((o || 0) > 0 ? '+' : '') + (o || 0).toFixed(2).replace('.', ',') + 's';
  async function loadLyrics(song) {
    let lyr = await api.getLyrics(song.id);
    if (!lyr && S.lib.settings.autoLyrics !== false) { lyr = await api.fetchLyrics(song.id); if (lyr) api.saveLyrics(song.id, lyr); }
    return lyr;
  }
  // Caixa da letra no Palco + estado do botão "Letra".
  function showLyrBox(on) {
    $('lyrBox').hidden = !on;
    const b = $('lyrBtn');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  }
  // Botão "Letra": liga/desliga e guarda a escolha na música (vira videoclipe ou karaokê).
  function toggleLyrics() {
    if (!S.current || S.current.youtube) return;
    const song = S.current.song, on = $('lyrBox').hidden;
    song.kind = on ? 'clip' : 'karaoke';
    api.updateSong(song.id, { kind: song.kind });
    if (on) applyLyrics(song);
    else { showLyrBox(false); setLyrics(null, true); }
    toast(on ? 'Letra ligada para esta música' : 'Letra desligada para esta música');
  }
  function applyLyrics(song) {
    setLyrics(null, true);
    showLyrBox(kindOf(song) === 'clip');
    if ($('lyrBox').hidden) {
      // Tipo automático, mas com letra já salva (baixada, colada ou .lrc): mostra mesmo assim.
      if (!song.kind) api.getLyrics(song.id).then((lyr) => { if (lyr && S.current && S.current.song === song) { showLyrBox(true); setLyrics(lyr); autoAlign(song); } });
      return;
    }
    $('lyrNow').textContent = 'Procurando a letra…';
    loadLyrics(song).then((lyr) => { if (S.current && S.current.song === song) { setLyrics(lyr); autoAlign(song); } });
  }
  // A letra do LRCLIB segue a versão de álbum; clipes costumam ter uma introdução antes da música.
  // Pela análise de melodia, acha onde a música começa no vídeo e encaixa a letra ali (uma vez por música).
  function autoAlign(song) {
    const lyr = S.lyrics;
    if (!lyr || !lyr.synced || lyr.aligned || lyr.offset || lyr.source !== 'LRCLIB') return;
    melody.get(song, true).then((res) => {
      if (S.lyrics !== lyr || !res) return;
      const off = lyricsShift(lyr, res);
      lyr.aligned = true;
      if (!off) { api.saveLyrics(song.id, lyr); return; }
      setOffset(off); // já salva e avisa a TV
      toast(`Letra encaixada no vídeo (${fmtOff(off)}). Se precisar, ajuste em “Tempo da letra”.`, 5000);
    });
  }
  function lyricsShift(lyr, res) {
    const notes = res.notes || [];
    if (notes.length < 8) return 0;
    // Começo da música: primeiro trecho de 4 s com nota em pelo menos metade do tempo.
    let start = null;
    for (let i = 0; i < notes.length && start == null; i++) {
      let cov = 0;
      for (let j = i; j < notes.length && notes[j].s < notes[i].s + 4; j++) cov += Math.min(notes[j].e, notes[i].s + 4) - notes[j].s;
      if (cov >= 2) start = notes[i].s;
    }
    if (start == null) return 0;
    // Se no álbum a voz entra logo no começo, a primeira linha marca o início da música.
    const first = (lyr.synced.find((l) => l.text) || { t: 0 }).t;
    const off = start - (first < 3 ? first : 0);
    // Só encaixa introduções (clipes); um vídeo igual ao álbum fica como está.
    return off < 1.5 ? 0 : Math.round(off * 100) / 100;
  }
  function setLyrics(lyr, quiet) {
    const has = lyr && ((lyr.synced && lyr.synced.length) || (lyr.plain && lyr.plain.length));
    S.lyrics = has ? lyr : null; S.lyrIdx = -2;
    const l = S.lyrics;
    $('lyrAdj').hidden = !(l && l.synced);
    $('lyrOff').textContent = fmtOff(l && l.offset);
    $('lyrSrc').textContent = !l ? 'Sem letra: use “Editar letra” para buscar ou colar.' : (l.synced ? 'Letra sincronizada' : 'Letra sem tempo: use “Sincronizar”') + (l.source ? ' · ' + l.source : '');
    $('lyrPrev').textContent = ''; $('lyrNext').textContent = '';
    $('lyrNow').textContent = !l ? (quiet ? '' : 'Sem letra para esta música') : l.synced ? '♪' : (l.plain.find(Boolean) || '');
    if (S.tv && S.current && !S.current.youtube) api.tvCmd({ type: 'lyrics', id: S.current.song.id, lyr: tvLyrics(), layout: S.lib.settings.tvLyrics || 'bottom' });
  }
  // A TV só mostra a letra quando ela também aparece aqui no notebook.
  const tvLyrics = () => ($('lyrBox').hidden ? null : S.lyrics);
  function tickLyrics() {
    if (!S.lyrics || !S.lyrics.synced || $('lyrBox').hidden || document.hidden || S.view !== 'player') return;
    const i = L.lineAt(S.lyrics, songClock());
    if (i === S.lyrIdx) return;
    S.lyrIdx = i;
    const s = S.lyrics.synced;
    $('lyrPrev').textContent = i > 0 ? s[i - 1].text : '';
    $('lyrNow').textContent = i >= 0 ? (s[i].text || '♪') : '♪';
    $('lyrNext').textContent = s[i + 1] ? s[i + 1].text : '';
  }
  let lyrSaveTimer;
  function setOffset(o) {
    if (!S.lyrics || !S.current) return;
    S.lyrics.offset = Math.round(o * 100) / 100; S.lyrIdx = -2;
    $('lyrOff').textContent = fmtOff(S.lyrics.offset);
    if (S.tv) api.tvCmd({ type: 'lyricsOffset', offset: S.lyrics.offset });
    const id = S.current.song.id, lyr = S.lyrics;
    clearTimeout(lyrSaveTimer); lyrSaveTimer = setTimeout(() => api.saveLyrics(id, lyr), 800);
  }

  // Sincronizar: com a música tocando, aperta Espaço quando cada linha começa.
  function startSync() {
    if (!S.lyrics) { toast('Cole a letra primeiro em “Editar letra”'); return; }
    hideScoreBar();
    S.sync = { lines: S.lyrics.plain.filter((x) => x.trim()), times: [] };
    $('syncBar').hidden = false; renderSync();
    if (P.paused) toast('Dê play e aperte Espaço quando cada linha começar a ser cantada', 5000);
  }
  function renderSync() {
    const k = S.sync.times.length, n = S.sync.lines.length;
    $('syncCount').textContent = `${k} de ${n} linhas`;
    $('syncLine').textContent = k < n ? S.sync.lines[k] : 'Fim da letra: clique em Concluir';
  }
  function finishSync() {
    const { lines, times } = S.sync;
    if (!times.length) { $('syncBar').hidden = true; S.sync = null; return; }
    let last = times[times.length - 1];
    const synced = lines.map((text, k) => ({ t: k < times.length ? times[k] : (last += 3), text }));
    const lyr = { synced, plain: lines, offset: 0, source: 'sincronizada no Amethyst' };
    api.saveLyrics(S.current.song.id, lyr);
    $('syncBar').hidden = true; S.sync = null;
    setLyrics(lyr);
    toast('Letra sincronizada e salva');
  }

  async function openLyrics(song) {
    if (!song) return;
    const cur = S.current && S.current.song === song;
    let lyr = cur && S.lyrics ? S.lyrics : await api.getLyrics(song.id);
    const m = $('modal');
    m.innerHTML = `<form class="mcard wide lyr-edit" id="lyrForm"><h2>Letra · ${esc(song.title)}</h2>
      <p class="note" id="lyrStatus">${lyr ? (lyr.synced ? 'Sincronizada' : 'Sem tempo') + (lyr.source ? ' · ' + esc(lyr.source) : '') : 'Sem letra ainda.'}</p>
      <textarea name="t" spellcheck="false" placeholder="Cole a letra aqui, uma linha por verso.&#10;Letras com tempo no formato [01:23.45] ficam sincronizadas.">${esc(L.toText(lyr))}</textarea>
      <div class="row-btns"><button class="btn pri" type="submit">Salvar</button>
      <button class="btn gho" type="button" data-action="lyrFetch" data-id="${song.id}">Buscar na internet</button>
      <button class="btn gho" type="button" data-action="lyrClear" data-id="${song.id}">Apagar letra</button>
      <button class="btn gho" type="button" data-action="closeModal">Cancelar</button></div></form>`;
    m.hidden = false;
    const form = $('lyrForm'), orig = form.t.value;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.t.value;
      const p = L.parse(text);
      const data = text.trim() ? Object.assign(p, { offset: lyr && p.synced ? lyr.offset || 0 : 0, source: text === orig && lyr ? lyr.source : (form.dataset.source || 'editada') }) : null;
      await api.saveLyrics(song.id, data);
      m.hidden = true;
      if (S.current && S.current.song === song) { if (kindOf(song) === 'clip' || (data && !song.kind)) showLyrBox(true); setLyrics(data); }
      toast(data ? 'Letra salva' : 'Letra apagada');
    });
    form._song = song;
  }

  async function startSong(song, singer) {
    S.current = { song, singer: singer || singerName(), youtube: false };
    $('pSinger').textContent = S.current.singer;
    $('pTitle').textContent = song.title;
    $('pArtist').textContent = '— ' + song.artist;
    $('hudName').textContent = `${S.current.singer} · ${song.title}`;
    $('playerEmpty').hidden = true; $('playerBox').hidden = false; $('verr').hidden = true;
    go('player');
    let mode = S.lib.settings.scoreMode || 'mic';
    if (mode === 'mic' && !(await ensureMic())) { mode = 'fake'; toast('Microfone não encontrado: usando o modo sorteio'); }
    setMode(mode);
    S.ytOnTv = false;
    sim.reset(); hideScoreBar(); kbars.reset(); $('kbInfo').textContent = '';
    scorer.begin();
    await P.load(song, 0, true);
    applyMelody(song);
    applyLyrics(song);
    $('syncBar').hidden = true; S.sync = null;
    if (S.tv || video.paused) scorer.pause();
    api.played(song.id);
  }

  // Player: toca aqui no notebook, ou na TV quando ela está ligada
  // (aí o vídeo daqui vira uma prévia sem som, seguindo a TV).
  const P = {
    async load(song, startAt, intro) {
      video.volume = $('volume').value / 100;
      video.muted = S.tv;
      if (S.tv && !previewOn()) video.removeAttribute('src');
      else video.src = `media://video/${song.id}`;
      if (S.tv) {
        api.tvCmd({ type: 'load', song: { id: song.id, title: song.title, artist: song.artist }, singer: S.current.singer,
          mode: S.mode, startAt, intro, volume: video.volume });
        if (startAt) video.addEventListener('loadedmetadata', () => { video.currentTime = startAt; }, { once: true });
        return;
      }
      if (startAt) video.addEventListener('loadedmetadata', () => { video.currentTime = startAt; }, { once: true });
      try { await video.play(); } catch { /* erro tratado no evento */ }
    },
    get paused() { return S.tv ? S.tvPaused : video.paused; },
    get time() { return S.tv ? S.tvT : video.currentTime; },
    get duration() { return S.tv ? S.tvD : video.duration; },
    play() { if (S.tv) api.tvCmd({ type: 'play' }); else video.play().catch(() => {}); },
    pause() { if (S.tv) api.tvCmd({ type: 'pause' }); else video.pause(); },
    toggle() { if (P.paused) P.play(); else P.pause(); },
    seek(t) { t = Math.max(0, Math.min(t, (P.duration || 0) - 0.5)); if (S.tv) api.tvCmd({ type: 'seek', t }); else video.currentTime = t; },
    volume(v) { video.volume = v; if (S.tv) api.tvCmd({ type: 'volume', v }); }
  };

  const previewOn = () => S.lib.settings.preview !== false;
  // Notebook minimizado no modo TV: a prévia para de decodificar (a TV continua normal).
  document.addEventListener('visibilitychange', () => { if (S.tv && document.hidden && !video.paused) video.pause(); });

  function onPlay() { scorer.resume(); $('ppBtn').innerHTML = ICON.pause; $('ppBtn').setAttribute('aria-label', 'Pausar'); }
  function onPause() { scorer.pause(); $('ppBtn').innerHTML = ICON.play; $('ppBtn').setAttribute('aria-label', 'Tocar'); }
  function onError() {
    if (!S.current || S.current.youtube) return;
    $('verr').hidden = false; scorer.pause();
    api.saveThumb(S.current.song.id, null, 0).then((s) => { if (s) Object.assign(S.current.song, s); });
  }
  function onTime(t, d) {
    if (!d) return;
    $('tNow').textContent = fmt(t); $('tDur').textContent = fmt(d);
    $('seekBar').style.width = (100 * t / d) + '%';
    const hn = $('hudNext');
    if (d - t < 25 && S.queue.length) { hn.hidden = false; hn.textContent = `Próximo: ${S.queue[0].singer} · ${S.queue[0].song.title}`; } else hn.hidden = true;
  }

  video.addEventListener('play', () => { if (!S.tv) onPlay(); });
  video.addEventListener('pause', () => { if (!S.tv) onPause(); });
  video.addEventListener('ended', () => { if (!S.tv) finish(); });
  video.addEventListener('error', () => { if (!S.tv && video.getAttribute('src')) onError(); });
  video.addEventListener('timeupdate', () => { if (!S.tv) onTime(video.currentTime, video.duration); });
  $('seek').addEventListener('click', (e) => {
    if (!P.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    P.seek(P.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  });
  $('volume').addEventListener('input', (e) => P.volume(e.target.value / 100));
  $('vbox').addEventListener('dblclick', toggleFullscreen);

  function toggleFullscreen() {
    if (S.tv) return api.tvFullscreen();
    if (document.fullscreenElement) document.exitFullscreen();
    else $('vbox').requestFullscreen().catch(() => {});
  }

  // ---------- tela da TV ----------
  function tvQueue() {
    if (!S.tv) return;
    api.tvCmd({ type: 'queue', queue: S.queue.slice(0, 8).map((q) => ({ singer: q.singer, title: q.song.title, artist: q.song.artist })),
      history: S.lib.history.slice(0, 8).map((h) => ({ singer: h.singer, title: h.title, total: h.total })) });
  }
  function renderTvButton(st) {
    const b = $('tvBtn');
    b.classList.toggle('on', S.tv);
    $('tvBtnText').textContent = S.tv ? 'TV ligada' : 'Tela da TV';
    $('tvBtnSub').textContent = S.tv ? (st && st.fullscreen ? 'em tela cheia' : 'em janela') : (S.tvExternal ? 'TV detectada' : 'sem segunda tela');
    $('onTv').hidden = !S.tv;
    $('ytTvBox').hidden = !S.tv;
    $('rTvIdle').hidden = !S.tv;
    if (S.view === 'settings') renderDisplays();
  }
  api.onTvStatus((st) => {
    S.tvExternal = st.external;
    if (!st.open && S.tv) {
      // TV fechada: a música continua aqui no notebook, do mesmo ponto.
      S.tv = false;
      video.muted = false;
      if (S.current && !S.current.youtube && S.view !== 'score' && S.tvD) {
        if (!video.getAttribute('src')) video.src = `media://video/${S.current.song.id}`;
        video.currentTime = S.tvT;
        if (!S.tvPaused) video.play().catch(() => {});
      }
      toast('Tela da TV desligada');
    }
    renderTvButton(st);
  });
  api.onTvEvent((e) => {
    if (e.type === 'ready') {
      S.tv = true;
      renderTvButton({ fullscreen: false });
      tvQueue();
      // Se já havia música tocando aqui, ela passa para a TV do mesmo ponto.
      if (S.current && !S.current.youtube && S.view === 'player' && video.getAttribute('src')) {
        const wasPaused = video.paused;
        S.tvPaused = wasPaused;
        video.muted = true;
        api.tvCmd({ type: 'load', song: { id: S.current.song.id, title: S.current.song.title, artist: S.current.song.artist },
          singer: S.current.singer, mode: S.mode, startAt: video.currentTime, intro: false, paused: wasPaused, volume: video.volume });
        if (S.melody) api.tvCmd({ type: 'melody', id: S.current.song.id, res: S.melody });
        if (tvLyrics()) api.tvCmd({ type: 'lyrics', id: S.current.song.id, lyr: tvLyrics(), layout: S.lib.settings.tvLyrics || 'bottom' });
      }
      toast(S.tvExternal ? 'TV ligada' : 'Janela da TV aberta (arraste para a TV e dê dois cliques para tela cheia)', 5000);
      return;
    }
    if (!S.tv) return;
    switch (e.type) {
      case 'play': S.tvPaused = false; if (video.getAttribute('src') && !document.hidden) video.play().catch(() => {}); return onPlay();
      case 'pause': S.tvPaused = true; video.pause(); return onPause();
      case 'ended': return finish();
      case 'ytstate': return S.ytOnTv && ytState(e);
      case 'error': return onError();
      case 'state':
        S.tvT = e.t; S.tvD = e.d; S.tvPaused = e.paused; S.tvTAt = performance.now();
        if (video.getAttribute('src') && !document.hidden) {
          if (Math.abs(video.currentTime - e.t) > 0.6) video.currentTime = e.t;
          if (e.paused && !video.paused) video.pause();
          if (!e.paused && video.paused) video.play().catch(() => {});
        }
        return onTime(e.t, e.d);
    }
  });

  // Atualiza a pontuação ao vivo (~12x por segundo). Só mexe no que mudou na tela.
  const shown = new Map();
  const setText = (id, v) => { if (shown.get(id) !== v) { shown.set(id, v); $(id).textContent = v; } };
  const setWidth = (id, v) => { const k = id + ':w'; if (shown.get(k) !== v) { shown.set(k, v); $(id).style.width = v + '%'; } };
  let tvTick = 0;
  setInterval(() => {
    tickLyrics();
    scorer.monitor = !document.hidden && (S.view === 'settings' || (S.view === 'player' && S.mode === 'mic'));
    if (S.mode === 'manual' && S.current && S.view !== 'score') {
      const playing = S.current.youtube ? S.ytScoring && S.ytPlaying : !P.paused;
      if (playing) sim.step();
      kbars.playing = playing;
      kbars.skill = Math.max(0.3, sim.total / 100);
      const total = Math.round(sim.total);
      if (S.view === 'player') { setText('manTotal', total); if (document.fullscreenElement) setText('hudScore', total + '%'); }
      if (S.view === 'youtube' && S.ytScoring) setText('ytLive', total + '%');
      if (S.tv && (!S.current.youtube || S.ytOnTv) && (tvTick++ & 1) === 0) api.tvCmd({ type: 'live', total, midi: playing ? sim.midi() : null });
      // Faltando 1 minuto (ou na metade, se a música for curta), pergunta a nota. Uma vez por música.
      if (!S.current.youtube && !sim.asked && P.duration > 20 && P.duration - P.time < Math.min(60, P.duration / 2)) askScore();
      return;
    }
    if (!scorer.ready) return;
    const m = scorer.metrics();
    if (!document.hidden && S.view === 'player' && S.mode === 'mic') {
      setText('liveTotal', m.total);
      setText('mTune', m.tune + '%'); setWidth('bTune', m.tune);
      setText('mPres', m.presence + '%'); setWidth('bPres', m.presence);
      setText('mStab', m.stab + '%'); setWidth('bStab', m.stab);
      setWidth('bLevel', Math.round(scorer.level * 100));
      setText('noteName', scorer.note);
      if (document.fullscreenElement) setText('hudScore', m.total + '%');
      drawTrail($('trail'), scorer);
    } else if (S.view === 'player') setText('hudScore', '??%');
    // Para a TV basta ~6x por segundo.
    if (S.tv && S.current && S.mode === 'mic' && (!S.current.youtube || S.ytOnTv) && S.view !== 'score' && (tvTick++ & 1) === 0) {
      const last = scorer.trail[scorer.trail.length - 1];
      api.tvCmd({ type: 'live', total: m.total, midi: last == null ? null : last });
    }
    if (S.view === 'youtube' && S.ytScoring) setText('ytLive', m.total + '%');
    if (S.view === 'settings') { setWidth('testLevel', Math.round(scorer.level * 100)); setText('testNote', scorer.note); }
  }, 80);

  function finish() {
    if (!S.current) return;
    const cur = S.current;
    let r;
    // Esqueceram de dar a nota: sai uma nota boa, acima de 80.
    if (S.mode === 'manual' && sim.chosen == null) sim.chosen = rnd(81, 100);
    hideScoreBar();
    const near = (v, a, b) => Math.max(0, Math.min(100, Math.round(v) + rnd(a, b)));
    if (S.mode === 'manual') r = { total: sim.chosen, tune: near(sim.chosen, -6, 6), presence: near(sim.chosen, -3, 8), stab: near(sim.chosen, -8, 5), fake: false, manual: true };
    else if (S.mode === 'fake') r = { total: rnd(62, 100), fake: true };
    else { const m = scorer.metrics(); r = { total: m.total, tune: m.tune, presence: m.presence, stab: m.stab, fake: false }; }
    if (!cur.youtube) { P.pause(); video.pause(); if (document.fullscreenElement) document.exitFullscreen(); }
    scorer.pause();
    r.singer = cur.singer; r.title = cur.song.title; r.artist = cur.song.artist;
    S.lastResult = r;
    if (S.tv) api.tvCmd({ type: 'result', r });
    S.ytOnTv = false;
    api.addHistory({ singer: r.singer, title: r.title, artist: r.artist, total: r.total, mode: r.fake ? 'sorteio' : r.manual ? 'sem detecção' : 'microfone' })
      .then((h) => { S.lib.history = h; renderQueue(); });
    showScore(r);
  }

  function showScore(r) {
    go('score');
    $('rWho').textContent = `${r.singer} cantou ${r.title}`;
    const stars = Math.max(1, Math.round(r.total / 20));
    $('rStars').innerHTML = [0, 1, 2, 3, 4].map((k) => ICON.star(k < stars)).join('');
    $('rStars').setAttribute('aria-label', stars + ' de 5 estrelas');
    $('rMsg').textContent = r.total >= 95 ? 'Lendário!' : r.total >= 85 ? 'Arrasou!' : r.total >= 70 ? 'Mandou bem!' : r.total >= 50 ? 'Boa! Dá pra mais.' : 'Bora de novo?';
    $('rBrk').hidden = r.fake;
    if (!r.fake) { $('rTune').textContent = r.tune + '%'; $('rPres').textContent = r.presence + '%'; $('rStab').textContent = r.stab + '%'; }
    $('rNote').textContent = r.fake ? 'Nota sorteada (modo sorteio)' : r.manual ? 'Nota escolhida por você (modo sem detecção)' : 'Nota calculada pelo microfone';
    $('rNext').hidden = !S.queue.length;
    if (S.queue.length) $('rNext').textContent = `Próximo: ${S.queue[0].singer} · ${S.queue[0].song.title}`;
    $('rAgain').hidden = !!(S.current && S.current.youtube);
    // Contagem animada até a nota final.
    const t0 = performance.now(), dur = r.fake ? 2200 : 1400;
    (function anim(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = r.fake && k < 0.7 ? rnd(10, 99) : k < 1 ? Math.round(r.total * e) : r.total;
      $('rTotal').textContent = fmtScore(v);
      $('rRing').style.background = `conic-gradient(#fff ${v * 3.6}deg,rgba(255,255,255,.1) 0)`;
      if (k < 1) requestAnimationFrame(anim);
    })(t0);
    // Foi bem: festa no fundo quando a contagem chega na nota.
    const vs = $('v-score');
    vs.classList.remove('burst');
    vs.dataset.tier = cele.start(r.total, $('rRing'), dur, () => vs.classList.add('burst'));
  }

  // ---------- YouTube ----------
  let webview = null;
  function ensureWebview() {
    if (webview) return;
    webview = document.createElement('webview');
    webview.setAttribute('src', 'https://www.youtube.com/');
    webview.setAttribute('partition', 'persist:youtube');
    webview.setAttribute('allowpopups', '');
    webview.addEventListener('page-title-updated', (e) => { S.ytTitle = e.title.replace(/\s*-\s*YouTube\s*$/, ''); });
    webview.addEventListener('dom-ready', () => { webview.ready = true; });
    $('webwrap').appendChild(webview);
  }
  // Abre um endereço no YouTube daqui (antes da página carregar, só troca o src).
  function ytLoad(url) {
    ensureWebview();
    if (webview.ready) return webview.loadURL(url).catch(() => {});
    webview.setAttribute('src', url);
    return new Promise((r) => webview.addEventListener('dom-ready', r, { once: true }));
  }
  function ytSearch(q) {
    const add = S.lib.settings.ytKaraoke !== false && !/karaok/i.test(q);
    ytLoad('https://www.youtube.com/results?search_query=' + encodeURIComponent(add ? q + ' karaokê' : q));
  }
  // "Lady Gaga - Bad Romance (Karaoke Version) | Sing King" → { artist: "Lady Gaga", title: "Bad Romance" }
  function ytSong(raw) {
    const t = String(raw || '')
      .replace(/[\[(【][^\])】]*(karaok|playback|instrumental|lyrics?|letra|vers[aã]o|version|official|oficial|v[ií]deo|audio|áudio|hd|4k)[^\])】]*[\])】]/gi, '')
      .replace(/\b(karaok[eê]|playback|com letra|with lyrics)\b/gi, '')
      .replace(/\s*[|｜].*$/, '')
      .replace(/[\s\-–—]+$/, '').replace(/\s{2,}/g, ' ').trim();
    const p = t.split(/\s+[-–—]\s+/);
    return p.length >= 2 ? { artist: p[0], title: p.slice(1).join(' - ') } : { artist: 'YouTube', title: t || 'Música do YouTube' };
  }
  // Botão "Barra": pontuação ao vivo na TV nos vídeos do YouTube (desligue nos que já têm a letra).
  const ytBarsOn = () => S.lib.settings.ytBars !== false;
  function renderYtBars() {
    const b = $('ytBarsBtn'), on = ytBarsOn();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  }
  async function ytBarsToggle() {
    await saveSettings({ ytBars: !ytBarsOn() });
    renderYtBars();
    if (S.tv) api.tvCmd({ type: 'bars', on: ytBarsOn() });
    toast(ytBarsOn() ? 'Barra de pontuação ligada na TV' : 'Barra de pontuação desligada (a nota final continua aparecendo)');
  }
  const ytIdOf = (url) => (String(url).match(/[?&]v=([\w-]{6,})/) || [])[1];
  // Põe o vídeo aberto na fila; quando chegar a vez, ele toca sozinho (na TV, se estiver ligada).
  function ytEnqueue() {
    ensureWebview();
    const url = webview.ready ? webview.getURL() : '';
    const id = ytIdOf(url);
    if (!id) return toast('Abra um vídeo do YouTube primeiro');
    const song = Object.assign({ id: 'yt:' + id, yt: 'https://www.youtube.com/watch?v=' + id }, ytSong(S.ytTitle));
    S.queue.push({ song, singer: singerName() });
    renderQueue();
    toast(`${song.title} entrou na fila (${singerName()})`);
  }
  async function playYoutube(song, singer) {
    if (S.ytScoring) ytScoreStop(false);
    go('youtube');
    await ytLoad(song.yt);
    await ytStart(singer);
    Object.assign(S.current.song, { title: song.title, artist: song.artist });
    if (S.tv) ytToTv();
  }
  async function ytScoreToggle() {
    if (S.ytScoring) return ytScoreStop(true);
    return ytStart(singerName());
  }
  async function ytStart(singer) {
    const manual = S.lib.settings.scoreMode === 'manual';
    if (!manual && !(await ensureMic())) toast('Microfone não encontrado: a nota será sorteada.');
    if (!video.paused) video.pause();
    S.ytScoring = true;
    S.current = { song: ytSong(S.ytTitle), singer, youtube: true };
    S.ytEnded = false; S.ytPlaying = false;
    // O vídeo da biblioteca que estava na TV sai de lá (senão continua tocando com a barra dele).
    if (S.tv && !S.ytOnTv) api.tvCmd({ type: 'idle' });
    S.mode = manual ? 'manual' : S.micOk ? 'mic' : 'fake';
    sim.reset();
    scorer.begin();
    $('ytLive').hidden = S.mode === 'fake';
    $('ytScoreBtn').textContent = 'Finalizar e ver nota';
    toast(manual ? 'Modo sem detecção: dê play e cante. No fim eu pergunto a nota.' : S.micOk ? 'Pontuando! Dê play no vídeo e cante.' : 'Modo sorteio: cante e toque em Finalizar.');
  }
  function ytScoreStop(show) {
    S.ytScoring = false;
    $('ytLive').hidden = true;
    $('ytScoreBtn').textContent = 'Pontuar esta música';
    if (show) { if (S.current.song.artist === 'YouTube') Object.assign(S.current.song, ytSong(S.ytTitle)); finish(); }
    else scorer.pause();
  }
  // Estado do vídeo (daqui ou da TV), ~1x por segundo: pergunta a nota no fim e mostra o resultado quando acaba.
  const YT_STATE = "(()=>{const v=document.querySelector('video.html5-main-video')||document.querySelector('video'),p=document.querySelector('#movie_player');" +
    "return v?{t:v.currentTime,d:v.duration||0,ended:v.ended,paused:v.paused,ad:!!(p&&p.classList.contains('ad-showing'))}:null})()";
  function ytState(st) {
    // A barra e a nota ao vivo só andam com o vídeo tocando (pausa, anúncio e fim param tudo).
    S.ytPlaying = !!st && !st.paused && !st.ad && !st.ended;
    if (!S.ytScoring || !st || st.ad || S.ytEnded) return;
    if (S.mode === 'manual' && !sim.asked && st.d > 20 && st.d - st.t < Math.min(60, st.d / 2)) askScore();
    if (st.d > 5 && (st.ended || st.t >= st.d - 0.4)) { S.ytEnded = true; ytScoreStop(true); }
  }
  setInterval(() => {
    if (!S.ytScoring || S.ytOnTv || !webview || !webview.ready) return;
    webview.executeJavaScript(YT_STATE).then(ytState).catch(() => {});
  }, 500);
  async function ytToTv() {
    ensureWebview();
    const url = webview.getURL();
    if (!/youtube\.com\/watch\?/.test(url)) return toast('Abra um vídeo do YouTube primeiro');
    webview.executeJavaScript("(()=>{const v=document.querySelector('video');if(v)v.pause();})()").catch(() => {});
    if (!video.paused) video.pause();
    if (!S.ytScoring) await ytScoreToggle();
    S.ytOnTv = true;
    api.tvCmd({ type: 'yt', url, singer: S.current.singer, title: S.ytTitle, mode: S.mode, bars: ytBarsOn() });
    toast('Vídeo mandado para a TV');
  }
  $('ytForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('ytQuery').value.trim(); if (q) ytSearch(q); });
  $('ytKaraoke').addEventListener('change', (e) => saveSettings({ ytKaraoke: e.target.checked }));

  // ---------- configurações ----------
  async function renderSettings() {
    api.version().then((v) => { $('verText').textContent = 'Amethyst ' + v; });
    $('folderList').innerHTML = S.lib.folders.map((f) => `<div class="frow"><span title="${esc(f)}">${esc(f)}</span>
      <button class="ibtn sm" data-action="removeFolder" data-folder="${esc(f)}" aria-label="Remover pasta">${ICON.x}</button></div>`).join('') ||
      '<p class="note">Nenhuma pasta ainda.</p>';
    $('sens').value = S.lib.settings.sensitivity; $('sensVal').textContent = S.lib.settings.sensitivity;
    $('defMode').value = S.lib.settings.scoreMode;
    $('histInfo').textContent = S.lib.history.length + ' notas guardadas';
    renderDisplays();
    $('previewChk').checked = previewOn();
    $('tvLyrics').value = S.lib.settings.tvLyrics || 'bottom';
    $('autoLyricsChk').checked = S.lib.settings.autoLyrics !== false;
    await ensureMic();
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      $('micSelect').innerHTML = '<option value="">Padrão do Windows</option>' +
        devs.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
          .map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microfone')}</option>`).join('');
      $('micSelect').value = S.lib.settings.micId || '';
    } catch { /* sem dispositivos */ }
  }
  async function renderDisplays(list) {
    list = list || await api.tvDisplays();
    const sel = $('tvDisplay');
    const opts = list.filter((d) => !d.control);
    const auto = opts.find((d) => d.auto);
    sel.innerHTML = `<option value="">Automático${auto ? ' (' + esc(auto.name) + ', ' + auto.width + '×' + auto.height + ')' : ''}</option>` +
      opts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${d.width}×${d.height}${d.height > d.width ? ' (em pé)' : ''}</option>`).join('');
    sel.value = S.lib.settings.tvDisplay && opts.some((d) => d.id === S.lib.settings.tvDisplay) ? S.lib.settings.tvDisplay : '';
    if (!opts.length) sel.innerHTML = '<option value="">Nenhuma segunda tela (a TV abre em janela)</option>';
    $('tvSetBtn').textContent = S.tv ? 'Desligar a tela da TV' : 'Ligar a tela da TV';
  }
  $('tvDisplay').addEventListener('change', async (e) => {
    S.lib.settings.tvDisplay = e.target.value;
    renderDisplays(await api.tvSetDisplay(e.target.value));
    if (S.tv) toast('Movendo a tela da TV…');
  });
  async function saveSettings(patch) { Object.assign(S.lib.settings, patch); await api.saveSettings(patch); }
  $('micSelect').addEventListener('change', async (e) => { await saveSettings({ micId: e.target.value }); scorer.stop(); await ensureMic(); });
  $('sens').addEventListener('input', (e) => { $('sensVal').textContent = e.target.value; scorer.sensitivity = +e.target.value; });
  $('sens').addEventListener('change', (e) => saveSettings({ sensitivity: +e.target.value }));
  $('defMode').addEventListener('change', (e) => saveSettings({ scoreMode: e.target.value }));
  $('previewChk').addEventListener('change', (e) => saveSettings({ preview: e.target.checked }));
  $('tvLyrics').addEventListener('change', async (e) => {
    await saveSettings({ tvLyrics: e.target.value });
    // Já troca na TV se tiver um videoclipe tocando.
    if (S.tv && S.current && !S.current.youtube && tvLyrics()) api.tvCmd({ type: 'lyrics', id: S.current.song.id, lyr: tvLyrics(), layout: e.target.value });
  });
  $('autoLyricsChk').addEventListener('change', (e) => saveSettings({ autoLyrics: e.target.checked }));
  $('singer').addEventListener('change', (e) => saveSettings({ singer: e.target.value.trim() }));

  // ---------- atualizações ----------
  let U = null;
  const when = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function renderUpdate(st) {
    if (!st) return;
    U = st;
    const dev = !st.canInstall && (st.state === 'available' || st.state === 'ready') ? ' (Fora do Amethyst.exe, a instalação automática fica desligada.)' : '';
    $('updText').textContent = ({
      none: `Você está na versão mais nova (${st.current}).` + (st.checked ? ` Última verificação: ${when(st.checked)}.` : ''),
      checking: 'Procurando atualização no GitHub…',
      available: `A versão ${st.latest} está disponível (você tem a ${st.current}).`,
      downloading: `Baixando a versão ${st.latest}… ${st.progress}%`,
      ready: `A versão ${st.latest} foi baixada e conferida. Está pronta para instalar.` + (st.error ? ' ' + st.error : ''),
      installing: 'Instalando: o Amethyst vai fechar e abrir de novo sozinho.',
      error: st.error || 'Algo deu errado. Tente de novo.'
    })[st.state] + dev;
    $('updTrk').hidden = st.state !== 'downloading';
    $('updBar').style.width = st.progress + '%';
    const main = $('updMainBtn');
    main.hidden = !(st.state === 'ready' || st.state === 'available' || (st.state === 'error' && st.latest));
    main.textContent = st.state === 'ready' ? 'Atualizar agora' : `Baixar a ${st.latest}`;
    main.disabled = st.state === 'ready' && !st.canInstall;
    $('updCheckBtn').disabled = ['checking', 'downloading', 'installing'].includes(st.state);
    $('autoUpdChk').checked = st.auto;
    // Aviso discreto no menu.
    const b = $('updBtn'), show = ['available', 'downloading', 'ready'].includes(st.state);
    b.hidden = !show;
    if (show) {
      $('updBtnText').textContent = st.state === 'ready' ? 'Atualização pronta' : st.state === 'downloading' ? 'Baixando atualização' : 'Nova versão';
      $('updBtnSub').textContent = st.state === 'downloading' ? st.progress + '%' : 'versão ' + st.latest;
    }
  }
  api.onUpdate(renderUpdate);
  api.updateStatus().then(renderUpdate);
  $('autoUpdChk').addEventListener('change', (e) => api.updateAuto(e.target.checked).then(renderUpdate));
  function confirmInstall() {
    if (!U || U.state !== 'ready') return;
    const playing = S.current && !P.paused;
    const notes = (U.notes || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/`/g, '').trim();
    const m = $('modal');
    m.innerHTML = `<div class="mcard wide"><h2>Atualizar para a versão ${esc(U.latest)}?</h2>
      <p class="note">O Amethyst fecha e abre de novo sozinho em alguns segundos. A biblioteca, as notas, as letras e as configurações continuam.</p>
      ${playing ? '<p class="note"><b>Tem uma música tocando:</b> ela vai parar.</p>' : ''}
      ${notes ? `<div class="upd-notes">${esc(notes)}</div>` : ''}
      <div class="row-btns"><button class="btn pri" type="button" data-action="updInstall">Atualizar agora</button>
      <button class="btn gho" type="button" data-action="closeModal">Depois</button></div></div>`;
    m.hidden = false;
  }

  // ---------- novidades ----------
  const rich = (t) => esc(t).split('*').map((p, i) => (i % 2 ? `<b>${p}</b>` : p)).join('');
  function openChangelog() {
    const { TAGS, LOG } = window.AmethystChangelog;
    const m = $('modal');
    m.innerHTML = `<div class="mcard wide log"><h2>Novidades</h2><div class="log-body">${LOG.map((v) =>
      `<h3 class="log-ver">${esc(v.version)}<span>${esc(v.date)}</span></h3><ul class="log-list">${v.items.map(([tag, text]) =>
        `<li><span class="log-tag ${tag}">${TAGS[tag]}</span>${rich(text)}</li>`).join('')}</ul>`).join('')}</div>
      <div class="row-btns"><button class="btn pri" type="button" data-action="closeModal">Fechar</button></div></div>`;
    m.hidden = false;
  }
  // Primeira abertura depois de uma atualização: avisa e aponta para as Novidades.
  // Sem versão salva mas com pastas ou notas = veio de uma versão anterior à 1.6.0.
  async function announceUpdate() {
    const v = await api.version(), prev = S.lib.settings.lastVersion;
    if (prev === v) return;
    saveSettings({ lastVersion: v });
    if (prev || S.lib.folders.length || S.lib.history.length) setTimeout(() => toast(`Amethyst atualizado para a ${v}! Veja o que mudou em Configurações → Novidades`, 7000), 1500);
  }

  // ---------- edição ----------
  function openEdit(song) {
    const m = $('modal');
    m.innerHTML = `<form class="mcard" id="editForm"><h2>Editar música</h2>
      <label class="field"><span>Música</span><input type="text" name="title" value="${esc(song.title)}"></label>
      <label class="field"><span>Artista</span><input type="text" name="artist" value="${esc(song.artist)}"></label>
      <label class="field"><span>Gênero desta música (vazio = o do artista)</span><input type="text" name="genre" list="genreList2" value="${esc(song.genre || '')}"></label>
      <datalist id="genreList2">${allGenres().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="field"><span>Tipo de vídeo</span><select name="kind">
        <option value="">Automático (agora: ${kindOf(Object.assign({}, song, { kind: null })) === 'clip' ? 'videoclipe' : 'karaokê'})</option>
        <option value="karaoke"${song.kind === 'karaoke' ? ' selected' : ''}>Karaokê (a letra já está no vídeo)</option>
        <option value="clip"${song.kind === 'clip' ? ' selected' : ''}>Videoclipe (mostrar a letra ao lado)</option></select></label>
      <p class="note" style="word-break:break-all">${esc(song.path)}</p>
      <div class="row-btns"><button class="btn pri" type="submit">Salvar</button><button class="btn gho" type="button" data-action="closeModal">Cancelar</button>
      <button class="btn gho" type="button" data-action="editLyrics" data-id="${song.id}">Letra…</button>
      <button class="btn gho" type="button" data-action="showFile" data-id="${song.id}">Mostrar arquivo</button></div></form>`;
    m.hidden = false;
    m.querySelector('input').focus();
    $('editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const upd = await api.updateSong(song.id, { title: f.get('title').trim() || song.title, artist: f.get('artist').trim() || song.artist, genre: f.get('genre').trim() || null, kind: f.get('kind') || null });
      Object.assign(song, upd); delete song._k;
      if (!S.lib.artists[song.artist]) S.lib.artists[song.artist] = { genre: null, source: null };
      m.hidden = true; renderLibrary(); toast('Música atualizada');
    });
  }

  // ---------- miniaturas ----------
  // Gera uma por vez, só quando o app está parado (nunca durante uma música) e
  // atualiza só a capa daquela música, sem redesenhar a biblioteca.
  const thumbVideo = document.createElement('video');
  thumbVideo.muted = true; thumbVideo.preload = 'auto'; thumbVideo.crossOrigin = 'anonymous';
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320; thumbCanvas.height = 180;
  let thumbBusy = false, thumbCursor = 0;
  const busyPlaying = () => (S.view === 'player' && !P.paused) || S.ytScoring;
  function scheduleThumb(ms = 150) {
    setTimeout(() => (window.requestIdleCallback || setTimeout)(nextThumb, { timeout: 2000 }), ms);
  }
  function nextThumb() {
    if (thumbBusy || !S.lib) return;
    if (busyPlaying()) return scheduleThumb(5000);
    const songs = S.lib.songs;
    while (thumbCursor < songs.length && (songs[thumbCursor].thumb != null || songs[thumbCursor].unsupported || songs[thumbCursor].thumbTried)) thumbCursor++;
    const s = songs[thumbCursor];
    if (!s) return;
    thumbBusy = true; s.thumbTried = true;
    let done = false, thumbDuration = 0;
    const finishThumb = async (dataUrl) => {
      if (done) return; done = true;
      clearTimeout(to);
      thumbVideo.removeAttribute('src'); thumbVideo.load();
      const updated = await api.saveThumb(s.id, dataUrl, thumbDuration);
      if (updated) { Object.assign(s, updated); updateCover(s); }
      thumbBusy = false;
      scheduleThumb();
    };
    const to = setTimeout(() => { done = true; thumbBusy = false; thumbVideo.removeAttribute('src'); thumbVideo.load(); scheduleThumb(); }, 12000);
    thumbVideo.onloadedmetadata = () => { thumbDuration = thumbVideo.duration || 0; thumbVideo.currentTime = Math.min(45, (thumbVideo.duration || 60) * 0.3); };
    thumbVideo.onseeked = () => {
      try {
        const g = thumbCanvas.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 320, 180);
        const vw = thumbVideo.videoWidth, vh = thumbVideo.videoHeight;
        if (!vw) return finishThumb(null);
        const k = Math.max(320 / vw, 180 / vh);
        g.drawImage(thumbVideo, (320 - vw * k) / 2, (180 - vh * k) / 2, vw * k, vh * k);
        finishThumb(thumbCanvas.toDataURL('image/jpeg', 0.72));
      } catch { finishThumb(null); }
    };
    thumbVideo.onerror = () => finishThumb(null);
    thumbVideo.src = `media://video/${s.id}`;
  }
  function updateCover(s) {
    document.querySelectorAll(`[data-id="${s.id}"]`).forEach((row) => {
      const cov = row.querySelector('.cov');
      if (cov) cov.outerHTML = coverHTML(s);
      const dur = row.querySelector('.dur');
      if (dur && s.duration) dur.textContent = fmt(s.duration);
      if (s.unsupported && !row.querySelector('.chip.warn')) row.querySelector('.chip')?.insertAdjacentHTML('beforebegin', '<span class="chip warn" title="Este formato não abriu nesta versão">formato?</span>');
    });
    S.queue.forEach((q, i) => {
      if (q.song.id !== s.id) return;
      const cov = document.querySelector(`[data-qi="${i}"] .cov`);
      if (cov) cov.outerHTML = coverHTML(s);
    });
  }

  // ---------- ações ----------
  async function act(action, el) {
    const row = el.closest('[data-id]');
    const song = row ? songById(row.dataset.id) : null;
    const qi = el.closest('[data-qi]');
    switch (action) {
      case 'sing': return startSong(song, singerName());
      case 'enqueue': return enqueue(song);
      case 'fav': {
        song.fav = !song.fav;
        api.updateSong(song.id, { fav: song.fav });
        el.classList.toggle('on', song.fav);
        el.innerHTML = ICON.heart.replace('FILL', song.fav ? 'currentColor' : 'none');
        if (S.coll === 'fav') renderLibrary();
        return;
      }
      case 'edit': return openEdit(song);
      case 'showFile': return api.showFile(el.dataset.id);
      case 'closeModal': $('modal').hidden = true; return;
      case 'changelog': return openChangelog();
      case 'updOpen':
        if (U && U.state === 'ready' && U.canInstall) return confirmInstall();
        go('settings'); setTimeout(() => $('updCard').scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        return;
      case 'updMain': return U && U.state === 'ready' ? confirmInstall() : api.updateDownload().then(renderUpdate);
      case 'updCheck': return api.updateCheck().then(renderUpdate);
      case 'updInstall': $('modal').hidden = true; toast('Atualizando… o Amethyst já volta', 8000); return api.updateInstall();
      case 'askScore': return askScore();
      case 'sbHide': return hideScoreBar();
      case 'editLyrics': return openLyrics(song || (S.current && !S.current.youtube ? S.current.song : null));
      case 'lyrShift': return setOffset((S.lyrics ? S.lyrics.offset || 0 : 0) + +el.dataset.d);
      case 'lyrFirst': {
        const first = S.lyrics && S.lyrics.synced && S.lyrics.synced.find((l) => l.text);
        if (first) { setOffset(songClock() - first.t); toast('Letra ajustada: primeira linha agora'); }
        return;
      }
      case 'lyrSync': return startSync();
      case 'syncMark': if (S.sync && S.sync.times.length < S.sync.lines.length) { S.sync.times.push(songClock()); renderSync(); } return;
      case 'syncUndo': if (S.sync) { S.sync.times.pop(); renderSync(); } return;
      case 'syncDone': return S.sync && finishSync();
      case 'syncCancel': $('syncBar').hidden = true; S.sync = null; return;
      case 'lyrFetch': {
        const form = $('lyrForm');
        $('lyrStatus').textContent = 'Buscando…';
        const res = await api.fetchLyrics(el.dataset.id);
        if (!res) { $('lyrStatus').textContent = 'Não encontrei esta letra. Confira o nome da música e do artista, ou cole a letra.'; return; }
        form.t.value = L.toText(res); form.dataset.source = 'LRCLIB';
        $('lyrStatus').textContent = `Encontrada no LRCLIB (${res.synced ? 'sincronizada' : 'sem tempo'}). Clique em Salvar.`;
        return;
      }
      case 'lyrClear': $('lyrForm').t.value = ''; $('lyrStatus').textContent = 'Clique em Salvar para apagar a letra.'; return;
      case 'pickScore': return pickScore(el.dataset.v === 'rnd' ? rnd(65, 100) : +el.dataset.v);
      case 'queueAll': filteredSongs().forEach((s) => S.queue.push({ song: s, singer: singerName() })); renderQueue(); return toast('Músicas adicionadas à fila');
      case 'clearFilter': {
        const toTab = S.artist ? 'artists' : S.genre ? 'genres' : S.tab;
        S.artist = null; S.genre = null; S.coll = null; S.tab = toTab; return go('library');
      }
      case 'startQueue': return nextInQueue();
      case 'next': return nextInQueue();
      case 'surprise': { if (!S.lib.songs.length) return toast('Adicione uma pasta de vídeos primeiro'); const ok = S.lib.songs.filter((s) => !s.unsupported); return startSong(ok[Math.floor(Math.random() * ok.length)], singerName()); }
      case 'again': return S.current && !S.current.youtube && startSong(S.current.song, S.current.singer);
      case 'qRemove': S.queue.splice(+qi.dataset.qi, 1); return renderQueue();
      case 'qUp': { const i = +qi.dataset.qi; [S.queue[i - 1], S.queue[i]] = [S.queue[i], S.queue[i - 1]]; return renderQueue(); }
      case 'playPause': return P.toggle();
      case 'restart': P.seek(0); scorer.begin(); return P.play();
      case 'tvToggle': return S.tv ? api.tvClose() : api.tvOpen();
      case 'tvFull': return api.tvFullscreen();
      case 'tvIdle': return S.tv && api.tvCmd({ type: 'idle' });
      case 'ytToTv': return ytToTv();
      case 'ytTvToggle': return api.tvCmd({ type: 'ytcmd', action: 'toggle' });
      case 'ytTvRestart': return api.tvCmd({ type: 'ytcmd', action: 'restart' });
      case 'ytEnqueue': return ytEnqueue();
      case 'ytBars': return ytBarsToggle();
      case 'lyrToggle': return toggleLyrics();
      case 'fullscreen': return toggleFullscreen();
      case 'finish': return finish();
      case 'skip': $('verr').hidden = true; return S.queue.length ? nextInQueue() : go('library');
      case 'ytScoreToggle': return ytScoreToggle();
      case 'addFolder': S.lib = await api.addFolder(); afterScan(); return;
      case 'removeFolder': S.lib = await api.removeFolder(el.dataset.folder); afterScan(); return;
      case 'rescan': S.lib = await api.rescan(); afterScan(); return;
      case 'fetchGenres': toast('Buscando gêneros… (1 artista por segundo)', 4000); S.lib = await api.fetchGenres(); renderLibrary(); return;
      case 'clearHistory': S.lib.history = await api.clearHistory(); renderQueue(); renderSettings(); return toast('Histórico apagado');
    }
  }
  function afterScan() {
    S.lib.songs.forEach((s) => { delete s.thumbTried; });
    thumbCursor = 0;
    if (S.view === 'settings') renderSettings(); else renderLibrary();
    renderQueue(); scheduleThumb();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a) { e.preventDefault(); act(a.dataset.action, a); return; }
    const n = e.target.closest('[data-nav]');
    if (n) { if (n.dataset.nav === 'library') { S.coll = null; } go(n.dataset.nav); return; }
    const c = e.target.closest('[data-coll]');
    if (c) { S.coll = c.dataset.coll; S.artist = null; S.genre = null; S.query = ''; $('search').value = ''; go('library'); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { S.tab = t.dataset.tab; S.artist = null; S.genre = null; S.coll = null; S.query = ''; $('search').value = ''; renderLibrary(); return; }
    const ar = e.target.closest('[data-artist]');
    if (ar) { S.artist = ar.dataset.artist; S.genre = null; renderLibrary(); document.querySelector('.main').scrollTop = 0; return; }
    const g = e.target.closest('[data-genre]');
    if (g) { S.genre = g.dataset.genre; S.artist = null; renderLibrary(); document.querySelector('.main').scrollTop = 0; return; }
    const md = e.target.closest('[data-mode]');
    if (md) { if (md.dataset.mode === 'mic') { ensureMic().then((ok) => { if (ok) setMode('mic'); else toast('Microfone não encontrado'); }); } else setMode(md.dataset.mode); return; }
    const yt = e.target.closest('[data-yt]');
    if (yt && webview) { const k = yt.dataset.yt; if (k === 'back' && webview.canGoBack()) webview.goBack(); if (k === 'forward' && webview.canGoForward()) webview.goForward(); if (k === 'home') webview.loadURL('https://www.youtube.com/'); return; }
    if (e.target.id === 'modal') $('modal').hidden = true;
  });
  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { S.query = e.target.value; renderLibrary(); document.querySelector('.main').scrollTop = 0; }, 140);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape' && !$('modal').hidden) { $('modal').hidden = true; return; }
    if (S.view !== 'player' || !S.current) return;
    if (e.key === ' ' && S.sync) { if (!e.target.closest('button')) { e.preventDefault(); act('syncMark', e.target); } return; }
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); P.toggle(); }
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'l' || e.key === 'L') toggleLyrics();
    else if (e.key === 'ArrowRight') P.seek(P.time + 5);
    else if (e.key === 'ArrowLeft') P.seek(P.time - 5);
  });

  api.onProgress((p) => toast(p.text, p.kind === 'done' ? 3000 : 60000));

  // ---------- início ----------
  (async function init() {
    S.lib = await api.getLibrary();
    api.tvStatus();
    $('singer').value = S.lib.settings.singer || '';
    $('ppBtn').innerHTML = ICON.pause;
    setMode(S.lib.settings.scoreMode || 'mic');
    go('library');
    renderQueue();
    announceUpdate();
    if (S.lib.folders.length) { S.lib = await api.rescan(); renderLibrary(); }
    scheduleThumb(1500);
    ensureMic();
  })();
})();
