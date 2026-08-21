import { describe, expect, it } from 'vitest';

import { moveToLongAlgebraic } from '$lib/chess/algebraic';
import { ChessSquare, type ChessSquareStr } from '$lib/chess/basic';
import { PGNParser } from '$lib/chess/pgn';
import { PieceId } from '$lib/chess/piece';

describe('chess/PGN', () => {
	it('parses a full PGN string with metadata and moves', () => {
		const result = PGNParser.parseMoves(fullTestPgn);
		const { moves, tags } = result;

		const movePositions = moves.map((m) => ChessSquare.toString(m.toSquare));
		expect(movePositions).toEqual(expectedPositions);

		const movePieces = moves.map((m) => m.movedPiece);
		expect(movePieces).toEqual(expectedPieces);

		const whiteComment = moves[2].comment;
		expect(whiteComment).toBe('testing comment for white');
		const blackComment = moves[7].comment;
		expect(blackComment).toBe('testing comment for black');
		const emptyComment = moves[10].comment;
		expect(emptyComment).toBe(undefined);

		expect(tags).toEqual({
			Name: 'Full test for PGN format',
		});
	});

	it('parses moves without line breaks', () => {
		expect(longAlgebraicMoves('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')).toEqual([
			'e4',
			'e5',
			'Ng1f3',
			'Nb8c6',
			'Bf1b5',
			'a6',
		]);
	});

	it('parses optional black move numbers', () => {
		expect(longAlgebraicMoves('1. e4 1... e5 2. Nf3 2... Nc6')).toEqual([
			'e4',
			'e5',
			'Ng1f3',
			'Nb8c6',
		]);
	});

	it('parses a game that starts with a numbered black move from a custom FEN', () => {
		const pgn = `
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 7"]
7... e5 8. Nf3
		`.trim();

		expect(longAlgebraicMoves(pgn)).toEqual(['e5', 'Ng1f3']);
	});

	it.each([
		['white move with three dots', '1... e4', /Invalid white move number/],
		['black move with one dot', '1. e4 1. e5', /Invalid black move number/],
		['incorrect white move number', '2. e4', /Expected move number 1/],
		['incorrect black move number', '1. e4 2... e5', /Expected move number 1/],
	])('rejects an invalid %s', (_case, pgn, expectedError) => {
		expect(() => PGNParser.parseMoves(pgn)).toThrow(expectedError);
	});

	it('parses games that start from a custom FEN', () => {
		const pgn = `
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
1. e4
		`.trim();

		const result = PGNParser.parseMoves(pgn);

		expect(result.moves).toHaveLength(1);
		expect(ChessSquare.toString(result.moves[0].fromSquare)).toBe('e2');
		expect(result.tags['FEN']).toContain('4k3');
	});

	it('propagates an invalid custom FEN as a PGN parse error', () => {
		expect(() => PGNParser.parseMoves('[FEN "invalid"]\n1. e4')).toThrow(/FEN/i);
	});

	it.todo('ignores a variation after a white move without changing the main line', () => {
		expect(longAlgebraicMoves('1. e4 (1. d4) e5')).toEqual(['e4', 'e5']);
	});

	it.todo('ignores a variation after a black move without changing the main line', () => {
		expect(longAlgebraicMoves('1. e4 e5 (1... c5) 2. Nf3')).toEqual(['e4', 'e5', 'Ng1f3']);
	});

	it.todo('ignores nested variations without changing the main line', () => {
		expect(longAlgebraicMoves('1. e4 (1. d4 (1. c4) d5) e5 2. Nf3')).toEqual(['e4', 'e5', 'Ng1f3']);
	});

	it.todo(
		'accepts every standard result marker after a move pair and excludes it from moves',
		() => {
			for (const marker of ['1-0', '0-1', '1/2-1/2', '*']) {
				expect(longAlgebraicMoves(`1. e4 e5 ${marker}`)).toEqual(['e4', 'e5']);
			}
		}
	);

	it.todo('accepts a result marker after a white move and excludes it from moves', () => {
		expect(longAlgebraicMoves('1. e4 *')).toEqual(['e4']);
	});

	it.todo('rejects moves after the result marker');

	it('ignores PGN line comments', () => {
		const pgn = `
1. e4 e5
2. Nf3 Nc6 ; ignored comment
		`.trim();

		const result = PGNParser.parseMoves(pgn);

		expect(result.moves.map((move) => moveToLongAlgebraic(move))).toEqual([
			'e4',
			'e5',
			'Ng1f3',
			'Nb8c6',
		]);
	});

	it('throws on malformed PGN input', () => {
		expect(() => PGNParser.parseMoves('1. e4 e5 (')).toThrow(/Unmatched opening parenthesis/);
		expect(() => PGNParser.parseMoves('1. e5')).toThrow(/Failed to parse white move/);
	});

	it('keeps the main line unchanged when comments are present', () => {
		expect(longAlgebraicMoves('1. e4 {alternative ideas omitted} e5 2. Nf3')).toEqual([
			'e4',
			'e5',
			'Ng1f3',
		]);
	});
});

