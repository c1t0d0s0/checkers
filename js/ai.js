// Checkers engine: negamax alpha-beta with iterative deepening, transposition
// table, killer/history move ordering, PVS, late-move reductions and capture
// resolution (positions with a pending capture are never statically evaluated).

import {
  BLACK, WHITE, generateMoves, makeMove, unmakeMove, rowOf, colOf, moveTo,
  initialBoard, sameMove,
} from './rules.js';

const INF = 1000000;
const MATE = 100000;
const MAX_PLY = 96;

// ---------------------------------------------------------------- Zobrist ---
let seed = 0x9e3779b9;
function rand32() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return seed | 0;
}
const ZL = new Int32Array(32 * 5);
const ZH = new Int32Array(32 * 5);
for (let i = 0; i < ZL.length; i++) { ZL[i] = rand32(); ZH[i] = rand32(); }
const SIDE_L = rand32();
const SIDE_H = rand32();

function hashLo(board, side) {
  let h = side === BLACK ? SIDE_L : 0;
  for (let i = 0; i < 32; i++) if (board[i]) h ^= ZL[i * 5 + board[i] + 2];
  return h;
}
function hashHi(board, side) {
  let h = side === BLACK ? SIDE_H : 0;
  for (let i = 0; i < 32; i++) if (board[i]) h ^= ZH[i * 5 + board[i] + 2];
  return h;
}

