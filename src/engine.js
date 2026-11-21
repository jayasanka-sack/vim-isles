// Modal Isles: a small Vim engine.
// Pure logic, no DOM. The game feeds it one key token at a time ("j", "Esc", "Enter", "C-r", ...)
// and reads back the buffer, cursor, mode and messages. Node tools load this file too.
const WORDC = /[A-Za-z0-9_]/;
const isWS = ch => ch === ' ' || ch === '\t';
const MOTION1 = new Set(['h','j','k','l','w','b','e','W','B','E','0','^','$','G','{','}',';',',','%','n','N','*']);
const FINDS = new Set(['f','F','t','T']);
const NACTIONS = new Set(['x','X','~','D','C','s','S','Y','p','P','u','C-r','.','J','i','a','I','A','o','O','v','V',':','/','?']);
const VACTIONS = new Set(['d','x','y','c','s','~','o','v','V','D','X','Y','C','S']);
const TOBJ = new Set(['w','W','"',"'",'`','(',')','b','[',']','{','}','B','<','>']);
const BRACK = {'(':'()',')':'()','b':'()','[':'[]',']':'[]','{':'{}','}':'{}','B':'{}','<':'<>','>':'<>'};
const LOCK_LABEL = { count: 'counts (like 5j)', textobj: 'text objects (like iw or i")', 'C-r': 'Ctrl-r', gg: 'gg' };
const prettyKeys = ks => ks.map(k => k.length > 1 ? `<${k}>` : k).join('');

class Vim {
  constructor(lines, start, allowed) {
    this.buf = lines.slice(); this.r = start.r; this.c = start.c; this.want = this.c;
    this.mode = 'normal'; this.pending = []; this.reg = { text: '', lw: false };
    this.undoStack = []; this.redoStack = []; this.inChange = false;
    this.lastSearch = null; this.lastFind = null; this.lastChange = null;
    this.rec = []; this.recChanged = false; this.recDot = true; this.skipRecord = false; this.replaying = false;
    this.cmdline = ''; this.cmdType = ''; this.vs = null; this.allowed = allowed || null;
    this.msg = ''; this.msgType = ''; this.events = [];
  }
  allowedId(id) { return !this.allowed || this.allowed.has(id); }
  flash(m, t = 'info') { this.msg = m; this.msgType = t; }
  bell() { this.events.push({ type: 'bell' }); }
  get last() { return this.buf.length - 1; }
  len(r) { return this.buf[r].length; }
  charAt(p) { return this.buf[p.r][p.c]; }
  firstNB(r) { const s = this.buf[r]; const m = s.search(/\S/); return m < 0 ? Math.max(0, s.length - 1) : m; }
  next(p) { if (p.c < this.len(p.r) - 1) return { r: p.r, c: p.c + 1 }; if (p.r < this.last) return { r: p.r + 1, c: 0 }; return null; }
  prev(p) { if (p.c > 0) return { r: p.r, c: p.c - 1 }; if (p.r > 0) return { r: p.r - 1, c: Math.max(0, this.len(p.r - 1) - 1) }; return null; }
  cls(p, big) { const s = this.buf[p.r]; if (!s.length) return 'E'; const ch = s[p.c]; if (ch === undefined || isWS(ch)) return 0; if (big) return 1; return WORDC.test(ch) ? 1 : 2; }
  wantCol(r) { const L = this.len(r); if (!L) return 0; return Math.min(this.want === Infinity ? L - 1 : this.want, L - 1); }
  clampNormal() {
    this.r = Math.max(0, Math.min(this.r, this.last));
    if (this.mode === 'insert') { this.c = Math.max(0, Math.min(this.c, this.len(this.r))); return; }
    this.c = Math.max(0, Math.min(this.c, Math.max(0, this.len(this.r) - 1)));
  }

  // ---------- key entry ----------
  feed(key) {
    const idle = this.mode === 'normal' && this.pending.length === 0;
    if (idle) { this.rec = []; this.recChanged = false; this.recDot = true; this.skipRecord = false; if (!this.replaying) this.msg = ''; }
    this.rec.push(key);
    if (this.mode === 'normal') this.normalKey(key);
    else if (this.mode === 'insert') this.insertKey(key);
    else if (this.mode === 'visual' || this.mode === 'vline') this.visualKey(key);
    else if (this.mode === 'cmdline') this.cmdKey(key);
    if (this.mode === 'normal' && this.pending.length === 0) {
      if (this.inChange) this.endChange();
      if (this.recChanged && this.recDot && !this.replaying && !this.skipRecord) this.lastChange = this.rec.slice();
      this.rec = []; this.recChanged = false;
      this.clampNormal();
    }
  }
  checkParsed(res) {
    const typed = prettyKeys(this.pending); this.pending = [];
    if (res.status === 'inv') { this.flash(`Not a command: ${typed}`, 'err'); this.bell(); return false; }
    const locked = res.ids.find(id => !this.allowedId(id));
    if (locked) { this.flash(`Locked: you haven't learned ${LOCK_LABEL[locked] || locked} yet.`, 'lock'); this.events.push({ type: 'locked', id: locked }); this.bell(); return false; }
    return true;
  }
  normalKey(key) {
    if (key === 'Esc') { this.pending = []; return; }
    this.pending.push(key);
    const res = this.parse(this.pending, false);
    if (res.status === 'inc') return;
    if (!this.checkParsed(res)) return;
    this.exec(res);
  }

