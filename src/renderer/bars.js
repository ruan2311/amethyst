// Barra de tom estilo karaokê: as notas passam da direita para a esquerda, a "voz" segue
// por elas e as notas acertadas acendem. Com a melodia analisada do vídeo (setTrack), as
// barras são as notas reais no tempo do vídeo; sem ela, uma melodia inventada.
(function () {
  const LEVELS = 12;
  const rand = (a, b) => a + Math.random() * (b - a);

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
          for (const x of this.track) if (x.start >= now) { x.hit = 0; x.seen = 0; x.done = false; }
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
        // Erro da voz diminui com a "habilidade" (que segue a nota ao vivo).
        const err = (1 - this.skill) * 2.2 * Math.sin(this.wobble * 0.9) + rand(-0.25, 0.25) * (1.2 - this.skill);
        const target = n.level + err;
        this.voice = this.voice == null ? target : this.voice + (target - this.voice) * Math.min(1, dt * 14);
        n.seen += dt;
        if (Math.abs(this.voice - n.level) < 0.6) n.hit += dt;
      } else if (this.voice != null) {
        this.voice = null;
      }
      this.trail.push({ t: this.t, v: this.voice });
      while (this.trail.length && this.trail[0].t < this.t - this.window * this.cursorAt) this.trail.shift();
      for (const x of this.notes) {
        if (x.end < this.t - 1 || x.start > this.t) continue;
        if (!x.done && x.end <= this.t) {
          x.done = true;
          const r = x.seen ? x.hit / x.seen : 0;
          if (r > 0.8) this.pops.push({ text: 'PERFEITO!', t: this.t, y: x.level });
          else if (r > 0.5) this.pops.push({ text: 'BOM!', t: this.t, y: x.level });
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
          const ratio = n.seen ? n.hit / n.seen : 0;
          g.save(); g.beginPath(); g.rect(0, 0, cx, h); g.clip();
          pill(x0, y, x1 - x0);
          if (ratio > 0.5) { g.fillStyle = lit; g.shadowColor = '#ff2d55'; g.shadowBlur = 12; } else g.fillStyle = 'rgba(255,255,255,.07)';
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

      // "PERFEITO!" / "BOM!"
      for (const p of this.pops) {
        const k = (this.t - p.t) / 0.9;
        g.globalAlpha = 1 - k;
        g.font = `800 ${Math.max(11, h * 0.13)}px Outfit, system-ui, sans-serif`;
        g.fillStyle = p.text === 'BOM!' ? '#b9a6ff' : '#ff8fab';
        g.textAlign = 'center';
        g.fillText(p.text, cx + bh * 3, yOf(p.y) - bh - k * h * 0.15);
        g.globalAlpha = 1;
      }
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
