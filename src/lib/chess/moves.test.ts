import { describe, expect, it } from 'vitest';

import { Position } from '$lib/chess/board';
import { INITIAL_FEN, parseFen } from '$lib/chess/fen';
import { applyMove, calculateMove, getLegalMovesFrom } from '$lib/chess/moves';
import { PieceId } from '$lib/chess/piece';

describe('move generation', () => {
	it('derives legal moves from canonical board state on demand', () => {
		const board = parseFen(INITIAL_FEN);

		const moves = getLegalMovesFrom(board, Position.fromStr('e2')).map((move) => move.toString());

		expect(moves).toEqual(['e3', 'e4']);
	});

	it('rejects moves that leave the king in check without a precomputed cache', () => {
		const board = parseFen('4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1');

		const [move, moveError] = calculateMove(board, Position.fromStr('a1'), Position.fromStr('a2'));

		expect(move).toBeUndefined();
		expect(moveError).toEqual({ type: 'invalidPieceMove', piece: 'R' });
	});

	it('keeps derived legal moves out of the persisted board state', () => {
		const board = parseFen(INITIAL_FEN);
		const [move] = calculateMove(board, Position.fromStr('e2'), Position.fromStr('e4'));

		expect(move).toBeDefined();
		if (!move) {
			throw new Error('Expected e2e4 to be legal');
		}

		const nextBoard = applyMove(board, move);

		expect(Object.hasOwn(nextBoard, 'allowedMoves')).toBe(false);
	});

	it('returns no legal moves for empty squares or opponent pieces', () => {
		const board = parseFen(INITIAL_FEN);

		expect(getLegalMovesFrom(board, Position.fromStr('e4'))).toEqual([]);
		expect(getLegalMovesFrom(board, Position.fromStr('a7'))).toEqual([]);
	});

	it('reports turn and own-piece capture errors', () => {
		const board = parseFen('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');

		const [, notYourTurn] = calculateMove(board, Position.fromStr('e8'), Position.fromStr('e7'));
		const [, captureOwnPiece] = calculateMove(
			board,
			Position.fromStr('e2'),
			Position.fromStr('e1')
		);

		expect(notYourTurn).toEqual({ type: 'notYourTurn' });
		expect(captureOwnPiece).toEqual({ type: 'captureOwnPiece' });
	});

	it('supports each piece move family', () => {
		const cases = [
			['4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', 'g1', 'f3', 'Nf3'],
			['4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'c1', 'g5', 'Bg5'],
			['4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1', 'a8', 'Ra8'],
			['4k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1', 'h5', 'Qh5'],
			['4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1', 'e2', 'Ke2']
		] as const;

		for (const [fen, from, to, algebraic] of cases) {
			const board = parseFen(fen);
			const [move] = calculateMove(board, Position.fromStr(from), Position.fromStr(to));

			expect(move?.algebraic).toBe(algebraic);
		}
	});

	it('tracks en passant targets on double pawn pushes', () => {
		const board = parseFen(INITIAL_FEN);
		const [move] = calculateMove(board, Position.fromStr('e2'), Position.fromStr('e4'));

		expect(move).toBeDefined();
		if (!move) throw new Error('Expected e2e4 to be legal');

		const nextBoard = applyMove(board, move);

		expect(nextBoard.enPassantTarget?.toString()).toBe('e3');
		expect(nextBoard.halfMoveClock).toBe(0);
		expect(nextBoard.fullMoveNumber).toBe(1);
	});

	it('applies en passant captures', () => {
		const board = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 4 7');
		const [move] = calculateMove(board, Position.fromStr('e5'), Position.fromStr('d6'));

		expect(move?.isEnPassantCapture).toBe(true);
		if (!move) throw new Error('Expected en passant to be legal');

		const nextBoard = applyMove(board, move);

		expect(nextBoard.pieces.get('d6')).toBe(PieceId.WHITE_PAWN);
		expect(nextBoard.pieces.has('d5')).toBe(false);
	});

	it('applies castling moves and updates castling rights', () => {
		const board = parseFen('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		const [move] = calculateMove(board, Position.fromStr('e1'), Position.fromStr('g1'));

		expect(move?.castling).toBe('king-side');
		if (!move) throw new Error('Expected white castling to be legal');

		const nextBoard = applyMove(board, move);

		expect(nextBoard.pieces.get('g1')).toBe(PieceId.WHITE_KING);
		expect(nextBoard.pieces.get('f1')).toBe(PieceId.WHITE_ROOK);
		expect(nextBoard.canCastle.whiteKingSide).toBe(false);
		expect(nextBoard.canCastle.whiteQueenSide).toBe(false);
	});

	it('promotes pawns to the default or requested piece', () => {
		const defaultBoard = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		const [defaultPromotion] = calculateMove(
			defaultBoard,
			Position.fromStr('a7'),
			Position.fromStr('a8')
		);

		expect(defaultPromotion?.promotion).toBe(PieceId.WHITE_QUEEN);

		const customBoard = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		const [customPromotion] = calculateMove(
			customBoard,
			Position.fromStr('a7'),
			Position.fromStr('a8'),
			PieceId.WHITE_KNIGHT
		);

		expect(customPromotion?.promotion).toBe(PieceId.WHITE_KNIGHT);
		if (!customPromotion) throw new Error('Expected promotion to be legal');

		const nextBoard = applyMove(customBoard, customPromotion);
		expect(nextBoard.pieces.get('a8')).toBe(PieceId.WHITE_KNIGHT);
	});

	it('throws when calculating or applying a move from an empty square', () => {
		const board = parseFen(INITIAL_FEN);

		expect(() => calculateMove(board, Position.fromStr('e4'), Position.fromStr('e5'))).toThrow(
			/No piece/
		);
		expect(() =>
			applyMove(board, {
				from: Position.fromStr('e4'),
				to: Position.fromStr('e5'),
				piece: PieceId.WHITE_PAWN,
				turn: board.turnColor,
				algebraic: 'e5',
				fen: INITIAL_FEN,
				isCapture: false
			})
		).toThrow(/does not match/);
	});
});
