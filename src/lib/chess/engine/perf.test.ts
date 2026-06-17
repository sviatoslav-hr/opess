import { describe, expect, it } from 'vitest';

import type { AbstractBoard } from '$lib/chess/board';
import { Board0x88 } from '$lib/chess/engine/0x88';

function perft<TBuf, TMove>(board: AbstractBoard<TBuf, TMove>, depth: number): number {
	if (depth <= 0) return 1;

	const moveBuffer = board.allocateMoveBuffer();
	const movesCount = board.generateLegalMoves(moveBuffer);

	// At the leaf level the count of legal moves is the answer; no need to
	// recurse into every child just to return 1 each time.
	if (depth === 1) return movesCount;

	let nodes = 0;
	for (let i = 0; i < movesCount; i++) {
		const move = board.getMoveByIndex(moveBuffer, i);
		board.makeMove(move);
		nodes += perft(board, depth - 1);
		board.unmakeMove(move);
	}

	return nodes;
}

describe('perft', () => {
	it('initial position', () => {
		const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
		expect(perft(new Board0x88(fen), 1)).toBe(20);
		expect(perft(new Board0x88(fen), 2)).toBe(400);
		expect(perft(new Board0x88(fen), 3)).toBe(8902);
		expect(perft(new Board0x88(fen), 4)).toBe(197281);
	});

	it('kiwipete', () => {
		const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
		expect(perft(new Board0x88(fen), 1)).toBe(48);
		expect(perft(new Board0x88(fen), 2)).toBe(2039);
		expect(perft(new Board0x88(fen), 3)).toBe(97862);
	});

	it('position 3', () => {
		const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
		expect(perft(new Board0x88(fen), 1)).toBe(14);
		expect(perft(new Board0x88(fen), 2)).toBe(191);
		expect(perft(new Board0x88(fen), 3)).toBe(2812);
		expect(perft(new Board0x88(fen), 4)).toBe(43238);
	});

	it('position 4', () => {
		const fen = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
		expect(perft(new Board0x88(fen), 1)).toBe(6);
		expect(perft(new Board0x88(fen), 2)).toBe(264);
		expect(perft(new Board0x88(fen), 3)).toBe(9467);
	});

	it('position 5', () => {
		const fen = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
		expect(perft(new Board0x88(fen), 1)).toBe(44);
		expect(perft(new Board0x88(fen), 2)).toBe(1486);
		expect(perft(new Board0x88(fen), 3)).toBe(62379);
	});

	it('position 6', () => {
		const fen = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';
		expect(perft(new Board0x88(fen), 1)).toBe(46);
		expect(perft(new Board0x88(fen), 2)).toBe(2079);
		expect(perft(new Board0x88(fen), 3)).toBe(89890);
	});
});
