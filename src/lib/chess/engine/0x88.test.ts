import { describe, expect, it } from 'vitest';

import {
	Board0x88,
	makePiece,
	pieceType,
	pieceColor,
	square,
	fileOf,
	rankOf,
	isOnBoard,
	squareToAlgebraic,
	algebraicToSquare,
	OFF_BOARD,
	encodeMove,
	moveFrom,
	moveTo,
	moveFlags,
	promotionType,
	isCaptureFlag,
	isPromotionFlag,
	moveToLongAlgebraic,
	FLAG_QUIET,
	FLAG_CAPTURE,
	FLAG_EP_CAPTURE,
	FLAG_DOUBLE_PAWN,
	FLAG_PROMO_QUEEN,
	FLAG_PROMO_KNIGHT,
	FLAG_PROMO_KNIGHT_CAPTURE,
	FLAG_PROMO_QUEEN_CAPTURE,
	FLAG_KING_CASTLE,
	CASTLE_WK,
	CASTLE_WQ,
	CASTLE_BK,
	CASTLE_BQ,
	PieceType,
	PieceColor,
	BoardPiece
} from '$lib/chess/engine/0x88';
import { INITIAL_FEN } from '$lib/chess/fen';

// --- helpers ----------------------------------------------------------------

function legalMoves(fen: string): string[] {
	const b = new Board0x88(fen);
	const buf = b.allocateMoveBuffer();
	const n = b.generateLegalMoves(buf);
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(moveToLongAlgebraic(buf[i]));
	return out.sort();
}

function pseudoMoves(fen: string): string[] {
	const b = new Board0x88(fen);
	const buf = b.allocateMoveBuffer();
	const n = b.generatePseudoLegalMoves(buf);
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(moveToLongAlgebraic(buf[i]));
	return out.sort();
}

function snapshot(b: Board0x88): string {
	return JSON.stringify({
		board: Array.from(b.board),
		turn: b.turn,
		castling: b.castling,
		ep: b.epSquare,
		hmc: b.halfMoveClock,
		fmn: b.fullMoveNumber,
		k: Array.from(b.kingSquare)
	});
}

// --- 1. Square / coordinate helpers -----------------------------------------

describe('square / coordinate helpers', () => {
	it('composes squares from file and rank', () => {
		expect(square(4, 0)).toBe(algebraicToSquare('e1'));
		expect(fileOf(square(4, 0))).toBe(4);
		expect(rankOf(square(4, 0))).toBe(0);
	});

	it('round-trips algebraic <-> 0x88', () => {
		expect(squareToAlgebraic(algebraicToSquare('e4'))).toBe('e4');
		expect(squareToAlgebraic(algebraicToSquare('a1'))).toBe('a1');
		expect(squareToAlgebraic(algebraicToSquare('h8'))).toBe('h8');
		expect(squareToAlgebraic(0)).toBe('a1');
		expect(squareToAlgebraic(119)).toBe('h8');
	});

	it('detects on-board vs off-board squares', () => {
		expect(isOnBoard(0)).toBe(true);
		expect(isOnBoard(119)).toBe(true);
		expect(isOnBoard(8)).toBe(false);
		expect(isOnBoard(0x88)).toBe(false);
		expect(isOnBoard(120)).toBe(false);
	});

	it('returns OFF_BOARD for invalid algebraic input', () => {
		expect(algebraicToSquare('z9')).toBe(OFF_BOARD);
		expect(OFF_BOARD).toBe(-1);
	});
});

// --- 2. Piece encoding -------------------------------------------------------

describe('piece encoding', () => {
	it('builds and decodes piece codes', () => {
		expect(makePiece(PieceType.QUEEN, PieceColor.BLACK)).toBe(BoardPiece.B_QUEEN);
		expect(makePiece(PieceType.PAWN, PieceColor.WHITE)).toBe(BoardPiece.W_PAWN);
		expect(pieceType(BoardPiece.B_ROOK)).toBe(PieceType.ROOK);
		expect(pieceType(BoardPiece.W_KING)).toBe(PieceType.KING);
		expect(pieceColor(BoardPiece.W_PAWN)).toBe(PieceColor.WHITE);
		expect(pieceColor(BoardPiece.B_PAWN)).toBe(PieceColor.BLACK);
	});
});

// --- 3. Move encoding round-trip ---------------------------------------------