// ------------------------------------------------------------- Evaluation ---
// Advancement bonus for a man, indexed by rows advanced from its own back rank.
const ADV = [0, 2, 4, 7, 11, 16, 22, 0];
// Central control for men.
const CENTER_MAN = new Int8Array(32);
// King centralisation.
const KING_POS = new Int8Array(32);
// Chebyshev-ish distance helpers.
const ROW = new Int8Array(32);
const COL = new Int8Array(32);
for (let i = 0; i < 32; i++) {
  const r = rowOf(i), c = colOf(i);
  ROW[i] = r; COL[i] = c;
  CENTER_MAN[i] = (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? 4 : (c === 0 || c === 7 ? -2 : 0);
  const dr = Math.abs(r - 3.5), dc = Math.abs(c - 3.5);
  KING_POS[i] = Math.round(8 - 2.2 * Math.max(dr, dc));
}
// Back rank guard squares (the "bridge" squares get the biggest bonus).
const BACK_BLACK = new Int8Array(32);
const BACK_WHITE = new Int8Array(32);
BACK_BLACK[0] = 10; BACK_BLACK[2] = 10; BACK_BLACK[1] = 5; BACK_BLACK[3] = 4;
BACK_WHITE[31] = 10; BACK_WHITE[29] = 10; BACK_WHITE[30] = 5; BACK_WHITE[28] = 4;
// Double corners (where a lone king can hold out longest).
const DOUBLE_CORNER = new Uint8Array(32);
DOUBLE_CORNER[0] = 1; DOUBLE_CORNER[4] = 1; DOUBLE_CORNER[27] = 1; DOUBLE_CORNER[31] = 1;

const scratchB = new Int8Array(12);
const scratchW = new Int8Array(12);

// Static evaluation from the point of view of `side`.
export function evaluate(board, side) {
  let bm = 0, bk = 0, wm = 0, wk = 0;
  let pos = 0;
  let backB = 0, backW = 0;
  let nb = 0, nw = 0;
  for (let i = 0; i < 32; i++) {
    const p = board[i];
    if (p === 0) continue;
    if (p === 1) {
      bm++; pos += ADV[ROW[i]] + CENTER_MAN[i]; backB += BACK_BLACK[i]; scratchB[nb++] = i;
    } else if (p === 2) {
      bk++; pos += KING_POS[i]; scratchB[nb++] = i;
    } else if (p === -1) {
      wm++; pos -= ADV[7 - ROW[i]] + CENTER_MAN[i]; backW += BACK_WHITE[i]; scratchW[nw++] = i;
    } else {
      wk++; pos -= KING_POS[i]; scratchW[nw++] = i;
    }
  }
  const total = nb + nw;
  const kingVal = total <= 10 ? 150 : 135;
  const bMat = bm * 100 + bk * kingVal;
  const wMat = wm * 100 + wk * kingVal;
  let score = bMat - wMat + pos;

  // Back rank matters while the opponent still has men that could crown.
  if (wm > 0) score += total > 12 ? backB : backB >> 1;
  if (bm > 0) score -= total > 12 ? backW : backW >> 1;

  // Prefer trades when ahead.
  const diff = bMat - wMat;
  if (diff !== 0) score += Math.trunc((diff * 6) / (total + 2));

  // Endgame technique: the stronger side hunts with its kings,
  // the weaker side hides in the double corners.
  if (total <= 12 && diff !== 0) {
    const strongIsBlack = diff > 0;
    const strong = strongIsBlack ? scratchB : scratchW;
    const ns = strongIsBlack ? nb : nw;
    const weak = strongIsBlack ? scratchW : scratchB;
    const nwk = strongIsBlack ? nw : nb;
    let hunt = 0;
    for (let a = 0; a < ns; a++) {
      const s = strong[a];
      if (Math.abs(board[s]) !== 2) continue;
      let best = 8;
      for (let b = 0; b < nwk; b++) {
        const t = weak[b];
        const d = Math.max(Math.abs(ROW[s] - ROW[t]), Math.abs(COL[s] - COL[t]));
        if (d < best) best = d;
      }
      hunt -= best * 3;
    }
    for (let b = 0; b < nwk; b++) {
      const t = weak[b];
      if (Math.abs(board[t]) === 2 && DOUBLE_CORNER[t]) hunt -= 8;
    }
    score += strongIsBlack ? hunt : -hunt;
  }

  return side === BLACK ? score : -score;
}

// ----------------------------------------------------------------- Engine ---
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1, LOWER = 2, UPPER = 3;

class StopSearch extends Error {}

export class Engine {
  constructor() {
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.ttMove = new Int8Array(TT_SIZE);
    this.killers = new Int16Array(MAX_PLY * 2 + 4);
    this.history = new Int32Array(1024);
    this.pathLo = new Int32Array(1024);
    this.pathHi = new Int32Array(1024);
    this.pathLen = 0;
    this.pathBase = 0;
  }

  clearTT() {
    this.ttKey.fill(0); this.ttFlag.fill(0);
  }

  // history: [{board, side}] positions since the last irreversible move,
  // excluding the current one. Used for repetition detection.
  setupPath(history) {
    this.pathLen = 0;
    for (const h of history.slice(-900)) {
      this.pathLo[this.pathLen] = hashLo(h.board, h.side);
      this.pathHi[this.pathLen] = hashHi(h.board, h.side);
      this.pathLen++;
    }
    this.pathBase = this.pathLen;
  }

  isRepetition(lo, hi) {
    // Same side to move only every second ply.
    for (let i = this.pathLen - 2; i >= 0; i -= 2) {
      if (this.pathLo[i] === lo && this.pathHi[i] === hi) return true;
    }
    return false;
  }

  orderMoves(moves, ttIdx, ply) {
    const n = moves.length;
    const scores = new Int32Array(n);
    const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      const key = m.from * 32 + moveTo(m);
      let s;
      if (i === ttIdx) s = 10000000;
      else if (m.captured.length) s = 5000000 + m.captured.length * 1000;
      else if (key + 1 === k1) s = 4000000;
      else if (key + 1 === k2) s = 3900000;
      else s = this.history[key];
      if (m.promote) s += 2000000;
      scores[i] = s;
    }
    const idx = Array.from({ length: n }, (_, i) => i);
    idx.sort((a, b) => scores[b] - scores[a]);
    return idx;
  }

  negamax(board, side, depth, ply, alpha, beta) {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && performance.now() > this.deadline) throw new StopSearch();

    const lo = hashLo(board, side);
    const hi = hashHi(board, side);
    if (ply > 0 && this.isRepetition(lo, hi)) return 0;

    const moves = generateMoves(board, side);
    if (moves.length === 0) return -MATE + ply;
    const isCapture = moves[0].captured.length > 0;
    if (ply >= MAX_PLY) return evaluate(board, side);
    if (depth <= 0 && !isCapture) return evaluate(board, side);
    if (depth < 0) depth = 0;

    // Transposition table probe.
    const slot = lo & TT_MASK;
    let ttIdx = -1;
    if (this.ttFlag[slot] && this.ttKey[slot] === hi) {
      const m = this.ttMove[slot];
      if (m >= 0 && m < moves.length) ttIdx = m;
      if (ply > 0 && this.ttDepth[slot] >= depth) {
        let s = this.ttScore[slot];
        if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;
        const f = this.ttFlag[slot];
        if (f === EXACT) return s;
        if (f === LOWER && s >= beta) return s;
        if (f === UPPER && s <= alpha) return s;
      }
    }

    const order = this.orderMoves(moves, ttIdx, ply);
    const alphaOrig = alpha;
    let best = -INF;
    let bestIdx = order[0];
    const forced = moves.length === 1;

    this.pathLo[this.pathLen] = lo;
    this.pathHi[this.pathLen] = hi;
    this.pathLen++;
    try {
      for (let n = 0; n < order.length; n++) {
        const i = order[n];
        const m = moves[i];
        const undo = makeMove(board, m);
        let newDepth = forced ? depth : depth - 1;
        let score;
        if (n === 0) {
          score = -this.negamax(board, -side, newDepth, ply + 1, -beta, -alpha);
        } else {
          // Late move reduction for quiet moves.
          let r = 0;
          if (depth >= 3 && n >= 3 && !isCapture && !m.promote) r = n >= 8 && depth >= 6 ? 2 : 1;
          score = -this.negamax(board, -side, newDepth - r, ply + 1, -alpha - 1, -alpha);
          if (score > alpha && (r > 0 || score < beta)) {
            score = -this.negamax(board, -side, newDepth, ply + 1, -beta, -alpha);
          }
        }
        unmakeMove(board, m, undo);
        if (score > best) {
          best = score;
          bestIdx = i;
          if (ply === 0) this.rootBest = i;
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) {
          if (!isCapture) {
            const key = m.from * 32 + moveTo(m) + 1;
            if (this.killers[ply * 2] !== key) {
              this.killers[ply * 2 + 1] = this.killers[ply * 2];
              this.killers[ply * 2] = key;
            }
            this.history[key - 1] += depth * depth;
          }
          break;
        }
      }
    } finally {
      this.pathLen--;
    }

    // Store.
    let s = best;
    if (s > MATE - 1000) s += ply; else if (s < -MATE + 1000) s -= ply;
    if (this.ttDepth[slot] <= depth || this.ttKey[slot] !== hi || !this.ttFlag[slot]) {
      this.ttKey[slot] = hi;
      this.ttScore[slot] = s;
      this.ttDepth[slot] = Math.min(depth, 127);
      this.ttFlag[slot] = best <= alphaOrig ? UPPER : best >= beta ? LOWER : EXACT;
      this.ttMove[slot] = bestIdx;
    }
    return best;
  }

  // Iterative deepening search for the best move.
  searchBest(board, side, { maxDepth = 64, timeMs = 2000, minDepth = 1 } = {}) {
    const b = new Int8Array(board);
    const moves = generateMoves(b, side);
    if (moves.length === 0) return null;
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };
    this.nodes = 0;
    this.history.fill(0);
    this.killers.fill(0);
    const start = performance.now();
    let bestMove = moves[0], bestScore = 0, reached = 0;
    for (let d = 1; d <= maxDepth; d++) {
      this.deadline = d <= minDepth ? Infinity : start + timeMs;
      this.rootBest = -1;
      try {
        bestScore = this.negamax(b, side, d, 0, -INF, INF);
        bestMove = moves[this.rootBest];
        reached = d;
      } catch (e) {
        if (!(e instanceof StopSearch)) throw e;
        // Partial iteration: keep its best move only if it was searched first (TT move).
        this.pathLen = this.pathBase;
        break;
      }
      if (Math.abs(bestScore) > MATE - 1000) break; // forced win/loss found
      const elapsed = performance.now() - start;
      if (elapsed > timeMs * 0.45) break; // next iteration would likely not finish
    }
    return { move: bestMove, score: bestScore, depth: reached, nodes: this.nodes };
  }

  // Score every root move at a fixed depth (used by the weaker levels).
  scoreRootMoves(board, side, depth) {
    const b = new Int8Array(board);
    const moves = generateMoves(b, side);
    this.nodes = 0;
    this.deadline = Infinity;
    this.history.fill(0);
    this.killers.fill(0);
    const lo = hashLo(b, side), hi = hashHi(b, side);
    this.pathLo[this.pathLen] = lo; this.pathHi[this.pathLen] = hi; this.pathLen++;
    const out = moves.map((m) => {
      const undo = makeMove(b, m);
      const score = -this.negamax(b, -side, depth - 1, 1, -INF, INF);
      unmakeMove(b, m, undo);
      return { move: m, score };
    });
    this.pathLen--;
    return out;
  }
}

