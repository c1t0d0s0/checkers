// American checkers (English draughts) rules.
//
// Board: 32 playable (dark) squares, index 0..31 = standard square number - 1.
// Row 0 is Black's back rank (rank 8), row 7 is White's back rank (rank 1).
// Even rows use columns 1,3,5,7; odd rows use columns 0,2,4,6.
// Black moves first and moves "down" (increasing row).
//
// Piece codes: 0 empty, 1 black man, 2 black king, -1 white man, -2 white king.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;
export const MAN = 1;
export const KING = 2;

// Directions: 0 = (-1,-1), 1 = (-1,+1), 2 = (+1,-1), 3 = (+1,+1)
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export function rowOf(sq) { return sq >> 2; }
export function colOf(sq) { const r = sq >> 2; return ((sq & 3) << 1) + ((r & 1) ? 0 : 1); }
export function sqAt(r, c) {
  if (r < 0 || r > 7 || c < 0 || c > 7) return -1;
  if (((r + c) & 1) === 0) return -1; // light square
  return (r << 2) + (c >> 1);
}

// NEIGHBOR[sq*4+d], JUMP[sq*4+d]: -1 if off board.
export const NEIGHBOR = new Int8Array(128);
export const JUMP = new Int8Array(128);
for (let sq = 0; sq < 32; sq++) {
  const r = rowOf(sq), c = colOf(sq);
  for (let d = 0; d < 4; d++) {
    NEIGHBOR[sq * 4 + d] = sqAt(r + DIRS[d][0], c + DIRS[d][1]);
    JUMP[sq * 4 + d] = sqAt(r + 2 * DIRS[d][0], c + 2 * DIRS[d][1]);
  }
}

// Directions a piece may move in.
const DIRS_BLACK_MAN = [2, 3];
const DIRS_WHITE_MAN = [0, 1];
const DIRS_KING = [0, 1, 2, 3];
function dirsFor(piece) {
  if (piece === 1) return DIRS_BLACK_MAN;
  if (piece === -1) return DIRS_WHITE_MAN;
  return DIRS_KING;
}

export function promotionRow(side) { return side === BLACK ? 7 : 0; }

export function initialBoard() {
  const b = new Int8Array(32);
  for (let i = 0; i < 12; i++) b[i] = 1;
  for (let i = 20; i < 32; i++) b[i] = -1;
  return b;
}

// A move: { from, path: [landing squares...], captured: [squares], promote: bool }
function captureMovesFrom(board, from, out) {
  const piece = board[from];
  const side = Math.sign(piece);
  const dirs = dirsFor(piece);
  const promoRow = promotionRow(side);
  const isMan = piece === side;
  board[from] = 0; // lift the piece so a king may pass through its origin
  const captured = [];
  const path = [];
  const taken = new Uint8Array(32);

  const dfs = (sq) => {
    let extended = false;
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const over = NEIGHBOR[sq * 4 + d];
      if (over < 0) continue;
      const land = JUMP[sq * 4 + d];
      if (land < 0) continue;
      const v = board[over];
      if (v === 0 || Math.sign(v) === side || taken[over]) continue;
      if (board[land] !== 0) continue;
      extended = true;
      taken[over] = 1;
      captured.push(over);
      path.push(land);
      if (isMan && rowOf(land) === promoRow) {
        // Promotion ends the turn.
        out.push({ from, path: path.slice(), captured: captured.slice(), promote: true });
      } else {
        dfs(land);
      }
      path.pop();
      captured.pop();
      taken[over] = 0;
    }
    if (!extended && path.length > 0) {
      out.push({ from, path: path.slice(), captured: captured.slice(), promote: false });
    }
  };
  dfs(from);
  board[from] = piece;
}

export function generateCaptures(board, side) {
  const out = [];
  for (let sq = 0; sq < 32; sq++) {
    const p = board[sq];
    if (p !== 0 && Math.sign(p) === side) captureMovesFrom(board, sq, out);
  }
  return out;
}

export function hasCapture(board, side) {
  for (let sq = 0; sq < 32; sq++) {
    const p = board[sq];
    if (p === 0 || Math.sign(p) !== side) continue;
    const dirs = dirsFor(p);
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const over = NEIGHBOR[sq * 4 + d];
      const land = JUMP[sq * 4 + d];
      if (over < 0 || land < 0) continue;
      const v = board[over];
      if (v !== 0 && Math.sign(v) !== side && board[land] === 0) return true;
    }
  }
  return false;
}

export function generateSimpleMoves(board, side) {
  const out = [];
  const promoRow = promotionRow(side);
  for (let sq = 0; sq < 32; sq++) {
    const p = board[sq];
    if (p === 0 || Math.sign(p) !== side) continue;
    const dirs = dirsFor(p);
    for (let i = 0; i < dirs.length; i++) {
      const to = NEIGHBOR[sq * 4 + dirs[i]];
      if (to < 0 || board[to] !== 0) continue;
      out.push({ from: sq, path: [to], captured: [], promote: p === side && rowOf(to) === promoRow });
    }
  }
  return out;
}

