import { describe, expect, it } from 'vitest';

import type { AbstractBoard } from '$lib/chess/board';
import { BoardInt8 } from '$lib/chess/engine/int8';
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
	describe('0x88', () => {
		runBoardTests(new Board0x88());
	});
	describe('int8', () => {
		runBoardTests(new BoardInt8());
	});
});

function runBoardTests(board: AbstractBoard<unknown, unknown>) {
	it('initial position', () => {
		const timeName = `${board.constructor.name} perft`;
		console.time(timeName);
		const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(20);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(400);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(8902);
		board.loadFen(fen);
		expect(perft(board, 4)).toBe(197281);
		// WARN: These take too much time to run...
		// expect(perft(board, 5)).toBe(4865609);
		// expect(perft(board, 6)).toBe(119060324);
		console.timeEnd(timeName);
	}, 10_000);

	it('kiwipete', () => {
		const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(48);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(2039);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(97862);
	});

	it('position 3', () => {
		const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(14);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(191);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(2812);
		board.loadFen(fen);
		expect(perft(board, 4)).toBe(43238);
	});

	it('position 4', () => {
		const fen = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(6);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(264);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(9467);
	});

	it('position 5', () => {
		const fen = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(44);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(1486);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(62379);
	});

	it('position 6', () => {
		const fen = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';
		board.loadFen(fen);
		expect(perft(board, 1)).toBe(46);
		board.loadFen(fen);
		expect(perft(board, 2)).toBe(2079);
		board.loadFen(fen);
		expect(perft(board, 3)).toBe(89890);
	});
}
