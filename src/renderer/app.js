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
  function go(view) {
    if (S.view === 'youtube' && view !== 'youtube' && S.ytScoring) ytScoreStop(false);
    // Saindo da aba YouTube: pausa o vídeo de lá para não gastar processador escondido.
    if (S.view === 'youtube' && view !== 'youtube' && webview) webview.executeJavaScript("document.querySelectorAll('video').forEach((v)=>v.pause())").catch(() => {});
    S.view = view;
    for (const v of ['library', 'youtube', 'player', 'score', 'settings']) $('v-' + v).hidden = v !== view;
    document.querySelectorAll('.nav[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === view || (view === 'score' && b.dataset.nav === 'player')));
    document.querySelectorAll('.nav[data-coll]').forEach((b) => b.classList.toggle('on', view === 'library' && S.coll === b.dataset.coll));
    if (view === 'youtube') ensureWebview();
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
        ${s.unsupported ? '<span class="chip warn" title="Este formato não abriu no protótipo">formato?</span>' : ''}
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
    $('histList').innerHTML = h.map((x) => `<div class="hist"><span>${esc(x.singer)} · ${esc(x.title)}</span><b>${x.total}%</b></div>`).join('') ||
      '<p class="note">As notas aparecem aqui.</p>';
    if (S.view === 'library') renderHero();
  }
  function enqueue(song, singer) {
    S.queue.push({ song, singer: singer || singerName() });
    renderQueue();
    toast(`${song.title} entrou na fila (${S.queue[S.queue.length - 1].singer})`);
  }
  function nextInQueue() {
    if (!S.queue.length) { toast('A fila está vazia'); return; }
    const q = S.queue.shift();
    renderQueue();
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
    scorer.begin();
    await P.load(song, 0, true);
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
      }
      toast(S.tvExternal ? 'TV ligada' : 'Janela da TV aberta (arraste para a TV e dê dois cliques para tela cheia)', 5000);
      return;
    }
    if (!S.tv) return;
    switch (e.type) {
      case 'play': S.tvPaused = false; if (video.getAttribute('src') && !document.hidden) video.play().catch(() => {}); return onPlay();
      case 'pause': S.tvPaused = true; video.pause(); return onPause();
      case 'ended': return finish();
      case 'error': return onError();
      case 'state':
        S.tvT = e.t; S.tvD = e.d; S.tvPaused = e.paused;
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
    scorer.monitor = !document.hidden && (S.view === 'settings' || (S.view === 'player' && S.mode === 'mic'));
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
    if (S.mode === 'fake') r = { total: rnd(62, 100), fake: true };
    else { const m = scorer.metrics(); r = { total: m.total, tune: m.tune, presence: m.presence, stab: m.stab, fake: false }; }
    if (!cur.youtube) { P.pause(); video.pause(); if (document.fullscreenElement) document.exitFullscreen(); }
    scorer.pause();
    r.singer = cur.singer; r.title = cur.song.title; r.artist = cur.song.artist;
    S.lastResult = r;
    if (S.tv) api.tvCmd({ type: 'result', r });
    S.ytOnTv = false;
    api.addHistory({ singer: r.singer, title: r.title, artist: r.artist, total: r.total, mode: r.fake ? 'sorteio' : 'microfone' })
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
    $('rNote').textContent = r.fake ? 'Nota sorteada (modo sorteio)' : 'Nota calculada pelo microfone';
    $('rNext').hidden = !S.queue.length;
    if (S.queue.length) $('rNext').textContent = `Próximo: ${S.queue[0].singer} · ${S.queue[0].song.title}`;
    $('rAgain').hidden = !!(S.current && S.current.youtube);
    // Contagem animada até a nota final.
    const t0 = performance.now(), dur = r.fake ? 2200 : 1400;
    (function anim(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = r.fake && k < 0.7 ? rnd(10, 99) : Math.round(r.total * e);
      $('rTotal').textContent = v;
      $('rRing').style.background = `conic-gradient(#fff ${v * 3.6}deg,rgba(255,255,255,.1) 0)`;
      if (k < 1) requestAnimationFrame(anim);
    })(t0);
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
    $('webwrap').appendChild(webview);
  }
  function ytSearch(q) {
    ensureWebview();
    const query = /karaok/i.test(q) ? q : q + ' karaokê';
    webview.loadURL('https://www.youtube.com/results?search_query=' + encodeURIComponent(query));
  }
  async function ytScoreToggle() {
    if (S.ytScoring) return ytScoreStop(true);
    if (!(await ensureMic())) toast('Microfone não encontrado: a nota será sorteada.');
    if (!video.paused) video.pause();
    S.ytScoring = true;
    S.current = { song: { title: S.ytTitle || 'Música do YouTube', artist: 'YouTube' }, singer: singerName(), youtube: true };
    S.mode = S.micOk ? 'mic' : 'fake';
    scorer.begin();
    $('ytLive').hidden = !S.micOk;
    $('ytScoreBtn').textContent = 'Finalizar e ver nota';
    toast(S.micOk ? 'Pontuando! Dê play no vídeo e cante.' : 'Modo sorteio: cante e toque em Finalizar.');
  }
  function ytScoreStop(show) {
    S.ytScoring = false;
    $('ytLive').hidden = true;
    $('ytScoreBtn').textContent = 'Pontuar esta música';
    if (show) { S.current.song.title = S.ytTitle || S.current.song.title; finish(); }
    else scorer.pause();
  }
  async function ytToTv() {
    ensureWebview();
    const url = webview.getURL();
    if (!/youtube\.com\/watch\?/.test(url)) return toast('Abra um vídeo do YouTube primeiro');
    webview.executeJavaScript("(()=>{const v=document.querySelector('video');if(v)v.pause();})()").catch(() => {});
    if (!video.paused) video.pause();
    if (!S.ytScoring) await ytScoreToggle();
    S.ytOnTv = true;
    api.tvCmd({ type: 'yt', url, singer: S.current.singer, title: S.ytTitle, mode: S.mode });
    toast('Vídeo mandado para a TV');
  }
  $('ytForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('ytQuery').value.trim(); if (q) ytSearch(q); });

  // ---------- configurações ----------
  async function renderSettings() {
    api.version().then((v) => { $('verText').textContent = 'Amethyst ' + v + ' · protótipo'; });
    $('folderList').innerHTML = S.lib.folders.map((f) => `<div class="frow"><span title="${esc(f)}">${esc(f)}</span>
      <button class="ibtn sm" data-action="removeFolder" data-folder="${esc(f)}" aria-label="Remover pasta">${ICON.x}</button></div>`).join('') ||
      '<p class="note">Nenhuma pasta ainda.</p>';
    $('sens').value = S.lib.settings.sensitivity; $('sensVal').textContent = S.lib.settings.sensitivity;
    $('defMode').value = S.lib.settings.scoreMode;
    $('histInfo').textContent = S.lib.history.length + ' notas guardadas';
    renderDisplays();
    $('previewChk').checked = previewOn();
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
  $('singer').addEventListener('change', (e) => saveSettings({ singer: e.target.value.trim() }));

  // ---------- edição ----------
  function openEdit(song) {
    const m = $('modal');
    m.innerHTML = `<form class="mcard" id="editForm"><h2>Editar música</h2>
      <label class="field"><span>Música</span><input type="text" name="title" value="${esc(song.title)}"></label>
      <label class="field"><span>Artista</span><input type="text" name="artist" value="${esc(song.artist)}"></label>
      <label class="field"><span>Gênero desta música (vazio = o do artista)</span><input type="text" name="genre" list="genreList2" value="${esc(song.genre || '')}"></label>
      <datalist id="genreList2">${allGenres().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <p class="note" style="word-break:break-all">${esc(song.path)}</p>
      <div class="row-btns"><button class="btn pri" type="submit">Salvar</button><button class="btn gho" type="button" data-action="closeModal">Cancelar</button>
      <button class="btn gho" type="button" data-action="showFile" data-id="${song.id}">Mostrar arquivo</button></div></form>`;
    m.hidden = false;
    m.querySelector('input').focus();
    $('editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const upd = await api.updateSong(song.id, { title: f.get('title').trim() || song.title, artist: f.get('artist').trim() || song.artist, genre: f.get('genre').trim() || null });
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
    if (md) { if (md.dataset.mode === 'mic') { ensureMic().then((ok) => { if (ok) setMode('mic'); else toast('Microfone não encontrado'); }); } else setMode('fake'); return; }
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
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); P.toggle(); }
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
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
    if (S.lib.folders.length) { S.lib = await api.rescan(); renderLibrary(); }
    scheduleThumb(1500);
    ensureMic();
  })();
})();
