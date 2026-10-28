// Comemoração da nota: aurora, cristais de ametista, ondas de anel e brilhos atrás do resultado.
// Só aparece quando a pessoa foi bem (70+); fica mais forte com 85+ e 95+.
(function (root) {
  const tierOf = (total) => (total >= 95 ? 3 : total >= 85 ? 2 : total >= 70 ? 1 : 0);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // Desenhos prontos (feitos uma vez), depois só copiados girando: bem mais leve que desenhar cada cristal.
  function sprite(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    draw(g, size / 2);
    return c;
  }
  // Cristal: ponta em cima e embaixo, faceta clara à esquerda, escura à direita e um reflexo branco.
  const crystal = ([light, mid, dark]) => sprite(64, (g, r) => {
    const w = r * 0.42, h = r * 0.95;
    const face = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
    face([[0, -h], [w, -h * 0.4], [w, h * 0.5], [0, h], [0, -h]], dark);
    face([[0, -h], [-w, -h * 0.4], [-w, h * 0.5], [0, h]], light);
    face([[0, -h], [w * 0.55, -h * 0.25], [0, h * 0.62], [-w * 0.55, -h * 0.25]], mid);
    face([[0, -h], [w * 0.28, -h * 0.42], [0, -h * 0.05], [-w * 0.28, -h * 0.42]], 'rgba(255,255,255,.75)');
  });
  const CRYSTALS = [
    ['#e6dcff', '#9b7bff', '#4a1fd6'],
    ['#cdb8ff', '#7b4dff', '#3a14b0'],
    ['#ffd0db', '#ff5c7f', '#c4123b'],
    ['#ffffff', '#d6ccff', '#8f78ff']
  ].map(crystal);
  const glow = (inner) => sprite(64, (g, r) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, inner); gr.addColorStop(1, 'rgba(91,44,255,0)');
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
  const DUST = [glow('rgba(201,184,255,.8)'), glow('rgba(255,122,154,.75)'), glow('rgba(124,92,255,.85)')];
  // Brilho de 4 pontas.
  const SPARK = sprite(64, (g, r) => {
    g.drawImage(DUST[0], -r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
    g.fillStyle = '#fff';
    for (const rot of [0, Math.PI / 2]) {
      g.save(); g.rotate(rot);
      g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.09, 0); g.lineTo(0, r); g.lineTo(-r * 0.09, 0); g.closePath(); g.fill();
      g.restore();
    }
  });

  function create(canvas) {
    const g = canvas.getContext('2d');
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0, W = 0, H = 0, u = 1, cx = 0, cy = 0, ringR = 100;
    let tier = 0, t = 0, burstAt = 0, burst2At = 0, nextWave = 0, origin = null;
    let parts = [], waves = [], halo = null;
    // Aurora e raios são desfocados por natureza: desenha numa tela 4x menor e estica (bem mais leve).
    const back = document.createElement('canvas'), bg = back.getContext('2d');

    function resize() {
      const r = canvas.getBoundingClientRect();
      // Limita a resolução: numa TV 4K não precisa desenhar cada pixel.
      const s = Math.min(window.devicePixelRatio || 1, 1.5, 2400 / Math.max(1, r.width));
      W = r.width; H = r.height; u = Math.min(W, H) / 1000;
      canvas.width = Math.round(W * s); canvas.height = Math.round(H * s);
      g.setTransform(s, 0, 0, s, 0, 0);
      back.width = Math.max(1, Math.ceil(W / 4)); back.height = Math.max(1, Math.ceil(H / 4));
      bg.setTransform(back.width / Math.max(1, W), 0, 0, back.height / Math.max(1, H), 0, 0);
      if (origin) {
        const o = origin.getBoundingClientRect();
        cx = o.left - r.left + o.width / 2; cy = o.top - r.top + o.height / 2; ringR = o.width / 2;
      } else { cx = W / 2; cy = H * 0.42; }
      // Halo colorido atrás do anel, já desfocado (desfocar a cada quadro pesa em PC sem placa de vídeo).
      halo = null;
      if (ringR > 4 && g.createConicGradient) {
        const S = Math.ceil(ringR * 4.4), c = document.createElement('canvas');
        c.width = c.height = S;
        const h = c.getContext('2d'), cg = h.createConicGradient(0, S / 2, S / 2);
        cg.addColorStop(0, 'rgba(91,44,255,.9)'); cg.addColorStop(0.33, 'rgba(255,45,85,.75)'); cg.addColorStop(0.66, 'rgba(201,184,255,.85)'); cg.addColorStop(1, 'rgba(91,44,255,.9)');
        h.filter = `blur(${Math.round(ringR * 0.22)}px)`;
        h.beginPath(); h.arc(S / 2, S / 2, ringR * 1.45, 0, Math.PI * 2); h.arc(S / 2, S / 2, ringR * 0.9, 0, Math.PI * 2, true);
        h.fillStyle = cg; h.fill();
        halo = c;
      }
    }

    const add = (p) => { if (parts.length < 700) parts.push(p); };
    function shards(n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), v = rand(0.35, 1) * speed * u, d = ringR * rand(0.6, 1);
        add({ k: 'c', img: pick(CRYSTALS), x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * u,
          s: rand(10, 26) * u, rot: a + Math.PI / 2, vr: rand(-4, 4), life: rand(2.2, 3.8), age: 0, drag: 1.7, grav: 260 * u });
      }
      for (let i = 0; i < n * 1.4; i++) {
        const a = rand(0, Math.PI * 2), v = rand(0.2, 1.1) * speed * 1.2 * u;
        add({ k: 'd', img: pick(DUST), x: cx + Math.cos(a) * ringR * 0.8, y: cy + Math.sin(a) * ringR * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          s: rand(5, 14) * u, life: rand(1.2, 2.4), age: 0, drag: 2.4, grav: 30 * u });
      }
    }
    const wave = (delay, power) => waves.push({ age: -delay, life: 1.9 + power * 0.5, power });

    function spawnAmbient(dt) {
      const after = burstAt && t >= burstAt;
      // Poeira subindo devagar do pé da tela.
      if (Math.random() < dt * (6 + tier * 8)) add({ k: 'd', img: pick(DUST), x: rand(0, W), y: H + 10, vx: rand(-8, 8) * u, vy: -rand(25, 70) * u,
        s: rand(4, 11) * u, life: rand(4, 7), age: 0, drag: 0, grav: 0, tw: rand(0, 6) });
      if (!after) return;
      // Cristais caindo como neve fina.
      if (tier >= 2 && Math.random() < dt * (tier === 3 ? 7 : 3.5)) add({ k: 'c', img: pick(CRYSTALS), x: rand(0, W), y: -20, vx: rand(-15, 15) * u, vy: rand(50, 110) * u,
        s: rand(6, 14) * u, rot: rand(0, 6), vr: rand(-1.5, 1.5), life: rand(5, 8), age: 0, drag: 0, grav: 0 });
      // Brilhos em volta da nota.
      if (Math.random() < dt * (2 + tier * 3)) {
        const a = rand(0, Math.PI * 2), d = ringR * rand(1.05, 2.3);
        add({ k: 's', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.8, s: rand(14, 30) * u, life: rand(0.7, 1.1), age: 0, rot: rand(0, 1) });
      }
    }

    function drawBack() {
      const fade = Math.min(1, t / 1.2), k = tier / 3;
      bg.clearRect(0, 0, W, H);
      bg.globalCompositeOperation = 'lighter';
      // Aurora: duas manchas de luz que respiram e passeiam.
      const blob = (x, y, r, color, a) => {
        const gr = bg.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0));
        bg.fillStyle = gr; bg.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const R = Math.max(W, H);
      blob(W * (0.78 + Math.sin(t * 0.21) * 0.08), H * (0.22 + Math.cos(t * 0.17) * 0.08), R * 0.6, 'rgba(91,44,255,A)', (0.22 + 0.18 * k) * fade * (0.85 + 0.15 * Math.sin(t * 0.9)));
      blob(W * (0.15 + Math.cos(t * 0.19) * 0.07), H * (0.9 + Math.sin(t * 0.23) * 0.06), R * 0.55, 'rgba(255,45,85,A)', (0.14 + 0.14 * k) * fade * (0.85 + 0.15 * Math.sin(t * 0.7 + 2)));
      // Raios de luz (85+ fraco, 95+ forte).
      if (tier >= 2 && burstAt && t >= burstAt) {
        const a = Math.min(1, (t - burstAt) / 1.2) * (tier === 3 ? 0.13 : 0.07), L = R * 0.9, n = 14;
        bg.save(); bg.translate(cx, cy); bg.rotate(t * 0.07);
        const gr = bg.createRadialGradient(0, 0, ringR * 0.8, 0, 0, L);
        gr.addColorStop(0, `rgba(230,220,255,${a})`); gr.addColorStop(1, 'rgba(230,220,255,0)');
        bg.fillStyle = gr;
        for (let i = 0; i < n; i++) {
          const b = (i / n) * Math.PI * 2, w = (i % 2 ? 0.05 : 0.09);
          bg.beginPath(); bg.moveTo(0, 0); bg.lineTo(Math.cos(b - w) * L, Math.sin(b - w) * L); bg.lineTo(Math.cos(b + w) * L, Math.sin(b + w) * L); bg.closePath(); bg.fill();
        }
        bg.restore();
      }
      g.globalCompositeOperation = 'lighter';
      g.drawImage(back, 0, 0, W, H);
      // Halo girando atrás do anel da nota.
      const pulse = burstAt && t >= burstAt ? Math.max(0, 1 - (t - burstAt) / 0.8) : 0;
      const hr = ringR * (1.45 + 0.12 * Math.sin(t * 1.6) + 0.35 * pulse);
      if (halo) {
        const sc = hr / (ringR * 1.45), S = halo.width * sc;
        g.save(); g.translate(cx, cy); g.rotate(t * 0.5);
        g.globalAlpha = (0.28 + 0.2 * k + 0.4 * pulse) * fade;
        g.drawImage(halo, -S / 2, -S / 2, S, S);
        g.restore();
      }
      g.globalAlpha = 1;
    }

    // Ondas: saem redondas do anel e vão deitando, como os anéis do buraco de minhoca do logo.
    function drawWaves(dt) {
      waves = waves.filter((w) => (w.age += dt) < w.life);
      g.save(); g.translate(cx, cy); g.rotate(-14 * Math.PI / 180);
      for (const w of waves) {
        if (w.age < 0) continue;
        const k = w.age / w.life, e = 1 - Math.pow(1 - k, 3);
        const rx = ringR * (1 + e * (2.6 + w.power)), ry = rx * (1 - 0.62 * e), a = (1 - k) * (0.5 + 0.25 * w.power);
        g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        g.strokeStyle = `rgba(124,92,255,${a * 0.5})`; g.lineWidth = (14 - 10 * k) * u; g.stroke();
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = (3.2 - 2.4 * k) * u; g.stroke();
      }
      g.restore();
    }

    function drawParts(dt) {
      parts = parts.filter((p) => (p.age += dt) < p.life);
      for (const p of parts) {
        const k = p.age / p.life;
        if (p.k === 's') {
          const sc = Math.sin(Math.PI * k);
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot + k * 0.6); g.globalAlpha = sc;
          g.drawImage(SPARK, -p.s * sc, -p.s * sc, p.s * 2 * sc, p.s * 2 * sc); g.restore();
          continue;
        }
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag; p.vy = p.vy * drag + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        let a = k < 0.1 ? k / 0.1 : k > 0.6 ? (1 - k) / 0.4 : 1;
        if (p.tw != null) a *= 0.55 + 0.45 * Math.sin(t * 3 + p.tw);
        g.globalAlpha = a;
        if (p.k === 'c') {
          p.rot += p.vr * dt;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.drawImage(p.img, -p.s, -p.s, p.s * 2, p.s * 2); g.restore();
        } else g.drawImage(p.img, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
      }
      g.globalAlpha = 1;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
      if (canvas.clientWidth !== Math.round(W) || canvas.clientHeight !== Math.round(H)) resize();
      if (burstAt && t >= burstAt && !frame.burst) {
        frame.burst = true;
        shards(calm ? 0 : [0, 36, 70, 110][tier], 700 + tier * 160);
        for (let i = 0; i < tier; i++) wave(i * 0.22, tier / 3);
        nextWave = t + 2.6;
        if (frame.onBurst) frame.onBurst();
      }
      if (tier === 3 && burst2At && t >= burst2At && !frame.burst2) { frame.burst2 = true; shards(calm ? 0 : 60, 900); wave(0, 1); }
      if (frame.burst && tier >= 2 && t >= nextWave && !calm) { wave(0, 0.5); nextWave = t + (tier === 3 ? 2 : 3); }
      if (!calm) spawnAmbient(dt);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      drawBack();
      g.globalCompositeOperation = 'lighter';
      drawWaves(dt);
      g.globalCompositeOperation = 'source-over';
      drawParts(dt);
    }

    return {
      // total: nota; ring: elemento do anel (centro da festa); delay: ms até a contagem chegar na nota.
      start(total, ring, delay, onBurst) {
        this.stop();
        tier = tierOf(total);
        canvas.hidden = !tier;
        if (!tier) return 0;
        origin = ring; t = 0; last = performance.now(); parts = []; waves = [];
        burstAt = delay / 1000; burst2At = burstAt + 0.75;
        frame.burst = frame.burst2 = false; frame.onBurst = onBurst;
        resize();
        raf = requestAnimationFrame(frame);
        return tier;
      },
      stop() {
        cancelAnimationFrame(raf); raf = 0;
        parts = []; waves = [];
        if (W) g.clearRect(0, 0, W, H);
      }
    };
  }

  root.AmethystCelebrate = { create, tierOf };
})(window);
