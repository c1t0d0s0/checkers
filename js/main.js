import { BLACK, WHITE, Game, rowOf, colOf, sqAt, moveNotation, countPieces } from './rules.js';
import { playSound, unlockAudio, setSoundEnabled } from './sound.js';
import { detectLang, setLang, t, applyI18n } from './i18n.js';

const STORAGE_KEY = 'checkers.v1';
const STEP_MS = 190;
const MIN_THINK_MS = 450;

// ------------------------------------------------------------------ state ---
const state = {
  game: new Game(),
  human: BLACK,
  level: 'medium',
  sound: true,
  selected: -1,
  partial: [],      // landing squares chosen so far in the current move
  busy: false,      // animating or CPU thinking
  thinking: false,
  reqId: 0,
};

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
let piecesLayer;
const cellEls = new Map();   // sq -> cell element
const pieceEls = new Map();  // sq -> piece element

// --------------------------------------------------------------- storage ---
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      level: state.level,
      human: state.human,
      sound: state.sound,
      moves: state.game.moves.map((m) => [m.from, ...m.path]),
    }));
  } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------ orientation ---
// The human's pieces are always at the bottom.
function toDisplay(sq) {
  const r = rowOf(sq), c = colOf(sq);
  return state.human === BLACK ? { r: 7 - r, c: 7 - c } : { r, c };
}
function fromDisplay(r, c) {
  return state.human === BLACK ? sqAt(7 - r, 7 - c) : sqAt(r, c);
}

function buildBoard() {
  boardEl.textContent = '';
  cellEls.clear();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      const dark = (r + c) % 2 === 1;
      cell.className = 'cell ' + (dark ? 'dark' : 'light');
      if (dark) {
        const sq = fromDisplay(r, c);
        cell.dataset.sq = String(sq);
        cellEls.set(sq, cell);
      }
      boardEl.appendChild(cell);
    }
  }
  piecesLayer = document.createElement('div');
  piecesLayer.className = 'pieces';
  boardEl.appendChild(piecesLayer);
}

// ---------------------------------------------------------------- pieces ---
const CROWN_SVG = '<svg class="crown" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 46 6 20l14 12 12-18 12 18 14-12-4 26z"/><rect x="10" y="49" width="44" height="6" rx="2"/></svg>';

function placeEl(el, sq) {
  const { r, c } = toDisplay(sq);
  el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
}

function makePiece(sq, p) {
  const el = document.createElement('div');
  el.className = 'piece ' + (p > 0 ? 'black' : 'white') + (Math.abs(p) === 2 ? ' king' : '');
  el.innerHTML = '<div class="disc">' + CROWN_SVG + '</div>';
  placeEl(el, sq);
  return el;
}

function renderPieces() {
  piecesLayer.textContent = '';
  pieceEls.clear();
  const b = state.game.board;
  for (let sq = 0; sq < 32; sq++) {
    if (!b[sq]) continue;
    const el = makePiece(sq, b[sq]);
    piecesLayer.appendChild(el);
    pieceEls.set(sq, el);
  }
}

// ------------------------------------------------------------ highlights ---
function humanToMove() {
  return !state.game.result && state.game.side === state.human && !state.busy;
}

function candidates() {
  if (state.selected < 0) return [];
  return state.game.legal.filter((m) => m.from === state.selected
    && state.partial.every((s, i) => m.path[i] === s));
}

function renderHighlights() {
  for (const cell of cellEls.values()) cell.classList.remove('selected', 'target', 'last', 'movable');
  for (const el of pieceEls.values()) el.classList.remove('movable');
  const last = state.game.moves[state.game.moves.length - 1];
  if (last) {
    cellEls.get(last.from).classList.add('last');
    cellEls.get(last.path[last.path.length - 1]).classList.add('last');
  }
  if (!humanToMove()) return;
  if (state.selected < 0) {
    const froms = new Set(state.game.legal.map((m) => m.from));
    for (const sq of froms) pieceEls.get(sq)?.classList.add('movable');
    return;
  }
  const cur = state.partial.length ? state.partial[state.partial.length - 1] : state.selected;
  cellEls.get(cur).classList.add('selected');
  for (const m of candidates()) {
    const next = m.path[state.partial.length];
    if (next !== undefined) cellEls.get(next).classList.add('target');
  }
}

