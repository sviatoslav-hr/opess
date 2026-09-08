import { describe, expect, it } from 'vitest';

import { moveToLongAlgebraic } from '$lib/chess/algebraic';
import { PieceColor } from '$lib/chess/basic';
import { boardToFen } from '$lib/chess/fen';
import {
	createBoardFromOpeningNode,
	matchOpeningNextNode,
	getOpenings,
	type Opening,
} from '$lib/chess/openings';
import { PGN, type PGNMoveNode } from '$lib/chess/pgn';

const opening = makeOpening(`
	1. e4 e5 2. Nf3 {Develop the knight}
	(2. Bc4 {Develop the bishop} Nc6)
	2... Nc6
	(2... Nf6)
`);

function makeOpening(pgn: string): Opening {
	const [tree, error] = PGN.parse(pgn);
	if (error) throw new Error(`Failed to parse test PGN: ${JSON.stringify(error)}`);
	return {
		name: 'Test Opening',
		color: PieceColor.WHITE,
		fen: tree.fen,
		rootNode: tree.root,
	};
}

function requireNext(node: PGNMoveNode): PGNMoveNode {
	if (!node.next) throw new Error(`Expected a move after ${moveToLongAlgebraic(node.move)}`);
	return node.next;
}

describe('findNextOpeningNode', () => {
	it('advances through the main line', () => {
		const e5 = requireNext(opening.rootNode);
		const [node, error] = matchOpeningNextNode(opening, opening.rootNode, e5.move);

		expect(error).toBeUndefined();
		expect(node).toBe(e5);
	});

	it('selects a variation at a divergence', () => {
		const e5 = requireNext(opening.rootNode);
		const bishopVariation = requireNext(e5).variations[0];
		const [node, error] = matchOpeningNextNode(opening, e5, bishopVariation.move);

		expect(error).toBeUndefined();
		expect(moveToLongAlgebraic(node!.move)).toBe('Bf1c4');
	});

	it('reports comments for every expected continuation', () => {
		const e5 = requireNext(opening.rootNode);
		const wrongMove = makeOpening('1. d4').rootNode.move;
		const [node, error] = matchOpeningNextNode(opening, e5, wrongMove);

		expect(node).toBeUndefined();
		expect(error).toBe(
			'Move "d4" does not match Test Opening. Expected Ng1f3 (Develop the knight) or Bf1c4 (Develop the bishop).'
		);
	});

	it('reports that a completed branch has no continuation', () => {
		const e5 = requireNext(opening.rootNode);
		const bishopVariation = requireNext(e5).variations[0];
		const leaf = requireNext(bishopVariation);

		expect(matchOpeningNextNode(opening, leaf, opening.rootNode.move)).toEqual([
			undefined,
			'Opening line is finished, no next move available.',
		]);
	});
});

describe('createBoardFromOpeningNode', () => {
	it('includes the root move', () => {
		const [board, error] = createBoardFromOpeningNode(opening, opening.rootNode);

		expect(error).toBeUndefined();
		expect(boardToFen(board!)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
	});

	it('replays a variation in root-to-node order', () => {
		const e5 = requireNext(opening.rootNode);
		const bishopVariation = requireNext(e5).variations[0];
		const leaf = requireNext(bishopVariation);
		const [board, error] = createBoardFromOpeningNode(opening, leaf);

		expect(error).toBeUndefined();
		expect(boardToFen(board!)).toBe(
			'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3'
		);
	});

	it('rejects a node from another tree', () => {
		const foreignNode = makeOpening('1. d4').rootNode;
		const [board, error] = createBoardFromOpeningNode(opening, foreignNode);

		expect(board).toBeUndefined();
		expect(error?.message).toBe('No node line found');
	});
});

describe('production openings', () => {
	it('parses each opening as a non-empty tree', () => {
		const openings = getOpenings();

		expect(openings.length).toBeGreaterThan(0);
		for (const productionOpening of openings) {
			expect(productionOpening.rootNode.move, productionOpening.name).toBeDefined();
			expect(productionOpening.fen, productionOpening.name).not.toBe('');
		}
	});
});
