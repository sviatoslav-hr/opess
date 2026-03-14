import { describe, expect, it } from 'vitest';

import { Position } from '$lib/chess/board';
import { calculateMoveFromAlgebraic } from '$lib/chess/algebraic';
import { parseFen } from '$lib/chess/fen';
import { calculateMove } from '$lib/chess/moves';
import { PieceId } from '$lib/chess/piece';

describe('algebraic notation', () => {
	it('parses pawn, piece, and castling moves', () => {
		const pawnBoard = parseFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
		const [pawnMove] = calculateMoveFromAlgebraic(pawnBoard, 'e4');
		expect(pawnMove?.from.toString()).toBe('e2');

		const pieceCases = [
			['4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', 'Nf3', 'g1', 'f3'],
			['4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'Bg5', 'c1', 'g5'],
			['4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8', 'a1', 'a8'],
			['4k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'Qh5', 'd1', 'h5'],
			['4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'Ke2', 'e1', 'e2']
		] as const;

		for (const [fen, algebraic, from, to] of pieceCases) {
			const board = parseFen(fen);
			const [move] = calculateMoveFromAlgebraic(board, algebraic);

			expect(move?.from.toString()).toBe(from);
			expect(move?.to.toString()).toBe(to);
		}

		const castleBoard = parseFen('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		const [castleMove] = calculateMoveFromAlgebraic(castleBoard, 'O-O');
		expect(castleMove?.castling).toBe('king-side');
	});

	it('parses pawn captures and promotions', () => {
		const captureBoard = parseFen('4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		const [captureMove] = calculateMoveFromAlgebraic(captureBoard, 'exd6');
		expect(captureMove?.isCapture).toBe(true);
		expect(captureMove?.from.toString()).toBe('e5');

		const promotionBoard = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		const [promotionMove] = calculateMoveFromAlgebraic(promotionBoard, 'a8=N');
		expect(promotionMove?.promotion).toBe(PieceId.WHITE_KNIGHT);

		const blackPromotionBoard = parseFen('4k3/8/8/8/8/8/p7/4K3 b - - 0 1');
		const [blackPromotionMove] = calculateMoveFromAlgebraic(blackPromotionBoard, 'a1=Q');
		expect(blackPromotionMove?.promotion).toBe(PieceId.BLACK_QUEEN);
	});

	it('rejects ambiguous or malformed notation', () => {
		const ambiguousBoard = parseFen('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1');
		const [, ambiguousError] = calculateMoveFromAlgebraic(ambiguousBoard, 'Nd2');
		expect(ambiguousError).toEqual({
			type: 'ambiguousAlgebraicNotation',
			algebraic: 'Nd2',
			piece: PieceId.WHITE_KNIGHT
		});

		const malformedBoard = parseFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
		const [, malformedError] = calculateMoveFromAlgebraic(malformedBoard, 'Qa9');
		expect(malformedError).toEqual({ type: 'invalidAlgebraicNotation', algebraic: 'Qa9' });
	});

	it('parses disambiguated piece moves', () => {
		const board = parseFen('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
		const [move] = calculateMoveFromAlgebraic(board, 'Nbd2');
		expect(move?.from.toString()).toBe('b1');
		expect(move?.to.toString()).toBe('d2');
	});

	it('formats captures, castling, and disambiguation when calculating moves', () => {
		const captureBoard = parseFen('4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1');
		const [captureMove] = calculateMove(
			captureBoard,
			Position.fromStr('e5'),
			Position.fromStr('d6')
		);
		expect(captureMove?.algebraic).toBe('exd6');

		const castleBoard = parseFen('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		const [castleMove] = calculateMove(castleBoard, Position.fromStr('e1'), Position.fromStr('g1'));
		expect(castleMove?.algebraic).toBe('O-O');

		const knightBoard = parseFen('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
		const [knightMove] = calculateMove(knightBoard, Position.fromStr('b1'), Position.fromStr('d2'));
		expect(knightMove?.algebraic).toBe('Nbd2');

		const rookBoard = parseFen('4k3/8/8/8/8/R7/8/R3K3 w - - 0 1');
		const [rookMove] = calculateMove(rookBoard, Position.fromStr('a1'), Position.fromStr('a2'));
		expect(rookMove?.algebraic).toBe('R1a2');

		const tripleKnightBoard = parseFen('4k3/8/8/1N6/8/8/8/1N1NK3 w - - 0 1');
		const [tripleKnightMove] = calculateMove(
			tripleKnightBoard,
			Position.fromStr('b1'),
			Position.fromStr('c3')
		);
		expect(tripleKnightMove?.algebraic).toBe('Nb1c3');
	});
});