// Legal moves: captures are mandatory.
export function generateMoves(board, side) {
  const caps = generateCaptures(board, side);
  return caps.length ? caps : generateSimpleMoves(board, side);
}

export function moveTo(move) { return move.path[move.path.length - 1]; }

// Apply in place; returns undo info.
export function makeMove(board, move) {
  const piece = board[move.from];
  const to = moveTo(move);
  const caps = move.captured;
  const removed = new Array(caps.length);
  for (let i = 0; i < caps.length; i++) { removed[i] = board[caps[i]]; board[caps[i]] = 0; }
  board[move.from] = 0;
  board[to] = move.promote ? piece * 2 : piece;
  return { piece, removed };
}

export function unmakeMove(board, move, undo) {
  board[moveTo(move)] = 0;
  board[move.from] = undo.piece;
  const caps = move.captured;
  for (let i = 0; i < caps.length; i++) board[caps[i]] = undo.removed[i];
}

export function applyMove(board, move) {
  const b = new Int8Array(board);
  makeMove(b, move);
  return b;
}

// Standard notation, e.g. "11-15" or "15x24x31".
export function moveNotation(move) {
  const sep = move.captured.length ? 'x' : '-';
  return [move.from, ...move.path].map((s) => s + 1).join(sep);
}

export function sameMove(a, b) {
  if (a.from !== b.from || a.path.length !== b.path.length) return false;
  for (let i = 0; i < a.path.length; i++) if (a.path[i] !== b.path[i]) return false;
  return true;
}

export function countPieces(board) {
  const c = { black: 0, white: 0, blackKings: 0, whiteKings: 0 };
  for (let i = 0; i < 32; i++) {
    const p = board[i];
    if (p > 0) { c.black++; if (p === 2) c.blackKings++; }
    else if (p < 0) { c.white++; if (p === -2) c.whiteKings++; }
  }
  return c;
}

export function positionKey(board, side) {
  let s = side === BLACK ? 'b' : 'w';
  for (let i = 0; i < 32; i++) s += String.fromCharCode(67 + board[i]);
  return s;
}

// Plies without a capture or a man move before a draw is declared (40 moves each).
export const DRAW_PLIES = 80;

// Full game record with draw detection.
export class Game {
  constructor() { this.reset(); }

  reset() { this.setPosition(initialBoard(), BLACK); }

  setPosition(board, side) {
    this.board = new Int8Array(board);
    this.side = side;
    this.moves = [];
    this.history = []; // [{board, side, quiet, keys}]
    this.quiet = 0;
    this.keys = [positionKey(this.board, this.side)];
    this.result = null; // null | { winner: BLACK|WHITE|0, reason }
    this.legal = generateMoves(this.board, this.side);
    this.checkEnd();
  }

  play(move) {
    const legal = this.legal.find((m) => sameMove(m, move));
    if (!legal || this.result) throw new Error('Illegal move');
    const piece = this.board[legal.from];
    this.history.push({ board: this.board, side: this.side, quiet: this.quiet, keys: this.keys, legal: this.legal });
    const irreversible = legal.captured.length > 0 || Math.abs(piece) === MAN;
    this.board = applyMove(this.board, legal);
    this.side = -this.side;
    this.moves.push(legal);
    this.quiet = irreversible ? 0 : this.quiet + 1;
    const key = positionKey(this.board, this.side);
    this.keys = irreversible ? [key] : [...this.keys, key];
    this.legal = generateMoves(this.board, this.side);
    this.checkEnd();
    return legal;
  }

  // Positions since the last irreversible move (for repetition detection in search).
  repetitionHistory() {
    if (this.quiet === 0) return [];
    return this.history.slice(-this.quiet).map((h) => ({ board: h.board, side: h.side }));
  }

  undo() {
    const h = this.history.pop();
    if (!h) return null;
    const move = this.moves.pop();
    this.board = h.board;
    this.side = h.side;
    this.quiet = h.quiet;
    this.keys = h.keys;
    this.legal = h.legal;
    this.result = null;
    return move;
  }

  checkEnd() {
    if (this.legal.length === 0) {
      const c = countPieces(this.board);
      const none = this.side === BLACK ? c.black === 0 : c.white === 0;
      this.result = { winner: -this.side, reason: none ? 'noPieces' : 'noMoves' };
      return;
    }
    const last = this.keys[this.keys.length - 1];
    let reps = 0;
    for (const k of this.keys) if (k === last) reps++;
    if (reps >= 3) { this.result = { winner: 0, reason: 'repetition' }; return; }
    if (this.quiet >= DRAW_PLIES) { this.result = { winner: 0, reason: 'fortyMoves' }; return; }
    this.result = null;
  }
}
