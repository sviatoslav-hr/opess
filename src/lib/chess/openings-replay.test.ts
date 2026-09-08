import { describe, it } from 'vitest';
import { moveToAlgebraic } from '$lib/chess/algebraic';
import { ChessBoard, ChessMove } from '$lib/chess/engine';
import { INITIAL_FEN, loadFen } from '$lib/chess/fen';
import { getOpenings } from '$lib/chess/openings';

describe('opening line replay', () => {
	it('formats and applies every move', () => {
		for (const opening of getOpenings()) {
			for (const line of opening.lines) {
				const board = new ChessBoard();
				const [, fenError] = loadFen(board, opening.fen ?? INITIAL_FEN);
				if (fenError) {
					throw new Error(`Failed to load FEN for ${opening.name}: ${fenError.message}`);
				}
				for (const [moveIndex, move] of line.moves.entries()) {
					try {
						moveToAlgebraic(board, move);
					} catch (error) {
						throw new Error(`${opening.name}: ${line.name}, move ${moveIndex + 1}`, {
							cause: error,
						});
					}
					board.applyMove(ChessMove.pack(move), true);
				}
			}
		}
	});
});
