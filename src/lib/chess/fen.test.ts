import { describe, expect, it } from 'vitest';

import { PlayerColor } from '$lib/chess/board';
import { boardToFen, parseFen, validateFen } from '$lib/chess/fen';
import { PieceId } from '$lib/chess/piece';

describe('FEN helpers', () => {
	it('validates piece placement structure', () => {
		expect(validateFen('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(true);
		expect(validateFen('8/8/8/8/8/8/8/4X3 w - - 0 1')).toBe(false);
		expect(validateFen('8/8/8/8/8/8/8/5K3 w - - 0 1')).toBe(false);
		expect(validateFen('')).toBe(false);
	});

	it('parses board pieces and metadata', () => {
		const board = parseFen('4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');

		expect(board.pieces.get('e8')).toBe(PieceId.BLACK_KING);
		expect(board.pieces.get('e5')).toBe(PieceId.WHITE_PAWN);
		expect(board.turnColor).toBe(PlayerColor.BLACK);
		expect(board.canCastle.whiteKingSide).toBe(true);
		expect(board.canCastle.whiteQueenSide).toBe(false);
		expect(board.canCastle.blackQueenSide).toBe(true);
		expect(board.enPassantTarget?.toString()).toBe('d6');
		expect(board.halfMoveClock).toBe(7);
		expect(board.fullMoveNumber).toBe(22);
	});

	it('fills in default metadata when optional fields are omitted', () => {
		const board = parseFen('8/8/8/8/8/8/8/4K3');

		expect(board.turnColor).toBe(PlayerColor.WHITE);
		expect(board.canCastle.whiteKingSide).toBe(false);
		expect(board.enPassantTarget).toBeNull();
		expect(board.halfMoveClock).toBe(0);
		expect(board.fullMoveNumber).toBe(1);
	});

	it('throws on invalid metadata values', () => {
		expect(() => parseFen('8/8/8/8/8/8/8/4K3 w - zz 0 1')).toThrow(/en passant target/);
		expect(() => parseFen('8/8/8/8/8/8/8/4K3 w - - -1 1')).toThrow(/half move clock/);
		expect(() => parseFen('8/8/8/8/8/8/8/4K3 w - - 0 0')).toThrow(/full move number/);
	});

	it('serializes placement and metadata fields', () => {
		const board = parseFen('4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');
		const [placement, turn, castling, enPassant, halfMove, fullMove] = boardToFen(board).split(' ');

		expect(placement).toBe('4k3/8/8/3pP3/8/8/8/4K3');
		expect(turn).toBe(board.turnColor);
		expect(castling).toBe('Kq');
		expect(enPassant).toBe('d6');
		expect(halfMove).toBe('7');
		expect(fullMove).toBe('22');
	});
});
