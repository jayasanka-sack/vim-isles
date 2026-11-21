// Vim Isles: game state, level flow, side panels and keyboard input.
const $ = s => document.querySelector(s);
const COL = { sea: '#0e3a4d', wave: '#2c6a7f', foam: '#3d8794', sand: '#dcbf86', sand2: '#c9a86c', stone: '#f4ecdb', shade: '#bfae8a', ink: '#2b2117', lantern: '#ffc14a', coral: '#ff7b5f', mint: '#79dfae', gem: '#6ee7ff', muted: '#7fa3a9', text: '#e8f0ec', sel: 'rgba(255,123,95,.38)' };
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SAVE_KEY = 'vim-isles-v1';
let save = { stars: {}, current: 0, seenIntro: false };
try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d) save = Object.assign(save, d); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

const G = { idx: 0, level: null, vim: null, target: null, gems: [], keys: 0, done: false, wq: false, fx: [], bufKey: '' };
let modal = null;

// ---------- level flow ----------
function loadLevel(i) {
  i = Math.max(0, Math.min(LEVELS.length - 1, i));
  const L = LEVELS[i], m = parseMap(L.map);
  Object.assign(G, { idx: i, level: L, vim: new Vim(m.buf, m.start, allowedFor(i)), target: L.target || null,
    gems: m.gems.map(g => ({ ...g, got: false })), keys: 0, done: false, wq: false, fx: [], bufKey: '' });
  save.current = i; persist();
  $('#complete').hidden = true;
  renderLesson(); layoutWorld(); updateUI();
}
function bufMatches() { return G.target && G.vim.buf.length === G.target.length && G.vim.buf.every((l, i) => l === G.target[i]); }

function press(tok) {
  if (G.done) return;
  const v = G.vim;
  v.feed(tok); G.keys++;
  for (const e of v.events) {
    if (e.type === 'bell') shake();
    if (e.type === 'wq') G.wq = true;
    if (e.type === 'quit') v.flash('There is no quitting mid-voyage. In real Vim, :q quits and :q! quits without saving.', 'warn');
  }
  v.events = [];
  if (G.gems.length && v.mode !== 'insert') for (const g of G.gems) if (!g.got && g.r === v.r && g.c === v.c) { g.got = true; sparkle(g); }
  checkWin(); updateUI();
}
function checkWin() {
  const L = G.level, v = G.vim; let won = false;
  if (G.gems.length) won = G.gems.every(g => g.got);
  else {
    const match = bufMatches();
    if (G.wq && !match) { v.flash('The gate stays shut. The manifest does not match the chart yet.', 'err'); G.wq = false; }
    else if (match && v.mode === 'normal' && (!L.needsWq || G.wq)) won = true;
    else if (match && v.mode === 'insert') v.flash('The island matches the chart. Press Esc to finish.', 'good');
    else if (match && L.needsWq && v.mode === 'normal') v.flash('The manifest is right. Type :wq and Enter to open the gate.', 'good');
  }
  if (won) finish();
}
function starsFor(keys, par) { return keys <= par ? 3 : keys <= par * 2 ? 2 : 1; }
function finish() {
  G.done = true;
  const L = G.level, s = starsFor(G.keys, L.par);
  save.stars[G.idx] = Math.max(save.stars[G.idx] || 0, s); persist();
  if (G.gems.length === 0) for (let i = 0; i < 3; i++) G.fx.push(...burst((GUT + 2 + Math.random() * 10) * T, (1 + Math.random() * G.vim.buf.length) * T, COL.lantern));
  setTimeout(() => {
    const last = G.idx === LEVELS.length - 1;
    $('#cTitle').textContent = last ? 'Every isle sailed' : 'Isle cleared';
    $('#cStars').innerHTML = [1, 2, 3].map(n => starSvg(n <= s)).join('');
    const verdict = G.keys <= L.par ? 'Right on par. Tidy work.' : s === 2 ? 'Under twice par. A few keys to shave.' : 'Cleared. Try again with counts and bigger jumps to earn more stars.';
    $('#cText').textContent = `${L.title} took ${G.keys} keys. Par is ${L.par}. ${last ? 'You know enough Vim to edit real files now. Open the chart to replay any isle.' : verdict}`;
    $('#cNext').textContent = last ? 'Open the chart' : `Sail to ${LEVELS[G.idx + 1].title} (Enter)`;
    $('#complete').hidden = false;
  }, REDUCED ? 50 : 650);
}
function nextLevel() { if (G.idx === LEVELS.length - 1) openModal('chart'); else loadLevel(G.idx + 1); }
function starSvg(on) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9l-5.8 3.2 1.4-6.4L2.7 9.3l6.5-.7z" fill="${on ? COL.lantern : 'none'}" stroke="${on ? COL.lantern : COL.muted}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

