'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - light blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const recordsPanel = document.getElementById('records-panel');
const gameoverRecordsEl = document.getElementById('gameover-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveRecordBtn = document.getElementById('save-record-btn');

let gridColor;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  themeBtn.textContent = theme === 'light' ? '☾ Modo oscuro' : '☀ Modo claro';
  try { localStorage.setItem('theme', theme); } catch (e) {}
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// Records: combo = piezas consecutivas que limpian líneas; pendingRecord = partida
// terminada que entra en el top y espera nombre; highlightIdx = fila recién guardada.
let combo = 0, maxCombo = 0, pendingRecord = null, highlightIdx = -1;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const linesBefore = lines;
  clearLines();
  trackCombo(lines > linesBefore);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords(); // tras mostrar el overlay, para que el input pueda recibir foco
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() puede ocurrir dentro de este mismo frame (lockPiece → spawn);
  // cancelAnimationFrame no detiene el frame en curso, así que no reprogramamos.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  savePendingRecord(); // si se reinicia sin pulsar Guardar, el récord no se pierde
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  highlightIdx = -1;
  hideGameOverRecords();
  startScreen.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records (localStorage) ----

const RECORDS_KEY = 'tetrisRecords';
const LAST_NAME_KEY = 'tetrisLastName';
const MAX_RECORDS = 5;
const NAME_MAXLEN = 12;

function trackCombo(clearedLines) {
  if (clearedLines) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function toCount(v, min) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER) : min;
}

function sanitizeName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAXLEN);
}

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

// Lee y valida los records; cualquier dato corrupto se descarta.
function loadRecords() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) {}
  const rec = emptyRecords();
  if (!data || typeof data !== 'object') return rec;
  if (Array.isArray(data.scores)) {
    rec.scores = data.scores
      .filter(s => s && typeof s === 'object')
      .map(s => ({
        name: sanitizeName(s.name) || 'Anónimo',
        score: toCount(s.score, 0),
        lines: toCount(s.lines, 0),
        level: toCount(s.level, 1),
        date: typeof s.date === 'string' ? s.date.slice(0, 40) : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  }
  rec.bestCombo = toCount(data.bestCombo, 0);
  rec.maxLines = toCount(data.maxLines, 0);
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {}
}

function qualifiesForTop(rec, value) {
  if (value <= 0) return false;
  return rec.scores.length < MAX_RECORDS || value > rec.scores[rec.scores.length - 1].score;
}

// Inserta la entrada en orden descendente (tras las de igual puntuación) y
// devuelve su índice, o -1 si no entra en el top.
function insertRecord(rec, entry) {
  let idx = rec.scores.findIndex(s => s.score < entry.score);
  if (idx === -1) idx = rec.scores.length;
  if (idx >= MAX_RECORDS) return -1;
  rec.scores.splice(idx, 0, entry);
  rec.scores.length = Math.min(rec.scores.length, MAX_RECORDS);
  return idx;
}

function formatRecordDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES');
}

function buildRecordsView(container, rec) {
  container.textContent = '';

  if (rec.scores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay records. ¡Juega una partida!';
    container.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'NIVEL', 'FECHA']) {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rec.scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i === highlightIdx) tr.className = 'records-highlight';
      const cells = [i + 1, s.name, s.score.toLocaleString(), s.lines, s.level, formatRecordDate(s.date)];
      cells.forEach((value, ci) => {
        const td = document.createElement('td');
        if (ci === 1) td.className = 'records-name';
        td.textContent = String(value); // nunca innerHTML: el nombre lo escribe el usuario
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  const stats = document.createElement('p');
  stats.className = 'records-stats';
  const comboLabel = document.createTextNode('Mejor combo: ');
  const comboVal = document.createElement('strong');
  comboVal.textContent = String(rec.bestCombo);
  const linesLabel = document.createTextNode(' · Líneas máximas: ');
  const linesVal = document.createElement('strong');
  linesVal.textContent = String(rec.maxLines);
  stats.appendChild(comboLabel);
  stats.appendChild(comboVal);
  stats.appendChild(linesLabel);
  stats.appendChild(linesVal);
  container.appendChild(stats);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'records-btn records-reset';
  resetBtn.textContent = 'Borrar records';
  resetBtn.addEventListener('click', () => {
    resetBtn.blur();
    resetRecords();
  });
  container.appendChild(resetBtn);
}

function renderRecords(rec = loadRecords()) {
  buildRecordsView(startRecordsEl, rec);
  buildRecordsView(gameoverRecordsEl, rec);
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records? Esta acción no se puede deshacer.')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
  highlightIdx = -1;
  // En game over, la partida recién terminada puede entrar ahora en la tabla vacía.
  if (gameOver && !pendingRecord && !recordsPanel.classList.contains('hidden')) {
    offerNameEntry(emptyRecords());
  }
  renderRecords();
}

function offerNameEntry(rec) {
  if (!qualifiesForTop(rec, score)) return false;
  pendingRecord = { score, lines, level, date: new Date().toISOString() };
  nameInput.value = loadLastName();
  nameEntry.classList.remove('hidden');
  nameInput.focus();
  const end = nameInput.value.length;
  try { nameInput.setSelectionRange(end, end); } catch (e) {}
  return true;
}

function loadLastName() {
  let name = '';
  try { name = localStorage.getItem(LAST_NAME_KEY); } catch (e) {}
  return sanitizeName(name);
}

// Llamada desde endGame(): actualiza mejor combo / líneas máximas y, si la
// puntuación entra en el top 5, pide el nombre.
function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  highlightIdx = -1;
  pendingRecord = null;
  nameEntry.classList.add('hidden');
  recordsPanel.classList.remove('hidden');
  offerNameEntry(rec);
  renderRecords(rec);
}

function hideGameOverRecords() {
  recordsPanel.classList.add('hidden');
  nameEntry.classList.add('hidden');
  nameInput.blur();
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const name = sanitizeName(nameInput.value) || 'Anónimo';
  const rec = loadRecords();
  highlightIdx = insertRecord(rec, { name, ...pendingRecord });
  saveRecords(rec);
  try { localStorage.setItem(LAST_NAME_KEY, name); } catch (e) {}
  pendingRecord = null;
  nameEntry.classList.add('hidden');
  nameInput.blur();
  renderRecords(rec);
}

function startGame() {
  playBtn.blur();
  init();
}

saveRecordBtn.addEventListener('click', () => {
  saveRecordBtn.blur();
  savePendingRecord();
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    savePendingRecord();
  }
});

playBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => restartBtn.blur()); // evita que Enter reinicie la partida

document.addEventListener('keydown', e => {
  // Mientras se escribe el nombre del récord, el juego no reacciona a las teclas.
  if (e.target === nameInput) return;
  if (!startScreen.classList.contains('hidden')) {
    if (e.key === 'Enter' && e.target === document.body) startGame();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // evita que Space/Enter reactiven el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

// La partida no arranca hasta pulsar "Jugar" en la pantalla de inicio.
renderRecords();
drawGrid();
// Sin partida en marcha nadie redibuja el tablero: repintar la rejilla al cambiar de tema.
themeBtn.addEventListener('click', () => {
  if (startScreen.classList.contains('hidden')) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
});
