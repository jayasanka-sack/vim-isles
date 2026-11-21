#!/usr/bin/env node
// Validates every isle and replays each editing isle's `solution` through the engine.
// Run: npm run check   (or: node tools/check-levels.js)
const { Vim } = require('../src/engine.js');
const { LEVELS, parseMap, allowedFor } = require('../src/levels.js');

const KNOWN_IDS = new Set(['h','j','k','l','count','w','b','e','W','B','E','0','^','$','gg','G','{','}',
  'f','F','t','T',';',',','/','?','n','N','*','%','x','X','r','~','u','C-r','i','a','I','A','o','O',
  'd','D','J','c','C','s','S','textobj','y','Y','p','P','.','v','V',':']);
const toKeys = s => (Array.isArray(s) ? s : [...s]);
let failures = 0;
const fail = (i, msg) => { failures++; console.log(`  ✗ Isle ${i + 1}: ${msg}`); };

const seen = new Set();
LEVELS.forEach((L, i) => {
  const name = `${i + 1}. ${L.title || '(untitled)'}`;
  for (const f of ['title', 'learn', 'par', 'intro', 'keys', 'hint', 'map']) if (L[f] === undefined) fail(i, `missing "${f}"`);
  for (const id of L.learn || []) {
    if (!KNOWN_IDS.has(id)) fail(i, `unknown command id "${id}" in learn`);
    if (seen.has(id)) fail(i, `"${id}" is already taught by an earlier isle`);
    seen.add(id);
  }
  const m = parseMap(L.map || []);
  if (!(L.map || []).some(l => l.includes('⟪'))) fail(i, 'map has no ⟪x⟫ start marker');
  if (!L.target && !m.gems.length) fail(i, 'needs gems (⟨x⟩) or a target');
  if (L.target && m.gems.length) fail(i, 'has both gems and a target; pick one');
  for (const g of m.gems) if (m.buf[g.r].length && g.c >= m.buf[g.r].length) fail(i, `gem at line ${g.r + 1} is off the end of the line`);

  if (L.target) {
    if (!L.solution) { fail(i, 'editing isles need a `solution` so we know they can be cleared'); return; }
    const v = new Vim(m.buf, m.start, allowedFor(i));
    const keys = toKeys(L.solution); let wq = false;
    for (const k of keys) {
      v.feed(k);
      for (const e of v.events) { if (e.type === 'wq') wq = true; if (e.type === 'locked') fail(i, `solution uses locked key at "${k}": ${v.msg}`); }
      v.events = [];
    }
    const ok = v.buf.join('\n') === L.target.join('\n') && v.mode === 'normal' && (!L.needsWq || wq);
    if (!ok) { fail(i, 'solution does not reach the target. The island ended as:'); console.log(v.buf.map(l => '      | ' + l).join('\n')); }
    else if (keys.length < L.par) fail(i, `solution takes ${keys.length} keys but par is ${L.par}; lower the par`);
    console.log(`${ok ? '✓' : '✗'} ${name}: solution ${keys.length} keys, par ${L.par}`);
  } else {
    console.log(`✓ ${name}: ${m.gems.length} gems, par ${L.par} (verify with npm run pars)`);
  }
});
console.log(failures ? `\n${failures} problem(s) found.` : '\nAll isles look good.');
process.exit(failures ? 1 : 0);
