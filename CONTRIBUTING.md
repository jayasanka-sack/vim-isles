# Contributing to Vim Isles

Thanks for wanting to help. This guide covers the setup, the three most common kinds of change, and what we look for in a pull request.

## Setup

You only need a browser and Node 18+.

```sh
git clone <your fork>
cd vim-isles
npm test
```

There is nothing to install. Open `index.html` or run `npm start` to play your changes. To jump straight to an isle while testing, open the browser console and run `loadLevel(4)` (isles are numbered from 0 in code).

## Kinds of change

### 1. Adding or changing an isle

Isles live in `src/levels.js`, in play order. Each one is an object like this:

```js
{
  title: 'Harpoon Bay',
  learn: ['f', 'F', 't', 'T', ';', ','],   // command ids this isle unlocks
  par: 7,                                  // expert keystroke count
  intro: 'One short paragraph that explains the idea.',
  keys: [['fx', 'to the next x'], ['Fx', 'back to the previous x']],
  hint: 'A concrete nudge for players who are stuck.',
  map: [
    '⟪h⟫arpoons fly along a single line.',
    'the fishermen sing of the ⟨q⟩uiet reef.',
  ],
}
```

**Map markers**

| Marker | Meaning |
|---|---|
| `⟪x⟫` | The cursor starts on character `x`. Exactly one per map. |
| `⟨x⟩` | A gem sits on character `x`. |
| `⟨⟩` | A gem on an empty line. |

The markers are stripped out; only the character inside stays in the text.

**Two kinds of isle**

- **Gem isles** have gems in the map and no `target`. They are cleared by landing on every gem.
- **Editing isles** have a `target` (the text the island must end up as) and no gems. They also need a `solution`, the keystrokes that clear them, so the checker can prove the isle is beatable. Add `needsWq: true` if the player must finish with `:wq`.

A `solution` is either a string of single keys (`'dw2wdwj'`) or an array when it includes special keys: `['A', '!', 'Esc', 'j', '.']`. Special keys are `Esc`, `Enter`, `BS`, `Tab` and `C-r`.

**Command ids for `learn`**

Most ids are the key itself (`w`, `$`, `%`, `x`, `p`). The exceptions are `count` for number prefixes, `gg`, `C-r` for redo, `textobj` for `iw`, `i"` and friends, and `:` for the whole command line. `d`, `c` and `y` unlock their operator, which covers `dd`, `cc` and `yy` too. Each id should be taught by exactly one isle; the checker complains if two isles teach the same thing.

A player on isle N can use everything taught by isles 1 to N, so an isle can only rely on keys from itself and earlier.

**Setting par**

- For a gem isle, run `node tools/compute-pars.js <isle number>`. It searches every path using that isle's keys and prints the fewest keystrokes. Use that number.
- For an editing isle, par is the length of your `solution`. Make the solution reasonably tight; the checker fails if par is lower than the solution.

**Writing good isles**

- Teach one idea per isle. If you need a paragraph to explain it, it is probably two isles.
- Put the lesson in the text itself where you can. The island is something the player reads while moving.
- Place gems where the new keys clearly win. If `l` mashing is as fast as `fq`, move the gem.
- Keep lines under about 70 characters so the map fits on a laptop screen.
- Write in plain, friendly English. Lowercase text on the island is fine and fits the style.

After any change to an isle, run:

```sh
npm run check
```

### 2. Fixing or extending the engine

`src/engine.js` is a plain class with no DOM access. The rough flow:

1. `feed(key)` routes each key to the handler for the current mode.
2. In Normal and Visual mode, keys collect in `pending` until `parse()` recognises a full command (count, operator, motion, text object or action).
3. `exec()` runs it. Motions return a target position; operators turn that into a range with `rangeFrom()` and apply it with `applyOp()`.
4. Any edit calls `beginChange()` first, which saves an undo snapshot. The last change's keys are recorded so `.` can replay them.

When you fix a behaviour or add a command:

- Check what real Vim does (`vim --clean` is a good reference) and match it.
- Add a test to `tools/test-engine.js`. Tests read like this:

  ```js
  test('dw deletes a word and its trailing space', () =>
    expectText(run('the the end', 'dw'), 'the end'));
  ```

  In key strings, write special keys the way Vim docs do: `<Esc>`, `<CR>`, `<BS>`, `<C-r>`.
- If the command is new, give it a command id, add the id to `KNOWN_IDS` in `tools/check-levels.js`, and teach it in an isle (new or existing).

### 3. Art, layout and accessibility

- Colors are tokens at the top of `styles/main.css`, and the canvas palette is the `COL` object at the top of `src/game.js`. Keep the two in step.
- Island drawing lives in `drawIsland()` (cached layer) and `frame()` (everything that moves) in `src/render.js`.
- Respect `prefers-reduced-motion`. The `REDUCED` flag turns off animation; check new effects against it.
- Test at phone width (about 400px) as well as desktop.

## Pull requests

- Keep each pull request to one isle or one fix where you can.
- Run `npm test` before opening it. CI runs the same thing.
- Describe what changed and, for isles, what a player is meant to learn.
- Screenshots help for anything visual.
- No new runtime dependencies or build steps without talking about it in an issue first. Opening `index.html` from disk should keep working.

## Reporting bugs

Open an issue with:

- The isle and what you typed (the keys, in order).
- What happened, and what real Vim does instead.
- Your browser and OS if it looks like a display problem.

## Ideas we'd love help with

- More isles: marks (`m` and `` ` ``), registers (`"a`), macros (`q`), `ge`, `H M L`, `>` and `<`, `gu` and `gU`, `:g`.
- Using the operator with search (`d/word`).
- A colorblind-friendly check on the chart's green and coral marks.
- Translations of the isle text.