describe('move encoding', () => {
	it('round-trips from / to / flags', () => {
		const triples: Array<[number, number, number]> = [
			[algebraicToSquare('e2'), algebraicToSquare('e4'), FLAG_DOUBLE_PAWN],
			[algebraicToSquare('a1'), algebraicToSquare('h8'), FLAG_QUIET],
			[algebraicToSquare('d4'), algebraicToSquare('e5'), FLAG_CAPTURE],
			[algebraicToSquare('e7'), algebraicToSquare('e8'), FLAG_PROMO_QUEEN]
		];
		for (const [from, to, flags] of triples) {
			const move = encodeMove(from, to, flags);
			expect(moveFrom(move)).toBe(from);
			expect(moveTo(move)).toBe(to);
			expect(moveFlags(move)).toBe(flags);
		}
	});

	it('maps promotion flags to piece types', () => {
		expect(promotionType(FLAG_PROMO_QUEEN)).toBe(PieceType.QUEEN);
		expect(promotionType(FLAG_PROMO_KNIGHT_CAPTURE)).toBe(PieceType.KNIGHT);
	});

	it('classifies capture and promotion flags', () => {
		expect(isCaptureFlag(FLAG_QUIET)).toBe(false);
		expect(isCaptureFlag(FLAG_CAPTURE)).toBe(true);
		expect(isCaptureFlag(FLAG_EP_CAPTURE)).toBe(true);
		expect(isPromotionFlag(FLAG_CAPTURE)).toBe(false);
		expect(isPromotionFlag(FLAG_PROMO_QUEEN)).toBe(true);
		expect(isCaptureFlag(FLAG_PROMO_QUEEN_CAPTURE)).toBe(true);
		expect(isPromotionFlag(FLAG_PROMO_QUEEN_CAPTURE)).toBe(true);
	});

	it('renders moves to long algebraic strings', () => {
		expect(
			moveToLongAlgebraic(
				encodeMove(algebraicToSquare('e7'), algebraicToSquare('e8'), FLAG_PROMO_QUEEN)
			)
		).toBe('e7e8q');
		expect(
			moveToLongAlgebraic(
				encodeMove(algebraicToSquare('e2'), algebraicToSquare('e4'), FLAG_DOUBLE_PAWN)
			)
		).toBe('e2e4');
	});
});

// --- 4. loadFen --------------------------------------------------------------

describe('loadFen', () => {
	it('parses the initial position', () => {
		const b = new Board0x88(INITIAL_FEN);
		expect(b.turn).toBe(PieceColor.WHITE);
		expect(b.castling).toBe(0b1111);
		expect(b.board[algebraicToSquare('e1')]).toBe(BoardPiece.W_KING);
		expect(b.board[algebraicToSquare('e8')]).toBe(BoardPiece.B_KING);
		expect(b.board[algebraicToSquare('d1')]).toBe(BoardPiece.W_QUEEN);
		expect(b.kingSquare[PieceColor.WHITE]).toBe(algebraicToSquare('e1'));
		expect(b.kingSquare[PieceColor.BLACK]).toBe(algebraicToSquare('e8'));
	});

	it('parses en passant target and clocks', () => {
		const b = new Board0x88('4k3/8/8/3pP3/8/8/8/4K3 w - d6 5 9');
		expect(b.epSquare).toBe(algebraicToSquare('d6'));
		expect(b.halfMoveClock).toBe(5);
		expect(b.fullMoveNumber).toBe(9);
		expect(b.turn).toBe(PieceColor.WHITE);
	});

	it('parses side to move and partial castling rights', () => {
		const b = new Board0x88('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b kq - 0 1');
		expect(b.turn).toBe(PieceColor.BLACK);
		expect(b.castling).toBe(CASTLE_BK | CASTLE_BQ);
	});
});

// --- 5. isSquareAttacked -----------------------------------------------------