function longAlgebraicMoves(pgn: string): string[] {
	return PGNParser.parseMoves(pgn).moves.map((move) => moveToLongAlgebraic(move));
}

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

const testPgnWithVariations = `
[name "PGN test with variations"]

1. d4 (1. e4 e5 2. Nc3 Nf6) (1. Nf3 e5 2. Nc3 Nf6) 1... e5 (1... d5 2. Nc3 Nf6)
(1... Nc6 2. Nc3 Nf6) 2. Nc3 (2. c3 Nf6) (2. Nf3 Nf6) 2... Nf6 *
`.trim();

const cursedPgn = `
% this whole line should be ignored

[Event "Cursed \\"PGN\\" Test"]
[Site "Somewhere\\Nowhere"]
[Date "2026.08.21"]
[Round "?"]
[White "White, Player"]
[Black "Black, Player"]
[Result "1-0"]
[Annotator ""]
[CustomTag "arbitrary value"]

{comment before movetext}

1. e4$1 {brace comment; semicolon is inert here}
1... e5 $2
2.Nf3 Nc6
3.Bb5 a6
(3...Nf6 $5
4.O-O Nxe4
(4...Be7 {nested RAV} 5.Re1)
5.Re1 Nd6
)
4.Ba4 Nf6 ; rest-of-line comment { braces are inert here }
5.O-O Be7
6.Re1 b5
7.Bb3 d6
8.c3 O-O
9.h3 Nb8 $14
10.d4 Nbd7
11.c4 exd4
12.Nxd4 Bb7
13.Nc3 Re8
14.Bf4 Bf8
15.cxb5 axb5
16.Ndxb5 Nxe4
17.Nxe4 Rxe4
18.Rxe4 Bxe4
19.Qh5 Bg6
20.Qd5 Nc5
21.Nxc7 Qxc7
22.Qxa8 Nxb3
23.axb3 Qc2
24.Re1 Qxb3
25.Re8 Qd1+
26.Kh2 Qd4
27.Be3 Qxb2
28.Qd8 Qe5+
29.g3 Be4
30.Rxf8+ Kxf8
31.Bf4 Qe6
32.Bxd6+ Kg8
33.Qf8# 1-0
`;

const expectedPositions: ChessSquareStr[] = [
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
	'e8',
];

const expectedPieces: PieceId[] = [
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_PAWN,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_BISHOP,
	PieceId.WHITE_KNIGHT,
	PieceId.BLACK_KNIGHT,
	PieceId.WHITE_PAWN,
	PieceId.BLACK_KING,
	PieceId.WHITE_QUEEN,
	PieceId.BLACK_KNIGHT,
	PieceId.WHITE_BISHOP,
	PieceId.BLACK_BISHOP,
	PieceId.WHITE_KING,
	PieceId.BLACK_BISHOP,
	PieceId.WHITE_QUEEN,
	PieceId.BLACK_QUEEN,
	PieceId.WHITE_QUEEN,
	PieceId.BLACK_KNIGHT,
];
