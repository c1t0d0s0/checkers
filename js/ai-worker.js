import { chooseMove } from './ai.js';

self.onmessage = (e) => {
  const { id, board, side, level, history } = e.data;
  const toBoard = (b) => Int8Array.from(b);
  const r = chooseMove(
    toBoard(board),
    side,
    level,
    history.map((h) => ({ board: toBoard(h.board), side: h.side })),
  );
  self.postMessage({ id, move: r ? r.move : null, info: r ? r.info : null });
};