// -------------------------------------------------------------- side info ---
function renderInfo() {
  const g = state.game;
  const c = countPieces(g.board);
  const cpu = -state.human;
  $('chip-top').className = 'chip ' + (cpu === BLACK ? 'black' : 'white');
  $('chip-bottom').className = 'chip ' + (state.human === BLACK ? 'black' : 'white');
  $('count-top').textContent = String(cpu === BLACK ? c.black : c.white);
  $('count-bottom').textContent = String(state.human === BLACK ? c.black : c.white);
  $('bar-top').classList.toggle('active', !g.result && g.side === cpu);
  $('bar-bottom').classList.toggle('active', !g.result && g.side === state.human);

  let status = '';
  if (g.result) {
    status = g.result.winner === 0 ? t('draw') : g.result.winner === state.human ? t('youWin') : t('youLose');
  } else if (g.side !== state.human) {
    status = state.thinking ? t('thinking') : '';
  } else if (state.partial.length) {
    status = t('continueJump');
  } else {
    status = g.legal[0]?.captured.length ? t('mustCapture') : t('yourTurn');
  }
  $('status').textContent = status;

  // Move list.
  const ol = $('moves');
  ol.textContent = '';
  for (let i = 0; i < g.moves.length; i += 2) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = moveNotation(g.moves[i]);
    li.appendChild(a);
    if (g.moves[i + 1]) {
      const b = document.createElement('span');
      b.textContent = moveNotation(g.moves[i + 1]);
      li.appendChild(b);
    }
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;

  $('btn-undo').disabled = !canUndo();
  for (const btn of $('level').children) btn.setAttribute('aria-checked', String(btn.dataset.value === state.level));
  for (const btn of $('color').children) btn.setAttribute('aria-checked', String(Number(btn.dataset.value) === state.human));
  $('btn-sound').setAttribute('aria-pressed', String(state.sound));
}

function render() {
  renderHighlights();
  renderInfo();
}

// ------------------------------------------------------------- animation ---
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function animateStep(el, to, captured) {
  el.classList.add('moving');
  placeEl(el, to);
  await wait(STEP_MS);
  el.classList.remove('moving');
  if (captured !== undefined) {
    pieceEls.get(captured)?.classList.add('taken');
    playSound('capture');
  } else {
    playSound('place');
  }
}

// Commit a fully specified move whose animation has already played.
function commitMove(move) {
  const g = state.game;
  const played = g.play(move);
  const el = pieceEls.get(played.from);
  pieceEls.delete(played.from);
  for (const c of played.captured) {
    const cel = pieceEls.get(c);
    if (cel) { cel.classList.add('taken'); setTimeout(() => cel.remove(), 260); }
    pieceEls.delete(c);
  }
  const to = played.path[played.path.length - 1];
  pieceEls.set(to, el);
  if (played.promote) {
    el.classList.add('king', 'crowning');
    setTimeout(() => el.classList.remove('crowning'), 500);
    setTimeout(() => playSound('crown'), 80);
  }
  state.selected = -1;
  state.partial = [];
  save();
  afterMove();
}

function afterMove() {
  render();
  const g = state.game;
  if (g.result) {
    setTimeout(showResult, 450);
    return;
  }
  if (g.side !== state.human) requestCpuMove();
}

// ------------------------------------------------------------ human input ---
async function advance(sq) {
  const cands = candidates();
  const idx = state.partial.length;
  const m = cands.find((x) => x.path[idx] === sq);
  if (!m) return;
  const el = pieceEls.get(state.selected);
  state.partial.push(sq);
  state.busy = true;
  render();
  await animateStep(el, sq, m.captured.length ? m.captured[idx] : undefined);
  state.busy = false;
  const remaining = candidates();
  const done = remaining.find((x) => x.path.length === state.partial.length);
  if (done) {
    commitMove(done);
  } else {
    render();
  }
}

