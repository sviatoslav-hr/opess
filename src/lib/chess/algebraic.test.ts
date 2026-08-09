import { assert, describe, expect, it } from 'vitest';

import {
	calculateMoveFromAlgebraic,
	moveToAlgebraic,
	moveToLongAlgebraic,
} from '$lib/chess/algebraic';
import { CASTLING_RIGHTS, ChessBoard, ChessMovePacked, Ox88 } from '$lib/chess/engine';
import { loadFen } from '$lib/chess/fen';
import { PieceId, PromotionPiece } from '$lib/chess/piece';

describe('algebraic notation', () => {
	it('parses pawn move', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
		expect(fenError).toBeNullable();

		const [pawnMove, pawnMoveError] = calculateMoveFromAlgebraic(board, 'e4');
		expect(pawnMoveError).toBeNullable(); // This makes the error readable
		assert(pawnMoveError == null); // This convinces the type checker
		expect(Ox88.squareToString(ChessMovePacked.unpackFromSquare(pawnMove))).toBe('e2');
	});

	const pieceCases = [
		['Nf3', '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', 'g1', 'f3'],
		['Bg5', '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'c1', 'g5'],
		['Ra8', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1', 'a8'],
		['Qh5', '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1', 'h5'],
		['Ke2', '4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1', 'e2'],
	] as const;

	it.each(pieceCases)('parses %s from "%s" as %s%s', (algebraic, fen, from, to) => {
		const board = new ChessBoard();
		const fenError = loadFen(board, fen);
		expect(fenError).toBeNullable();
		const [move, moveError] = calculateMoveFromAlgebraic(board, algebraic);
		expect(moveError).toBeNullable();
		assert(moveError == null);

		expect(Ox88.squareToString(ChessMovePacked.unpackFromSquare(move))).toBe(from);
		expect(Ox88.squareToString(ChessMovePacked.unpackToSquare(move))).toBe(to);
	});

	it('parses castling moves', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		expect(fenError).toBeNullable();
		expect(board.castlingRights).toBe(
			CASTLING_RIGHTS.BLACK_KINGSIDE | CASTLING_RIGHTS.WHITE_KINGSIDE
		);
		const [castleMove, castleError] = calculateMoveFromAlgebraic(board, 'O-O');
		expect(castleError).toBeNullable();
		assert(castleMove != null);

		board.applyMove(castleMove);
		expect(board.castlingRights).toBe(CASTLING_RIGHTS.BLACK_KINGSIDE);
		expect(ChessMovePacked.unpackCastingRights(castleMove)).toBe(CASTLING_RIGHTS.BLACK_KINGSIDE);
	});

	it('parses pawn capture', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();

		const [captureMove, captureError] = calculateMoveFromAlgebraic(board, 'exd6');
		expect(captureError).toBeNullable();
		assert(captureMove != null);
		expect(ChessMovePacked.unpackCapturedPiece(captureMove)).toBe(PieceId.BLACK_PAWN);
		expect(Ox88.squareToString(ChessMovePacked.unpackFromSquare(captureMove))).toBe('e5');
	});

	it('parses pawn promotion', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();
		const [promotionMove, promotionError] = calculateMoveFromAlgebraic(board, 'a8=N');
		expect(promotionError).toBeNullable();
		assert(promotionMove != null);
		expect(ChessMovePacked.unpackPromotionKind(promotionMove)).toBe(PieceId.WHITE_KNIGHT);
	});

	it('parses black pawn promotion', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/8/8/8/8/p7/4K3 b - - 0 1');
		expect(fenError).toBeNullable();
		const [blackPromotionMove, blackPromotionError] = calculateMoveFromAlgebraic(board, 'a1=Q');
		expect(blackPromotionError).toBeNullable();
		assert(blackPromotionMove != null);
		expect(ChessMovePacked.unpackPromotionKind(blackPromotionMove)).toBe(PromotionPiece.QUEEN);
	});

	it('rejects ambiguous or malformed notation', () => {
		const board = new ChessBoard();
		let fenError = loadFen(board, '4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1');
		expect(fenError).toBeNullable();
		const [, ambiguousError] = calculateMoveFromAlgebraic(board, 'Nd2');
		expect(ambiguousError).toEqual({
			type: 'ambiguousAlgebraicNotation',
			algebraic: 'Nd2',
			piece: PieceId.WHITE_KNIGHT,
		});

		fenError = loadFen(board, '4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
		expect(fenError).toBeNullable();
		const [, malformedError] = calculateMoveFromAlgebraic(board, 'Qa9');
		expect(malformedError).toEqual({
			type: 'invalidAlgebraicNotation',
			algebraic: 'Qa9',
			context: expect.anything(),
		});
	});

	it('parses disambiguated piece moves', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
		expect(fenError).toBeNullable();
		const [move, moveError] = calculateMoveFromAlgebraic(board, 'Nbd2');
		assert(moveError == null);
		expect(Ox88.squareToString(ChessMovePacked.unpackFromSquare(move))).toBe('b1');
		expect(Ox88.squareToString(ChessMovePacked.unpackToSquare(move))).toBe('d2');
	});

	it('formats captures, castling, and disambiguation when calculating moves', () => {
		const board = new ChessBoard();
		let fenError = loadFen(board, '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const captureMove = board.findMove(
			Ox88.squareFromStr('e5') ?? 0,
			Ox88.squareFromStr('d6') ?? 0
		);
		assert(captureMove != null);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(captureMove))).toBe('exd6');

		fenError = loadFen(board, '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const castleMove = board.findMove(Ox88.squareFromStr('e1') ?? 0, Ox88.squareFromStr('g1') ?? 0);
		assert(castleMove != null);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(castleMove))).toBe('O-O');

		fenError = loadFen(board, '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const knightMove = board.findMove(Ox88.squareFromStr('b1') ?? 0, Ox88.squareFromStr('d2') ?? 0);
		assert(knightMove != null);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(knightMove))).toBe('Nbd2');

		fenError = loadFen(board, '4k3/8/8/8/8/R7/8/R3K3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const rookMove = board.findMove(Ox88.squareFromStr('a1') ?? 0, Ox88.squareFromStr('a2') ?? 0);
		assert(rookMove != null);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(rookMove))).toBe('R1a2');

		fenError = loadFen(board, '4k3/8/8/1N6/8/8/8/1N1NK3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const tripleKnightMove = board.findMove(
			Ox88.squareFromStr('b1') ?? 0,
			Ox88.squareFromStr('c3') ?? 0
		);
		assert(tripleKnightMove != null);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(tripleKnightMove))).toBe('Nb1c3');
	});

	it('formats an ordinary move while castling rights remain', () => {
		const board = new ChessBoard();
		expect(loadFen(board, 'r3k2r/8/8/8/8/8/4P3/R3K2R w KQkq - 0 1')).toBeNullable();
		board.generateLegalMoves();
		const move = board.findMove(Ox88.squareFromStr('e2') ?? 0, Ox88.squareFromStr('e4') ?? 0);
		assert(move != null);

		expect(moveToAlgebraic(board, ChessMovePacked.unpack(move))).toBe('e4');
	});

	const promotionCases = [
		['a8=Q', PromotionPiece.QUEEN],
		['a8=R', PromotionPiece.ROOK],
		['a8=B', PromotionPiece.BISHOP],
		['a8=N', PromotionPiece.KNIGHT],
	] as const;

	it.each(promotionCases)('parses and formats the %s promotion suffix', (algebraic, promotion) => {
		const board = new ChessBoard();
		expect(loadFen(board, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1')).toBeNullable();
		const [move, error] = calculateMoveFromAlgebraic(board, algebraic);
		expect(error).toBeNullable();
		assert(move != null);

		expect(ChessMovePacked.unpackPromotionKind(move)).toBe(promotion);
		expect(moveToAlgebraic(board, ChessMovePacked.unpack(move))).toBe(algebraic);
		expect(moveToLongAlgebraic(ChessMovePacked.unpack(move))).toBe(algebraic);
	});

	const longAlgebraicCases = [
		['e4', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2', 'e4'],
		['Ng1f3', '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', 'g1', 'f3'],
		['exd6', '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1', 'e5', 'd6'],
		['O-O', '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1', 'e1', 'g1'],
	] as const;

	it.each(longAlgebraicCases)('formats long algebraic notation as %s', (expected, fen, from, to) => {
		const board = new ChessBoard();
		expect(loadFen(board, fen)).toBeNullable();
		board.generateLegalMoves();
		const move = board.findMove(Ox88.squareFromStr(from) ?? 0, Ox88.squareFromStr(to) ?? 0);
		assert(move != null);

		expect(moveToLongAlgebraic(ChessMovePacked.unpack(move))).toBe(expected);
	});

	const roundTripCases = [
		['e4', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'],
		['Nf3', '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1'],
		['exd6', '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1'],
		['Nc6', '1n2k3/8/8/8/8/8/8/4K3 b - - 0 1'],
		['exd3', '4k3/8/8/8/4p3/3P4/8/4K3 b - - 0 1'],
	] as const;

	it.each(roundTripCases)('round-trips representative notation %s', (algebraic, fen) => {
		const board = new ChessBoard();
		expect(loadFen(board, fen)).toBeNullable();
		const [move, error] = calculateMoveFromAlgebraic(board, algebraic);
		expect(error).toBeNullable();
		assert(move != null);

		expect(moveToAlgebraic(board, ChessMovePacked.unpack(move))).toBe(algebraic);
	});

	it('formats a black move symmetrically in short and long notation', () => {
		const board = new ChessBoard();
		expect(loadFen(board, '1n2k3/8/8/8/8/8/8/4K3 b - - 0 1')).toBeNullable();
		const [move, error] = calculateMoveFromAlgebraic(board, 'Nc6');
		expect(error).toBeNullable();
		assert(move != null);
		const unpackedMove = ChessMovePacked.unpack(move);

		expect(moveToAlgebraic(board, unpackedMove)).toBe('Nc6');
		expect(moveToLongAlgebraic(unpackedMove)).toBe('Nb8c6');
	});

	it.todo('requires the capture marker exactly when a move captures');
	it.todo('rejects + and # suffixes when the resulting position does not match them');
	it.todo('formats checking moves with + and checkmating moves with #');
});