// ---------- panels ----------
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function keyRow([k, d]) {
  const li = el('li'); const ks = el('span', 'k');
  k.split('  ').forEach(part => ks.appendChild(el('kbd', null, part)));
  li.append(ks, el('span', null, d)); return li;
}
function renderLesson() {
  const L = G.level, box = $('#lesson'); box.innerHTML = '';
  box.append(el('div', 'tag', `Isle ${G.idx + 1} of ${LEVELS.length}`));
  const h = el('h2', null, L.title); box.append(h, el('p', null, L.intro));
  box.append(el('h3', null, 'New keys'));
  const ul = el('ul', 'keys'); L.keys.forEach(k => ul.appendChild(keyRow(k))); box.append(ul);
  const goal = el('div', 'goal'); goal.id = 'goal'; box.append(goal);
  const det = el('details', 'hint'); det.append(el('summary', null, 'Show a hint'), el('p', null, L.hint)); box.append(det);
  $('#isleNum').textContent = `Isle ${G.idx + 1} of ${LEVELS.length}`;
  $('#isleTitle').textContent = L.title;
}
function renderGoal() {
  const g = $('#goal'); if (!g) return; g.innerHTML = '';
  if (G.gems.length) {
    g.append(el('strong', null, `Collect every gem by landing on it`));
    const pips = el('div', 'pips'); G.gems.forEach(x => pips.appendChild(el('span', 'pip' + (x.got ? ' got' : '')))); g.append(pips);
    g.append(el('span', 'legend', `Par: ${G.level.par} keys`));
  } else {
    g.append(el('strong', null, G.level.needsWq ? 'Match the chart, then :wq' : 'Make the island match the chart'));
    const pre = el('div', 'chartpre');
    G.target.forEach((line, i) => pre.appendChild(el('div', G.vim.buf[i] === line ? 'ok' : 'bad', line || ' ')));
    g.append(pre);
    const extra = G.vim.buf.length - G.target.length;
    g.append(el('span', 'legend', extra > 0 ? `The island has ${extra} line${extra > 1 ? 's' : ''} too many.` : extra < 0 ? `The island is missing ${-extra} line${extra < -1 ? 's' : ''}.` : `Lines turn green when they match. Par: ${G.level.par} keys`));
  }
}
const MODE_LABEL = { normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL', vline: 'V-LINE', cmdline: 'COMMAND' };
function updateUI() {
  const v = G.vim;
  const m = $('#mode'); m.textContent = MODE_LABEL[v.mode]; m.className = 'mode ' + v.mode;
  const cmd = $('#cmd');
  if (v.mode === 'cmdline') { cmd.className = 'cmd info'; cmd.textContent = v.cmdType + v.cmdline; cmd.appendChild(el('span', 'caret')); }
  else if (v.msg) { cmd.className = 'cmd ' + (v.msgType || 'info'); cmd.textContent = v.msg; }
  else if (v.mode === 'insert') { cmd.className = 'cmd idle'; cmd.textContent = '-- INSERT -- type text, Esc to stop'; }
  else if (v.mode === 'visual' || v.mode === 'vline') { cmd.className = 'cmd idle'; cmd.textContent = '-- VISUAL -- move to select, then d, y or c'; }
  else { cmd.className = 'cmd idle'; cmd.textContent = ''; }
  $('#showcmd').textContent = v.pending.map(k => k.length > 1 ? `<${k}>` : k).join('');
  $('#pos').textContent = `${v.r + 1}:${v.c + 1}`;
  const got = G.gems.filter(g => g.got).length;
  const gs = $('#gemStat'); gs.hidden = !G.gems.length; gs.innerHTML = `<em>gems</em> ${got}/${G.gems.length}`;
  $('#keyStat').innerHTML = `<em>keys</em> ${G.keys} <em>· par ${G.level.par}</em>`;
  renderGoal();
}
function renderChart() {
  const box = $('#isles'); box.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = el('button', 'isle' + (i === G.idx ? ' now' : '')); b.type = 'button';
    b.append(el('span', 'n', `Isle ${i + 1}`), el('span', 't', L.title), el('span', 'ks', L.keys.map(k => k[0].split('  ')[0]).slice(0, 4).join(' ')));
    const st = el('span', 'st'); st.innerHTML = [1, 2, 3].map(n => starSvg(n <= (save.stars[i] || 0))).join(''); b.append(st);
    b.addEventListener('click', () => { closeModal(); loadLevel(i); });
    box.appendChild(b);
  });
}
function renderGuide() {
  const box = $('#guide'); box.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const s = el('section', i > G.idx ? 'locked' : '');
    s.append(el('h4', null, `Isle ${i + 1} · ${L.title}${i > G.idx ? ' · not yet' : ''}`));
    const ul = el('ul', 'keys'); L.keys.forEach(k => ul.appendChild(keyRow(k))); s.append(ul); box.appendChild(s);
  });
}
function openModal(name) {
  closeModal();
  if (name === 'chart') renderChart(); if (name === 'guide') renderGuide();
  modal = $('#' + name + 'Modal'); modal.hidden = false;
}
function closeModal() { if (modal) modal.hidden = true; modal = null; }

