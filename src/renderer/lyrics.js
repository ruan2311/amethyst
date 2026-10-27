// Letras: leitura/escrita do formato LRC ("[01:23.45] linha") e a linha da vez num instante.
(function (root) {
  // Texto colado pode ser LRC (com tempos) ou letra simples (sem tempos).
  function parse(text) {
    const synced = [], plain = [];
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      const line = raw.replace(/\[[^\]]*\]/g, '').trim();
      if (stamps.length) {
        for (const s of stamps) synced.push({ t: +s[1] * 60 + parseFloat(s[2].replace(':', '.')), text: line });
      } else if (!/^\[[a-z]+:.*\]$/i.test(raw.trim())) {
        plain.push(line);
      }
    }
    synced.sort((a, b) => a.t - b.t);
    // remove linhas vazias do começo/fim da letra simples
    while (plain.length && !plain[0]) plain.shift();
    while (plain.length && !plain[plain.length - 1]) plain.pop();
    return synced.length ? { synced, plain: synced.map((l) => l.text) } : { synced: null, plain };
  }

  function stamp(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
  }
  function toText(lyr) {
    if (!lyr) return '';
    if (lyr.synced) return lyr.synced.map((l) => stamp(l.t) + ' ' + l.text).join('\n');
    return (lyr.plain || []).join('\n');
  }

  // Índice da linha cantada em t (segundos do vídeo), já com o ajuste de tempo.
  function lineAt(lyr, t) {
    if (!lyr || !lyr.synced) return -1;
    const x = t - (lyr.offset || 0);
    let lo = 0, hi = lyr.synced.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyr.synced[mid].t <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  root.AmethystLyrics = { parse, toText, lineAt, stamp };
})(typeof window !== 'undefined' ? window : globalThis);
