import { describe, expect, it } from 'vitest';

import { PieceColor } from '$lib/chess/basic';
import { CASTLING_RIGHTS, ChessBoard, Ox88 } from '$lib/chess/engine';
import { boardToFen, isValidFen, loadFen } from '$lib/chess/fen';
import { PieceId } from '$lib/chess/piece';

describe('chess/FEN', () => {
	it('validates piece placement structure', () => {
		expect(isValidFen('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(true);
		expect(isValidFen('8/8/8/8/8/8/8/4X3 w - - 0 1')).toBe(false);
		expect(isValidFen('8/8/8/8/8/8/8/5K3 w - - 0 1')).toBe(false);
		expect(isValidFen('8/8/8/8/8/8/8/9 w - - 0 1')).toBe(false);
		expect(isValidFen('8/8/8/8/8/8/8 w - - 0 1')).toBe(false);
		expect(isValidFen('')).toBe(false);
	});

	it.todo('rejects zero digits in piece placement, such as "80"');
	it.todo('rejects an active color other than "w" or "b"');
	it.todo('rejects malformed, duplicated, or non-canonical castling rights');
	it.todo('rejects en-passant targets outside ranks 3 and 6');
	it.todo('rejects non-integer clocks instead of partially parsing them');
	it.todo('rejects FEN strings with extra fields');

	it('parses board pieces and metadata', () => {
		const board = new ChessBoard();
		const error = loadFen(board, '4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');
		expect(error).toBeUndefined();

		expect(board.getPieceByStr('e8')).toBe(PieceId.BLACK_KING);
		expect(board.getPieceByStr('e5')).toBe(PieceId.WHITE_PAWN);
		expect(board.turnColor).toBe(PieceColor.BLACK);
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_KINGSIDE).toBeTruthy();
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_QUEENSIDE).toBeFalsy();
		expect(board.castlingRights & CASTLING_RIGHTS.BLACK_QUEENSIDE).toBeTruthy();
		expect(Ox88.squareToString(board.enPassantTarget ?? Ox88.OFF_BOARD)).toBe('d6');
		expect(board.halfMoveClock).toBe(7);
		expect(board.fullMoveNumber).toBe(22);
	});

	it('fills in default metadata when optional fields are omitted', () => {
		const board = new ChessBoard();
		const error = loadFen(board, '8/8/8/8/8/8/8/4K3');
		expect(error).toBeUndefined();

		expect(board.turnColor).toBe(PieceColor.WHITE);
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_KINGSIDE).toBeFalsy();
		expect(board.enPassantTarget).toBe(null);
		expect(board.halfMoveClock).toBe(0);
		expect(board.fullMoveNumber).toBe(1);
	});

	it('returns errors for invalid metadata values', () => {
		const board = new ChessBoard();
		expect(loadFen(board, '8/8/8/8/8/8/8/4K3 w - zz 0 1')?.message).toMatch(/en passant target/);
		expect(loadFen(board, '8/8/8/8/8/8/8/4K3 w - - -1 1')?.message).toMatch(/half move clock/);
		expect(loadFen(board, '8/8/8/8/8/8/8/4K3 w - - 0 0')?.message).toMatch(/full move number/);
	});

	it.todo('returns an error for ranks shorter or longer than eight squares');

	it.todo('does not mutate the board when loading FEN fails', () => {
		const board = new ChessBoard();
		expect(loadFen(board, '4k3/8/8/8/8/8/4P3/4K3 b - - 7 22')).toBeUndefined();
		const before = boardToFen(board);

		expect(loadFen(board, '8/8/8/8/8/8/8/4K3 w - zz 0 1')).toBeInstanceOf(Error);
		expect(boardToFen(board)).toBe(before);
	});

	it('round-trips a canonical FEN', () => {
		const fen = 'r3k2r/8/8/3pP3/8/8/8/R3K2R b KQkq d6 7 22';
		const board = new ChessBoard();

		expect(loadFen(board, fen)).toBeUndefined();
		expect(boardToFen(board)).toBe(fen);
	});

	it('serializes placement and metadata fields', () => {
		const board = new ChessBoard();
		const error = loadFen(board, '4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');
		expect(error).toBeUndefined();
		const [placement, turn, castling, enPassant, halfMove, fullMove] = boardToFen(board).split(' ');

		expect(placement).toBe('4k3/8/8/3pP3/8/8/8/4K3');
		expect(turn).toBe(board.turnColor === PieceColor.WHITE ? 'w' : 'b');
		expect(castling).toBe('Kq');
		expect(enPassant).toBe('d6');
		expect(halfMove).toBe('7');
		expect(fullMove).toBe('22');
	});
});
