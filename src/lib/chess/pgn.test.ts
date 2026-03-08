import { describe, expect, it } from 'vitest';

import type { PositionStr } from '$lib/chess/board';
import { parsePGNMoves } from '$lib/chess/pgn';
import type { PieceId } from '$lib/chess/piece';

describe('PGN parser', () => {
	it('parses a full PGN string with metadata and moves', () => {
		const result = parsePGNMoves(fullTestPgn);
		const { moves, tags } = result;

		const movePositions = moves.map((m) => m.to.toString());
		expect(movePositions).toEqual(expectedPositions);

		const movePieces = moves.map((m) => m.piece);
		expect(movePieces).toEqual(expectedPieces);

		const whiteComment = moves[2].comment;
		expect(whiteComment).toBe('testing comment for white');
		const blackComment = moves[7].comment;
		expect(blackComment).toBe('testing comment for black');
		const emptyComment = moves[10].comment;
		expect(emptyComment).toBe(undefined);

		expect(tags).toEqual({
			Name: 'Full test for PGN format'
		});
	});

	it('parses games that start from a custom FEN', () => {
		const pgn = `
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
1. e4
		`.trim();

		const result = parsePGNMoves(pgn);

		expect(result.moves).toHaveLength(1);
		expect(result.moves[0]?.from.toString()).toBe('e2');
		expect(result.tags['FEN']).toContain('4k3');
	});

	it('ignores PGN line comments', () => {
		const pgn = `
1. e4 e5
2. Nf3 Nc6 ; ignored comment
		`.trim();

		const result = parsePGNMoves(pgn);

		expect(result.moves.map((move) => move.algebraic)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
	});

	it('throws on malformed PGN input', () => {
		expect(() => parsePGNMoves('1. e4 e5 (')).toThrow(/Unmatched opening parenthesis/);
		expect(() => parsePGNMoves('1. e5')).toThrow(/Failed to parse white move/);
	});
});

const fullTestPgn = `
 [Name "Full test for PGN format"]
 1. a4 h5
 2. a5 {testing comment for white} h4
 3. a6 h3
 4. axb7 hxg2 {testing comment for black}
 5. bxa8=Q gxh1=Q
 6. e4 e6
 7. e5 d5
 8. exd6 Bxd6
 9. Nc3 Nf6
 10. d4 O-O
 11. Qd3 Nc6
 12. Be3 Bb4
 13. O-O-O Bxc3
 14. Qxc3 Qxh2
 15. Qcxc6 Ne8
 `.trim();

const expectedPositions: PositionStr[] = [
	'a4',
	'h5',
	'a5',
	'h4',
	'a6',
	'h3',
	'b7',
	'g2',
	'a8',
	'h1',
	'e4',
	'e6',
	'e5',
	'd5',
	'd6',
	'd6',
	'c3',
	'f6',
	'd4',
	'g8',
	'd3',
	'c6',
	'e3',
	'b4',
	'c1',
	'c3',
	'c3',
	'h2',
	'c6',
	'e8'
];

const expectedPieces: PieceId[] = [
	'P',
	'p',
	'P',
	'p',
	'P',
	'p',
	'P',
	'p',
	'P',
	'p',
	'P',
	'p',
	'P',
	'p',
	'P',
	'b',
	'N',
	'n',
	'P',
	'k',
	'Q',
	'n',
	'B',
	'b',
	'K',
	'b',
	'Q',
	'q',
	'Q',
	'n'
];