// ------------------------------------------------------------ Difficulty ---
export const LEVELS = {
  easy: { depth: 3, noise: 90, randomRate: 0.2 },
  medium: { depth: 6, noise: 20, randomRate: 0 },
  hard: { timeMs: 2000, minDepth: 8 },
};

// Sound first moves for Black (standard numbering).
const OPENINGS = [[10, 14], [8, 13], [10, 15], [9, 14], [9, 13]];

function isInitial(board, side) {
  if (side !== BLACK) return false;
  const init = initialBoard();
  for (let i = 0; i < 32; i++) if (board[i] !== init[i]) return false;
  return true;
}

let engine = null;

// Choose a move for `side`. history: [{board, side}] since last irreversible move.
export function chooseMove(board, side, level = 'hard', history = [], rng = Math.random) {
  const moves = generateMoves(board, side);
  if (moves.length === 0) return null;
  if (moves.length === 1) return { move: moves[0], info: { forced: true } };
  if (!engine) engine = new Engine();
  engine.setupPath(history);
  const cfg = LEVELS[level] || LEVELS.hard;

  if (level !== 'easy' && isInitial(board, side)) {
    const [from, to] = OPENINGS[Math.floor(rng() * OPENINGS.length)];
    const m = moves.find((x) => sameMove(x, { from, path: [to] }));
    if (m) return { move: m, info: { book: true } };
  }

  if (level === 'hard') {
    const r = engine.searchBest(board, side, { timeMs: cfg.timeMs, minDepth: cfg.minDepth });
    return { move: r.move, info: { score: r.score, depth: r.depth, nodes: r.nodes } };
  }

  if (rng() < cfg.randomRate) {
    return { move: moves[Math.floor(rng() * moves.length)], info: { random: true } };
  }
  const scored = engine.scoreRootMoves(board, side, cfg.depth);
  let best = null, bestVal = -Infinity;
  for (const s of scored) {
    const v = s.score + (rng() * 2 - 1) * cfg.noise;
    if (v > bestVal) { bestVal = v; best = s; }
  }
  return { move: best.move, info: { score: best.score, depth: cfg.depth } };
}

export { WHITE };
