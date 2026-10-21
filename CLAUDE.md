# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris (HTML5 Canvas + CSS). No dependencies, no `package.json`, no build step, no linter, no test suite. User-facing text and the README are in Spanish; keep new UI strings in Spanish.

## Running

Open `index.html` directly, or serve the directory statically (preferred):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Verification is manual in the browser.

## Architecture

Three files: `index.html` (DOM + two canvases + overlay), `style.css` (dark theme), `game.js` (all logic, loaded as a plain non-module `<script>` with `'use strict'`).

Key points in `game.js` that span multiple functions:

- **All game state is module-level `let` globals** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, ...). `init()` resets every one of them and is also the restart handler — any new state variable must be reset there.
- **Cell values double as color indices.** `PIECES[type]` matrices are filled with the piece's type number (1–7), which indexes `COLORS`. `merge()` copies those values straight into `board`, so the board needs no separate color map. A new piece type requires matching entries in both `PIECES` and `COLORS`, plus updating the `* 7` in `randomPiece()`.
- **`collide(shape, x, y)` is the single validity check** used by movement, rotation (`tryRotate` with kick offsets `[0,-1,1,-2,2]`), gravity, ghost projection (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Piece lifecycle:** gravity in `loop()` / `softDrop()` / `hardDrop()` → `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next` → `current`, ends game if the new piece collides).
- **Game loop:** `requestAnimationFrame`-driven; `dropAccum` accumulates ms and steps gravity when it exceeds `dropInterval`. Pause/game-over stop it via `cancelAnimationFrame(animId)`; resuming resets `lastTime` to avoid a large `dt` jump.
- **Rendering** redraws the full board every frame (`draw()`); the next-piece preview (`drawNext()`) is only redrawn on `spawn()`. `drawBlock()` is shared by both canvases and takes the context and cell size.
- **HUD** (`updateHUD()`) is updated imperatively after state changes, not per frame.
- **Overlays:** `#overlay` is used only for GAME OVER (`#overlay-title` / `#overlay-score`). Pause uses its own `#pause-menu` (Reanudar / Reiniciar / Ver controles / Nivel inicial), opened/closed with `P` or `Escape` via `togglePause()` → `openPauseMenu()` / `resumeGame()`. While `paused` the keydown handler ignores every game key; after resuming/restarting, `ignoreRepeat` drops `e.repeat` events until a fresh keydown. `hidePauseMenu()` blurs focused menu controls so Space/Enter/arrows can't re-trigger them.
- **Start level:** `startLevel` (1–10) is a persisted preference (`localStorage` key `startLevel`), not game state, so `init()` doesn't reset it; it copies it into `baseLevel`. `clearLines()` computes `level = baseLevel + floor(lines / 10)` and `dropInterval = dropIntervalFor(level)`, so changing the selector mid-game only affects the next game.

## Coupled values

`COLS × BLOCK` and `ROWS × BLOCK` must match the `<canvas id="board">` `width`/`height` in `index.html` (300×600). The `#next-canvas` (120×120) assumes a 4×4 grid of 30px cells (`NB` in `drawNext()`).