describe('isSquareAttacked', () => {
	it('white pawn attacks the two forward diagonals only', () => {
		const b = new Board0x88('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1');
		expect(b.isSquareAttacked(algebraicToSquare('c5'), PieceColor.WHITE)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('e5'), PieceColor.WHITE)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('d5'), PieceColor.WHITE)).toBe(false);
	});

	it('black pawn attacks the two forward diagonals only', () => {
		const b = new Board0x88('4k3/8/8/4p3/8/8/8/4K3 w - - 0 1');
		expect(b.isSquareAttacked(algebraicToSquare('d4'), PieceColor.BLACK)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('f4'), PieceColor.BLACK)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('e4'), PieceColor.BLACK)).toBe(false);
	});

	it('detects knight attacks', () => {
		const b = new Board0x88('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1');
		// Knight on d4 attacks these eight squares.
		for (const sq of ['c6', 'e6', 'b5', 'f5', 'b3', 'f3', 'c2', 'e2']) {
			expect(b.isSquareAttacked(algebraicToSquare(sq), PieceColor.WHITE)).toBe(true);
		}
		// Not these.
		expect(b.isSquareAttacked(algebraicToSquare('d6'), PieceColor.WHITE)).toBe(false);
		expect(b.isSquareAttacked(algebraicToSquare('d5'), PieceColor.WHITE)).toBe(false);
	});

	it('detects rook attacks along rank/file with blockers', () => {
		// Rook a1, blocker (own pawn) on a4. The rook attacks every square up to
		// and including a4, but nothing beyond it.
		const b = new Board0x88('4k3/8/8/8/P7/8/8/R3K3 w - - 0 1');
		expect(b.isSquareAttacked(algebraicToSquare('a3'), PieceColor.WHITE)).toBe(true);
		// a4 is the blocker; a5 lies beyond it on the same ray.
		expect(b.isSquareAttacked(algebraicToSquare('a5'), PieceColor.WHITE)).toBe(false);
		expect(b.isSquareAttacked(algebraicToSquare('a8'), PieceColor.WHITE)).toBe(false);
		// Along the 1st rank the rook reaches b1/c1/d1 (king sits on e1).
		expect(b.isSquareAttacked(algebraicToSquare('b1'), PieceColor.WHITE)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('c1'), PieceColor.WHITE)).toBe(true);
	});

	it('detects bishop attacks along a diagonal with blockers', () => {
		// Bishop c1 attacks the c1-h6 diagonal, blocked by an own pawn on f4.
		const b = new Board0x88('4k3/8/8/8/5P2/8/8/2B1K3 w - - 0 1');
		expect(b.isSquareAttacked(algebraicToSquare('d2'), PieceColor.WHITE)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('e3'), PieceColor.WHITE)).toBe(true);
		// f4 is the blocker; h6 lies beyond it on the same diagonal and is not
		// reachable by any other white piece.
		expect(b.isSquareAttacked(algebraicToSquare('h6'), PieceColor.WHITE)).toBe(false);
		// b2 / a3 on the other (open) diagonal.
		expect(b.isSquareAttacked(algebraicToSquare('b2'), PieceColor.WHITE)).toBe(true);
		expect(b.isSquareAttacked(algebraicToSquare('a3'), PieceColor.WHITE)).toBe(true);
	});
});

// --- 6. Pseudo-legal generation counts ---------------------------------------