// ---------- input ----------
function keyToken(e) {
  if (e.isComposing) return null;
  if (e.key === 'Escape') return 'Esc';
  if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) return 'C-r';
  if (e.ctrlKey && (e.key === '[' || e.key === 'c')) return 'Esc';
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'Enter') return 'Enter';
  if (e.key === 'Backspace') return 'BS';
  if (e.key === 'Tab') return 'Tab';
  if (e.key.length === 1) return e.key;
  return null;
}
document.addEventListener('keydown', e => {
  if (modal) {
    if (e.key === 'Escape') { e.preventDefault(); if (modal.id === 'introModal') startFromIntro(); else closeModal(); }
    else if (e.key === 'Enter' && modal.id === 'introModal') { e.preventDefault(); startFromIntro(); }
    return;
  }
  if (G.done) {
    if (e.key === 'Enter') { e.preventDefault(); nextLevel(); }
    else if (e.key === 'r') { e.preventDefault(); loadLevel(G.idx); }
    return;
  }
  if (e.key.startsWith('Arrow')) { e.preventDefault(); G.vim.flash('Arrow keys sink here. Use h j k l.', 'warn'); updateUI(); return; }
  const tok = keyToken(e); if (!tok) return;
  e.preventDefault(); press(tok);
});
const kbd = $('#kbd');
kbd.addEventListener('input', () => { const val = kbd.value; kbd.value = ''; for (const ch of val) press(ch); });
$('#kbBtn').addEventListener('click', () => kbd.focus());
document.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => { press(b.dataset.key); kbd.focus(); }));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'introModal') closeModal(); }));
$('#btnChart').addEventListener('click', e => { e.currentTarget.blur(); openModal('chart'); });
$('#btnGuide').addEventListener('click', e => { e.currentTarget.blur(); openModal('guide'); });
$('#btnReset').addEventListener('click', e => { e.currentTarget.blur(); loadLevel(G.idx); });
$('#cNext').addEventListener('click', nextLevel);
$('#cRetry').addEventListener('click', () => loadLevel(G.idx));
function startFromIntro() { save.seenIntro = true; persist(); closeModal(); window.focus(); }
$('#introGo').addEventListener('click', startFromIntro);
const veil = $('#veil');
function syncVeil() { veil.hidden = document.hasFocus() || !!modal || matchMedia('(pointer: coarse)').matches; }
window.addEventListener('focus', syncVeil); window.addEventListener('blur', syncVeil);
$('#veilBtn').addEventListener('click', () => { window.focus(); veil.hidden = true; });
$('#viewport').addEventListener('pointerdown', () => { window.focus(); if (matchMedia('(pointer: coarse)').matches) kbd.focus(); });
setInterval(syncVeil, 800);
function shake() { if (REDUCED) return; const vp = $('#viewport'); vp.classList.remove('shake'); void vp.offsetWidth; vp.classList.add('shake'); }

