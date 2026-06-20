import { describe, expect, it } from 'vitest';

import type { AbstractBoard } from '$lib/chess/board';
import {
	BoardInt8,
	INITIAL_FEN,
	encodeMove,
	type MoveInt8,
	type MoveBufferInt8,
	moveToUci,
	squareFromAlgebraic,
	PieceColor,
	PieceType,
	Piece
} from '$lib/chess/engine/int8';

function movesToUci(board: BoardInt8, legal = true): string[] {
	const buffer = board.allocateMoveBuffer();
	const count = legal ? board.generateLegalMoves(buffer) : board.generatePseudoLegalMoves(buffer);
	const moves: string[] = [];

	for (let i = 0; i < count; i++) {
		moves.push(moveToUci(board.getMoveByIndex(buffer, i)));
	}

	return moves.sort();
}

function findMove(board: BoardInt8, uci: string): MoveInt8 {
	const buffer = board.allocateMoveBuffer();
	const count = board.generateLegalMoves(buffer);

	for (let i = 0; i < count; i++) {
		const move = board.getMoveByIndex(buffer, i);
		if (moveToUci(move) === uci) {
			return move;
		}
	}

	throw new Error(`Expected legal move not found: ${uci}`);
}

function perft(board: AbstractBoard<MoveBufferInt8, MoveInt8>, depth: number): number {
	const buffers = Array.from({ length: depth + 1 }, () => board.allocateMoveBuffer());
	return perftAtMoveDepth(board, depth, 0, buffers);
}

function perftAtMoveDepth(
	board: AbstractBoard<MoveBufferInt8, MoveInt8>,
	depth: number,
	moveDepth: number,
	buffers: MoveBufferInt8[]
): number {
	if (depth === 0) return 1;

	const buffer = buffers[moveDepth];
	const count = board.generateLegalMoves(buffer, moveDepth);
	if (depth === 1) return count;

	let nodes = 0;

	for (let i = 0; i < count; i++) {
		const move = board.getMoveByIndex(buffer, i);
		board.makeMove(move);
		nodes += perftAtMoveDepth(board, depth - 1, moveDepth + 1, buffers);
		board.unmakeMove(move);
	}

	return nodes;
}

function snapshot(board: BoardInt8): object {
	return {
		fen: board.toFen(),
		board: Array.from(board.board),
		pieceSquares: Array.from(board.pieceSquares),
		pieceCodes: Array.from(board.pieceCodes),
		squareToPiece: Array.from(board.squareToPiece),
		turn: board.turn,
		castlingRights: board.castlingRights,
		enPassantSquare: board.enPassantSquare,
		halfMoveClock: board.halfMoveClock,
		fullMoveNumber: board.fullMoveNumber,
		whiteKingSquare: board.whiteKingSquare,
		blackKingSquare: board.blackKingSquare
	};
}

