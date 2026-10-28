// Amethyst — tela da TV (convidados). Só obedece aos comandos do notebook e devolve o estado do vídeo.
(function () {
  const bridge = window.tvBridge;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  // Nota com vírgula quando é quebrada: 87.5 → "87,5".
  const fmtScore = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

  const video = $('video');
  const STAR = (on) => `<svg viewBox="0 0 24 24" fill="${on ? '#fff' : 'none'}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`;

  const kbars = new window.KaraokeBars($('kCanvas'), { window: 5, cursorAt: 0.22 });
  const Lyr = window.AmethystLyrics;
  const T = { screen: 'idle', queue: [], history: [], current: null, mode: 'mic', trail: [], introTimer: null, resultTimer: null, yt: null };

  function show(name) {
    T.screen = name;
    if (name !== 'result') cele.stop();
    for (const s of ['idle', 'intro', 'play', 'yt', 'result']) $('s-' + s).hidden = s !== name;
    const playing = name === 'play' || name === 'yt';
    document.body.classList.toggle('playing', playing);
    document.body.classList.toggle('dim', name === 'intro' || name === 'result');
    $('hud').hidden = !playing;
    if (name !== 'yt' && T.yt) { T.yt.remove(); T.yt = null; }
  }

  // ---------- espera ----------
  function renderIdle() {
    const q = T.queue;
    $('idleTitle').textContent = q.length ? `Próximo: ${q[0].singer}` : 'Quem abre o show?';
    $('idleHint').textContent = q.length ? `${q[0].title} — ${q[0].artist}` : 'Escolha sua música e coloque seu nome na fila';
    $('nextList').innerHTML = q.slice(0, 6).map((x, i) => `<li><span class="n">${i + 1}</span>
      <span class="t"><b>${esc(x.singer)}</b> <span>· ${esc(x.title)}</span></span></li>`).join('') ||
      '<li class="empty">A fila está vazia</li>';
    $('lastList').innerHTML = T.history.slice(0, 6).map((h) => `<li><span class="t"><b>${esc(h.singer)}</b> <span>· ${esc(h.title)}</span></span>
      <span class="s">${fmtScore(h.total)}%</span></li>`).join('') || '<li class="empty">Ninguém cantou ainda</li>';
    const hn = $('hudNext');
    if (!q.length) hn.hidden = true;
  }

  // ---------- música ----------
  function load(c) {
    clearInterval(T.introTimer); clearTimeout(T.resultTimer);
    T.current = c; T.mode = c.mode; T.trail = [];
    $('hudWho').textContent = `${c.singer} · ${c.song.title}`;
    $('hudScore').hidden = c.mode === 'fake';
    karaoke(c);
    setLyrics(null);
    $('hudTotal').textContent = '0';
    $('verr').hidden = true;
    video.src = `media://video/${c.song.id}`;
    video.volume = c.volume == null ? 0.9 : c.volume;
    const startAt = c.startAt || 0;
    video.addEventListener('loadedmetadata', function once() {
      video.removeEventListener('loadedmetadata', once);
      if (startAt) video.currentTime = startAt;
    });
    if (c.intro) {
      show('intro');
      $('introWho').textContent = c.singer;
      $('introSong').textContent = `${c.song.title} — ${c.song.artist}`;
      let n = 3;
      $('introCount').textContent = n;
      T.introTimer = setInterval(() => {
        n--;
        if (n > 0) { $('introCount').textContent = n; return; }
        clearInterval(T.introTimer);
        show('play');
        video.play().catch(() => {});
      }, 1000);
    } else {
      show('play');
      if (!c.paused) video.play().catch(() => {});
    }
  }

  video.addEventListener('play', () => bridge.emit({ type: 'play' }));
  video.addEventListener('pause', () => bridge.emit({ type: 'pause' }));
  video.addEventListener('ended', () => bridge.emit({ type: 'ended' }));
  video.addEventListener('error', () => { if (video.getAttribute('src')) { $('verr').hidden = false; bridge.emit({ type: 'error' }); } });
  setInterval(() => {
    if (T.screen === 'play' || T.screen === 'intro') {
      bridge.emit({ type: 'state', t: video.currentTime, d: video.duration || 0, paused: video.paused || T.screen === 'intro' });
      const left = (video.duration || 0) - video.currentTime;
      const hn = $('hudNext');
      if (T.screen === 'play' && video.duration && left < 25 && T.queue.length) {
        if (hn.hidden) { hn.hidden = false; hn.textContent = `Próximo: ${T.queue[0].singer} · ${T.queue[0].title}`; }
      } else hn.hidden = true;
    }
  }, 250);

  // ---------- pontuação ao vivo ----------
  function drawTrail() {
    const c = $('hudTrail'), g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(91,44,255,.2)'); grad.addColorStop(1, '#ff2d55');
    g.strokeStyle = grad; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    const n = 90, pts = T.trail;
    pts.forEach((m, i) => {
      if (m == null) { pen = false; return; }
      const x = (w * (n - pts.length + i)) / n;
      const y = h - (Math.max(0, Math.min(1, (m - 40) / 44)) * (h - 8) + 4);
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    });
    g.stroke();
  }

  // ---------- letra (videoclipes) ----------
  function setLyrics(l) {
    T.lyr = l; T.lyrIdx = -2;
    document.body.classList.toggle('withlyrics', !!l);
    $('lyrics').hidden = !l;
    const box = $('lyScroll');
    box.classList.toggle('plain', !!(l && !l.synced));
    box.style.transform = 'translateY(0)';
    box.innerHTML = !l ? '' : (l.synced ? l.synced.map((x) => x.text) : l.plain).map((t) => `<p>${esc(t || '♪')}</p>`).join('');
  }
  setInterval(() => {
    const l = T.lyr;
    if (!l || T.screen !== 'play') return;
    const box = $('lyScroll'), H = $('lyrics').clientHeight;
    if (l.synced) {
      const i = Lyr.lineAt(l, video.currentTime);
      if (i === T.lyrIdx) return;
      T.lyrIdx = i;
      [...box.children].forEach((p, k) => { p.classList.toggle('now', k === i); p.classList.toggle('past', k < i); });
      const cur = box.children[Math.max(0, i)];
      box.style.transform = `translateY(${i < 0 ? 0 : -(cur.offsetTop - H * 0.38)}px)`;
    } else if (video.duration) {
      // Sem tempo: rola devagar acompanhando o andamento do vídeo.
      const k = video.currentTime / video.duration;
      box.style.transform = `translateY(${-(box.scrollHeight - H) * k}px)`;
    }
  }, 120);

  // ---------- barra de tom (modo sem detecção) ----------
  function karaoke(c) {
    const on = c.mode === 'manual';
    document.body.classList.toggle('kmode', on);
    $('kStrip').hidden = !on;
    $('kWho').textContent = c.singer;
    $('kTotal').textContent = '0';
    kbars.reset();
  }
  kbars.run(() => !$('kStrip').hidden && (T.screen === 'play' || T.screen === 'yt'));
  setInterval(() => { kbars.playing = T.screen === 'yt' || (T.screen === 'play' && !video.paused); }, 200);

  // ---------- nota ----------
  const cele = window.AmethystCelebrate.create($('rCele'));
  function result(r) {
    clearInterval(T.introTimer);
    video.pause();
    show('result');
    $('rWho').textContent = `${r.singer} cantou ${r.title}`;
    const stars = Math.max(1, Math.round(r.total / 20));
    $('rStars').innerHTML = [0, 1, 2, 3, 4].map((k) => STAR(k < stars)).join('');
    $('rMsg').textContent = r.total >= 95 ? 'Lendário!' : r.total >= 85 ? 'Arrasou!' : r.total >= 70 ? 'Mandou bem!' : r.total >= 50 ? 'Boa! Dá pra mais.' : 'Bora de novo?';
    $('rMsg').style.visibility = 'hidden';
    $('rBrk').hidden = !!r.fake;
    if (!r.fake) { $('rTune').textContent = r.tune + '%'; $('rPres').textContent = r.presence + '%'; $('rStab').textContent = r.stab + '%'; }
    $('rNext').hidden = !T.queue.length;
    if (T.queue.length) $('rNext').textContent = `Próximo: ${T.queue[0].singer} · ${T.queue[0].title}`;
    const t0 = performance.now(), dur = r.fake ? 3000 : 2200;
    (function anim(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = r.fake && k < 0.75 ? rnd(10, 99) : k < 1 ? Math.round(r.total * e) : r.total;
      $('rTotal').textContent = fmtScore(v);
      $('rRing').style.background = `conic-gradient(#fff ${v * 3.6}deg,rgba(255,255,255,.1) 0)`;
      if (k < 1) requestAnimationFrame(anim); else $('rMsg').style.visibility = 'visible';
    })(t0);
    // Foi bem: festa no fundo quando a contagem chega na nota.
    const sr = $('s-result');
    sr.classList.remove('burst');
    sr.dataset.tier = cele.start(r.total, $('rRing'), dur, () => sr.classList.add('burst'));
    clearTimeout(T.resultTimer);
    T.resultTimer = setTimeout(() => { if (T.screen === 'result') { show('idle'); renderIdle(); } }, 20000);
  }

  // ---------- YouTube na TV ----------
  // Deixa só o player do YouTube, ocupando a tela inteira.
  const YT_CSS = `
    #masthead-container, ytd-masthead, #secondary, #below, #related, ytd-comments, tp-yt-app-drawer, #guide,
    ytd-mini-guide-renderer, .ytp-chrome-top, .ytp-pause-overlay { display: none !important; }
    html, body { overflow: hidden !important; background: #000 !important; }
    #movie_player, .html5-video-player { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 99999 !important; background: #000 !important; }
    #movie_player video.html5-main-video { width: 100vw !important; height: 100vh !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }`;
  function youtube(c) {
    clearInterval(T.introTimer); clearTimeout(T.resultTimer);
    video.pause();
    T.current = c; T.mode = c.mode; T.trail = [];
    $('hudWho').textContent = `${c.singer} · ${c.title || 'YouTube'}`;
    $('hudScore').hidden = c.mode === 'fake';
    karaoke(c);
    setLyrics(null);
    show('yt');
    const w = document.createElement('webview');
    w.setAttribute('partition', 'persist:youtube');
    w.setAttribute('src', c.url);
    w.addEventListener('dom-ready', () => { w.insertCSS(YT_CSS); w.setAudioMuted(false); });
    $('ytwrap').appendChild(w);
    T.yt = w;
  }
  function ytCmd(action) {
    if (!T.yt) return;
    const js = action === 'toggle' ? "(()=>{const v=document.querySelector('video');if(v){v.paused?v.play():v.pause();}})()"
      : action === 'restart' ? "(()=>{const v=document.querySelector('video');if(v){v.currentTime=0;v.play();}})()" : '';
    if (js) T.yt.executeJavaScript(js).catch(() => {});
  }

  // ---------- comandos do notebook ----------
  bridge.onCmd((c) => {
    switch (c.type) {
      case 'load': return load(c);
      case 'play': if (T.screen === 'play') video.play().catch(() => {}); return;
      case 'pause': return video.pause();
      case 'seek': video.currentTime = c.t; return;
      case 'volume': video.volume = c.v; return;
      case 'live':
        $('hudTotal').textContent = c.total;
        if (T.mode === 'manual') { $('kTotal').textContent = c.total; kbars.skill = Math.max(0.3, c.total / 100); }
        T.trail.push(c.midi == null ? null : c.midi);
        if (T.trail.length > 90) T.trail.shift();
        if (T.screen === 'play' || T.screen === 'yt') drawTrail();
        return;
      case 'melody':
        if (T.mode === 'manual' && T.current && T.current.song && T.current.song.id === c.id) kbars.setTrack(c.res, () => video.currentTime);
        return;
      case 'lyrics': if (T.current && T.current.song && T.current.song.id === c.id) setLyrics(c.lyr); return;
      case 'lyricsOffset': if (T.lyr) { T.lyr.offset = c.offset; T.lyrIdx = -2; } return;
      case 'result': return result(c.r);
      case 'queue': T.queue = c.queue || []; T.history = c.history || []; if (T.screen === 'idle') renderIdle(); return;
      case 'idle': setLyrics(null); clearInterval(T.introTimer); video.pause(); video.removeAttribute('src'); video.load(); show('idle'); return renderIdle();
      case 'yt': return youtube(c);
      case 'ytcmd': return ytCmd(c.action);
    }
  });

  document.addEventListener('dblclick', () => bridge.toggleFullscreen());
  document.addEventListener('keydown', (e) => { if (e.key === 'F11' || e.key === 'f' || e.key === 'F') bridge.toggleFullscreen(); });

  show('idle');
  renderIdle();
  bridge.emit({ type: 'ready' });
})();