describe('pseudo-legal generation', () => {
	it('produces 20 moves from the initial position', () => {
		expect(pseudoMoves(INITIAL_FEN)).toHaveLength(20);
	});

	it('produces 48 moves in kiwipete', () => {
		const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
		expect(pseudoMoves(kiwipete)).toHaveLength(48);
	});

	it('includes castling moves for white', () => {
		const moves = pseudoMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
		expect(moves).toContain('e1g1');
		expect(moves).toContain('e1c1');
	});

	it('includes en passant captures', () => {
		const moves = pseudoMoves('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
		expect(moves).toContain('e5d6');
	});

	it('includes all four promotions from a7', () => {
		const moves = pseudoMoves('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		const fromA7 = moves.filter((m) => m.startsWith('a7a8'));
		expect(fromA7.sort()).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
	});
});

// --- 7. Legal move filtering -------------------------------------------------

describe('legal move filtering', () => {
	it('keeps a pinned piece on the pin line', () => {
		// White rook e2 is pinned to its king (e1) by the black rook on e8.
		const moves = legalMoves('4r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
		expect(moves).toContain('e2e8'); // capture along the pin
		expect(moves).toContain('e2e5'); // slide along the pin
		expect(moves).not.toContain('e2d2'); // leaving the file exposes the king
		expect(moves).not.toContain('e2f2');
	});

	it("returns 0 legal moves for checkmate (fool's mate)", () => {
		const b = new Board0x88('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
		const buf = b.allocateMoveBuffer();
		expect(b.generateLegalMoves(buf)).toBe(0);
	});

	it('returns 0 legal moves for stalemate', () => {
		const b = new Board0x88('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
		const buf = b.allocateMoveBuffer();
		expect(b.generateLegalMoves(buf)).toBe(0);
	});

	it('forces the king to safety when in check', () => {
		// White king e1 in check from the black rook on e8 (open e-file).
		const fen = '4r3/8/8/8/8/8/8/4K3 w - - 0 1';
		const b = new Board0x88(fen);
		const buf = b.allocateMoveBuffer();
		const n = b.generateLegalMoves(buf);
		expect(n).toBeGreaterThan(0);
		// Every legal move must leave the white king unattacked.
		for (let i = 0; i < n; i++) {
			const move = buf[i];
			b.makeMove(move);
			expect(b.isSquareAttacked(b.kingSquare[PieceColor.WHITE], PieceColor.BLACK)).toBe(false);
			b.unmakeMove(move);
		}
	});
});

// --- 8. make / unmake invariants ---------------------------------------------

describe('make / unmake invariants', () => {
	const fens = [
		INITIAL_FEN,
		'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', // kiwipete
		'4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', // en passant
		'4k3/P7/8/8/8/8/8/4K3 w - - 0 1', // promotion
		'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' // castling
	];

	for (const fen of fens) {
		it(`restores state byte-for-byte for every pseudo-legal move: ${fen}`, () => {
			const b = new Board0x88(fen);
			const buf = b.allocateMoveBuffer();
			const n = b.generatePseudoLegalMoves(buf);
			const before = snapshot(b);
			for (let i = 0; i < n; i++) {
				const move = buf[i];
				b.makeMove(move);
				b.unmakeMove(move);
				expect(snapshot(b)).toBe(before);
			}
		});
	}

	it('applies king-side castling correctly', () => {
		const b = new Board0x88('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
		b.makeMove(encodeMove(algebraicToSquare('e1'), algebraicToSquare('g1'), FLAG_KING_CASTLE));
		expect(b.board[algebraicToSquare('g1')]).toBe(BoardPiece.W_KING);
		expect(b.board[algebraicToSquare('f1')]).toBe(BoardPiece.W_ROOK);
		expect(b.board[algebraicToSquare('e1')]).toBe(PieceType.EMPTY);
		expect(b.board[algebraicToSquare('h1')]).toBe(PieceType.EMPTY);
		expect(b.kingSquare[PieceColor.WHITE]).toBe(algebraicToSquare('g1'));
		// White's castling bits cleared, black's preserved.
		expect(b.castling & (CASTLE_WK | CASTLE_WQ)).toBe(0);
		expect(b.castling & (CASTLE_BK | CASTLE_BQ)).toBe(CASTLE_BK | CASTLE_BQ);
	});

	it('applies en passant capture correctly', () => {
		const b = new Board0x88('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
		b.makeMove(encodeMove(algebraicToSquare('e5'), algebraicToSquare('d6'), FLAG_EP_CAPTURE));
		expect(b.board[algebraicToSquare('d6')]).toBe(BoardPiece.W_PAWN);
		expect(b.board[algebraicToSquare('e5')]).toBe(PieceType.EMPTY);
		// The captured black pawn that stood on d5 is gone.
		expect(b.board[algebraicToSquare('d5')]).toBe(PieceType.EMPTY);
	});

	it('applies a queen promotion correctly', () => {
		const b = new Board0x88('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		b.makeMove(encodeMove(algebraicToSquare('a7'), algebraicToSquare('a8'), FLAG_PROMO_QUEEN));
		expect(b.board[algebraicToSquare('a8')]).toBe(BoardPiece.W_QUEEN);
		expect(b.board[algebraicToSquare('a7')]).toBe(PieceType.EMPTY);
	});
});

// --- 9. Evaluation -----------------------------------------------------------

describe('evaluation', () => {
	it('is symmetric (zero) in the initial position', () => {
		const b = new Board0x88(INITIAL_FEN);
		expect(b.evaluateMaterial()).toBe(0);
		expect(b.evaluatePST()).toBe(0);
		expect(b.evaluateMobility()).toBe(0);
		expect(b.evaluate()).toBe(0);
	});

	it("scores material balance from White's perspective", () => {
		expect(new Board0x88('4k3/8/8/8/8/8/8/3QK3 w - - 0 1').evaluateMaterial()).toBe(900);
		expect(new Board0x88('3qk3/8/8/8/8/8/8/4K3 w - - 0 1').evaluateMaterial()).toBe(-900);
	});

	it('does not change the side to move when scoring mobility', () => {
		const b = new Board0x88('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
		const before = b.turn;
		b.evaluateMobility();
		expect(b.turn).toBe(before);

		const bb = new Board0x88('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
		const beforeB = bb.turn;
		bb.evaluateMobility();
		expect(bb.turn).toBe(beforeB);
	});

	it('is positive when White is clearly winning and negative in the mirror', () => {
		expect(new Board0x88('4k3/8/8/8/8/8/8/3QK3 w - - 0 1').evaluate()).toBeGreaterThan(0);
		expect(new Board0x88('3qk3/8/8/8/8/8/8/4K3 w - - 0 1').evaluate()).toBeLessThan(0);
	});
});
