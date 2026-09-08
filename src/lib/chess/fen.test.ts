import { describe, expect, it } from 'vitest';

import { ChessSquare, PieceColor } from '$lib/chess/basic';
import { CASTLING_RIGHTS, ChessBoard } from '$lib/chess/engine';
import { boardToFen, isFenValid, loadFen, type FENError } from '$lib/chess/fen';
import { PieceId } from '$lib/chess/piece';

function loadFenError(board: ChessBoard, fen: string): FENError | null | undefined {
	return loadFen(board, fen)[1];
}

describe('chess/FEN', () => {
	it('validates piece placement structure', () => {
		expect(isFenValid('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(true);
		expect(isFenValid('8/8/8/8/8/8/8/4X3 w - - 0 1')).toBe(false);
		expect(isFenValid('8/8/8/8/8/8/8/5K3 w - - 0 1')).toBe(false);
		expect(isFenValid('8/8/8/8/8/8/8/9 w - - 0 1')).toBe(false);
		expect(isFenValid('8/8/8/8/8/8/8 w - - 0 1')).toBe(false);
		expect(isFenValid('')).toBe(false);
	});

	it('parses board pieces and metadata', () => {
		const board = new ChessBoard();
		const error = loadFenError(board, '4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');
		expect(error).toBeUndefined();

		expect(board.getPiece('e8')).toBe(PieceId.BLACK_KING);
		expect(board.getPiece('e5')).toBe(PieceId.WHITE_PAWN);
		expect(board.turnColor).toBe(PieceColor.BLACK);
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_KINGSIDE).toBeTruthy();
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_QUEENSIDE).toBeFalsy();
		expect(board.castlingRights & CASTLING_RIGHTS.BLACK_QUEENSIDE).toBeTruthy();
		expect(board.enPassantTarget).not.toBeNull();
		expect(ChessSquare.toString(board.enPassantTarget!)).toBe('d6');
		expect(board.halfMoveClock).toBe(7);
		expect(board.fullMoveNumber).toBe(22);
	});

	it('fills in default metadata when optional fields are omitted', () => {
		const board = new ChessBoard();
		const error = loadFenError(board, '8/8/8/8/8/8/8/4K3');
		expect(error).toBeUndefined();

		expect(board.turnColor).toBe(PieceColor.WHITE);
		expect(board.castlingRights & CASTLING_RIGHTS.WHITE_KINGSIDE).toBeFalsy();
		expect(board.enPassantTarget).toBe(null);
		expect(board.halfMoveClock).toBe(0);
		expect(board.fullMoveNumber).toBe(1);
	});

	it('returns errors for invalid metadata values', () => {
		const board = new ChessBoard();
		expect(loadFenError(board, '8/8/8/8/8/8/8/4K3 w - zz 0 1')?.message).toMatch(
			/en passant target/
		);
		expect(loadFenError(board, '8/8/8/8/8/8/8/4K3 w - - -1 1')?.message).toMatch(/half move clock/);
		expect(loadFenError(board, '8/8/8/8/8/8/8/4K3 w - - 0 0')?.message).toMatch(/full move number/);
	});

	it.each(['8/8/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/8/8/8/8 w - - 0 1'])(
		'rejects piece placement without exactly eight ranks: %s',
		(fen) => {
			expect(isFenValid(fen)).toBe(false);

			const board = new ChessBoard();
			expect(loadFenError(board, fen)?.message).toMatch(/must contain exactly 8 rows/i);
		}
	);

	it.each(['8/8/8/8/8/8/8/7', '8/8/8/8/8/8/8/9', '8/8/8/8/8/8/8/6K', '8/8/8/8/8/8/8/8K'])(
		'returns an error for ranks shorter or longer than eight squares: %s',
		(piecePlacement) => {
			const board = new ChessBoard();

			expect(isFenValid(piecePlacement)).toBe(false);
			expect(loadFenError(board, piecePlacement)?.message).toMatch(
				/rank must contain exactly 8 squares/i
			);
		}
	);

	it('rejects zero digit in piece placement', () => {
		const fen = '8/8/8/8/8/8/8/0K7 w - - 0 1';

		expect(isFenValid(fen)).toBe(false);
		const board = new ChessBoard();
		expect(loadFenError(board, fen)?.message).toMatch(/zero digit/);
	});

	it('rejects consecutive digits in piece placement', () => {
		const fen = '8/8/8/8/8/8/8/44 w - - 0 1';

		expect(isFenValid(fen)).toBe(false);
		const board = new ChessBoard();
		expect(loadFenError(board, fen)?.message).toMatch(/consecutive digits/);
	});
	it.todo('rejects an active color other than "w" or "b"');
	it.todo('rejects malformed, duplicated, or non-canonical castling rights');
	it.todo('rejects en-passant targets outside ranks 3 and 6');
	it.todo('rejects non-integer clocks instead of partially parsing them');
	it.todo('rejects FEN strings with extra fields');

	it('does not mutate the board when loading FEN fails', () => {
		const board = new ChessBoard();
		expect(loadFenError(board, '4k3/8/8/8/8/8/4P3/4K3 b - - 7 22')).toBeUndefined();

		const boardFenBefore = boardToFen(board);
		expect(loadFenError(board, '8/8/8/8/8/8/8/4K3 w - zz 0 1')).toEqual(
			expect.objectContaining({ type: 'invalidFEN' })
		);
		expect(boardToFen(board)).toBe(boardFenBefore);
	});

	it('round-trips a canonical FEN', () => {
		const fen = 'r3k2r/8/8/3pP3/8/8/8/R3K2R b KQkq d6 7 22';
		const board = new ChessBoard();

		expect(loadFenError(board, fen)).toBeUndefined();
		expect(boardToFen(board)).toBe(fen);
	});

	it('serializes placement and metadata fields', () => {
		const board = new ChessBoard();
		const error = loadFenError(board, '4k3/8/8/3pP3/8/8/8/4K3 b Kq d6 7 22');
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
