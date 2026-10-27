// Pontuação semi-real: ouve o microfone, detecta o tom (YIN) e mede
// afinação, presença e estabilidade enquanto a música toca.
(function () {
  const NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const wrapCents = (c) => ((c % 100) + 150) % 100 - 50; // -50..50

  // YIN simplificado: devolve a frequência em Hz, ou 0 se não houver tom claro.
  // Para no primeiro vale abaixo do limite, então vozes agudas custam bem menos que graves.
  const yinD = new Float32Array(1024);
  function yin(buf, sr, minHz = 70, maxHz = 1000, threshold = 0.15) {
    const tauMin = Math.floor(sr / maxHz);
    const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(buf.length / 2), yinD.length - 2);
    const W = buf.length - tauMax;
    const d = yinD;
    d[0] = 1;
    let running = 0, best = -1, found = false;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; sum += x * x; }
      running += sum;
      d[tau] = running ? sum * tau / running : 1;
      if (!found && tau >= tauMin && d[tau] < threshold) found = true;
      if (found && d[tau] > d[tau - 1]) { best = tau - 1; break; }
    }
    if (found && best < 0) best = tauMax;
    if (best < 0) return 0;
    // Interpolação parabólica para mais precisão.
    const a = d[best - 1] || d[best], b = d[best], c = d[best + 1] || d[best];
    const shift = (a + c - 2 * b) ? (a - c) / (2 * (a + c - 2 * b)) : 0;
    return sr / (best + shift);
  }

  class VoiceScorer {
    constructor() {
      this.ctx = null; this.stream = null; this.analyser = null; this.timer = null;
      this.buf = null; this.noise = 0.004; this.sensitivity = 50;
      this.running = false; this.ready = false; this.monitor = false;
      this.level = 0; this.note = ''; this.midi = 0;
      this.trail = [];
      this.reset();
    }

    reset() {
      this.total = 0; this.voiced = 0; this.devSum = 0; this.pairs = 0; this.steady = 0;
      this.cos = 0; this.sin = 0; this.lastCents = null; this.trail = [];
    }

    async start(deviceId, sensitivity) {
      this.sensitivity = sensitivity == null ? 50 : sensitivity;
      if (this.ready && this.deviceId === (deviceId || '')) return true;
      this.stop();
      this.deviceId = deviceId || '';
      const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: false };
      if (deviceId) audio.deviceId = { exact: deviceId };
      this.stream = await navigator.mediaDevices.getUserMedia({ audio });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 70;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(hp); hp.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.half = new Float32Array(this.analyser.fftSize / 2);
      this.ready = true;
      this.calibrating = 20; this.noiseAcc = [];
      this.timer = setInterval(() => this.tick(), 40);
      return true;
    }

    stop() {
      clearInterval(this.timer); this.timer = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) this.ctx.close();
      this.stream = null; this.ctx = null; this.ready = false; this.running = false;
    }

    begin() { this.reset(); this.running = true; }
    pause() { this.running = false; }
    resume() { this.running = true; }

    threshold() {
      // Sensibilidade 0..100: quanto maior, mais baixo o volume necessário para contar como voz.
      const mult = 4.5 - (this.sensitivity / 100) * 3.2;
      return Math.max(0.006, this.noise * mult);
    }

    tick() {
      if (!this.analyser) return;
      // Sem música tocando e sem ninguém olhando o medidor, não gasta processador.
      if (!this.running && !this.monitor && this.calibrating <= 0) { this.level = 0; return; }
      this.analyser.getFloatTimeDomainData(this.buf);
      let rms = 0;
      for (let i = 0; i < this.buf.length; i++) rms += this.buf[i] * this.buf[i];
      rms = Math.sqrt(rms / this.buf.length);
      this.level = clamp(rms * 6);

      if (this.calibrating > 0) {
        this.noiseAcc.push(rms);
        if (--this.calibrating === 0) {
          const sorted = this.noiseAcc.sort((a, b) => a - b);
          this.noise = Math.max(0.002, sorted[Math.floor(sorted.length / 2)]);
        }
        return;
      }

      let hz = 0;
      if (rms > this.threshold()) {
        // Metade da taxa de amostragem: voz cabe folgado e o cálculo fica ~4x mais leve.
        const b = this.buf, h = this.half;
        for (let i = 0; i < h.length; i++) h[i] = (b[2 * i] + b[2 * i + 1]) * 0.5;
        hz = yin(h, this.ctx.sampleRate / 2);
      }
      const voiced = hz >= 75 && hz <= 1000;
      if (voiced) {
        const midiF = 69 + 12 * Math.log2(hz / 440);
        this.midi = midiF;
        const r = Math.round(midiF);
        this.note = NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
      } else {
        this.note = '';
      }
      this.trail.push(voiced ? this.midi : null);
      if (this.trail.length > 160) this.trail.shift();

      if (!this.running) return;
      this.total++;
      if (!voiced) { this.lastCents = null; return; }
      this.voiced++;
      const cents = this.midi * 100;
      // Referência de afinação = média circular dos desvios (aguenta música com tom deslocado).
      const ang = (2 * Math.PI * wrapCents(cents)) / 100;
      this.cos += Math.cos(ang); this.sin += Math.sin(ang);
      const offset = (Math.atan2(this.sin, this.cos) * 100) / (2 * Math.PI);
      this.devSum += Math.abs(wrapCents(cents - offset));
      if (this.lastCents != null) {
        this.pairs++;
        if (Math.abs(cents - this.lastCents) < 40) this.steady++;
      }
      this.lastCents = cents;
    }

    metrics() {
      const presence = this.total ? clamp((this.voiced / this.total) / 0.5) : 0;
      const tune = this.voiced ? clamp(1 - (this.devSum / this.voiced - 8) / 27) : 0;
      const stab = this.pairs ? clamp((this.steady / this.pairs - 0.35) / 0.5) : 0;
      let total;
      if (this.voiced < 30) total = Math.round(presence * 20);
      else total = Math.round(clamp(30 + 70 * (0.45 * tune + 0.35 * presence + 0.2 * stab), 0, 100));
      return {
        total, tune: Math.round(tune * 100), presence: Math.round(presence * 100), stab: Math.round(stab * 100),
        voicedSeconds: Math.round(this.voiced * 0.04)
      };
    }
  }

  // Desenha a trilha de tom (as últimas notas cantadas) num <canvas>.
  function drawTrail(canvas, scorer) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const y = (h * i) / 6; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    const pts = scorer.trail, n = 160, lo = 40, hi = 84;
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(91,44,255,.2)'); grad.addColorStop(1, '#ff2d55');
    g.strokeStyle = grad; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    pts.forEach((m, i) => {
      if (m == null) { pen = false; return; }
      const x = (w * (n - pts.length + i)) / n;
      const y = h - (clamp((m - lo) / (hi - lo)) * (h - 8) + 4);
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    });
    g.stroke();
  }

  window.AmethystScoring = { VoiceScorer, drawTrail };
})();
