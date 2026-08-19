import { assert, describe, expect, it } from 'vitest';

import {
	calculateMoveFromAlgebraic,
	moveToAlgebraic,
	moveToLongAlgebraic,
} from '$lib/chess/algebraic';
import { CastlingRights, CastlingType } from '$lib/chess/basic';
import { ChessBoard, ChessMove, ChessSquare } from '$lib/chess/engine';
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
		expect(ChessSquare.toString(ChessMove.fromSquareOf(pawnMove))).toBe('e2');
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

		expect(ChessSquare.toString(ChessMove.fromSquareOf(move))).toBe(from);
		expect(ChessSquare.toString(ChessMove.toSquareOf(move))).toBe(to);
	});

	it('parses castling moves', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		expect(fenError).toBeNullable();
		expect(board.castlingRights).toBe(
			CastlingRights.BLACK_KINGSIDE | CastlingRights.WHITE_KINGSIDE
		);
		const [castleMove, castleError] = calculateMoveFromAlgebraic(board, 'O-O');
		expect(castleError).toBeNullable();
		assert(castleMove != null);

		board.applyMove(castleMove);
		expect(board.castlingRights).toBe(CastlingRights.BLACK_KINGSIDE);
		expect(ChessMove.castlingTypeOf(castleMove)).toBe(CastlingType.KINGSIDE);
	});

	it('parses pawn capture', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();

		const [captureMove, captureError] = calculateMoveFromAlgebraic(board, 'exd6');
		expect(captureError).toBeNullable();
		assert(captureMove != null);
		expect(ChessMove.capturedPieceOf(captureMove)).toBe(PieceId.BLACK_PAWN);
		expect(ChessSquare.toString(ChessMove.fromSquareOf(captureMove))).toBe('e5');
	});

	it('parses pawn promotion', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();
		const [promotionMove, promotionError] = calculateMoveFromAlgebraic(board, 'a8=N');
		expect(promotionError).toBeNullable();
		assert(promotionMove != null);
		expect(ChessMove.promotionOf(promotionMove)).toBe(PieceId.WHITE_KNIGHT);
	});

	it('parses black pawn promotion', () => {
		const board = new ChessBoard();
		const fenError = loadFen(board, '4k3/8/8/8/8/8/p7/4K3 b - - 0 1');
		expect(fenError).toBeNullable();
		const [blackPromotionMove, blackPromotionError] = calculateMoveFromAlgebraic(board, 'a1=Q');
		expect(blackPromotionError).toBeNullable();
		assert(blackPromotionMove != null);
		expect(ChessMove.promotionOf(blackPromotionMove)).toBe(PromotionPiece.QUEEN);
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
		expect(ChessSquare.toString(ChessMove.fromSquareOf(move))).toBe('b1');
		expect(ChessSquare.toString(ChessMove.toSquareOf(move))).toBe('d2');
	});

	it('formats captures, castling, and disambiguation when calculating moves', () => {
		const board = new ChessBoard();
		let fenError = loadFen(board, '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const captureMove = board.findMove('e5', 'd6');
		assert(captureMove != null);
		expect(moveToAlgebraic(board, ChessMove.unpack(captureMove))).toBe('exd6');

		fenError = loadFen(board, '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const castleMove = board.findMove('e1', 'g1');
		assert(castleMove != null);
		expect(moveToAlgebraic(board, ChessMove.unpack(castleMove))).toBe('O-O');

		fenError = loadFen(board, '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const knightMove = board.findMove('b1', 'd2');
		assert(knightMove != null);
		expect(moveToAlgebraic(board, ChessMove.unpack(knightMove))).toBe('Nbd2');

		fenError = loadFen(board, '4k3/8/8/8/8/R7/8/R3K3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const rookMove = board.findMove('a1', 'a2');
		assert(rookMove != null);
		expect(moveToAlgebraic(board, ChessMove.unpack(rookMove))).toBe('R1a2');

		fenError = loadFen(board, '4k3/8/8/1N6/8/8/8/1N1NK3 w - - 0 1');
		expect(fenError).toBeNullable();
		board.generateLegalMoves();
		const tripleKnightMove = board.findMove('b1', 'c3');
		assert(tripleKnightMove != null);
		expect(moveToAlgebraic(board, ChessMove.unpack(tripleKnightMove))).toBe('Nb1c3');
	});

	it('formats an ordinary move while castling rights remain', () => {
		const board = new ChessBoard();
		expect(loadFen(board, 'r3k2r/8/8/8/8/8/4P3/R3K2R w KQkq - 0 1')).toBeNullable();
		board.generateLegalMoves();
		const move = board.findMove('e2', 'e4');
		assert(move != null);

		expect(moveToAlgebraic(board, ChessMove.unpack(move))).toBe('e4');
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

		expect(ChessMove.promotionOf(move)).toBe(promotion);
		expect(moveToAlgebraic(board, ChessMove.unpack(move))).toBe(algebraic);
		expect(moveToLongAlgebraic(ChessMove.unpack(move))).toBe(algebraic);
	});

	const longAlgebraicCases = [
		['e4', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2', 'e4'],
		['Ng1f3', '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', 'g1', 'f3'],
		['exd6', '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1', 'e5', 'd6'],
		['O-O', '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1', 'e1', 'g1'],
	] as const;

	it.each(longAlgebraicCases)(
		'formats long algebraic notation as %s',
		(expected, fen, from, to) => {
			const board = new ChessBoard();
			expect(loadFen(board, fen)).toBeNullable();
			board.generateLegalMoves();
			const move = board.findMove(from, to);
			assert(move != null);

			expect(moveToLongAlgebraic(ChessMove.unpack(move))).toBe(expected);
		}
	);

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

		expect(moveToAlgebraic(board, ChessMove.unpack(move))).toBe(algebraic);
	});

	it('formats a black move symmetrically in short and long notation', () => {
		const board = new ChessBoard();
		expect(loadFen(board, '1n2k3/8/8/8/8/8/8/4K3 b - - 0 1')).toBeNullable();
		const [move, error] = calculateMoveFromAlgebraic(board, 'Nc6');
		expect(error).toBeNullable();
		assert(move != null);
		const unpackedMove = ChessMove.unpack(move);

		expect(moveToAlgebraic(board, unpackedMove)).toBe('Nc6');
		expect(moveToLongAlgebraic(unpackedMove)).toBe('Nb8c6');
	});

	it.each([
		['Nxd5', 'Nd5', '4k3/8/8/3p4/5N2/8/8/4K3 w - - 0 1'],
		['Nd5', 'Nxd5', '4k3/8/8/8/5N2/8/8/4K3 w - - 0 1'],
		['exd6', 'd6', '4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1'],
		['e6', 'exd6', '4k3/8/8/4P3/8/8/8/4K3 w - - 0 1'],
	] as const)(
		'requires the capture marker in %s and rejects the mismatched notation %s',
		(validAlgebraic, invalidAlgebraic, fen) => {
			const board = new ChessBoard();
			expect(loadFen(board, fen)).toBeNullable();

			const [move, error] = calculateMoveFromAlgebraic(board, validAlgebraic);
			expect(error).toBeNullable();
			expect(move).not.toBeNullable();

			const [invalidMove, invalidError] = calculateMoveFromAlgebraic(board, invalidAlgebraic);
			expect(invalidMove).toBeNullable();
			expect(invalidError).not.toBeNullable();
		}
	);

	it.each([
		['e4+', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ''],
		['e4#', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ''],
		['Qh5#', '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', '+'],
		['Qg7+', '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', '#'],
		['d7#', '4k3/8/3P4/8/8/8/8/4K3 w - - 0 1', '+'],
		['O-O-O#', '3k4/8/8/8/8/8/8/R3K3 w Q - 0 1', '+'],
	] as const)(
		'rejects %s when the check suffix does not match the resulting position',
		(algebraic, fen, expectedSuffix) => {
			const board = new ChessBoard();
			expect(loadFen(board, fen)).toBeNullable();

			const [move, error] = calculateMoveFromAlgebraic(board, algebraic);

			expect(move).toBeNullable();
			expect(error).toEqual({
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: `check suffix does not match resulting position (expected '${expectedSuffix}')`,
			});
		}
	);

	it.each([
		['Qh5+', '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'],
		['Qg7#', '7k/8/5KQ1/8/8/8/8/8 w - - 0 1'],
		['d7+', '4k3/8/3P4/8/8/8/8/4K3 w - - 0 1'],
		['O-O-O+', '3k4/8/8/8/8/8/8/R3K3 w Q - 0 1'],
	] as const)(
		'accepts %s when the check suffix matches the resulting position',
		(algebraic, fen) => {
			const board = new ChessBoard();
			expect(loadFen(board, fen)).toBeNullable();

			const [move, error] = calculateMoveFromAlgebraic(board, algebraic);

			expect(error).toBeNullable();
			expect(move).not.toBeNullable();
		}
	);
	it.todo('formats checking moves with + and checkmating moves with #');
});
