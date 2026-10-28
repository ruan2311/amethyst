// Barra de tom estilo karaokê: as notas passam da direita para a esquerda, a "voz" segue
// por elas e as notas acertadas acendem. Com a melodia analisada do vídeo (setTrack), as
// barras são as notas reais no tempo do vídeo; sem ela, uma melodia inventada.
(function () {
  const LEVELS = 12;
  const rand = (a, b) => a + Math.random() * (b - a);
  // Avaliação de cada nota, como no Just Dance. err: quanto a voz desvia da barra (em faixas).
  const GRADES = [
    { text: 'X', color: '#ff4d6d', err: 2.6, lit: 0 },
    { text: 'OK', color: 'rgba(255,255,255,.85)', err: 1.0, lit: 0.25 },
    { text: 'BOM!', color: '#9b7bff', err: 0.55, lit: 0.55 },
    { text: 'ÓTIMO!', color: '#c9b8ff', err: 0.28, lit: 0.85 },
    { text: 'PERFEITO!', color: '#ff8fab', err: 0.06, lit: 1 }
  ];
  // Sorteio que dá o mesmo resultado para a mesma nota no notebook e na TV.
  const seeded = (x) => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };

  class KaraokeBars {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.window = opts.window || 5;      // segundos visíveis na tela
      this.cursorAt = opts.cursorAt || 0.24; // posição da "agulha" (fração da largura)
      this.skill = 0.8;                    // 0..1: quanto a voz acerta as notas
      this.playing = false;
      this.reset();
    }

    reset() {
      this.t = 0; this.notes = []; this.genUntil = 0.8; this.trail = []; this.pops = [];
      this.level = Math.floor(LEVELS / 2); this.voice = null; this.wobble = Math.random() * 10;
      this.track = null; this.clock = null;
    }

    // Melodia real: notas {s, e, m} em segundos do vídeo e alturas MIDI; clock() = tempo atual do vídeo.
    setTrack(analysis, clock) {
      const [lo, hi] = analysis.range;
      const span = Math.max(1, hi - lo);
      // Cabe em 12 faixas? Uma faixa por semitom (centralizado). Senão, escala.
      const level = span <= LEVELS - 1 ? (m) => m - lo + Math.floor((LEVELS - 1 - span) / 2) : (m) => ((m - lo) / span) * (LEVELS - 1);
      this.track = analysis.notes.map((n) => ({ start: n.s, end: n.e, level: level(n.m), hit: 0, seen: 0, done: false }));
      this.clock = clock;
      this.t = clock(); this.trail = []; this.pops = []; this.voice = null;
    }

    // Escolhe a avaliação da nota: a média segue a "habilidade" e varia em fases boas e ruins da música.
    grade(n) {
      const s = Math.max(0, Math.min(1, (this.skill - 0.3) / 0.7));
      const mu = 0.9 + s * 2.6 + 0.7 * Math.sin(n.start * 0.21) + 0.35 * Math.sin(n.start * 0.83 + 1.7);
      const w = GRADES.map((_, k) => Math.exp(-((k - mu) ** 2) / (2 * 1.25 ** 2)) + (k < 2 ? 0.05 : 0));
      let r = seeded(n.start * 7.31 + n.level) * w.reduce((a, b) => a + b, 0), k = 0;
      while (k < GRADES.length - 1 && r > w[k]) r -= w[k++];
      return k;
    }

    // Frases de 4 a 7 notas, com pausas entre as frases, como uma melodia.
    generate(until) {
      while (this.genUntil < until) {
        let t = this.genUntil;
        const count = Math.floor(rand(4, 8));
        for (let i = 0; i < count; i++) {
          this.level = Math.max(1, Math.min(LEVELS - 2, this.level + Math.round(rand(-2.4, 2.4))));
          const dur = rand(0.28, 0.95);
          this.notes.push({ start: t, end: t + dur, level: this.level, hit: 0, seen: 0, done: false });
          t += dur + rand(0.03, 0.14);
        }
        this.genUntil = t + rand(0.8, 1.8);
      }
      this.notes = this.notes.filter((n) => n.end > this.t - this.window);
    }

    step(dt) {
      if (this.track) {
        const now = this.clock();
        if (now < this.t - 0.5) { // voltou a música: as notas à frente voltam a ficar apagadas
          for (const x of this.track) if (x.start >= now) { x.hit = 0; x.seen = 0; x.done = false; x.grade = undefined; }
          this.trail = [];
        }
        this.t = now;
        this.notes = this.track;
        if (!this.playing) return;
      } else {
        if (!this.playing) return;
        this.t += dt;
        this.generate(this.t + this.window * 1.2);
      }
      this.wobble += dt * 7;
      const n = this.notes.find((x) => x.start <= this.t && x.end > this.t);
      if (n) {
        if (n.grade === undefined) n.grade = this.grade(n);
        const G = GRADES[n.grade], k = (this.t - n.start) / Math.max(0.05, n.end - n.start);
        if (n.grade === 0 && k > 0.55) this.voice = null; // errou: perde a nota no meio
        else {
          // A voz desvia da barra conforme a avaliação: no PERFEITO fica em cima, no X sai do tom.
          const side = n.level > LEVELS / 2 ? -1 : 1;
          const err = n.grade === 0 ? side * G.err + 0.4 * Math.sin(this.wobble * 1.3)
            : G.err * Math.sin(this.wobble * 0.9 + n.start) + rand(-0.12, 0.12) * G.err;
          const target = n.level + err;
          this.voice = this.voice == null ? target : this.voice + (target - this.voice) * Math.min(1, dt * 14);
        }
        n.seen += dt;
        if (this.voice != null && Math.abs(this.voice - n.level) < 0.6) n.hit += dt;
      } else if (this.voice != null) {
        this.voice = null;
      }
      this.trail.push({ t: this.t, v: this.voice });
      while (this.trail.length && this.trail[0].t < this.t - this.window * this.cursorAt) this.trail.shift();
      for (const x of this.notes) {
        if (x.end < this.t - 1 || x.start > this.t) continue;
        if (!x.done && x.end <= this.t) {
          x.done = true;
          // Uma avaliação por vez; notas muito juntas (menos de 0,4 s) não trocam a que está na tela.
          const last = this.pops[0];
          if (x.grade !== undefined && (!last || this.t - last.t > 0.4)) this.pops = [{ g: x.grade, t: this.t }];
        }
      }
      this.pops = this.pops.filter((p) => this.t - p.t < 0.9);
    }

    draw() {
      const c = this.c, g = this.g, dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const pad = Math.max(6, h * 0.08), lane = (h - pad * 2) / LEVELS;
      const pps = w / this.window, cx = w * this.cursorAt;
      const yOf = (lv) => h - pad - (lv + 0.5) * lane;
      const bh = Math.max(4, lane * 0.62), r = bh / 2;

      // linhas de fundo
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
      for (let i = 0; i <= LEVELS; i += 2) { const y = h - pad - i * lane; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

      const pill = (x, y, len) => {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y - bh / 2, Math.max(len, bh), bh, r); else g.rect(x, y - bh / 2, Math.max(len, bh), bh);
      };
      const lit = g.createLinearGradient(0, 0, w, 0);
      lit.addColorStop(0, '#5b2cff'); lit.addColorStop(1, '#ff2d55');

      const tMin = this.t - this.window, tMax = this.t + this.window;
      for (const n of this.notes) {
        if (n.end < tMin || n.start > tMax) continue;
        const x0 = cx + (n.start - this.t) * pps, x1 = cx + (n.end - this.t) * pps;
        const y = yOf(n.level);
        // parte que ainda vai chegar
        pill(x0, y, x1 - x0);
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.2; g.stroke();
        // parte que já passou: acende se a voz acertou
        if (x0 < cx) {
          // Acende conforme a avaliação: PERFEITO brilha forte, OK quase apagado, X fica vermelho escuro.
          const G = n.grade === undefined ? null : GRADES[n.grade];
          g.save(); g.beginPath(); g.rect(0, 0, cx, h); g.clip();
          pill(x0, y, x1 - x0);
          if (G && G.lit) {
            g.globalAlpha = 0.35 + 0.65 * G.lit; g.fillStyle = lit;
            if (G.lit >= 0.85) { g.shadowColor = '#ff2d55'; g.shadowBlur = 12 * G.lit; }
          } else g.fillStyle = G ? 'rgba(255,77,109,.18)' : 'rgba(255,255,255,.07)';
          g.fill();
          g.restore();
        }
      }

      // rastro da voz até a agulha
      g.lineWidth = Math.max(2, bh * 0.35); g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      let pen = false;
      for (const p of this.trail) {
        if (p.v == null) { pen = false; continue; }
        const x = cx + (p.t - this.t) * pps, y = yOf(p.v);
        if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
      }
      g.stroke();

      // agulha
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, pad * 0.5); g.lineTo(cx, h - pad * 0.5); g.stroke();
      if (this.voice != null) {
        const y = yOf(this.voice);
        g.fillStyle = '#fff'; g.shadowColor = '#b9a6ff'; g.shadowBlur = 14;
        g.beginPath(); g.moveTo(cx + bh * 0.9, y); g.lineTo(cx - bh * 0.5, y - bh * 0.7); g.lineTo(cx - bh * 0.5, y + bh * 0.7); g.closePath(); g.fill();
        g.shadowBlur = 0;
      }

      // X / OK / BOM! / ÓTIMO! / PERFEITO!: aparece com um pulo, sobe e some.
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const p of this.pops) {
        const G = GRADES[p.g], k = (this.t - p.t) / 0.9;
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.3 ? 1.15 - ((k - 0.15) / 0.15) * 0.15 : 1;
        // Tamanho pelo lado menor: faixa larga da TV ou painel alto e estreito do notebook.
        const base = Math.min(h, w * 0.4);
        const size = Math.max(13, base * (p.g === 4 ? 0.3 : p.g === 0 ? 0.36 : 0.25)) * pop;
        g.font = `800 ${size}px Outfit, system-ui, sans-serif`;
        const tw = g.measureText(G.text).width;
        // Logo à direita da agulha, no meio da faixa, sem passar da borda (o X treme).
        const x = Math.min(cx + bh * 1.5 + tw / 2, w - tw / 2 - 4) + (p.g === 0 && k < 0.3 ? Math.sin(k * 90) * bh * 0.4 : 0);
        const y = h * 0.5 - k * h * 0.12;
        g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(4,4,8,.85)';
        g.strokeText(G.text, x, y);
        if (p.g >= 3) { g.shadowColor = G.color; g.shadowBlur = size * 0.45; }
        g.fillStyle = G.color;
        g.fillText(G.text, x, y);
        g.shadowBlur = 0; g.globalAlpha = 1;
      }
      g.textBaseline = 'alphabetic';
    }
  }

  // Liga o desenho a uma condição (só anima quando visível).
  KaraokeBars.prototype.run = function (isActive) {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (isActive()) { this.step(dt); this.draw(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  window.KaraokeBars = KaraokeBars;
})();
