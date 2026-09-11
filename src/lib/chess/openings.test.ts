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
		rootNodes: tree.roots,
	};
}

function requireRoot(opening: Opening): PGNMoveNode {
	const root = opening.rootNodes[0];
	if (!root) throw new Error(`Expected a root move for ${opening.name}`);
	return root;
}

function requireNext(node: PGNMoveNode): PGNMoveNode {
	const nextNode = node.next[0];
	if (!nextNode) throw new Error(`Expected a move after ${moveToLongAlgebraic(node.move)}`);
	return nextNode;
}

function requireAlternative(node: PGNMoveNode): PGNMoveNode {
	const alternative = node.next[1];
	if (!alternative)
		throw new Error(`Expected an alternative after ${moveToLongAlgebraic(node.move)}`);
	return alternative;
}

describe('findNextOpeningNode', () => {
	it('advances through the main line', () => {
		const rootNode = requireRoot(opening);
		const e5 = requireNext(rootNode);
		const [node, error] = matchOpeningNextNode(opening, rootNode, e5.move);

		expect(error).toBeUndefined();
		expect(node).toBe(e5);
	});

	it('selects a variation at a divergence', () => {
		const rootNode = requireRoot(opening);
		const e5 = requireNext(rootNode);
		const bishopVariation = requireAlternative(e5);
		const [node, error] = matchOpeningNextNode(opening, e5, bishopVariation.move);

		expect(error).toBeUndefined();
		expect(moveToLongAlgebraic(node!.move)).toBe('Bf1c4');
	});

	it('reports comments for every expected continuation', () => {
		const rootNode = requireRoot(opening);
		const e5 = requireNext(rootNode);
		const wrongMove = requireRoot(makeOpening('1. d4')).move;
		const [node, error] = matchOpeningNextNode(opening, e5, wrongMove);

		expect(node).toBeUndefined();
		expect(error).toBe(
			'Move "d4" does not match Test Opening. Expected Ng1f3 (Develop the knight) or Bf1c4 (Develop the bishop).'
		);
	});

	it('reports that a completed branch has no continuation', () => {
		const rootNode = requireRoot(opening);
		const e5 = requireNext(rootNode);
		const bishopVariation = requireAlternative(e5);
		const leaf = requireNext(bishopVariation);

		expect(matchOpeningNextNode(opening, leaf, rootNode.move)).toEqual([
			undefined,
			'Opening line is finished, no next move available.',
		]);
	});
});

describe('createBoardFromOpeningNode', () => {
	it('includes the root move', () => {
		const [board, error] = createBoardFromOpeningNode(opening, requireRoot(opening));

		expect(error).toBeUndefined();
		expect(boardToFen(board!)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
	});

	it('replays a variation in root-to-node order', () => {
		const rootNode = requireRoot(opening);
		const e5 = requireNext(rootNode);
		const bishopVariation = requireAlternative(e5);
		const leaf = requireNext(bishopVariation);
		const [board, error] = createBoardFromOpeningNode(opening, leaf);

		expect(error).toBeUndefined();
		expect(boardToFen(board!)).toBe(
			'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3'
		);
	});
});

describe('production openings', () => {
	it('parses each opening as a non-empty tree', () => {
		const openings = getOpenings();

		expect(openings.length).toBeGreaterThan(0);
		for (const productionOpening of openings) {
			expect(productionOpening.rootNodes.length, productionOpening.name).toBeGreaterThan(0);
			expect(productionOpening.rootNodes[0].move, productionOpening.name).toBeDefined();
			expect(productionOpening.fen, productionOpening.name).not.toBe('');
		}
	});
});
