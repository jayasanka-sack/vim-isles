#!/usr/bin/env node
// Behaviour tests for the Vim engine. Each case starts from some text, types keys,
// and checks the resulting text and cursor against what real Vim does.
// Run: npm test
const assert = require('node:assert/strict');
const { Vim } = require('../src/engine.js');

// Keys are written like Vim docs: <Esc>, <CR>, <C-r>. Everything else is one key per character.
function tokens(s) {
  const out = []; const map = { Esc: 'Esc', CR: 'Enter', BS: 'BS', 'C-r': 'C-r' };
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<') { const j = s.indexOf('>', i); const name = s.slice(i + 1, j); if (map[name]) { out.push(map[name]); i = j; continue; } }
    out.push(s[i]);
  }
  return out;
}
function run(text, keys, start = { r: 0, c: 0 }) {
  const v = new Vim(text.split('\n'), start, null);
  for (const k of tokens(keys)) v.feed(k);
  return v;
}
const cases = [];
const test = (name, fn) => cases.push([name, fn]);
const expectText = (v, text) => assert.equal(v.buf.join('\n'), text);
const expectCursor = (v, r, c) => assert.deepEqual([v.r, v.c], [r, c]);

// motions
test('w skips punctuation runs as their own words', () => expectCursor(run('foo.bar baz', 'ww'), 0, 4));
test('W treats everything between spaces as one WORD', () => expectCursor(run('foo.bar baz', 'W'), 0, 8));
test('e goes to end of word, then the next', () => expectCursor(run('one two', 'ee'), 0, 6));
test('b goes back across lines', () => expectCursor(run('one two\nthree', 'b', { r: 1, c: 0 }), 0, 4));
test('j keeps the wanted column through short lines', () => expectCursor(run('abcdef\nab\nabcdef', '$jj'), 2, 5));
test('counts multiply moves', () => expectCursor(run('a\nb\nc\nd\ne', '3j'), 3, 0));
test('5G jumps to line 5', () => expectCursor(run('1\n2\n3\n4\n  5', '5G'), 4, 2));
test('} stops on the next empty line', () => expectCursor(run('a\nb\n\nc', '}'), 2, 0));
test('f and ; repeat a find', () => expectCursor(run('a-b-c-d', 'f-;'), 0, 3));
test('t stops before, ; skips past the adjacent match', () => expectCursor(run('a-b-c', 't-;'), 0, 2));
test('% jumps to the matching bracket', () => expectCursor(run('if (a(b)) x', '%'), 0, 8));
test('/ searches and n wraps around', () => expectCursor(run('cat dog cat', '/cat<CR>n'), 0, 0));
test('* searches the word under the cursor', () => expectCursor(run('sea tea sea', '*'), 0, 8));

// operators
test('dw deletes a word and its trailing space', () => expectText(run('the the end', 'dw'), 'the end'));
test('dw on the last word stops at the end of the line', () => expectText(run('a b\nc', 'wdw'), 'a \nc'));
test('cw acts like ce', () => expectText(run('blue wool', 'cwred<Esc>'), 'red wool'));
test('d$ and D delete to end of line', () => expectText(run('keep cut', 'wD'), 'keep '));
test('3dd deletes three lines', () => expectText(run('1\n2\n3\n4', '3dd'), '4'));
test('dj deletes linewise', () => expectText(run('1\n2\n3', 'dj'), '3'));
test('ciw changes the whole word', () => expectText(run('a coat b', 'wlciwcloak<Esc>'), 'a cloak b'));
test('ci" changes inside quotes', () => expectText(run('say "hi" now', 'ci"yo<Esc>'), 'say "yo" now'));
test('di( deletes inside brackets', () => expectText(run('f(a, b)', 'f,di('), 'f()'));
test('daw on the last word takes the leading space', () => expectText(run('one two', '$daw'), 'one'));
test('x, X, r and ~', () => expectText(run('abcd', 'xlXrZ~'), 'zd'));
test('J joins with a single space', () => expectText(run('a\n   b', 'J'), 'a b'));

// insert
test('A appends, o opens below', () => expectText(run('hi', 'A!<Esc>oyo<Esc>'), 'hi!\nyo'));
test('Esc steps the cursor back one', () => expectCursor(run('ab', 'A<Esc>'), 0, 1));
test('backspace in insert mode', () => expectText(run('ab', 'Axy<BS><Esc>'), 'abx'));

// yank and put
test('yy p duplicates a line', () => expectText(run('a\nb', 'yyp'), 'a\na\nb'));
test('yw P puts before the cursor', () => expectText(run('ho ', 'ywP'), 'ho ho '));
test('3p puts three copies', () => expectText(run('x', 'yl3p'), 'xxxx'));

// undo, redo, dot
test('u undoes, Ctrl-r redoes', () => expectText(run('abc', 'xxu'), 'bc'));
test('redo after undo', () => expectText(run('abc', 'xu<C-r>'), 'bc'));
test('an insert counts as one undo step', () => expectText(run('a', 'Abcd<Esc>u'), 'a'));
test('. repeats an append', () => expectText(run('x\ny', 'A!<Esc>j.'), 'x!\ny!'));
test('. repeats dw', () => expectText(run('a b c d', 'dw..'), 'd'));
test('undo after . removes only the repeat', () => expectText(run('a b c', 'dw.u'), 'b c'));

// visual
test('v selects and d deletes inclusively', () => expectText(run('abcdef', 'lvlld'), 'aef'));
test('V selects whole lines', () => expectText(run('1\n2\n3', 'Vjd'), '3'));
test('viw then c', () => expectText(run('a big b', 'wviwcsmall<Esc>'), 'a small b'));

// ex commands
test(':%s replaces on every line', () => expectText(run('a cat\na cat cat', ':%s/cat/dog/g<CR>'), 'a dog\na dog dog'));
test(':s without g replaces the first match only', () => expectText(run('cat cat', ':s/cat/dog/<CR>'), 'dog cat'));
test(':3 jumps to line 3', () => expectCursor(run('a\nb\nc', ':3<CR>'), 2, 0));
test(':wq raises a wq event', () => { const v = new Vim(['a'], { r: 0, c: 0 }); for (const k of tokens(':wq<CR>')) v.feed(k); assert.ok(v.events.some(e => e.type === 'wq')); });

// locking
test('locked commands do nothing and report why', () => {
  const v = new Vim(['abc'], { r: 0, c: 0 }, new Set(['h', 'j', 'k', 'l']));
  v.feed('x'); assert.equal(v.buf[0], 'abc'); assert.match(v.msg, /Locked/);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failed++; console.log(`✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