  // ---------- parsing ----------
  readCount(keys, i) { let s = ''; while (i < keys.length && /^[0-9]$/.test(keys[i]) && !(keys[i] === '0' && s === '')) s += keys[i++]; return [s, i]; }
  parse(keys, visual) {
    const INC = { status: 'inc' }, INV = { status: 'inv' };
    let [n1, i] = this.readCount(keys, 0);
    if (i >= keys.length) return INC;
    const ids = []; if (n1) ids.push('count');
    const k = keys[i];
    if (!visual && (k === 'd' || k === 'c' || k === 'y')) {
      ids.push(k); i++;
      const [n2, j] = this.readCount(keys, i); i = j; if (n2) ids.push('count');
      if (i >= keys.length) return INC;
      const count = (+n1 || 1) * (+n2 || 1), hasCount = !!(n1 || n2);
      const m = keys[i];
      if (m === k) return i === keys.length - 1 ? { status: 'ok', kind: 'opline', op: k, count, hasCount, ids } : INV;
      if (m === 'i' || m === 'a') {
        if (i + 1 >= keys.length) return INC;
        const t = keys[i + 1]; if (!TOBJ.has(t) || i + 2 !== keys.length) return INV;
        ids.push('textobj'); return { status: 'ok', kind: 'optobj', op: k, inner: m === 'i', obj: t, count, hasCount, ids };
      }
      const mr = this.parseMotion(keys, i);
      if (mr.status === 'inc') return INC;
      if (mr.status !== 'ok') return INV;
      ids.push(mr.id); return { status: 'ok', kind: 'opmotion', op: k, motion: mr.motion, count, hasCount, ids };
    }
    const count = +n1 || 1, hasCount = !!n1;
    if (visual && (k === 'i' || k === 'a')) {
      if (i + 1 >= keys.length) return INC;
      const t = keys[i + 1]; if (!TOBJ.has(t) || i + 2 !== keys.length) return INV;
      ids.push('textobj'); return { status: 'ok', kind: 'vtobj', inner: k === 'i', obj: t, count, hasCount, ids };
    }
    const mr = this.parseMotion(keys, i);
    if (mr.status === 'inc') return INC;
    if (mr.status === 'inv') return INV;
    if (mr.status === 'ok') { ids.push(mr.id); return { status: 'ok', kind: 'motion', motion: mr.motion, count, hasCount, ids }; }
    if (!visual && k === 'r') {
      if (i + 1 >= keys.length) return INC;
      const a = keys[i + 1]; if (a.length !== 1 || i + 2 !== keys.length) return INV;
      ids.push('r'); return { status: 'ok', kind: 'action', key: 'r', arg: a, count, hasCount, ids };
    }
    const set = visual ? VACTIONS : NACTIONS;
    if (set.has(k) && i === keys.length - 1) { ids.push(k); return { status: 'ok', kind: 'action', key: k, count, hasCount, ids }; }
    return INV;
  }
  parseMotion(keys, i) {
    const k = keys[i], rest = keys.length - i;
    if (MOTION1.has(k)) return rest === 1 ? { status: 'ok', id: k, motion: { key: k } } : { status: 'inv' };
    if (k === 'g') {
      if (rest === 1) return { status: 'inc' };
      if (keys[i + 1] === 'g' && rest === 2) return { status: 'ok', id: 'gg', motion: { key: 'gg' } };
      return { status: 'inv' };
    }
    if (FINDS.has(k)) {
      if (rest === 1) return { status: 'inc' };
      const a = keys[i + 1]; if (a.length !== 1 || rest !== 2) return { status: 'inv' };
      return { status: 'ok', id: k, motion: { key: k, arg: a } };
    }
    return { status: 'none' };
  }

