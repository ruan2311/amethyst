// Analisador de melodia: recebe o áudio da música (mono) e devolve as notas da melodia
// principal, o tom e o andamento. Roda numa thread separada (Web Worker) e também pode
// ser carregado como script comum (plano B) ou pelo Node (testes).
(function (root) {
  const NOTE = ['Dó', 'Dó#', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Fá#', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'];
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

  // FFT radix-2 no lugar (re/im de tamanho potência de 2).
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  function median(arr) { const s = Array.from(arr).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; }
  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(da * db || 1);
  }

  function analyze(x, sr, progress) {
    const N = 4096, HOP = 512, dt = HOP / sr, binHz = sr / N;
    const frames = Math.max(0, Math.floor((x.length - N) / HOP));
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
    const prevMag = new Float32Array(N / 2);

    // Candidatos de altura: Lá2 (45) a Dó6 (84), em passos de 1/5 de semitom.
    const C0 = 45, C1 = 84, STEP = 0.2, NC = Math.round((C1 - C0) / STEP) + 1, H = 8;
    const hw = []; for (let h = 1; h <= H; h++) hw.push(Math.pow(0.84, h - 1));
    const candBins = [];
    for (let c = 0; c < NC; c++) {
      const f0 = 440 * Math.pow(2, (C0 + c * STEP - 69) / 12);
      const row = []; for (let h = 1; h <= H; h++) row.push((h * f0) / binHz);
      candBins.push(row);
    }
    const sal = new Float32Array(NC);
    const pitch = new Float32Array(frames), strength = new Float32Array(frames), rms = new Float32Array(frames), onset = new Float32Array(frames);
    const chroma = new Float64Array(12);
    const tops = [];
    let prevPick = -1;

    for (let f = 0; f < frames; f++) {
      const o = f * HOP;
      let e = 0;
      for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
      rms[f] = Math.sqrt(e / N);
      fft(re, im);
      let flux = 0;
      for (let k = 0; k < N / 2; k++) {
        const m = Math.sqrt(Math.sqrt(re[k] * re[k] + im[k] * im[k])); // compressão (raiz da magnitude)
        mag[k] = m;
        const d = m - prevMag[k]; if (d > 0) flux += d;
        prevMag[k] = m;
      }
      onset[f] = flux;
      // Cromagrama (para o tom): 55 Hz a 2 kHz.
      for (let k = Math.ceil(55 / binHz); k < Math.min(N / 2, 2000 / binHz); k++) {
        const midi = 69 + 12 * Math.log2((k * binHz) / 440);
        chroma[((Math.round(midi) % 12) + 12) % 12] += mag[k];
      }
      // Saliência: soma dos harmônicos de cada candidato.
      let best = 0, bestC = -1, near = -1, nearS = 0;
      for (let c = 0; c < NC; c++) {
        let s = 0;
        const row = candBins[c];
        for (let h = 0; h < H; h++) {
          const b = row[h]; if (b >= N / 2 - 1) break;
          const i0 = Math.floor(b), t = b - i0;
          s += hw[h] * (mag[i0] * (1 - t) + mag[i0 + 1] * t);
        }
        sal[c] = s;
        if (s > best) { best = s; bestC = c; }
        // Continuidade: candidato perto do anterior com saliência quase tão alta ganha preferência.
        if (prevPick >= 0 && Math.abs(c - prevPick) <= 10 && s > nearS) { nearS = s; near = c; }
      }
      const pick = near >= 0 && nearS > best * 0.86 ? near : bestC;
      prevPick = pick;
      pitch[f] = pick >= 0 ? C0 + pick * STEP : 0;
      strength[f] = pick >= 0 ? sal[pick] : 0;
      tops.push(strength[f]);
      if (progress && f % 500 === 0) progress(f / frames);
    }

    // ---- tom (Krumhansl) ----
    let key = { tonic: 0, mode: 'major', score: -2 };
    for (let t = 0; t < 12; t++) {
      const rot = (p) => Array.from({ length: 12 }, (_, i) => p[(i - t + 12) % 12]);
      const cMaj = corr(Array.from(chroma), rot(MAJOR)), cMin = corr(Array.from(chroma), rot(MINOR));
      if (cMaj > key.score) key = { tonic: t, mode: 'major', score: cMaj };
      if (cMin > key.score) key = { tonic: t, mode: 'minor', score: cMin };
    }
    const scale = SCALE[key.mode].map((d) => (d + key.tonic) % 12);

    // ---- andamento (autocorrelação do "ataque") ----
    let bpm = 0;
    {
      const lo = Math.round(60 / 180 / dt), hi = Math.round(60 / 60 / dt);
      const mean = onset.reduce((a, b) => a + b, 0) / (frames || 1);
      let bestR = -Infinity;
      for (let lag = lo; lag <= hi; lag++) {
        let r = 0;
        for (let f = 0; f + lag < frames; f++) r += (onset[f] - mean) * (onset[f + lag] - mean);
        const b = 60 / (lag * dt);
        r *= 1 - 0.25 * Math.abs(Math.log2(b / 110)); // leve preferência por andamentos comuns
        if (r > bestR) { bestR = r; bpm = Math.round(b); }
      }
    }

    // ---- notas ----
    const rmsMed = median(rms), salMed = median(tops);
    const voiced = (f) => rms[f] > rmsMed * 0.25 && strength[f] > salMed * 0.55;
    // mediana de 5 quadros na altura para tirar picos isolados
    const smooth = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const w = []; for (let k = -2; k <= 2; k++) { const g = f + k; if (g >= 0 && g < frames && pitch[g]) w.push(pitch[g]); }
      smooth[f] = w.length ? median(w) : 0;
    }
    const snap = (m) => {
      let r = Math.round(m), pc = ((r % 12) + 12) % 12;
      if (scale.includes(pc)) return r;
      const up = scale.includes((pc + 1) % 12), dn = scale.includes((pc + 11) % 12);
      if (up && (!dn || m > r)) return r + 1;
      return r - 1;
    };
    let notes = [];
    let cur = null;
    for (let f = 0; f < frames; f++) {
      const m = voiced(f) && smooth[f] ? snap(smooth[f]) : null;
      if (cur && m === cur.m) { cur.e = (f + 1) * dt; continue; }
      if (cur) notes.push(cur);
      cur = m == null ? null : { s: f * dt, e: (f + 1) * dt, m };
    }
    if (cur) notes.push(cur);
    // notas muito curtas (< 0,14 s) somem; buracos minúsculos entre notas iguais se fecham
    notes = notes.filter((n) => n.e - n.s >= 0.14);
    const merged = [];
    for (const n of notes) {
      const p = merged[merged.length - 1];
      if (p && p.m === n.m && n.s - p.e < 0.1) p.e = n.e; else merged.push({ ...n });
    }
    // Oitava: o detector às vezes erra a oitava (acerta a nota, erra a altura em 12 semitons).
    // Melodias cantadas quase nunca saltam mais de meia oitava, então cada nota fica na
    // oitava mais perto das últimas notas; depois tudo é centralizado na faixa da voz.
    for (let i = 1; i < merged.length; i++) {
      const prev = median(merged.slice(Math.max(0, i - 5), i).map((n) => n.m)); // aguenta uma nota errada no meio
      let best = merged[i].m;
      for (const k of [-24, -12, 12, 24]) if (Math.abs(merged[i].m + k - prev) < Math.abs(best - prev)) best = merged[i].m + k;
      merged[i].m = best;
    }
    const shift = 12 * Math.round((64 - median(merged.map((n) => n.m))) / 12);
    for (const n of merged) n.m += shift;
    const out = merged.map((n) => ({ s: +n.s.toFixed(3), e: +n.e.toFixed(3), m: n.m }));
    const ms = out.map((n) => n.m);
    return {
      v: 1, notes: out, bpm,
      key: { tonic: key.tonic, mode: key.mode, name: NOTE[key.tonic] + (key.mode === 'major' ? ' maior' : ' menor') },
      range: ms.length ? [Math.min(...ms), Math.max(...ms)] : [57, 69],
      coverage: frames ? out.reduce((t, n) => t + n.e - n.s, 0) / (frames * dt) : 0
    };
  }

  const api = { analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { id, samples, sr } = e.data;
      try {
        const res = analyze(samples, sr, (p) => root.postMessage({ id, progress: p }));
        root.postMessage({ id, result: res });
      } catch (err) { root.postMessage({ id, error: String(err && err.message || err) }); }
    };
  } else root.AmethystMelody = api;
})(typeof self !== 'undefined' ? self : globalThis);
