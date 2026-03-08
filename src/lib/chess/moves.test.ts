import { describe, expect, it } from 'vitest';

import { Position } from '$lib/chess/board';
import { INITIAL_FEN, parseFen } from '$lib/chess/fen';
import { applyMove, calculateMove, getLegalMovesFrom } from '$lib/chess/moves';

describe('move generation', () => {
	it('derives legal moves from canonical board state on demand', () => {
		const board = parseFen(INITIAL_FEN);

		const moves = getLegalMovesFrom(board, Position.fromStr('e2')).map((move) => move.toString());

		expect(moves).toEqual(['e3', 'e4']);
	});

	it('rejects moves that leave the king in check without a precomputed cache', () => {
		const board = parseFen('4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1');

		const [move, moveError] = calculateMove(board, Position.fromStr('a1'), Position.fromStr('a2'));

		expect(move).toBeUndefined();
		expect(moveError).toEqual({ type: 'invalidPieceMove', piece: 'R' });
	});

	it('keeps derived legal moves out of the persisted board state', () => {
		const board = parseFen(INITIAL_FEN);
		const [move] = calculateMove(board, Position.fromStr('e2'), Position.fromStr('e4'));

		expect(move).toBeDefined();
		if (!move) {
			throw new Error('Expected e2e4 to be legal');
		}

		const nextBoard = applyMove(board, move);

		expect(Object.hasOwn(nextBoard, 'allowedMoves')).toBe(false);
	});
});
