import { describe, expect, it } from 'vitest';

import {
	BoardMap,
	cloneBoardInfo,
	PlayerColor,
	Position,
	isBoardFile,
	isBoardRank,
	isPositionStr,
	newBoardInfo,
	nextBoardRank,
	prevBoardRank,
	resetBoardInfo
} from '$lib/chess/board';
import { PieceId } from '$lib/chess/piece';

describe('board primitives', () => {
	it('parses and compares positions', () => {
		const position = Position.parse('e4');

		expect(position?.equals('e4')).toBe(true);
		expect(position?.fileIndex()).toBe(4);
		expect(position?.rankIndex()).toBe(3);
		expect(Position.parse('z9')).toBeNull();
	});

	it('validates files, ranks, and adjacent ranks', () => {
		expect(isBoardFile('a')).toBe(true);
		expect(isBoardFile('z')).toBe(false);
		expect(isBoardRank('8')).toBe(true);
		expect(isBoardRank('9')).toBe(false);
		expect(isPositionStr('b7')).toBe(true);
		expect(isPositionStr('q1')).toBe(false);
		expect(prevBoardRank('1')).toBeNull();
		expect(prevBoardRank('3')).toBe('2');
		expect(nextBoardRank('8')).toBeNull();
		expect(nextBoardRank('6')).toBe('7');
	});
});

describe('BoardMap', () => {
	it('stores, clones, and resets board entries', () => {
		const board = new BoardMap<PieceId>();
		board.set('a1', PieceId.WHITE_ROOK);
		board.set(Position.fromStr('e1'), PieceId.WHITE_KING);

		expect(board.has('a1')).toBe(true);
		expect(board.get('e1')).toBe(PieceId.WHITE_KING);
		expect(board.findPositionFor(PieceId.WHITE_ROOK)).toBe('a1');

		const clone = board.clone();
		clone.set('a2', PieceId.WHITE_PAWN);
		clone.delete('a1');

		expect(board.has('a2')).toBe(false);
		expect(board.has('a1')).toBe(true);

		board.reset();
		expect(board.size).toBe(0);
	});

	it('finds the first matching piece on a file', () => {
		const board = new BoardMap<PieceId>();
		board.set('b2', PieceId.WHITE_PAWN);
		board.set('b4', PieceId.WHITE_PAWN);

		expect(board.findPieceOnFile(PieceId.WHITE_PAWN, 'b')).toBe('b2');
		expect(board.findPieceOnFile(PieceId.BLACK_PAWN, 'b')).toBeUndefined();
	});
});

describe('board state helpers', () => {
	it('creates and resets board info', () => {
		const board = newBoardInfo();
		board.pieces.set('e1', PieceId.WHITE_KING);
		board.turnColor = PlayerColor.BLACK;
		board.canCastle.whiteKingSide = false;
		board.enPassantTarget = Position.fromStr('e3');
		board.halfMoveClock = 4;
		board.fullMoveNumber = 9;
		board.moves.push({} as never);

		resetBoardInfo(board);

		expect(board.pieces.size).toBe(0);
		expect(board.turnColor).toBe(PlayerColor.WHITE);
		expect(board.canCastle.whiteKingSide).toBe(true);
		expect(board.enPassantTarget).toBeNull();
		expect(board.halfMoveClock).toBe(0);
		expect(board.fullMoveNumber).toBe(0);
		expect(board.moves).toHaveLength(0);
	});

	it('clones board info without sharing mutable state', () => {
		const board = newBoardInfo();
		board.pieces.set('e1', PieceId.WHITE_KING);
		board.pieces.set('e2', PieceId.WHITE_PAWN);
		board.turnColor = PlayerColor.BLACK;
		board.canCastle.whiteKingSide = false;
		board.enPassantTarget = Position.fromStr('e3');
		board.halfMoveClock = 4;
		board.fullMoveNumber = 9;
		board.moves.push({
			from: Position.fromStr('e2'),
			to: Position.fromStr('e4'),
			piece: PieceId.WHITE_PAWN,
			turn: PlayerColor.WHITE,
			algebraic: 'e4',
			isCapture: false
		});

		const clone = cloneBoardInfo(board);
		clone.pieces.delete('e2');
		clone.turnColor = PlayerColor.WHITE;
		clone.canCastle.blackKingSide = false;
		clone.enPassantTarget = null;
		clone.moves[0]!.algebraic = 'changed';
		clone.moves[0]!.from = Position.fromStr('d2');

		expect(board.pieces.has('e2')).toBe(true);
		expect(board.turnColor).toBe(PlayerColor.BLACK);
		expect(board.canCastle.blackKingSide).toBe(true);
		expect(board.enPassantTarget?.toString()).toBe('e3');
		expect(board.moves[0]?.algebraic).toBe('e4');
		expect(board.moves[0]?.from.toString()).toBe('e2');
	});
});
