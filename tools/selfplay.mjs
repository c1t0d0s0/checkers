// Engine self-play: node tools/selfplay.mjs [games] [levelA] [levelB]
import { Game, BLACK, moveNotation } from '../js/rules.js';
import { chooseMove } from '../js/ai.js';

const games = Number(process.argv[2] || 10);
const A = process.argv[3] || 'hard';
const B = process.argv[4] || 'medium';
const tally = { [A]: 0, [B]: 0, draw: 0 };
for (let g = 0; g < games; g++) {
  const game = new Game();
  const aIsBlack = g % 2 === 0;
  const depths = [];
  while (!game.result && game.moves.length < 300) {
    const level = (game.side === BLACK) === aIsBlack ? A : B;
    const hist = game.repetitionHistory();
    const r = chooseMove(game.board, game.side, level, hist);
    if (level === A && r.info.depth) depths.push(r.info.depth);
    game.play(r.move);
  }
  const w = game.result ? game.result.winner : 0;
  const winner = w === 0 ? 'draw' : (w === BLACK) === aIsBlack ? A : B;
  tally[winner]++;
  const avg = depths.length ? (depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1) : '-';
  console.log(`game ${g + 1}: ${winner} (${game.result?.reason ?? 'limit'}, ${game.moves.length} plies, ${A} avg depth ${avg})`);
}
console.log(tally);
