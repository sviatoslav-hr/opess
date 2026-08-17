import { describe, expect, it } from 'vitest';

import { PieceColor } from '$lib/chess/basic';
import { PieceId, PromotionPiece } from '$lib/chess/piece';

describe('chess/PieceId', () => {
	it('recognizes and parses valid piece ids', () => {
		expect(PieceId.is(1)).toBe(true);
		expect(PieceId.is(5)).toBe(true);
		expect(PieceId.is(69)).toBe(false);

		expect(PieceId.parse(PieceId.WHITE_QUEEN)).toBe(PieceId.WHITE_QUEEN);
		expect(PieceId.parse(69)).toBeNull();
	});

	it('classifies piece colors and kinds', () => {
		expect(PieceId.colorOf(PieceId.WHITE_BISHOP)).toBe(PieceColor.WHITE);
		expect(PieceId.colorOf(PieceId.BLACK_ROOK)).toBe(PieceColor.BLACK);

		expect(PieceId.isWhite(PieceId.WHITE_KNIGHT)).toBe(true);
		expect(PieceId.isBlack(PieceId.BLACK_KNIGHT)).toBe(true);
		expect(PieceId.isPawn(PieceId.WHITE_PAWN)).toBe(true);
		expect(PieceId.isKing(PieceId.BLACK_KING)).toBe(true);
		expect(PieceId.isQueen(PieceId.WHITE_QUEEN)).toBe(true);
		expect(PieceId.isRook(PieceId.BLACK_ROOK)).toBe(true);
		expect(PieceId.isBishop(PieceId.WHITE_BISHOP)).toBe(true);
		expect(PieceId.isKnight(PieceId.BLACK_KNIGHT)).toBe(true);
	});

	it.each([
		[PromotionPiece.QUEEN, 'q'],
		[PromotionPiece.ROOK, 'r'],
		[PromotionPiece.BISHOP, 'b'],
		[PromotionPiece.KNIGHT, 'n'],
	] as const)('maps promotion piece %s to the %s suffix key', (piece, key) => {
		expect(PromotionPiece.keyOf(piece)).toBe(key);
	});

});
