# Vim Isles

Learn Vim by sailing an archipelago made of text.

Every island in the game is the text you are editing. Each character is a stone tile, and the glowing block walking across them is your cursor. Fifteen isles take you from `h j k l` to `:wq`, a few keys at a time. Keys you haven't learned yet stay locked, so you always know which tool the isle wants you to practise.

## Play

No install, no build step.

- **Quickest:** open `index.html` in a browser.
- **Local server** (needs Node 18+):

  ```sh
  npm start
  ```

  Then open http://localhost:5173.

Click the map once so it gets your keystrokes. A real keyboard works best. On phones there is an Esc / Enter / Keyboard bar under the map.

Progress and stars are saved in your browser's local storage.

## What you learn

| Isle | Name | Keys | Goal |
|---|---|---|---|
| 1 | Landfall | `h` `j` `k` `l` | Gems |
| 2 | Tally Reef | counts, like `5j` | Gems |
| 3 | Wordwood | `w` `b` `e` `W` `B` `E` | Gems |
| 4 | The Long Shore | `0` `^` `$` | Gems |
| 5 | Cliffs of G | `gg` `G` `23G` `{` `}` | Gems |
| 6 | Harpoon Bay | `f` `F` `t` `T` `;` `,` | Gems |
| 7 | The Lighthouse | `/` `?` `n` `N` `*` `%` | Gems |
| 8 | Stonecutter's Yard | `x` `X` `r` `~` `u` `Ctrl-r` | Match the chart |
| 9 | Scribe's Hut | `i` `a` `I` `A` `o` `O` | Match the chart |
| 10 | The Quarry | `d` + motions, `dd` `D` `J` | Match the chart |
| 11 | Tailor's Shop | `c` `cc` `C` `s` `S`, text objects `iw` `aw` `i"` `i(` | Match the chart |
| 12 | Echo Caves | `y` `yy` `Y` `p` `P` | Match the chart |
| 13 | The Clocktower | `.` | Match the chart |
| 14 | Glass Garden | `v` `V` | Match the chart |
| 15 | Harbor Gate | `:%s/old/new/g` `:w` `:wq` | Match the chart, then `:wq` |

Gem isles are cleared by landing the cursor on every gem. Editing isles are cleared when the text matches the chart in the side panel and you are back in Normal mode.

Every isle has a **par**, the number of keystrokes an expert needs. Finish within par for three stars, within twice par for two.

## How it works

The game is plain HTML, CSS and JavaScript with no dependencies and no bundler.

```
index.html          page markup; loads the scripts below in order
styles/main.css     all styling
src/engine.js       the Vim engine: pure logic, no DOM
src/levels.js       the isles: text, lessons, goals, par
src/game.js         game state, level flow, side panels, keyboard input
src/render.js       canvas drawing: sea, island tiles, gems, cursor, effects
src/main.js         boot code, loaded last
tools/              Node scripts for tests and level checks
```

The **engine** (`src/engine.js`) is a small Vim written from scratch. The game feeds it one key at a time (`"j"`, `"Esc"`, `"Enter"`, `"C-r"`) and reads back the buffer, cursor, mode and status message. It supports counts, operators with any motion or text object, visual mode, undo and redo, dot repeat, search, and a handful of `:` commands. It runs the same in the browser and in Node, which is how the tools test it.

Scripts are loaded as plain `<script>` tags rather than ES modules so the game still runs when opened straight from disk (`file://`). Files share a few globals; `main.js` must stay last.

## Development

```sh
npm test         # engine behaviour tests + level checks
npm run check    # level checks only
npm run pars     # compute the best possible score for each gem isle
```

All of these need only Node 18 or newer. CI runs `npm test` on every push and pull request.

## Contributing

New isles, engine fixes, missing Vim commands, art and accessibility improvements are all welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for how to add an isle, how the tests work and what a good pull request looks like.

## License

[MIT](LICENSE)