describe('BoardInt8', () => {
	it('implements the AbstractBoard interface with an Int8Array board', () => {
		const board: AbstractBoard<MoveBufferInt8, MoveInt8> = new BoardInt8(INITIAL_FEN);
		const buffer = board.allocateMoveBuffer();

		expect(buffer).toBeInstanceOf(Int32Array);
		expect(board.generatePseudoLegalMoves(buffer)).toBe(20);
		expect(board.generateLegalMoves(buffer)).toBe(20);
		expect(board.getMoveByIndex(buffer, 0)).toBeTypeOf('number');
		expect(board.isSquareAttacked(squareFromAlgebraic('e4'), PieceColor.BLACK)).toBe(false);
		expect(board.evaluateMaterial()).toBe(0);
		expect(board.evaluatePST()).toBeTypeOf('number');
		expect(board.evaluateMobility()).toBe(0);
		expect(board.evaluate()).toBeTypeOf('number');
		expect((board as BoardInt8).board).toBeInstanceOf(Int8Array);
		expect((board as BoardInt8).board).toHaveLength(64);
	});

	it('loads and serializes FEN metadata and numeric pieces', () => {
		const board = new BoardInt8('4k3/8/8/3pP3/8/8/8/4K3 w Kq d6 7 22');

		expect(board.board[squareFromAlgebraic('e8')]).toBe(Piece.BLACK_KING);
		expect(board.board[squareFromAlgebraic('e5')]).toBe(Piece.WHITE_PAWN);
		expect(board.board[squareFromAlgebraic('d5')]).toBe(Piece.BLACK_PAWN);
		expect(board.turn).toBe(PieceColor.WHITE);
		expect(board.enPassantSquare).toBe(squareFromAlgebraic('d6'));
		expect(board.halfMoveClock).toBe(7);
		expect(board.fullMoveNumber).toBe(22);
		expect(board.whiteKingSquare).toBe(squareFromAlgebraic('e1'));
		expect(board.blackKingSquare).toBe(squareFromAlgebraic('e8'));
		expect(board.toFen()).toBe('4k3/8/8/3pP3/8/8/8/4K3 w Kq d6 7 22');
	});

	it('rejects malformed FEN king and en-passant state', () => {
		expect(() => new BoardInt8('8/8/8/8/8/8/8/4K3 w - - 0 1')).toThrow(/exactly one king/);
		expect(() => new BoardInt8('4k2k/8/8/8/8/8/8/4K3 w - - 0 1')).toThrow(/exactly one king/);
		expect(() => new BoardInt8('4k3/8/8/8/4P3/8/8/4K3 b - e5 0 1')).toThrow(/en passant target/);
		expect(() => new BoardInt8('4k3/8/8/8/8/8/8/4K3 b - e3 0 1')).toThrow(/capturable pawn/);
		expect(() => new BoardInt8('4k3/8/3N4/3pP3/8/8/8/4K3 w - d6 0 1')).toThrow(/occupied/);
	});

	it('detects pawn, knight, king, and blocked sliding attacks', () => {
		const board = new BoardInt8('4k3/6p1/8/3p4/2N1P3/2B5/8/4K3 w - - 0 1');

		expect(board.isSquareAttacked(squareFromAlgebraic('d5'), PieceColor.WHITE)).toBe(true);
		expect(board.isSquareAttacked(squareFromAlgebraic('e4'), PieceColor.BLACK)).toBe(true);
		expect(board.isSquareAttacked(squareFromAlgebraic('b6'), PieceColor.WHITE)).toBe(true);
		expect(board.isSquareAttacked(squareFromAlgebraic('h8'), PieceColor.WHITE)).toBe(false);
		expect(board.isSquareAttacked(squareFromAlgebraic('e2'), PieceColor.WHITE)).toBe(true);
		expect(board.isSquareAttacked(squareFromAlgebraic('d7'), PieceColor.BLACK)).toBe(true);
	});

	it('matches standard perft counts from the initial position', () => {
		const board = new BoardInt8(INITIAL_FEN);

		expect(perft(board, 1)).toBe(20);
		expect(perft(board, 2)).toBe(400);
		expect(perft(board, 3)).toBe(8902);
		expect(perft(board, 4)).toBe(197281);
	});

	it('matches standard Kiwipete perft counts', () => {
		const board = new BoardInt8(
			'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
		);

		expect(perft(board, 1)).toBe(48);
		expect(perft(board, 2)).toBe(2039);
		expect(perft(board, 3)).toBe(97862);
		expect(perft(board, 4)).toBe(4085603);
	});

	it('matches a standard perft count for pinned and checking moves', () => {
		const board = new BoardInt8('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');

		expect(perft(board, 1)).toBe(14);
		expect(perft(board, 2)).toBe(191);
	});

	it('filters illegal castling through attacked squares', () => {
		const legalBoard = new BoardInt8('4k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1');
		expect(movesToUci(legalBoard)).toContain('e1g1');
		expect(movesToUci(legalBoard)).toContain('e1c1');

		const attackedTransit = new BoardInt8('4k2r/8/8/8/2b5/8/8/R3K2R w KQk - 0 1');
		expect(movesToUci(attackedTransit)).not.toContain('e1g1');
		expect(movesToUci(attackedTransit, false)).toContain('e1g1');
	});

	it('filters en passant when it exposes the moving side king', () => {
		const board = new BoardInt8('8/8/8/8/R1pP2k1/8/8/K7 b - d3 0 1');

		expect(movesToUci(board, false)).toContain('c4d3');
		expect(movesToUci(board)).not.toContain('c4d3');
	});

	it('allows only king moves when evading double check', () => {
		const board = new BoardInt8('k3r3/8/8/8/1b6/8/8/4K3 w - - 0 1');

		expect(movesToUci(board)).toEqual(['e1d1', 'e1f1', 'e1f2']);
	});

	it('generates all promotion choices', () => {
		const board = new BoardInt8('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

		expect(movesToUci(board)).toEqual(expect.arrayContaining(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']));
	});

	it('restores exact state after quiet, capture, castle, en passant, and promotion moves', () => {
		const cases = [
			[INITIAL_FEN, 'e2e4'],
			['4k3/8/8/8/8/8/4r3/K3R3 b - - 0 1', 'e2e1'],
			['4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1e2'],
			['4k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1', 'e1g1'],
			['4k3/8/8/3pP3/8/8/8/4K3 w - d6 4 7', 'e5d6'],
			['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q']
		] as const;

		for (const [fen, uci] of cases) {
			const board = new BoardInt8(fen);
			const before = snapshot(board);
			const move = findMove(board, uci);

			board.makeMove(move);
			board.unmakeMove(move);

			expect(snapshot(board)).toEqual(before);
		}
	});

	it('does not corrupt history when unmaking a non-LIFO move', () => {
		const board = new BoardInt8(INITIAL_FEN);
		const before = snapshot(board);
		const move = findMove(board, 'e2e4');
		const wrongMove = encodeMove(squareFromAlgebraic('d2'), squareFromAlgebraic('d4'));

		board.makeMove(move);
		expect(() => board.unmakeMove(wrongMove)).toThrow(/non-LIFO/);
		board.unmakeMove(move);

		expect(snapshot(board)).toEqual(before);
	});

	it('guards direct makeMove calls against invalid captures and promotions', () => {
		const ownCapture = new BoardInt8('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
		expect(() =>
			ownCapture.makeMove(encodeMove(squareFromAlgebraic('e1'), squareFromAlgebraic('a1')))
		).toThrow(/own piece/);

		const nonPawnPromotion = new BoardInt8('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
		expect(() =>
			nonPawnPromotion.makeMove(encodeMove(squareFromAlgebraic('h1'), squareFromAlgebraic('h8'), 5))
		).toThrow(/non-pawn/);

		const missingPromotion = new BoardInt8('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		expect(() =>
			missingPromotion.makeMove(encodeMove(squareFromAlgebraic('a7'), squareFromAlgebraic('a8')))
		).toThrow(/requires promotion/);
	});

	it('updates state for makeMove side effects', () => {
		const board = new BoardInt8(INITIAL_FEN);
		board.makeMove(findMove(board, 'g1f3'));

		expect(board.board[squareFromAlgebraic('g1')]).toBe(0);
		expect(board.board[squareFromAlgebraic('f3')]).toBe(Piece.WHITE_KNIGHT);
		expect(board.turn).toBe(PieceColor.BLACK);
		expect(board.halfMoveClock).toBe(1);

		board.makeMove(findMove(board, 'b8c6'));
		expect(board.fullMoveNumber).toBe(2);

		board.makeMove(findMove(board, 'e2e4'));
		expect(board.board[squareFromAlgebraic('e4')]).toBe(Piece.WHITE_PAWN);
		expect(board.enPassantSquare).toBe(squareFromAlgebraic('e3'));
		expect(board.halfMoveClock).toBe(0);
	});

	it('scores material from White perspective', () => {
		const board = new BoardInt8('4k3/8/8/8/8/8/8/4K1B1 w - - 0 1');

		expect(board.evaluateMaterial()).toBe(330);

		board.loadFen('4k3/8/8/8/8/8/8/4K1b1 w - - 0 1');
		expect(board.evaluateMaterial()).toBe(-330);
	});

	it('keeps the piece index arrays synchronized', () => {
		const board = new BoardInt8('4k3/8/8/8/8/8/4p3/K7 b - - 0 1');
		const move = findMove(board, 'e2e1q');

		board.makeMove(move);

		const promotionSquare = squareFromAlgebraic('e1');
		const promotedPieceIndex = board.squareToPiece[promotionSquare] - 1;
		expect(board.board[promotionSquare]).toBe(-5);
		expect(board.board[squareFromAlgebraic('e2')]).toBe(0);
		expect(board.pieceSquares[promotedPieceIndex]).toBe(promotionSquare);
		expect(board.pieceCodes[promotedPieceIndex]).toBe(-5);
		expect(Math.abs(board.pieceCodes[promotedPieceIndex])).not.toBe(PieceType.PAWN);

		expect(board.board[squareFromAlgebraic('e8')]).toBe(Piece.BLACK_KING);
		expect(board.board[squareFromAlgebraic('e1')]).not.toBe(Piece.WHITE_KING);
	});
});