  // ---------- motions ----------
  wFwd(p, big) {
    let q = p; const c0 = this.cls(q, big); let n = this.next(q);
    if (c0 === 1 || c0 === 2) { while (n && n.r === q.r && this.cls(n, big) === c0) { q = n; n = this.next(q); } }
    if (!n) return { pos: { r: q.r, c: this.len(q.r) }, end: true };
    q = n;
    while (q) {
      const c = this.cls(q, big);
      if (c === 'E') { if (q.r !== p.r) break; } else if (c !== 0) break;
      const nn = this.next(q); if (!nn) return { pos: { r: q.r, c: this.len(q.r) }, end: true };
      q = nn;
    }
    return { pos: q, end: false };
  }
  bBack(p, big) {
    let q = this.prev(p); if (!q) return { r: 0, c: 0 };
    while (q) { const c = this.cls(q, big); if (c !== 0) break; const pp = this.prev(q); if (!pp) return q; q = pp; }
    if (this.cls(q, big) === 'E') return q;
    const c0 = this.cls(q, big); let pp;
    while ((pp = this.prev(q)) && pp.r === q.r && this.cls(pp, big) === c0) q = pp;
    return q;
  }
  eFwd(p, big) {
    let q = this.next(p); if (!q) return p;
    while (q && (this.cls(q, big) === 0 || this.cls(q, big) === 'E')) q = this.next(q);
    if (!q) return { r: this.last, c: Math.max(0, this.len(this.last) - 1) };
    const c0 = this.cls(q, big); let n;
    while ((n = this.next(q)) && n.r === q.r && this.cls(n, big) === c0) q = n;
    return q;
  }
  cwTarget(count, big) {
    let q = { r: this.r, c: this.c };
    for (let i = 0; i < count; i++) {
      const n = this.next(q), c0 = this.cls(q, big);
      if (i === 0 && (!n || n.r !== q.r || this.cls(n, big) !== c0)) continue;
      q = this.eFwd(q, big);
    }
    return { r: q.r, c: q.c, inc: true };
  }
  findChar(kind, ch, count, isRepeat) {
    const s = this.buf[this.r]; const fwd = kind === 'f' || kind === 't'; let pos = this.c;
    for (let i = 0; i < count; i++) {
      let start = fwd ? pos + 1 : pos - 1;
      if (isRepeat && i === 0 && (kind === 't' || kind === 'T')) start = fwd ? pos + 2 : pos - 2;
      const idx = fwd ? s.indexOf(ch, start) : (start < 0 ? -1 : s.lastIndexOf(ch, start));
      if (idx < 0) return null; pos = idx;
    }
    if (kind === 't') pos -= 1; if (kind === 'T') pos += 1;
    return { r: this.r, c: pos, inc: fwd };
  }
  matchPair() {
    const s = this.buf[this.r]; let i = this.c; const pairs = '()[]{}';
    while (i < s.length && pairs.indexOf(s[i]) < 0) i++;
    if (i >= s.length) return null;
    const ch = s[i], k = pairs.indexOf(ch), open = k % 2 === 0, mate = pairs[open ? k + 1 : k - 1];
    let depth = 0, p = { r: this.r, c: i };
    while (p) {
      const c = this.charAt(p);
      if (c === ch) depth++;
      else if (c === mate) { depth--; if (depth === 0) return { r: p.r, c: p.c, inc: true }; }
      p = open ? this.next(p) : this.prev(p);
    }
    return null;
  }
  search(pat, dir, from) {
    let re; try { re = new RegExp(pat, 'g'); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); }
    const hits = [];
    for (let r = 0; r < this.buf.length; r++) {
      const s = this.buf[r]; re.lastIndex = 0; let m;
      while ((m = re.exec(s))) { hits.push({ r, c: m.index }); if (m[0].length === 0) re.lastIndex++; }
    }
    if (!hits.length) { this.flash(`Pattern not found: ${pat}`, 'err'); return null; }
    const cmp = (a, b) => a.r - b.r || a.c - b.c;
    if (dir > 0) { const h = hits.find(h => cmp(h, from) > 0); if (h) return h; this.flash('Search hit BOTTOM, continuing at TOP', 'warn'); return hits[0]; }
    for (let i = hits.length - 1; i >= 0; i--) if (cmp(hits[i], from) < 0) return hits[i];
    this.flash('Search hit TOP, continuing at BOTTOM', 'warn'); return hits[hits.length - 1];
  }
  doMotion(m, count, hasCount, op) {
    const p = { r: this.r, c: this.c }, L = this.len(p.r);
    switch (m.key) {
      case 'h': if (p.c === 0) return null; return { r: p.r, c: Math.max(0, p.c - count) };
      case 'l':
        if (!L) return null;
        if (op) { if (p.c >= L) return null; return { r: p.r, c: Math.min(L, p.c + count) }; }
        if (p.c >= L - 1) return null; return { r: p.r, c: Math.min(L - 1, p.c + count) };
      case 'j': case 'k': {
        const t = Math.max(0, Math.min(this.last, m.key === 'j' ? p.r + count : p.r - count));
        if (t === p.r) return null; return { r: t, c: this.wantCol(t), lw: true, keepWant: true };
      }
      case 'w': case 'W': {
        const big = m.key === 'W'; let q = p, res;
        for (let n = 0; n < count; n++) { res = this.wFwd(q, big); q = res.pos; if (res.end) break; }
        if (op) {
          if (!res.end && q.r > p.r && /^\s*$/.test(this.buf[q.r].slice(0, q.c))) { const r = q.r - 1; return { r, c: this.len(r) }; }
          return { r: q.r, c: q.c };
        }
        if (res.end) q = { r: q.r, c: Math.max(0, this.len(q.r) - 1) };
        if (q.r === p.r && q.c === p.c) return null; return q;
      }
      case 'b': case 'B': { let q = p; for (let n = 0; n < count; n++) q = this.bBack(q, m.key === 'B'); if (q.r === p.r && q.c === p.c) return null; return q; }
      case 'e': case 'E': { let q = p; for (let n = 0; n < count; n++) q = this.eFwd(q, m.key === 'E'); if (q.r === p.r && q.c === p.c) return null; return { r: q.r, c: q.c, inc: true }; }
      case '0': return { r: p.r, c: 0 };
      case '^': return { r: p.r, c: this.firstNB(p.r) };
      case '$': { const r = Math.min(this.last, p.r + count - 1); const Lr = this.len(r); if (!Lr) return { r, c: 0, want: Infinity }; return { r, c: Lr - 1, inc: true, want: Infinity }; }
      case 'gg': { const r = hasCount ? Math.min(this.last, count - 1) : 0; return { r, c: this.firstNB(r), lw: true }; }
      case 'G': { const r = hasCount ? Math.min(this.last, count - 1) : this.last; return { r, c: this.firstNB(r), lw: true }; }
      case '}': {
        let r = p.r;
        for (let n = 0; n < count; n++) { while (r < this.last && !this.len(r)) r++; while (r < this.last && this.len(r)) r++; }
        if (r === p.r && (p.c >= L - 1)) return null;
        if (this.len(r)) return { r, c: op ? this.len(r) : this.len(r) - 1 };
        return { r, c: 0 };
      }
      case '{': {
        let r = p.r;
        for (let n = 0; n < count; n++) { while (r > 0 && !this.len(r)) r--; while (r > 0 && this.len(r)) r--; }
        if (r === p.r && p.c === 0) return null; return { r, c: 0 };
      }
      case 'f': case 'F': case 't': case 'T': this.lastFind = { key: m.key, ch: m.arg }; return this.findChar(m.key, m.arg, count, false);
      case ';': case ',': {
        if (!this.lastFind) return null; let k = this.lastFind.key;
        if (m.key === ',') k = { f: 'F', F: 'f', t: 'T', T: 't' }[k];
        return this.findChar(k, this.lastFind.ch, count, true);
      }
      case '%': return this.matchPair();
      case 'n': case 'N': {
        if (!this.lastSearch) { this.flash('No previous search', 'err'); return null; }
        const dir = m.key === 'n' ? this.lastSearch.dir : -this.lastSearch.dir; let q = p;
        for (let n = 0; n < count; n++) { q = this.search(this.lastSearch.pat, dir, q); if (!q) return null; }
        return q;
      }
      case '*': {
        const s = this.buf[p.r]; let i = p.c;
        while (i < s.length && !WORDC.test(s[i])) i++;
        if (i >= s.length) { this.flash('No word under the cursor', 'err'); return null; }
        let a = i, b = i; while (a > 0 && WORDC.test(s[a - 1])) a--; while (b < s.length - 1 && WORDC.test(s[b + 1])) b++;
        const w = s.slice(a, b + 1), pat = '\\b' + w + '\\b';
        this.lastSearch = { pat, dir: 1 }; this.flash('/' + w);
        let q = { r: p.r, c: a };
        for (let n = 0; n < count; n++) { q = this.search(pat, 1, q); if (!q) return null; }
        return q;
      }
    }
    return null;
  }
  moveTo(t) {
    this.r = t.r; this.c = t.c;
    if (t.keepWant) return;
    this.want = t.want === Infinity ? Infinity : this.c;
  }

  // ---------- text objects ----------
  textObj(inner, obj) {
    const p = { r: this.r, c: this.c }, s = this.buf[p.r];
    if (obj === 'w' || obj === 'W') {
      if (!s.length) return null;
      const big = obj === 'W'; const cl = i => { const ch = s[i]; return isWS(ch) ? 0 : big ? 1 : (WORDC.test(ch) ? 1 : 2); };
      let a = p.c, b = p.c; const k = cl(p.c);
      while (a > 0 && cl(a - 1) === k) a--; while (b < s.length - 1 && cl(b + 1) === k) b++;
      if (!inner) {
        if (k === 0) { if (b < s.length - 1) { const k2 = cl(b + 1); b++; while (b < s.length - 1 && cl(b + 1) === k2) b++; } }
        else if (b < s.length - 1 && cl(b + 1) === 0) { b++; while (b < s.length - 1 && cl(b + 1) === 0) b++; }
        else { while (a > 0 && cl(a - 1) === 0) a--; }
      }
      return { sr: p.r, sc: a, er: p.r, ec: b };
    }
    if (obj === '"' || obj === "'" || obj === '`') {
      const qs = []; for (let i = 0; i < s.length; i++) if (s[i] === obj && s[i - 1] !== '\\') qs.push(i);
      let a = -1, b = -1;
      for (let i = 0; i + 1 < qs.length; i += 2) if (qs[i] <= p.c && p.c <= qs[i + 1]) { a = qs[i]; b = qs[i + 1]; break; }
      if (a < 0) for (let i = 0; i + 1 < qs.length; i += 2) if (qs[i] > p.c) { a = qs[i]; b = qs[i + 1]; break; }
      if (a < 0) return null;
      if (inner) { if (b === a + 1) return { empty: true, sr: p.r, sc: b }; return { sr: p.r, sc: a + 1, er: p.r, ec: b - 1 }; }
      let e = b;
      if (e < s.length - 1 && isWS(s[e + 1])) { while (e < s.length - 1 && isWS(s[e + 1])) e++; }
      else { while (a > 0 && isWS(s[a - 1])) a--; }
      return { sr: p.r, sc: a, er: p.r, ec: e };
    }
    const pair = BRACK[obj]; if (!pair) return null;
    const [o, cl] = pair;
    let q = { ...p }, depth = 0, open = null;
    while (q) {
      const ch = this.charAt(q), here = q.r === p.r && q.c === p.c;
      if (ch === cl && !here) depth++;
      else if (ch === o) { if (depth === 0) { open = q; break; } depth--; }
      q = this.prev(q);
    }
    if (!open) return null;
    let close = null; q = this.next(open); depth = 0;
    while (q) {
      const ch = this.charAt(q);
      if (ch === o) depth++;
      else if (ch === cl) { if (depth === 0) { close = q; break; } depth--; }
      q = this.next(q);
    }
    if (!close) return null;
    if (!inner) return { sr: open.r, sc: open.c, er: close.r, ec: close.c };
    if (open.r === close.r && close.c === open.c + 1) return { empty: true, sr: close.r, sc: close.c };
    const st = this.next(open), en = this.prev(close);
    return { sr: st.r, sc: st.c, er: en.r, ec: en.c };
  }

  // ---------- ranges & operators ----------
  rangeFrom(a, t) {
    if (t.lw) return { sr: Math.min(a.r, t.r), er: Math.max(a.r, t.r), lw: true };
    let s = a, e = t; if (t.r < a.r || (t.r === a.r && t.c < a.c)) { s = t; e = a; }
    let er = e.r, ec = e.c;
    if (!t.inc) { if (ec === 0 && er > s.r) { er--; ec = this.len(er) - 1; } else ec--; }
    if (er === s.r && ec < s.c) return { empty: true, sr: s.r, sc: s.c };
    return { sr: s.r, sc: s.c, er, ec };
  }
  getText(R) {
    if (R.lw) return this.buf.slice(R.sr, R.er + 1);
    if (R.sr === R.er) return this.buf[R.sr].slice(R.sc, R.ec + 1);
    const parts = [this.buf[R.sr].slice(R.sc)];
    for (let r = R.sr + 1; r < R.er; r++) parts.push(this.buf[r]);
    parts.push(this.buf[R.er].slice(0, R.ec + 1));
    return parts.join('\n');
  }
  deleteRange(R) {
    if (R.lw) {
      this.buf.splice(R.sr, R.er - R.sr + 1); if (!this.buf.length) this.buf = [''];
      this.r = Math.min(R.sr, this.last); this.c = this.firstNB(this.r); return;
    }
    const head = this.buf[R.sr].slice(0, R.sc), tail = this.buf[R.er].slice(R.ec + 1);
    this.buf.splice(R.sr, R.er - R.sr + 1, head + tail); this.r = R.sr; this.c = R.sc;
  }
  applyOp(op, R) {
    if (R.empty) { if (op === 'c') { this.beginChange(); this.r = R.sr; this.c = R.sc; this.mode = 'insert'; } return; }
    this.reg = { text: this.getText(R), lw: !!R.lw };
    const n = R.lw ? R.er - R.sr + 1 : 0;
    if (op === 'y') {
      this.r = R.sr; if (!R.lw) this.c = R.sc;
      if (n > 2) this.flash(`${n} lines yanked`);
      return;
    }
    this.beginChange();
    if (op === 'd') { this.deleteRange(R); if (n > 2) this.flash(`${n} fewer lines`); return; }
    if (op === 'c') {
      if (R.lw) { const indent = (this.buf[R.sr].match(/^\s*/) || [''])[0]; this.buf.splice(R.sr, R.er - R.sr + 1, indent); this.r = R.sr; this.c = indent.length; }
      else { this.deleteRange(R); this.r = R.sr; this.c = R.sc; }
      this.mode = 'insert';
    }
  }
  mapRange(R, fn) {
    const flip = s => { let o = ''; for (const ch of s) o += fn(ch); return o; };
    this.beginChange();
    for (let r = R.sr; r <= R.er; r++) {
      const s = this.buf[r];
      if (R.lw) { this.buf[r] = flip(s); continue; }
      const a = r === R.sr ? R.sc : 0, b = r === R.er ? R.ec + 1 : s.length;
      this.buf[r] = s.slice(0, a) + flip(s.slice(a, b)) + s.slice(b);
    }
    this.r = R.sr; this.c = R.lw ? 0 : R.sc;
  }
  exec(res) {
    const { count, hasCount } = res;
    if (res.kind === 'motion') {
      const t = this.doMotion(res.motion, count, hasCount, null);
      if (!t) { this.bell(); return; }
      this.moveTo(t); this.clampNormal(); return;
    }
    if (res.kind === 'opmotion') {
      let t; const mk = res.motion.key;
      if (res.op === 'c' && (mk === 'w' || mk === 'W') && ![0, 'E'].includes(this.cls({ r: this.r, c: this.c }, mk === 'W'))) t = this.cwTarget(count, mk === 'W');
      else t = this.doMotion(res.motion, count, hasCount, res.op);
      if (!t) { this.bell(); return; }
      this.applyOp(res.op, this.rangeFrom({ r: this.r, c: this.c }, t));
    } else if (res.kind === 'opline') {
      this.applyOp(res.op, { sr: this.r, er: Math.min(this.last, this.r + count - 1), lw: true });
    } else if (res.kind === 'optobj') {
      const R = this.textObj(res.inner, res.obj);
      if (!R) { this.bell(); return; }
      this.applyOp(res.op, R);
    } else if (res.kind === 'action') {
      this.doAction(res);
    }
    if (this.mode === 'normal') { this.clampNormal(); this.want = this.c; }
  }
  doAction({ key, arg, count }) {
    const r = this.r, c = this.c, L = this.len(r);
    switch (key) {
      case 'x': if (!L) return this.bell(); return this.applyOp('d', { sr: r, sc: c, er: r, ec: Math.min(L - 1, c + count - 1) });
      case 'X': if (!c) return this.bell(); return this.applyOp('d', { sr: r, sc: Math.max(0, c - count), er: r, ec: c - 1 });
      case 'D': case 'C': {
        const er = Math.min(this.last, r + count - 1), op = key === 'D' ? 'd' : 'c';
        if (er === r && !L) { if (op === 'c') { this.beginChange(); this.mode = 'insert'; } return; }
        return this.applyOp(op, { sr: r, sc: c, er, ec: this.len(er) - 1 });
      }
      case 's': if (!L) { this.beginChange(); this.mode = 'insert'; return; } return this.applyOp('c', { sr: r, sc: c, er: r, ec: Math.min(L - 1, c + count - 1) });
      case 'S': return this.applyOp('c', { sr: r, er: Math.min(this.last, r + count - 1), lw: true });
      case 'Y': return this.applyOp('y', { sr: r, er: Math.min(this.last, r + count - 1), lw: true });
      case 'r': {
        if (c + count > L) return this.bell();
        this.beginChange(); const s = this.buf[r];
        this.buf[r] = s.slice(0, c) + arg.repeat(count) + s.slice(c + count); this.c = c + count - 1; return;
      }
      case '~': {
        if (!L) return this.bell();
        const e = Math.min(L, c + count);
        this.mapRange({ sr: r, sc: c, er: r, ec: e - 1 }, ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());
        this.c = Math.min(L - 1, e); return;
      }
      case 'J': {
        const n = Math.max(2, count); if (r >= this.last) return this.bell();
        this.beginChange();
        for (let i = 1; i < n && r < this.last; i++) {
          const a = this.buf[r], b = this.buf[r + 1].replace(/^\s+/, '');
          const sep = (!a.length || /\s$/.test(a) || !b.length || b[0] === ')') ? '' : ' ';
          this.buf.splice(r, 2, a + sep + b); this.c = sep ? a.length : Math.max(0, a.length - 1);
        }
        return;
      }
      case 'i': this.beginChange(); this.mode = 'insert'; return;
      case 'a': this.beginChange(); this.c = L ? c + 1 : 0; this.mode = 'insert'; return;
      case 'I': { this.beginChange(); const m = this.buf[r].search(/\S/); this.c = m < 0 ? L : m; this.mode = 'insert'; return; }
      case 'A': this.beginChange(); this.c = L; this.mode = 'insert'; return;
      case 'o': this.beginChange(); this.buf.splice(r + 1, 0, ''); this.r = r + 1; this.c = 0; this.mode = 'insert'; return;
      case 'O': this.beginChange(); this.buf.splice(r, 0, ''); this.c = 0; this.mode = 'insert'; return;
      case 'p': case 'P': return this.paste(key === 'P', count);
      case 'u': this.recDot = false; return this.undo();
      case 'C-r': this.recDot = false; return this.redo();
      case '.': return this.dot();
      case 'v': this.mode = 'visual'; this.vs = { r, c }; this.recDot = false; return;
      case 'V': this.mode = 'vline'; this.vs = { r, c }; this.recDot = false; return;
      case ':': case '/': case '?': this.mode = 'cmdline'; this.cmdType = key; this.cmdline = ''; this.recDot = false; return;
    }
  }
  paste(before, count) {
    const t = this.reg.text;
    if (t === '' || (Array.isArray(t) && !t.length)) { this.flash('Nothing to paste yet. Yank something first.', 'warn'); return this.bell(); }
    this.beginChange();
    if (this.reg.lw) {
      const lines = []; for (let i = 0; i < count; i++) lines.push(...t);
      const at = before ? this.r : this.r + 1; this.buf.splice(at, 0, ...lines);
      this.r = at; this.c = this.firstNB(at); if (lines.length > 2) this.flash(`${lines.length} more lines`); return;
    }
    const txt = t.repeat(count), parts = txt.split('\n'), s = this.buf[this.r];
    const at = before ? this.c : (s.length ? this.c + 1 : 0);
    if (parts.length === 1) { this.buf[this.r] = s.slice(0, at) + txt + s.slice(at); this.c = at + txt.length - 1; }
    else {
      const head = s.slice(0, at), tail = s.slice(at);
      this.buf.splice(this.r, 1, head + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail); this.c = at;
    }
  }

  // ---------- undo / redo / dot ----------
  snapshot() { return { buf: this.buf.slice(), r: this.r, c: this.c }; }
  restore(s) { this.buf = s.buf.slice(); this.r = Math.min(s.r, this.last); this.c = s.c; this.want = this.c; }
  beginChange() {
    if (this.inChange) return;
    this.undoStack.push(this.snapshot()); if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = []; this.inChange = true; this.recChanged = true;
  }
  endChange() {
    this.inChange = false;
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.buf.length === this.buf.length && top.buf.every((l, i) => l === this.buf[i])) this.undoStack.pop();
  }
  undo() {
    if (!this.undoStack.length) { this.flash('Already at the oldest change', 'warn'); return this.bell(); }
    this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop());
    this.flash(`Undid one change · ${this.undoStack.length} more to undo`);
  }
  redo() {
    if (!this.redoStack.length) { this.flash('Already at the newest change', 'warn'); return this.bell(); }
    this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop());
    this.flash('Redid one change');
  }
  dot() {
    if (!this.lastChange) { this.flash('Nothing to repeat yet. Make a change first.', 'warn'); return this.bell(); }
    const keys = this.lastChange; this.replaying = true; this.pending = [];
    for (const k of keys) this.feed(k);
    if (this.mode === 'insert') this.feed('Esc');
    this.replaying = false; this.lastChange = keys; this.skipRecord = true;
  }

  // ---------- insert ----------
  insertKey(key) {
    const s = this.buf[this.r];
    if (key === 'Esc') { this.mode = 'normal'; this.c = Math.max(0, this.c - 1); this.want = this.c; return; }
    if (key === 'BS') {
      if (this.c > 0) { this.buf[this.r] = s.slice(0, this.c - 1) + s.slice(this.c); this.c--; }
      else if (this.r > 0) { const p = this.buf[this.r - 1]; this.buf.splice(this.r - 1, 2, p + s); this.r--; this.c = p.length; }
      return;
    }
    if (key === 'Enter') { this.buf.splice(this.r, 1, s.slice(0, this.c), s.slice(this.c)); this.r++; this.c = 0; return; }
    let ch = key; if (key === 'Tab') ch = '    '; else if (key.length !== 1) return;
    this.buf[this.r] = s.slice(0, this.c) + ch + s.slice(this.c); this.c += ch.length;
  }

  // ---------- visual ----------
  visualRange() {
    let a = this.vs, b = { r: this.r, c: this.c };
    if (b.r < a.r || (b.r === a.r && b.c < a.c)) [a, b] = [b, a];
    if (this.mode === 'vline') return { sr: a.r, er: b.r, lw: true };
    const Lb = this.len(b.r);
    if (!Lb && a.r === b.r) return { empty: true, sr: a.r, sc: 0 };
    return { sr: a.r, sc: a.c, er: b.r, ec: Lb ? Math.min(b.c, Lb - 1) : -1 };
  }
  visualKey(key) {
    if (key === 'Esc') { if (this.pending.length) { this.pending = []; return; } this.mode = 'normal'; this.vs = null; return; }
    this.pending.push(key);
    const res = this.parse(this.pending, true);
    if (res.status === 'inc') return;
    if (!this.checkParsed(res)) return;
    if (res.kind === 'motion') {
      const t = this.doMotion(res.motion, res.count, res.hasCount, null);
      if (!t) { this.bell(); return; }
      this.moveTo(t); this.c = Math.max(0, Math.min(this.c, Math.max(0, this.len(this.r) - 1))); return;
    }
    if (res.kind === 'vtobj') {
      const R = this.textObj(res.inner, res.obj);
      if (!R || R.empty) { this.bell(); return; }
      this.vs = { r: R.sr, c: R.sc }; this.r = R.er; this.c = R.ec; this.want = this.c; return;
    }
    const k = res.key;
    if (k === 'o') { const t = this.vs; this.vs = { r: this.r, c: this.c }; this.r = t.r; this.c = t.c; this.want = this.c; return; }
    if (k === 'v' || k === 'V') {
      const target = k === 'v' ? 'visual' : 'vline';
      if (this.mode === target) { this.mode = 'normal'; this.vs = null; } else this.mode = target;
      return;
    }
    let R = this.visualRange();
    if ('DXYSC'.includes(k)) R = { sr: R.sr, er: R.er === undefined ? R.sr : R.er, lw: true };
    this.mode = 'normal'; this.vs = null;
    if (k === '~') { if (!R.empty) this.mapRange(R, ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()); return; }
    const op = { d: 'd', x: 'd', y: 'y', c: 'c', s: 'c', D: 'd', X: 'd', Y: 'y', S: 'c', C: 'c' }[k];
    this.applyOp(op, R);
    if (this.mode === 'normal') this.want = this.c;
  }

  // ---------- command line ----------
  cmdKey(key) {
    if (key === 'Esc') { this.mode = 'normal'; this.cmdline = ''; return; }
    if (key === 'BS') { if (!this.cmdline) { this.mode = 'normal'; return; } this.cmdline = this.cmdline.slice(0, -1); return; }
    if (key === 'Enter') {
      const t = this.cmdType, line = this.cmdline; this.mode = 'normal'; this.cmdline = '';
      if (t === ':') this.ex(line); else this.runSearch(t, line); return;
    }
    if (key.length === 1) this.cmdline += key;
  }
  runSearch(t, pat) {
    const dir = t === '/' ? 1 : -1;
    if (!pat) { if (!this.lastSearch) { this.flash('No previous search', 'err'); return; } pat = this.lastSearch.pat; }
    this.lastSearch = { pat, dir };
    const q = this.search(pat, dir, { r: this.r, c: this.c });
    if (!q) { this.bell(); return; }
    this.r = q.r; this.c = q.c; this.want = q.c;
  }
  ex(line) {
    const cmd = line.trim(); if (!cmd) return; let m;
    const written = () => this.flash(`"island.txt" ${this.buf.length}L written`);
    if (/^\d+$/.test(cmd)) { this.r = Math.min(this.last, Math.max(0, +cmd - 1)); this.c = this.firstNB(this.r); this.want = this.c; return; }
    if (cmd === '$') { this.r = this.last; this.c = this.firstNB(this.r); this.want = this.c; return; }
    if (cmd === 'w' || cmd === 'write') { this.events.push({ type: 'write' }); written(); return; }
    if (cmd === 'q' || cmd === 'quit' || cmd === 'q!' || cmd === 'qa') { this.events.push({ type: 'quit' }); return; }
    if (['wq', 'x', 'wq!', 'x!', 'xit', 'exit'].includes(cmd)) { this.events.push({ type: 'write' }, { type: 'wq' }); written(); return; }
    if ((m = cmd.match(/^(%|\.|\d+(?:,\d+)?)?s\/(.*)$/))) return this.substitute(m[1], m[2]);
    if (/^(h|help)\b/.test(cmd)) { this.flash('Open the Field guide to see every command you have learned.'); return; }
    if (/^set?\b/.test(cmd)) { this.flash('Settings are fixed on these islands.'); return; }
    if (cmd === 'noh' || cmd === 'nohlsearch') return;
    this.flash(`Not an editor command: ${cmd}`, 'err'); this.bell();
  }
  substitute(range, rest) {
    const parts = []; let cur = '';
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '\\' && rest[i + 1] === '/') { cur += '/'; i++; continue; }
      if (ch === '/') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    const [pat, rep = '', flags = ''] = parts;
    if (!pat) { this.flash('Empty search pattern', 'err'); return this.bell(); }
    let r0 = this.r, r1 = this.r;
    if (range === '%') { r0 = 0; r1 = this.last; }
    else if (range && range !== '.') { const [a, b] = range.split(','); r0 = +a - 1; r1 = b ? +b - 1 : r0; }
    r0 = Math.max(0, Math.min(r0, this.last)); r1 = Math.max(r0, Math.min(r1, this.last));
    let re; try { re = new RegExp(pat, (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : '')); }
    catch (e) { this.flash(`Bad pattern: ${pat}`, 'err'); return this.bell(); }
    let n = 0, lastR = -1, lines = 0; const nb = this.buf.slice();
    for (let r = r0; r <= r1; r++) {
      const s = this.buf[r];
      const t = s.replace(re, m0 => { n++; return rep.replace(/&/g, m0); });
      if (t !== s) { nb[r] = t; lastR = r; lines++; }
    }
    if (!n) { this.flash(`Pattern not found: ${pat}`, 'err'); return this.bell(); }
    this.beginChange(); this.buf = nb; this.r = lastR; this.c = this.firstNB(lastR); this.want = this.c;
    this.flash(`${n} substitution${n > 1 ? 's' : ''} on ${lines} line${lines > 1 ? 's' : ''}`);
  }
}

if (typeof module !== "undefined") module.exports = { Vim, prettyKeys };
