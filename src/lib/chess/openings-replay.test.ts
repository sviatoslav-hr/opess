import { describe, it } from 'vitest';

import { moveToAlgebraic } from '$lib/chess/algebraic';
import { ChessBoard, ChessMove } from '$lib/chess/engine';
import { loadFen } from '$lib/chess/fen';
import { getOpenings } from '$lib/chess/openings';
import type { PGNMoveNode } from '$lib/chess/pgn';

describe('opening tree replay', () => {
	it('formats and applies every move on every branch', () => {
		for (const opening of getOpenings()) {
			const board = new ChessBoard();
			const [, fenError] = loadFen(board, opening.fen);
			if (fenError) {
				throw new Error(`Failed to load FEN for ${opening.name}: ${fenError.message}`);
			}
			board.generateLegalMoves();

			for (const firstNode of [opening.rootNode, ...opening.rootNode.variations]) {
				replayNode(firstNode, board, opening.name, []);
			}
		}
	});
});

function replayNode(
	node: PGNMoveNode,
	positionBeforeMove: ChessBoard,
	openingName: string,
	line: string[]
): void {
	const board = positionBeforeMove.clone();
	let algebraic: string;
	try {
		algebraic = moveToAlgebraic(board, node.move);
	} catch (error) {
		throw new Error(`${openingName}: ${line.join(' ')} at ${node.fullMoveNumber}`, {
			cause: error,
		});
	}
	if (!board.applyMove(ChessMove.pack(node.move))) {
		throw new Error(`${openingName}: failed to apply ${algebraic} after ${line.join(' ')}`);
	}
	board.generateLegalMoves();

	if (!node.next) return;
	for (const nextNode of [node.next, ...node.next.variations]) {
		replayNode(nextNode, board, openingName, [...line, algebraic]);
	}
}
