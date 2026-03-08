import { describe, expect, it } from 'vitest';

import { PlayerColor } from '$lib/chess/board';
import { PieceId } from '$lib/chess/piece';

describe('PieceId', () => {
	it('recognizes and parses valid piece ids', () => {
		expect(PieceId.isPiece('P')).toBe(true);
		expect(PieceId.isPiece('k')).toBe(true);
		expect(PieceId.isPiece('x')).toBe(false);

		expect(PieceId.parse('Q')).toBe(PieceId.WHITE_QUEEN);
		expect(PieceId.parse('z')).toBeNull();
	});

	it('classifies piece colors and kinds', () => {
		expect(PieceId.getColor(PieceId.WHITE_BISHOP)).toBe(PlayerColor.WHITE);
		expect(PieceId.getColor(PieceId.BLACK_ROOK)).toBe(PlayerColor.BLACK);

		expect(PieceId.isWhite(PieceId.WHITE_KNIGHT)).toBe(true);
		expect(PieceId.isBlack(PieceId.BLACK_KNIGHT)).toBe(true);
		expect(PieceId.isPawn(PieceId.WHITE_PAWN)).toBe(true);
		expect(PieceId.isKing(PieceId.BLACK_KING)).toBe(true);
		expect(PieceId.isQueen(PieceId.WHITE_QUEEN)).toBe(true);
		expect(PieceId.isRook(PieceId.BLACK_ROOK)).toBe(true);
		expect(PieceId.isBishop(PieceId.WHITE_BISHOP)).toBe(true);
		expect(PieceId.isKnight(PieceId.BLACK_KNIGHT)).toBe(true);
	});
});
