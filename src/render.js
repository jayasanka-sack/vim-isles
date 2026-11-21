// Vim Isles: draws the sea, the text island, gems, cursor and effects on a canvas.
// The island layer is cached and only redrawn when the buffer or tile size changes.

// ---------- rendering ----------
const cv = $('#world'), ctx = cv.getContext('2d');
const isl = document.createElement('canvas');
let dpr = 1, VW = 0, VH = 0, T = 28, islKey = '';
const GUT = 3;
const cam = { x: 0, y: 0, init: false };
function worldCols() { let m = 0; for (const l of G.vim.buf) m = Math.max(m, l.length); if (G.target) for (const l of G.target) m = Math.max(m, l.length); return m; }
function worldRows() { return Math.max(G.vim.buf.length, G.target ? G.target.length : 0); }
function layoutWorld() {
  const r = $('#viewport').getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1); VW = r.width; VH = r.height;
  cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr); cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  if (!G.vim) return;
  const cols = worldCols() + 2, rows = worldRows() + 2;
  T = Math.floor(Math.max(18, Math.min(40, VW / (GUT + 1 + cols), VH / rows)));
  cam.init = false; islKey = '';
}
const sx = c => (GUT + 1 + c) * T - cam.x, sy = r => (1 + r) * T - cam.y;
function hash(a, b) { let h = (a * 73856093) ^ (b * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; }
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

function drawIsland() {
  const v = G.vim, W = (GUT + 3 + worldCols()) * T + T * 4, H = (worldRows() + 3) * T + T * 4;
  isl.width = Math.ceil(W * dpr); isl.height = Math.ceil(H * dpr); isl._w = W; isl._h = H;
  const c = isl.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const X = col => (GUT + 1 + col) * T, Y = r => (1 + r) * T;
  const e = T * 0.16;
  c.fillStyle = COL.foam;
  v.buf.forEach((line, r) => { const n = Math.max(1, line.length); for (let i = 0; i < n; i++) { rr(c, X(i) - e, Y(r) - e, T + 2 * e, T + 2 * e, T * 0.32); c.fill(); } });
  v.buf.forEach((line, r) => {
    const n = Math.max(1, line.length);
    for (let i = 0; i < n; i++) {
      const x = X(i), y = Y(r), h = hash(i + 7, r + 3);
      c.fillStyle = line.length ? COL.sand : COL.sand2; c.fillRect(x - .5, y - .5, T + 1, T + 1);
      c.fillStyle = 'rgba(120,88,40,.28)';
      for (let k = 0; k < 3; k++) { const hx = (h >>> (k * 7)) % 100 / 100, hy = (h >>> (k * 5 + 3)) % 100 / 100; c.fillRect(x + 3 + hx * (T - 7), y + 3 + hy * (T - 7), 2, 2); }
      const ch = line[i];
      if (ch !== undefined && ch !== ' ') {
        c.fillStyle = COL.shade; rr(c, x + 2, y + 3, T - 4, T - 4, T * 0.18); c.fill();
        c.fillStyle = COL.stone; rr(c, x + 2, y + 2, T - 4, T - 5, T * 0.18); c.fill();
        c.fillStyle = COL.ink; c.font = `700 ${Math.round(T * 0.56)}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(ch, x + T / 2, y + T / 2);
      }
    }
  });
}
function drawWater(t) {
  ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = COL.wave; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.lineCap = 'round';
  const x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1, x1 = x0 + Math.ceil(VW / T) + 2, y1 = y0 + Math.ceil(VH / T) + 2;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const h = hash(tx, ty); if (h % 4) continue;
    const ox = REDUCED ? 0 : Math.sin(t / 1400 + (h % 628) / 100) * T * 0.12;
    const x = tx * T - cam.x + (h % 7) / 7 * T * 0.5 + ox, y = ty * T - cam.y + T * 0.5 + ((h >> 3) % 5) / 5 * T * 0.3, w = T * 0.42;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w * 0.25, y - w * 0.28, x + w * 0.5, y); ctx.quadraticCurveTo(x + w * 0.75, y + w * 0.28, x + w, y); ctx.stroke();
  }
}
function selRange() {
  const v = G.vim; if (v.mode !== 'visual' && v.mode !== 'vline') return null;
  let a = v.vs, b = { r: v.r, c: v.c }; if (b.r < a.r || (b.r === a.r && b.c < a.c)) [a, b] = [b, a];
  return { a, b, lw: v.mode === 'vline' };
}
function frame(t) {
  requestAnimationFrame(frame);
  if (!G.vim || !VW) return;
  const v = G.vim;
  const key = v.buf.join('\n') + '|' + T + '|' + dpr;
  if (key !== islKey) { islKey = key; drawIsland(); }
  // camera
  const WW = (GUT + 3 + worldCols()) * T, WH = (worldRows() + 2) * T;
  const cx = (GUT + 1 + v.c + 0.5) * T, cy = (1 + v.r + 0.5) * T;
  const fit = (W, V, cur, p) => { if (W <= V) return (W - V) / 2; let tgt = p; const m = V * 0.28; if (cur - tgt < m) tgt = cur - m; if (cur - tgt > V - m) tgt = cur - (V - m); return Math.max(0, Math.min(W - V, tgt)); };
  const tx = fit(WW, VW, cx, cam.x), ty = fit(WH, VH, cy, cam.y);
  if (!cam.init || REDUCED) { cam.x = tx; cam.y = ty; cam.init = true; } else { cam.x += (tx - cam.x) * 0.18; cam.y += (ty - cam.y) * 0.18; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWater(t);
  ctx.drawImage(isl, -cam.x, -cam.y, isl._w, isl._h);
  // gutter line numbers
  ctx.font = `500 ${Math.round(T * 0.42)}px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  v.buf.forEach((line, r) => {
    let col = r === v.r ? COL.text : COL.muted;
    if (G.target) col = G.target[r] === line ? COL.mint : (r === v.r ? COL.coral : 'rgba(255,123,95,.75)');
    ctx.fillStyle = col; ctx.fillText(String(r + 1), (GUT + 0.55) * T - cam.x, sy(r) + T / 2);
  });
  // selection
  const S = selRange();
  if (S) {
    ctx.fillStyle = COL.sel;
    for (let r = S.a.r; r <= S.b.r; r++) {
      const L = Math.max(1, v.len(r)); let c0 = 0, c1 = L - 1;
      if (!S.lw) { if (r === S.a.r) c0 = S.a.c; if (r === S.b.r) c1 = Math.min(S.b.c, L - 1); }
      ctx.fillRect(sx(c0), sy(r), (c1 - c0 + 1) * T, T);
    }
  }
  // gems
  G.gems.forEach((g, i) => {
    if (g.got) return;
    const x = sx(g.c), y = sy(g.r), pulse = REDUCED ? 1 : 0.6 + 0.4 * Math.sin(t / 300 + i);
    ctx.strokeStyle = COL.gem; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * pulse;
    rr(ctx, x + 1, y + 1, T - 2, T - 2, T * 0.2); ctx.stroke(); ctx.globalAlpha = 1;
    const bob = REDUCED ? 0 : Math.sin(t / 420 + i * 1.7) * T * 0.05;
    const gx = x + T * 0.82, gy = y + T * 0.16 + bob, s = Math.max(4, T * 0.19);
    ctx.save(); ctx.shadowColor = COL.gem; ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = COL.gem; ctx.beginPath(); ctx.moveTo(gx, gy - s); ctx.lineTo(gx + s * 0.75, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - s * 0.75, gy); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(gx - s * 0.2, gy - s * 0.45, s * 0.25, s * 0.35);
  });
  // cursor
  const x = sx(v.c), y = sy(v.r), glow = REDUCED ? 8 : 8 + 6 * Math.sin(t / 260);
  ctx.save();
  if (v.mode === 'insert') {
    ctx.shadowColor = COL.mint; ctx.shadowBlur = glow; ctx.fillStyle = COL.mint;
    ctx.fillRect(x - 2, y + 2, 4, T - 4); ctx.fillRect(x - 5, y + 2, 10, 2); ctx.fillRect(x - 5, y + T - 4, 10, 2);
  } else {
    const color = v.pending.length ? COL.coral : v.mode === 'cmdline' ? COL.gem : COL.lantern;
    ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.fillStyle = color;
    rr(ctx, x + 1, y + 1, T - 2, T - 2, T * 0.2); ctx.fill();
    ctx.shadowBlur = 0;
    const ch = v.buf[v.r][v.c];
    if (ch && ch !== ' ') { ctx.fillStyle = COL.ink; ctx.font = `700 ${Math.round(T * 0.56)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x + T / 2, y + T / 2); }
  }
  ctx.restore();
  // effects
  G.fx = G.fx.filter(p => p.life > 0);
  for (const p of G.fx) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 1;
    ctx.globalAlpha = Math.max(0, p.life / 50); ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cam.x - 2, p.y - cam.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}
function burst(wx, wy, color) {
  if (REDUCED) return [];
  return Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, sp = 1.5 + Math.random() * 2.5; return { x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 40 + Math.random() * 15, color }; });
}
function sparkle(g) { G.fx.push(...burst((GUT + 1 + g.c + 0.5) * T, (1 + g.r + 0.5) * T, COL.gem)); }

