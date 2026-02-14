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
