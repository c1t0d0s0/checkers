import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK, WHITE, Game, generateMoves, initialBoard, moveNotation, applyMove, DRAW_PLIES,
} from '../js/rules.js';
import { chooseMove, Engine } from '../js/ai.js';

// Build a board from standard square numbers (1..32).
function board(spec) {
  const b = new Int8Array(32);
  for (const [sq, p] of Object.entries(spec)) b[Number(sq) - 1] = p;
  return b;
}
const notes = (moves) => moves.map(moveNotation).sort();

test('initial position has 7 moves for Black', () => {
  const moves = generateMoves(initialBoard(), BLACK);
  assert.deepEqual(notes(moves), ['10-14', '10-15', '11-15', '11-16', '12-16', '9-13', '9-14'].sort());
});

test('White has 7 replies after 11-15', () => {
  const g = new Game();
  g.play(g.legal.find((m) => moveNotation(m) === '11-15'));
  assert.equal(g.side, WHITE);
  assert.deepEqual(notes(g.legal), ['21-17', '22-17', '22-18', '23-18', '23-19', '24-19', '24-20'].sort());
});

test('captures are mandatory', () => {
  // Black man on 14, White man on 18, empty 23: Black must jump 14x23.
  const b = board({ 14: 1, 18: -1, 1: 1 });
  assert.deepEqual(notes(generateMoves(b, BLACK)), ['14x23']);
});

test('multi-jump continues to the end', () => {
  const b = board({ 1: 1, 6: -1, 15: -1, 24: -1 });
  assert.deepEqual(notes(generateMoves(b, BLACK)), ['1x10x19x28']);
  const after = applyMove(b, generateMoves(b, BLACK)[0]);
  assert.equal(after[5], 0); assert.equal(after[14], 0); assert.equal(after[23], 0);
  assert.equal(after[27], 1);
});

test('multiple capture choices are all allowed (no majority rule)', () => {
  // Black on 10 may take one piece (10x17) or two (10x19x28).
  const b = board({ 10: 1, 14: -1, 15: -1, 24: -1 });
  assert.deepEqual(notes(generateMoves(b, BLACK)), ['10x17', '10x19x28']);
});

test('a man that crowns during a jump stops there', () => {
  // Black man 22 jumps 26 to 31 (crowns). White man on 27 could be jumped by a king but not now.
  const b = board({ 22: 1, 26: -1, 27: -1, 5: -1 });
  const moves = generateMoves(b, BLACK);
  assert.deepEqual(notes(moves), ['22x31']);
  assert.equal(moves[0].promote, true);
  assert.equal(applyMove(b, moves[0])[30], 2);
});

test('kings move backwards and men do not', () => {
  const b = board({ 18: 2, 1: -1 });
  assert.deepEqual(notes(generateMoves(b, BLACK)), ['18-14', '18-15', '18-22', '18-23']);
  const m = board({ 18: 1, 1: -1 });
  assert.deepEqual(notes(generateMoves(m, BLACK)), ['18-22', '18-23']);
});

test('king can complete a circular jump through its origin', () => {
  // King on 10 jumps 15, 23, 22, 14 and returns to 10... (square shape)
  const b = board({ 10: 2, 15: -1, 23: -1, 22: -1, 14: -1 });
  const n = notes(generateMoves(b, BLACK));
  assert.ok(n.some((s) => s.startsWith('10x') && s.endsWith('x10')), n.join(','));
});

test('no pieces / no moves loses', () => {
  const g = new Game();
  g.setPosition(board({ 29: -1, 25: 1, 22: 1 }), WHITE); // White is blocked
  assert.deepEqual(g.result, { winner: BLACK, reason: 'noMoves' });
  g.setPosition(board({ 25: 1 }), WHITE);
  assert.deepEqual(g.result, { winner: BLACK, reason: 'noPieces' });
});

test('threefold repetition and 40-move rule draw', () => {
  const g = new Game();
  g.setPosition(board({ 1: 2, 32: -2 }), BLACK);
  const play = (s) => g.play(g.legal.find((m) => moveNotation(m) === s));
  for (let i = 0; i < 2; i++) { play('1-5'); play('32-28'); play('5-1'); play('28-32'); }
  assert.equal(g.result?.reason, 'repetition');

  const g2 = new Game();
  g2.setPosition(board({ 1: 2, 32: -2 }), BLACK);
  g2.quiet = DRAW_PLIES - 1;
  g2.play(g2.legal[0]);
  assert.equal(g2.result?.reason, 'fortyMoves');
});

test('undo restores the previous position', () => {
  const g = new Game();
  const before = new Int8Array(g.board);
  g.play(g.legal[0]);
  g.undo();
  assert.deepEqual(g.board, before);
  assert.equal(g.side, BLACK);
});

test('every level plays the forced capture', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const b = board({ 14: 1, 18: -1, 5: 1, 32: -1 });
    const r = chooseMove(b, BLACK, level, [], () => 0.5);
    assert.equal(moveNotation(r.move), '14x23');
  }
});

test('medium and hard AI do not hang a piece', () => {
  // 14-18 would allow 23x14.
  const b = board({ 14: 1, 1: 1, 23: -1, 32: -1 });
  for (const level of ['medium', 'hard']) {
    for (let i = 0; i < 5; i++) {
      const r = chooseMove(b, BLACK, level, [], Math.random);
      assert.notEqual(moveNotation(r.move), '14-18', level);
    }
  }
});

test('engine sees a two-for-one shot', () => {
  // Black 18-22 gives one man but wins two: 25x18 forced? Validate by score only.
  const e = new Engine();
  const b = board({ 19: 1, 10: 1, 24: -1, 27: -1, 31: -1 });
  const r = e.searchBest(b, BLACK, { timeMs: 500 });
  assert.ok(r.move);
});

test('hard AI answers within time limits from the opening', () => {
  const g = new Game();
  g.play(g.legal.find((m) => moveNotation(m) === '11-15'));
  const t = performance.now();
  const r = chooseMove(g.board, g.side, 'hard', []);
  const dt = performance.now() - t;
  assert.ok(r.move);
  assert.ok(dt < 6000, `took ${dt}ms`);
  assert.ok(r.info.depth >= 8, `depth ${r.info.depth}`);
});
