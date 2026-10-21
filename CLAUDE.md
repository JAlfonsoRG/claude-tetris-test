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

Three files: `index.html` (DOM + two canvases + overlay + theme toggle / skin selector), `style.css` (dark theme), `game.js` (all logic, loaded as a plain non-module `<script>` with `'use strict'`).

Key points in `game.js` that span multiple functions:

- **All game state is module-level `let` globals** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, ...). `init()` resets every one of them and is also the restart handler — any new state variable must be reset there.
- **Cell values double as color indices.** `PIECES[type]` matrices are filled with the piece's type number (1–7), which indexes `COLORS`. `merge()` copies those values straight into `board`, so the board needs no separate color map. A new piece type requires a matching color in **every** skin's `colors` array in `SKINS`, plus updating the `* 7` in `randomPiece()`.
- **Skins.** `SKINS = { retro, neon, pastel, pixel }`, each with `name`, `colors` (8 entries, index 0 `null`), optional `bg`/`grid` canvas overrides and `drawBlock(context, px, py, size, color, alpha)` (pixel coords). `currentSkin` is the active one and `COLORS` (a `let`) points at its palette. The global `drawBlock(context, x, y, colorIndex, size, alpha)` keeps its cell-coord signature and delegates to `currentSkin.drawBlock`. `applySkin(key)` (from `#skin-select`, persisted in `localStorage` key `skin`, invalid → `retro`) sets inline canvas `background` from `bg` (otherwise CSS `--canvas-bg`), and redraws `draw()`/`drawNext()` immediately since the loop is stopped while paused/game over; `drawGrid()` uses `currentSkin.grid || gridColor`. Skin is a preference, not game state, so `init()` doesn't touch it. Skin `drawBlock`s must restore any context state they change (`globalAlpha`, `shadowBlur`/`shadowColor`).
- **`collide(shape, x, y)` is the single validity check** used by movement, rotation (`tryRotate` with kick offsets `[0,-1,1,-2,2]`), gravity, ghost projection (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Piece lifecycle:** gravity in `loop()` / `softDrop()` / `hardDrop()` → `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next` → `current`, ends game if the new piece collides).
- **Game loop:** `requestAnimationFrame`-driven; `dropAccum` accumulates ms and steps gravity when it exceeds `dropInterval`. Pause/game-over stop it via `cancelAnimationFrame(animId)`; resuming resets `lastTime` to avoid a large `dt` jump.
- **Rendering** redraws the full board every frame (`draw()`); the next-piece preview (`drawNext()`) is only redrawn on `spawn()`. `drawBlock()` is shared by both canvases and takes the context and cell size.
- **HUD** (`updateHUD()`) is updated imperatively after state changes, not per frame.
- **One overlay** (`#overlay`) is reused for both PAUSA and GAME OVER by rewriting `#overlay-title` / `#overlay-score`.

## Coupled values

`COLS × BLOCK` and `ROWS × BLOCK` must match the `<canvas id="board">` `width`/`height` in `index.html` (300×600). The `#next-canvas` (120×120) assumes a 4×4 grid of 30px cells (`NB` in `drawNext()`).