function resetPartial() {
  if (!state.partial.length) return;
  state.partial = [];
  renderPieces();
}

function onSquare(sq) {
  if (!humanToMove()) return;
  const g = state.game;
  const isTarget = state.selected >= 0 && candidates().some((m) => m.path[state.partial.length] === sq);
  if (isTarget) { advance(sq); return; }
  if (state.partial.length) {
    // Abort an unfinished multi-jump and choose again.
    resetPartial();
  }
  if (g.legal.some((m) => m.from === sq)) {
    state.selected = state.selected === sq ? -1 : sq;
  } else {
    state.selected = -1;
  }
  render();
}

// Pointer handling (tap / click and drag).
let drag = null;

function squareFromPoint(x, y) {
  const rect = boardEl.getBoundingClientRect();
  const c = Math.floor(((x - rect.left) / rect.width) * 8);
  const r = Math.floor(((y - rect.top) / rect.height) * 8);
  if (r < 0 || r > 7 || c < 0 || c > 7) return -1;
  return fromDisplay(r, c);
}

boardEl.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!humanToMove() || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sq = squareFromPoint(e.clientX, e.clientY);
  if (sq < 0) return;
  const cur = state.partial.length ? state.partial[state.partial.length - 1] : state.selected;
  const ownPiece = (sq === cur && state.selected >= 0) || (!state.partial.length && state.game.legal.some((m) => m.from === sq));
  if (ownPiece) {
    const el = pieceEls.get(state.partial.length ? state.selected : sq);
    const wasSelected = state.selected === sq;
    if (!state.partial.length && !wasSelected) { state.selected = sq; render(); }
    drag = { id: e.pointerId, sq, x: e.clientX, y: e.clientY, el, moved: false, wasSelected };
    boardEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else {
    onSquare(sq);
  }
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  const { r, c } = toDisplay(drag.sq);
  const cell = boardEl.getBoundingClientRect().width / 8;
  drag.el.classList.add('dragging');
  drag.el.style.transform = `translate(${c * cell + dx}px, ${r * cell + dy}px) scale(1.08)`;
});

function endDrag(e, cancelled) {
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  d.el.classList.remove('dragging');
  if (!d.moved) {
    // A tap on a piece: toggle selection (handled like a click).
    placeEl(d.el, d.sq);
    if (d.wasSelected && !state.partial.length) state.selected = -1;
    render();
    return;
  }
  const sq = cancelled ? -1 : squareFromPoint(e.clientX, e.clientY);
  const ok = sq >= 0 && candidates().some((m) => m.path[state.partial.length] === sq);
  if (ok) {
    advance(sq);
  } else {
    placeEl(d.el, d.sq);
  }
}
boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

// -------------------------------------------------------------- computer ---
let worker = null;
let workerOk = true;

function getWorker() {
  if (!workerOk) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => onCpuReply(e.data);
      worker.onerror = () => { workerOk = false; worker = null; if (state.thinking) requestCpuMove(true); };
    } catch {
      workerOk = false;
      return null;
    }
  }
  return worker;
}

function cancelCpu() {
  state.reqId++;
  if (state.thinking && worker) { worker.terminate(); worker = null; }
  state.thinking = false;
  state.busy = false;
}

let thinkStart = 0;
async function requestCpuMove(retry = false) {
  const g = state.game;
  const id = ++state.reqId;
  state.thinking = true;
  state.busy = true;
  if (!retry) thinkStart = performance.now();
  render();
  const payload = {
    id,
    board: Array.from(g.board),
    side: g.side,
    level: state.level,
    history: g.repetitionHistory().map((h) => ({ board: Array.from(h.board), side: h.side })),
  };
  const w = getWorker();
  if (w) {
    w.postMessage(payload);
  } else {
    // Fallback: compute on the main thread.
    await wait(30);
    const { chooseMove } = await import('./ai.js');
    const r = chooseMove(g.board, g.side, state.level, g.repetitionHistory());
    onCpuReply({ id, move: r?.move, info: r?.info });
  }
}

