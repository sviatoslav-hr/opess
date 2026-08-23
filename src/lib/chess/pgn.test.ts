import { describe, expect, it } from 'vitest';

import { moveToLongAlgebraic } from '$lib/chess/algebraic';
import { ChessSquare, type ChessSquareStr } from '$lib/chess/basic';
import { PGNParser, type PGNMoveNode } from '$lib/chess/pgn';
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
		expect(parsePGNToLongAlgebraicMoves('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')).toEqual([
			'e4',
			'e5',
			'Ng1f3',
			'Nb8c6',
			'Bf1b5',
			'a6',
		]);
	});

	it('treats tabs as whitespace between metadata, moves, and comments', () => {
		const result = PGNParser.parseMoves(
			'\t[Name "Tabbed game"]\t1.\te4\t{king pawn opening}\te5\t2.\tNf3\tNc6\t'
		);

		expect(result.tags).toEqual({ Name: 'Tabbed game' });
		expect(result.moves.map((move) => moveToLongAlgebraic(move))).toEqual([
			'e4',
			'e5',
			'Ng1f3',
			'Nb8c6',
		]);
		expect(result.moves[0].comment).toBe('king pawn opening');
	});

	it('parses optional black move numbers', () => {
		expect(parsePGNToLongAlgebraicMoves('1. e4 1... e5 2. Nf3 2... Nc6')).toEqual([
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

		expect(parsePGNToLongAlgebraicMoves(pgn)).toEqual(['e5', 'Ng1f3']);
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

	describe('variations', () => {
		it('parses multiple variations from white and black moves', () => {
			const { root, tags } = PGNParser.parse(`
[name "PGN test with variations"]
1. d4 (1. e4 e5 2. Nc3 Nf6) (1. Nf3 e5 2. Nc3 Nf6) 1... e5 (1... d5 2. Nc3 Nf6)
(1... Nc6 2. Nc3 Nf6) 2. Nc3 (2. c3 Nf6) (2. Nf3 Nf6) 2... Nf6 *`);

			expect(tags).toEqual({ name: 'PGN test with variations' });
			expect(sequenceToLongAlgebraic(root)).toEqual(['d4', 'e5', 'Nb1c3', 'Ng8f6']);
			expect(root.variations.map(sequenceToLongAlgebraic)).toEqual([
				['e4', 'e5', 'Nb1c3', 'Ng8f6'],
				['Ng1f3', 'e5', 'Nb1c3', 'Ng8f6'],
			]);
			expect(root.next?.variations.map(sequenceToLongAlgebraic)).toEqual([
				['d5', 'Nb1c3', 'Ng8f6'],
				['Nb8c6', 'Nb1c3', 'Ng8f6'],
			]);
			expect(root.next?.next?.variations.map(sequenceToLongAlgebraic)).toEqual([
				['c3', 'Ng8f6'],
				['Ng1f3', 'Ng8f6'],
			]);
		});

		it('parses nested variations and their comments', () => {
			const { root } = PGNParser.parse(
				'1. e4 {main move} e5 (1... c5 {Sicilian} (1... e6 {French}) 2. Nf3 {develop}) 2. Bc4'
			);

			const blackMainMove = root.next;
			const sicilian = blackMainMove?.variations[0];
			const french = sicilian?.variations[0];

			expect(sequenceToLongAlgebraic(root)).toEqual(['e4', 'e5', 'Bf1c4']);
			expect(root.move.comment).toBe('main move');
			expect(sequenceToLongAlgebraic(sicilian)).toEqual(['c5', 'Ng1f3']);
			expect(sicilian?.move.comment).toBe('Sicilian');
			expect(sicilian?.next?.move.comment).toBe('develop');
			expect(sequenceToLongAlgebraic(french)).toEqual(['e6']);
			expect(french?.move.comment).toBe('French');
		});

		it('keeps variations out of the flattened move list', () => {
			expect(parsePGNToLongAlgebraicMoves('1. e4 (1. d4) e5 (1... c5) 2. Nf3')).toEqual([
				'e4',
				'e5',
				'Ng1f3',
			]);
		});

		it.each([
			['before the first move', '(1. d4) 1. e4', /Variation cannot start before a move/],
			['with an unmatched opening parenthesis', '1. e4 (1. d4', /Unmatched opening parenthesis/],
			['with an unmatched closing parenthesis', '1. e4 )', /Unmatched closing parenthesis/],
			['when empty', '1. e4 () e5', /No moves found/],
		])('rejects a variation %s', (_case, pgn, expectedError) => {
			expect(() => PGNParser.parse(pgn)).toThrow(expectedError);
		});
	});

	it.each(['1-0', '0-1', '1/2-1/2', '*'])(
		'accepts the %s result marker after a move pair and excludes it from moves',
		(marker) => {
			expect(parsePGNToLongAlgebraicMoves(`1. e4 e5 ${marker}`)).toEqual(['e4', 'e5']);
		}
	);

	it('accepts a result marker after a white move and excludes it from moves', () => {
		expect(parsePGNToLongAlgebraicMoves('1. e4 *')).toEqual(['e4']);
	});

	it('rejects moves after the result marker', () => {
		expect(() => PGNParser.parseMoves('1. e4 e5 1-0 2. Nf3')).toThrow();
	});

	describe('annotation glyphs', () => {
		it.each(['!', '?', '!!', '??', '!?', '?!'])('parses the %s symbolic glyph', (glyph) => {
			expect(parsePGNToLongAlgebraicMoves(`1. e4${glyph} e5 ${glyph} 2. Nf3`)).toEqual([
				'e4',
				'e5',
				'Ng1f3',
			]);
		});

		it.each([
			['attached', '1. e4$1 e5$2 2. Nf3'],
			['separated by whitespace', '1. e4 $1 e5 $14 2. Nf3'],
		])('parses numeric glyphs %s', (_case, pgn) => {
			expect(parsePGNToLongAlgebraicMoves(pgn)).toEqual(['e4', 'e5', 'Ng1f3']);
		});

		it('keeps a comment after an annotation glyph', () => {
			const { moves } = PGNParser.parseMoves('1. e4! {king pawn opening} e5');

			expect(moves[0].comment).toBe('king pawn opening');
		});

		it('parses annotation glyphs inside a variation', () => {
			const { root } = PGNParser.parse('1. e4! (1. d4?! d5$1) e5');

			expect(sequenceToLongAlgebraic(root)).toEqual(['e4', 'e5']);
			expect(sequenceToLongAlgebraic(root.variations[0])).toEqual(['d4', 'd5']);
		});
	});

	describe('comments', () => {
		it('accepts comments immediately before and after a variation opening parenthesis', () => {
			const { root } = PGNParser.parse(
				'1. e4 {alternative follows}({variation introduction}1. d4 d5)e5'
			);

			expect(root.move.comment).toBe('alternative follows');
			expect(sequenceToLongAlgebraic(root.variations[0])).toEqual(['d4', 'd5']);
			expect(sequenceToLongAlgebraic(root)).toEqual(['e4', 'e5']);
		});

		it('parses a line comment inside a variation', () => {
			const { root } = PGNParser.parse('1. e4 (1. d4 ; queen pawn\nd5) e5');
			const variation = root.variations[0];

			expect(sequenceToLongAlgebraic(variation)).toEqual(['d4', 'd5']);
			expect(variation.move.comment).toBe('queen pawn');
			expect(sequenceToLongAlgebraic(root)).toEqual(['e4', 'e5']);
		});

		it('keeps a comment immediately before a variation closing parenthesis', () => {
			const { root } = PGNParser.parse('1. e4 (1. d4 d5{variation end})e5');
			const variation = root.variations[0];

			expect(sequenceToLongAlgebraic(variation)).toEqual(['d4', 'd5']);
			expect(variation.next?.move.comment).toBe('variation end');
			expect(sequenceToLongAlgebraic(root)).toEqual(['e4', 'e5']);
		});

		it('parses a brace comment after a move', () => {
			const { moves } = PGNParser.parseMoves('1. e4 {king pawn opening} e5');

			expect(moves[0].comment).toBe('king pawn opening');
			expect(moves[1].comment).toBeUndefined();
		});

		it('parses a line comment followed by another move', () => {
			const { moves } = PGNParser.parseMoves('1. e4 ; king pawn opening\ne5');

			expect(moves.map((move) => moveToLongAlgebraic(move))).toEqual(['e4', 'e5']);
			expect(moves[0].comment).toBe('king pawn opening');
		});

		it('parses a line comment at the end of the PGN', () => {
			const { moves } = PGNParser.parseMoves('1. e4 e5 ; classical reply');

			expect(moves[1].comment).toBe('classical reply');
		});

		it('parses a comment between the move number and move', () => {
			const { moves } = PGNParser.parseMoves('1. {first move} e4 e5');

			expect(moves[0].comment).toBe('first move');
		});

		it('parses a brace comment not separated by whitespace', () => {
			const { moves } = PGNParser.parseMoves('1. e4{king pawn opening}e5');

			expect(moves[0].comment).toBe('king pawn opening');
			expect(moves[1].comment).toBeUndefined();
		});

		it('parses a line comment not separated by whitespace', () => {
			const { moves } = PGNParser.parseMoves('1. e4; king pawn opening\ne5');

			expect(moves[0].comment).toBe('king pawn opening');
			expect(moves[1].comment).toBeUndefined();
		});

		it('keeps the last of consecutive comments without whitespace', () => {
			const { moves } = PGNParser.parseMoves('1. e4{first comment}{second comment}e5');

			expect(moves[0].comment).toBe('second comment');
		});

		it('parses a multiline brace comment', () => {
			const { moves } = PGNParser.parseMoves('1. e4 {first line\nsecond line} e5');

			expect(moves[0].comment).toBe('first line\nsecond line');
		});

		it('ignores a comment before movetext', () => {
			const { moves } = PGNParser.parseMoves('{game introduction}1. e4 e5');

			expect(moves.map((move) => moveToLongAlgebraic(move))).toEqual(['e4', 'e5']);
			expect(moves[0].comment).toBeUndefined();
		});

		it('parses a comment before the result marker without whitespace', () => {
			const { moves } = PGNParser.parseMoves('1. e4 e5{final position}1-0');

			expect(moves[1].comment).toBe('final position');
		});

		it('parses an empty comment', () => {
			const { moves } = PGNParser.parseMoves('1. e4 {} e5');

			expect(moves[0].comment).toBe('');
		});

		it('rejects an unterminated brace comment', () => {
			expect(() => PGNParser.parseMoves('1. e4 {unfinished')).toThrow(/Unterminated comment/);
		});

		it('keeps the last of several consecutive comments', () => {
			const { moves } = PGNParser.parseMoves('1. e4 {first comment} {second comment} e5');

			expect(moves[0].comment).toBe('second comment');
		});

		it('trims whitespace in brace and line comments', () => {
			const { moves } = PGNParser.parseMoves(
				'1. e4 {  brace comment  } e5 ;  line comment  \n2. Nf3'
			);

			expect(moves[0].comment).toBe('brace comment');
			expect(moves[1].comment).toBe('line comment');
		});

		it('treats semicolons in brace comments and braces in line comments as text', () => {
			const { moves } = PGNParser.parseMoves(
				'1. e4 {semicolon; remains text} e5 ; braces {remain text}\n2. Nf3'
			);

			expect(moves[0].comment).toBe('semicolon; remains text');
			expect(moves[1].comment).toBe('braces {remain text}');
		});
	});

	it('throws on malformed PGN input', () => {
		expect(() => PGNParser.parseMoves('1. e4 e5 (')).toThrow(/Unmatched opening parenthesis/);
		expect(() => PGNParser.parseMoves('1. e5')).toThrow(/Failed to parse white move/);
	});

	describe('escape lines', () => {
		it('ignores escape lines throughout the PGN', () => {
			const result = PGNParser.parseMoves(
				'% before metadata\n[Name "Escape lines"]\n% before moves\n1. e4\n% between moves\ne5 2. Nf3'
			);

			expect(result.tags).toEqual({ Name: 'Escape lines' });
			expect(result.moves.map((move) => moveToLongAlgebraic(move))).toEqual(['e4', 'e5', 'Ng1f3']);
		});

		it('ignores consecutive escape lines', () => {
			expect(
				parsePGNToLongAlgebraicMoves('1. e4\n% first ignored line\n% second ignored line\ne5')
			).toEqual(['e4', 'e5']);
		});

		it('ignores escape lines in PGN with CRLF line endings', () => {
			expect(parsePGNToLongAlgebraicMoves('1. e4\r\n% ignored\r\ne5')).toEqual(['e4', 'e5']);
		});

		it('does not ignore a percent sign preceded by whitespace', () => {
			expect(() => PGNParser.parseMoves(' % not an escape line\n1. e4')).toThrow(
				/Expected move number/
			);
		});
	});
});

function parsePGNToLongAlgebraicMoves(pgn: string): string[] {
	return PGNParser.parseMoves(pgn).moves.map((move) => moveToLongAlgebraic(move));
}

function sequenceToLongAlgebraic(root: PGNMoveNode | null | undefined): string[] {
	const moves: string[] = [];
	let node = root;
	while (node) {
		moves.push(moveToLongAlgebraic(node.move));
		node = node.next;
	}
	return moves;
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