async function onCpuReply({ id, move }) {
  if (id !== state.reqId || !move) return;
  const elapsed = performance.now() - thinkStart;
  if (elapsed < MIN_THINK_MS) await wait(MIN_THINK_MS - elapsed);
  if (id !== state.reqId) return;
  state.thinking = false;
  render();
  const el = pieceEls.get(move.from);
  for (let i = 0; i < move.path.length; i++) {
    await animateStep(el, move.path[i], move.captured.length ? move.captured[i] : undefined);
    if (id !== state.reqId) return;
  }
  state.busy = false;
  commitMove(move);
}

// --------------------------------------------------------------- controls ---
function canUndo() {
  if (state.busy && !state.thinking) return false;
  const g = state.game;
  // Is there a human move to take back?
  return g.moves.some((_, i) => (i % 2 === 0 ? BLACK : WHITE) === state.human);
}

function undo() {
  if (!canUndo()) return;
  cancelCpu();
  const g = state.game;
  while (g.moves.length) {
    const mover = (g.moves.length - 1) % 2 === 0 ? BLACK : WHITE;
    g.undo();
    if (mover === state.human) break;
  }
  state.selected = -1;
  state.partial = [];
  renderPieces();
  save();
  render();
}

function inProgress() {
  const g = state.game;
  return g.moves.some((_, i) => (i % 2 === 0 ? BLACK : WHITE) === state.human) && !g.result;
}

function newGame(human = state.human, ask = true) {
  if (ask && inProgress() && !window.confirm(t('confirmNew'))) return false;
  cancelCpu();
  state.human = human;
  state.game.reset();
  state.selected = -1;
  state.partial = [];
  buildBoard();
  renderPieces();
  save();
  afterMove();
  return true;
}

function showResult() {
  const g = state.game;
  if (!g.result) return;
  const { winner, reason } = g.result;
  $('result-title').textContent = winner === 0 ? t('draw') : winner === state.human ? t('youWin') : t('youLose');
  const loserName = t(winner === BLACK ? 'white' : 'black');
  const key = { noPieces: 'reasonNoPieces', noMoves: 'reasonNoMoves', repetition: 'reasonRepetition', fortyMoves: 'reasonFortyMoves' }[reason];
  $('result-reason').textContent = t(key, { side: loserName });
  const dlg = $('result-dialog');
  dlg.dataset.outcome = winner === 0 ? 'draw' : winner === state.human ? 'win' : 'lose';
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

$('result-dialog').addEventListener('close', () => {
  if ($('result-dialog').returnValue === 'again') newGame(state.human, false);
});

$('btn-new').addEventListener('click', () => { unlockAudio(); newGame(); });
$('btn-undo').addEventListener('click', undo);
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  setSoundEnabled(state.sound);
  if (state.sound) { unlockAudio(); playSound('place'); }
  save();
  render();
});
$('level').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.value;
  if (!v) return;
  state.level = v;
  save();
  render();
});
$('color').addEventListener('click', (e) => {
  const v = Number(e.target.closest('button')?.dataset.value);
  if (!v || v === state.human) return;
  unlockAudio();
  newGame(v);
  render();
});

// ------------------------------------------------------------------ init ---
function init() {
  setLang(detectLang());
  applyI18n();
  const saved = load();
  if (saved) {
    if (['easy', 'medium', 'hard'].includes(saved.level)) state.level = saved.level;
    if (saved.human === BLACK || saved.human === WHITE) state.human = saved.human;
    if (typeof saved.sound === 'boolean') state.sound = saved.sound;
    // Restore the game in progress.
    try {
      for (const [from, ...path] of saved.moves || []) state.game.play({ from, path });
    } catch {
      state.game.reset();
    }
  }
  setSoundEnabled(state.sound);
  buildBoard();
  renderPieces();
  afterMove();
}

init();
