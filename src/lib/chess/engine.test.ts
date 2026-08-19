import { describe, expect, it } from 'vitest';

import {
	CastlingRights,
	CastlingType,
	ChessError,
	ChessSquare,
	Ox88,
	PieceColor,
	type ChessSquareStr,
} from '$lib/chess/basic';
import { ChessBoard, ChessMove, chessMoveInfoEquals, type ChessMoveInfo } from '$lib/chess/engine';
import { loadFen } from '$lib/chess/fen';
import { PieceId, PromotionPiece, type PieceId as PieceIdType } from '$lib/chess/piece';

describe('chess/engine', () => {
	describe('board state basics', () => {
		it('starts with an empty white-to-move board and default metadata', () => {
			const board = new ChessBoard();

			expect(board.isWhiteTurn).toBe(true);
			expect(board.turnColor).toBe(PieceColor.WHITE);
			expect(board.enPassantTarget).toBe(null);
			expect(board.castlingRights).toBe(CastlingRights.all());
			expect(board.halfMoveClock).toBe(0);
			expect(board.fullMoveNumber).toBe(1);
			expect(board.undoMoves).toEqual([]);
			expect(board.legalMovesThisTurn).toEqual([]);
			expect(Array.from(board.iteratePieces())).toEqual([]);
			expect(board.board).toHaveLength(Ox88.BOARD_SIZE);
		});

		it('places, reads, and clears pieces by square and position string', () => {
			const board = new ChessBoard();

			expect(board.placePiece(square('e4'), PieceId.WHITE_KNIGHT)).toBeUndefined();

			expect(board.getPiece('e4')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.getPiece('e4')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.getPiece('e4')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.getPiece('e5')).toBe(null);

			expect(board.placePiece('e4', null)).toBeUndefined();
			expect(board.getPiece('e4')).toBe(null);
		});

		it('keeps king tracking synchronized across placement, FEN loading, clearing, and cloning', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['a8', PieceId.BLACK_KING],
				['e8', PieceId.BLACK_ROOK],
			]);

			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(true);

			board.placePiece('e1', null);
			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(false);

			expect(loadFen(board, 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1')).toBeUndefined();
			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(true);
			expect(board.clone().isKingInCheck(PieceColor.WHITE)).toBe(true);
		});

		it('reports invalid square input through public APIs', () => {
			const board = new ChessBoard();

			const error = board.placePiece(0x88 as ChessSquare, PieceId.WHITE_KING);

			expect(ChessError.is(error)).toBe(true);
			expect(error).toMatchObject({
				type: 'InvalidSquare',
				square: 0x88,
			});
		});

		it('iterates occupied squares and pieces only', () => {
			const board = createBoardWithPieces([
				['a1', PieceId.WHITE_ROOK],
				['e4', PieceId.WHITE_KNIGHT],
				['h8', PieceId.BLACK_KING],
			]);

			const pieces = Array.from(board.iteratePieces()).map(([square, piece]) => [
				ChessSquare.toString(square),
				piece,
			]);
			expect(pieces.map(([square]) => square)).toEqual(['a1', 'e4', 'h8']);
			expect(pieces).toEqual([
				['a1', PieceId.WHITE_ROOK],
				['e4', PieceId.WHITE_KNIGHT],
				['h8', PieceId.BLACK_KING],
			]);
		});

		it('clears pieces, move history, and metadata back to defaults', () => {
			const board = createBoardWithPieces([['e4', PieceId.WHITE_QUEEN]], PieceColor.BLACK);
			board.enPassantTarget = square('e3');
			board.castlingRights = 0;
			board.halfMoveClock = 12;
			board.fullMoveNumber = 34;
			board.undoMoves.push({
				fromSquare: square('e2'),
				toSquare: square('e4'),
				movedPieceId: PieceId.WHITE_PAWN,
				capturedPieceId: null,
				isEnPassantCapture: false,
				castlingBeforeMove: CastlingRights.all(),
				enPassantTargetBeforeMove: null,
				halfMoveClockBeforeMove: 0,
				fullMoveNumberBeforeMove: 1,
			});

			board.clear();

			expect(Array.from(board.iteratePieces())).toEqual([]);
			expect(board.turnColor).toBe(PieceColor.WHITE);
			expect(board.enPassantTarget).toBe(null);
			expect(board.castlingRights).toBe(CastlingRights.all());
			expect(board.halfMoveClock).toBe(0);
			expect(board.fullMoveNumber).toBe(1);
			expect(board.undoMoves).toEqual([]);
		});

		it('clones board placement and metadata without sharing board storage', () => {
			const board = createBoardWithPieces([['d4', PieceId.WHITE_BISHOP]], PieceColor.BLACK);
			board.enPassantTarget = square('d3');
			board.castlingRights = CastlingRights.BLACK_KINGSIDE;
			board.halfMoveClock = 5;
			board.fullMoveNumber = 9;

			const clone = board.clone();

			expect(clone).not.toBe(board);
			expect(clone.board).not.toBe(board.board);
			expect(clone.getPiece('d4')).toBe(PieceId.WHITE_BISHOP);
			expect(clone.turnColor).toBe(PieceColor.BLACK);
			expect(clone.enPassantTarget).toBe(square('d3'));
			expect(clone.castlingRights).toBe(CastlingRights.BLACK_KINGSIDE);
			expect(clone.halfMoveClock).toBe(5);
			expect(clone.fullMoveNumber).toBe(9);

			clone.placePiece('d4', PieceId.BLACK_QUEEN);
			expect(board.getPiece('d4')).toBe(PieceId.WHITE_BISHOP);
			expect(clone.getPiece('d4')).toBe(PieceId.BLACK_QUEEN);
		});
	});

	describe('move packing and helpers', () => {
		it('unpacks quiet move helper fields', () => {
			const packedMove = ChessMove.pack(
				createMove({
					fromSquare: square('a1'),
					toSquare: square('h1'),
					movedPiece: PieceId.WHITE_ROOK,
					capturedPiece: null,
				})
			);

			expect(ChessMove.unpackFromSquare(packedMove)).toBe(square('a1'));
			expect(ChessMove.unpackToSquare(packedMove)).toBe(square('h1'));
			expect(ChessMove.unpackMovedPiece(packedMove)).toBe(PieceId.WHITE_ROOK);
			expect(ChessMove.unpackCapturedPiece(packedMove)).toBe(null);
			expect(ChessMove.unpackColor(packedMove)).toBe(PieceColor.WHITE);
		});

		it('unpacks capture helper fields', () => {
			const packedMove = ChessMove.pack(
				createMove({
					fromSquare: square('a1'),
					toSquare: square('b1'),
					movedPiece: PieceId.WHITE_ROOK,
					capturedPiece: PieceId.BLACK_KNIGHT,
				})
			);

			expect(ChessMove.unpackFromSquare(packedMove)).toBe(square('a1'));
			expect(ChessMove.unpackToSquare(packedMove)).toBe(square('b1'));
			expect(ChessMove.unpackMovedPiece(packedMove)).toBe(PieceId.WHITE_ROOK);
			expect(ChessMove.unpackCapturedPiece(packedMove)).toBe(PieceId.BLACK_KNIGHT);
		});

		it('round-trips a quiet move without adding a promotion', () => {
			const move = createMove({
				fromSquare: square('a1'),
				toSquare: square('h1'),
				movedPiece: PieceId.WHITE_ROOK,
				capturedPiece: null,
				promotion: null,
				enPassantTargetAfterMove: null,
				isEnPassantCapture: false,
			});

			expect(ChessMove.unpack(ChessMove.pack(move))).toEqual(move);
		});

		it('round-trips promotion information', () => {
			const move = createMove({
				fromSquare: square('a7'),
				toSquare: square('a8'),
				movedPiece: PieceId.WHITE_PAWN,
				capturedPiece: null,
				promotion: PromotionPiece.QUEEN,
				enPassantTargetAfterMove: null,
				isEnPassantCapture: false,
			});

			const packedMove = ChessMove.pack(move);

			expect(ChessMove.unpackPromotion(packedMove)).toBe(move.promotion);
			expect(ChessMove.unpack(packedMove)).toEqual(move);
		});

		it.each([
			['white kingside', PieceId.WHITE_KING, 'e1', 'g1', CastlingType.KINGSIDE],
			['white queenside', PieceId.WHITE_KING, 'e1', 'c1', CastlingType.QUEENSIDE],
			['black kingside', PieceId.BLACK_KING, 'e8', 'g8', CastlingType.KINGSIDE],
			['black queenside', PieceId.BLACK_KING, 'e8', 'c8', CastlingType.QUEENSIDE],
		] as const)('identifies %s castling moves', (_description, movedPiece, from, to, expected) => {
			const move = ChessMove.pack(
				createMove({ fromSquare: square(from), toSquare: square(to), movedPiece })
			);
			expect(ChessMove.castlingTypeOf(move)).toBe(expected);
		});

		it.each([
			['a normal king move', PieceId.WHITE_KING, 'e1', 'f1'],
			['a king move from a non-original square', PieceId.WHITE_KING, 'e2', 'g2'],
			['a non-king move with castling coordinates', PieceId.WHITE_ROOK, 'e1', 'g1'],
		] as const)('does not identify %s as castling', (_description, movedPiece, from, to) => {
			const move = ChessMove.pack(
				createMove({ fromSquare: square(from), toSquare: square(to), movedPiece })
			);
			expect(ChessMove.castlingTypeOf(move)).toBe(null);
		});
	});

	describe('chessMoveEquals', () => {
		it('compares moves by public move fields', () => {
			const move = createMove({
				fromSquare: square('a1'),
				toSquare: square('a2'),
				movedPiece: PieceId.WHITE_PAWN,
				capturedPiece: PieceId.BLACK_PAWN,
				promotion: PromotionPiece.KNIGHT,
				enPassantTargetAfterMove: square('a5'),
			});

			expect(chessMoveInfoEquals(move, createMove(move))).toBe(true);
			expect(chessMoveInfoEquals(move, createMove({ ...move, fromSquare: square('c3') }))).toBe(
				false
			);
			expect(chessMoveInfoEquals(move, createMove({ ...move, toSquare: square('c3') }))).toBe(
				false
			);
			expect(
				chessMoveInfoEquals(move, createMove({ ...move, movedPiece: PieceId.BLACK_PAWN }))
			).toBe(false);
			expect(
				chessMoveInfoEquals(move, createMove({ ...move, capturedPiece: PieceId.WHITE_PAWN }))
			).toBe(false);
			expect(chessMoveInfoEquals(move, createMove({ ...move, promotion: null }))).toBe(false);
			expect(
				chessMoveInfoEquals(move, createMove({ ...move, enPassantTargetAfterMove: null }))
			).toBe(false);
		});
	});

	describe('ChessError', () => {
		it('identifies chess error objects', () => {
			const invalidSquare = ChessError.InvalidSquare({ square: 0x88, context: 'test' });
			const invalidMove = ChessError.InvalidMove({
				fromSquare: square('a1'),
				toSquare: square('a2'),
				context: 'test',
			});
			const wrongTurn = ChessError.WrongTurn(PieceColor.BLACK);

			expect(ChessError.is(invalidSquare)).toBe(true);
			expect(ChessError.is(invalidMove)).toBe(true);
			expect(ChessError.is(wrongTurn)).toBe(true);
			expect(ChessError.is(null)).toBe(false);
			expect(ChessError.is({})).toBe(false);
			expect(ChessError.is({ type: 'OtherError' })).toBe(false);
		});
	});

	describe('legal move generation', () => {
		it('generates the exact move set for an isolated knight', () => {
			const board = createBoardWithPieces([['d4', PieceId.WHITE_KNIGHT]]);
			board.castlingRights = 0;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).toEqual([
				'd4b3',
				'd4b5',
				'd4c2',
				'd4c6',
				'd4e2',
				'd4e6',
				'd4f3',
				'd4f5',
			]);
		});

		it('allows generated bishop moves with captures and blockers', () => {
			const board = createBoardWithPieces([
				['d4', PieceId.WHITE_BISHOP],
				['f6', PieceId.WHITE_PAWN],
				['b6', PieceId.BLACK_PAWN],
			]);

			board.generateLegalMoves();
			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toEqual(expect.arrayContaining(['d4e5', 'd4c5', 'd4b6', 'd4e3']));
			expect(moveStrings).not.toContain('d4g7');
			expect(moveStrings).not.toContain('d4a7');
		});

		it('allows generated rook moves with captures and blockers', () => {
			const board = createBoardWithPieces([
				['d4', PieceId.WHITE_ROOK],
				['d6', PieceId.WHITE_PAWN],
				['f4', PieceId.BLACK_PAWN],
			]);

			board.generateLegalMoves();
			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toEqual(expect.arrayContaining(['d4d5', 'd4f4', 'd4d1', 'd4a4']));
			expect(moveStrings).not.toContain('d4d7');
			expect(moveStrings).not.toContain('d4g4');
		});

		it('generates the exact move set for an isolated bishop', () => {
			const board = createBoardWithPieces([['d4', PieceId.WHITE_BISHOP]]);
			board.castlingRights = 0;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).toEqual([
				'd4a1',
				'd4a7',
				'd4b2',
				'd4b6',
				'd4c3',
				'd4c5',
				'd4e3',
				'd4e5',
				'd4f2',
				'd4f6',
				'd4g1',
				'd4g7',
				'd4h8',
			]);
		});

		it('generates the exact move set for an isolated rook', () => {
			const board = createBoardWithPieces([['d4', PieceId.WHITE_ROOK]]);
			board.castlingRights = 0;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).toEqual([
				'd4a4',
				'd4b4',
				'd4c4',
				'd4d1',
				'd4d2',
				'd4d3',
				'd4d5',
				'd4d6',
				'd4d7',
				'd4d8',
				'd4e4',
				'd4f4',
				'd4g4',
				'd4h4',
			]);
		});

		it('allows generated king moves', () => {
			const board = createBoardWithPieces([['d4', PieceId.WHITE_KING]]);
			board.generateLegalMoves();

			const expectedMoves = ['d4c5', 'd4d5', 'd4e5', 'd4c4', 'd4e4', 'd4c3', 'd4d3', 'd4e3'];
			expectLegalMovesToContain(board, expectedMoves);
		});

		it('allows single and double pawn pushes from the starting rank', () => {
			const board = createBoardWithPieces([['e2', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();
			expectLegalMovesToContain(board, ['e2e3', 'e2e4']);
		});

		it('does not allow pawn pushes through blockers', () => {
			const board = createBoardWithPieces([
				['b1', PieceId.WHITE_KNIGHT],
				['e2', PieceId.WHITE_PAWN],
				['e3', PieceId.BLACK_KNIGHT],
			]);

			board.generateLegalMoves();
			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toContain('b1c3');
			expect(moveStrings).not.toContain('e2e3');
			expect(moveStrings).not.toContain('e2e4');
		});

		it('does not allow a double pawn push onto an occupied square', () => {
			const board = createBoardWithPieces([
				['e2', PieceId.WHITE_PAWN],
				['e4', PieceId.BLACK_KNIGHT],
			]);

			board.generateLegalMoves();
			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toContain('e2e3');
			expect(moveStrings).not.toContain('e2e4');
		});

		it('allows pawn only enemy-piece captures', () => {
			const board = createBoardWithPieces([
				['e2', PieceId.WHITE_PAWN],
				['d3', PieceId.BLACK_KNIGHT],
				['f3', PieceId.WHITE_KNIGHT],
			]);

			board.generateLegalMoves();
			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toContain('e2d3');
			expect(moveStrings).not.toContain('e2f3');
		});

		it('allows promotion moves', () => {
			const board = createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();
			expect(legalMoveStringsOf(board)).toContain('a7a8q');
		});

		it('allows en passant captures when a target square is available', () => {
			const board = createBoardWithPieces([
				['e5', PieceId.WHITE_PAWN],
				['d5', PieceId.BLACK_PAWN],
			]);
			board.enPassantTarget = square('d6');
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).toContain('e5d6');
		});

		it('rejects moves that would leave the king in check', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['e2', PieceId.WHITE_ROOK],
				['e7', PieceId.BLACK_ROOK],
				['e8', PieceId.BLACK_KING],
			]);
			board.generateLegalMoves();

			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toContain('e2e7');
			expect(moveStrings).toContain('e1d1');
			expect(moveStrings).not.toContain('e2d2');
			expect(moveStrings).not.toContain('e2f2');
		});

		it('allows castling moves when castling is legal', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['a1', PieceId.WHITE_ROOK],
				['e8', PieceId.BLACK_KING],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE | CastlingRights.WHITE_QUEENSIDE;
			board.generateLegalMoves();

			const moveStrings = legalMoveStringsOf(board);

			expect(moveStrings).toContain('e1c1');
			expect(moveStrings).toContain('e1g1');
		});

		it('does not allow castling out of check', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['a8', PieceId.BLACK_KING],
				['e8', PieceId.BLACK_ROOK],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).not.toContain('e1g1');
		});

		it('does not allow castling through check', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['a8', PieceId.BLACK_KING],
				['f8', PieceId.BLACK_ROOK],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).not.toContain('e1g1');
		});

		it('does not allow castling into check', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['a8', PieceId.BLACK_KING],
				['g8', PieceId.BLACK_ROOK],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE;
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).not.toContain('e1g1');
		});

		it('allows every normal promotion choice', () => {
			const board = createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();

			expect(legalMoveStringsOf(board)).toEqual(
				expect.arrayContaining(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'])
			);
		});

		it('generates initial-position perft counts through depth 3', () => {
			const board = boardFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

			expect(perft(board, 1)).toBe(20);
			expect(perft(board, 2)).toBe(400);
			expect(perft(board, 3)).toBe(8902);
		});

		// Kiwipete is a standard chess-engine test position designed to exercise castling,
		// pins, captures, and other move-generation edge cases in a compact position.
		it('generates the established Kiwipete position count at depth 1', () => {
			const board = boardFromFen(
				'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
			);

			expect(perft(board, 1)).toBe(48);
		});

		describe('black-side symmetry', () => {
			it('generates black pawn pushes, en passant, and promotions', () => {
				const pawnBoard = createBoardWithPieces([['e7', PieceId.BLACK_PAWN]], PieceColor.BLACK);
				pawnBoard.castlingRights = 0;
				pawnBoard.generateLegalMoves();
				expect(legalMoveStringsOf(pawnBoard)).toEqual(['e7e5', 'e7e6']);

				const enPassantBoard = createBoardWithPieces(
					[
						['e4', PieceId.BLACK_PAWN],
						['d4', PieceId.WHITE_PAWN],
					],
					PieceColor.BLACK
				);
				enPassantBoard.enPassantTarget = square('d3');
				enPassantBoard.generateLegalMoves();
				expect(legalMoveStringsOf(enPassantBoard)).toContain('e4d3');

				const promotionBoard = createBoardWithPieces(
					[['a2', PieceId.BLACK_PAWN]],
					PieceColor.BLACK
				);
				promotionBoard.generateLegalMoves();
				expect(legalMoveStringsOf(promotionBoard)).toEqual(['a2a1b', 'a2a1n', 'a2a1q', 'a2a1r']);
			});

			it('generates black castling and rejects moves that expose the black king', () => {
				const castlingBoard = createBoardWithPieces(
					[
						['e1', PieceId.WHITE_KING],
						['e8', PieceId.BLACK_KING],
						['a8', PieceId.BLACK_ROOK],
						['h8', PieceId.BLACK_ROOK],
					],
					PieceColor.BLACK
				);
				castlingBoard.castlingRights =
					CastlingRights.BLACK_KINGSIDE | CastlingRights.BLACK_QUEENSIDE;
				castlingBoard.generateLegalMoves();
				expect(legalMoveStringsOf(castlingBoard)).toEqual(expect.arrayContaining(['e8c8', 'e8g8']));

				const checkBoard = createBoardWithPieces(
					[
						['e1', PieceId.WHITE_KING],
						['e2', PieceId.WHITE_ROOK],
						['e7', PieceId.BLACK_ROOK],
						['e8', PieceId.BLACK_KING],
					],
					PieceColor.BLACK
				);
				checkBoard.castlingRights = 0;
				checkBoard.generateLegalMoves();
				expect(legalMoveStringsOf(checkBoard)).not.toContain('e7d7');
				expect(legalMoveStringsOf(checkBoard)).not.toContain('e7f7');
				expect(legalMoveStringsOf(checkBoard)).toContain('e7e2');
			});
		});
	});

	describe('moving pieces', () => {
		it('requires moves to be generated before applying a move', () => {
			const board = createBoardWithPieces([['e2', PieceId.WHITE_PAWN]]);

			expect(board.makeMove('e2', 'e4')).toBe(null);
			expect(board.getPiece('e2')).toBe(PieceId.WHITE_PAWN);
			expect(board.getPiece('e4')).toBe(null);
		});

		it('applies a generated quiet move and toggles the turn', () => {
			const board = createBoardWithPieces([['b1', PieceId.WHITE_KNIGHT]]);
			board.generateLegalMoves();

			const packedMove = board.makeMove('b1', 'c3');

			expect(packedMove).not.toBe(null);
			expect(board.getPiece('b1')).toBe(null);
			expect(board.getPiece('c3')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.turnColor).toBe(PieceColor.BLACK);
			expect(board.halfMoveClock).toBe(1);
			expect(board.fullMoveNumber).toBe(1);
		});

		it('applies a generated capture and resets the half-move clock', () => {
			const board = createBoardWithPieces([
				['b1', PieceId.WHITE_KNIGHT],
				['c3', PieceId.BLACK_BISHOP],
			]);
			board.halfMoveClock = 7;
			board.generateLegalMoves();

			const packedMove = board.makeMove('b1', 'c3');

			expect(packedMove).not.toBe(null);
			expect(board.getPiece('b1')).toBe(null);
			expect(board.getPiece('c3')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.halfMoveClock).toBe(0);
		});

		it('increments the full move number after black moves', () => {
			const board = createBoardWithPieces([['g8', PieceId.BLACK_KNIGHT]], PieceColor.BLACK);
			board.fullMoveNumber = 12;
			board.generateLegalMoves();

			const packedMove = board.makeMove('g8', 'f6');

			expect(packedMove).not.toBe(null);
			expect(board.turnColor).toBe(PieceColor.WHITE);
			expect(board.fullMoveNumber).toBe(13);
		});

		it('undo restores board state and metadata', () => {
			const board = createBoardWithPieces([['b1', PieceId.WHITE_KNIGHT]]);
			board.enPassantTarget = square('e3');
			board.castlingRights = CastlingRights.WHITE_KINGSIDE;
			board.halfMoveClock = 4;
			board.fullMoveNumber = 7;
			board.generateLegalMoves();

			const packedMove = board.makeMove('b1', 'c3');
			expect(packedMove).not.toBe(null);
			board.undoMove();

			expect(board.getPiece('b1')).toBe(PieceId.WHITE_KNIGHT);
			expect(board.getPiece('c3')).toBe(null);
			expect(board.turnColor).toBe(PieceColor.WHITE);
			expect(board.enPassantTarget).toBe(square('e3'));
			expect(board.castlingRights).toBe(CastlingRights.WHITE_KINGSIDE);
			expect(board.halfMoveClock).toBe(4);
			expect(board.fullMoveNumber).toBe(7);
			expect(board.undoMoves).toEqual([]);
		});

		it('tracks a moved king and restores its location on undo', () => {
			const board = boardFromFen('k3r3/8/8/8/8/8/8/4K3 w - - 0 1');
			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(true);
			board.generateLegalMoves();

			const move = board.makeMove('e1', 'd1');

			expect(move).not.toBe(null);
			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(false);

			board.undoMove();
			expect(board.isKingInCheck(PieceColor.WHITE)).toBe(true);
		});

		it('reconstructs applied move history', () => {
			const board = createBoardWithPieces([['b1', PieceId.WHITE_KNIGHT]]);
			board.generateLegalMoves();

			board.makeMove('b1', 'c3');

			expect(board.getMove(0)).toMatchObject({
				fromSquare: square('b1'),
				toSquare: square('c3'),
				movedPiece: PieceId.WHITE_KNIGHT,
				capturedPiece: null,
				isEnPassantCapture: false,
			});
			expect(board.getMove(-1)).toBe(null);
			expect(board.getMove(1)).toBe(null);
		});

		it('updates en passant target after a double pawn push', () => {
			const board = createBoardWithPieces([
				['e2', PieceId.WHITE_PAWN],
				['f4', PieceId.BLACK_PAWN],
			]);
			board.generateLegalMoves();
			const move = board.makeMove('e2', 'e4');
			expect(move).not.toBe(null);
			expect(ChessSquare.toString(board.enPassantTarget!)).toBe('e3');
		});

		it('removes the passed pawn when applying en passant capture', () => {
			const board = createBoardWithPieces([
				['e5', PieceId.WHITE_PAWN],
				['d5', PieceId.BLACK_PAWN],
			]);
			board.enPassantTarget = square('d6');
			board.generateLegalMoves();

			const move = board.makeMove('e5', 'd6');
			expect(move).not.toBe(null);

			expect(board.getPiece('d6')).toBe(PieceId.WHITE_PAWN);
			expect(board.getPiece('e5')).toBe(null);
			expect(board.getPiece('d5')).toBe(null);
		});

		it('applies a queen promotion by replacing the pawn', () => {
			const board = createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();

			board.makeMove('a7', 'a8');

			expect(board.getPiece('a8')).toBe(PieceId.WHITE_QUEEN);
			expect(board.getPiece('a7')).toBe(null);
		});

		it('applies castling by moving the king and rook', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['e8', PieceId.BLACK_KING],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE;
			board.generateLegalMoves();

			board.makeMove('e1', 'g1');

			expect(board.getPiece('g1')).toBe(PieceId.WHITE_KING);
			expect(board.getPiece('f1')).toBe(PieceId.WHITE_ROOK);
			expect(board.getPiece('e1')).toBe(null);
			expect(board.getPiece('h1')).toBe(null);
		});

		it('removes white castling rights automatically when white king moves', () => {
			const board = createBoardWithPieces([['e1', PieceId.WHITE_KING]], PieceColor.WHITE);
			board.castlingRights =
				CastlingRights.WHITE_KINGSIDE |
				CastlingRights.WHITE_QUEENSIDE |
				CastlingRights.BLACK_KINGSIDE;
			board.generateLegalMoves();
			const move = board.makeMove('e1', 'e2');
			expect(move).not.toBe(null);

			expect(board.castlingRights & CastlingRights.WHITE_KINGSIDE).toBe(0);
			expect(board.castlingRights & CastlingRights.WHITE_QUEENSIDE).toBe(0);
			expect(board.castlingRights).toBe(CastlingRights.BLACK_KINGSIDE);
		});

		it('removes black castling rights automatically when black king moves', () => {
			const board = createBoardWithPieces([['e8', PieceId.BLACK_KING]], PieceColor.BLACK);
			board.castlingRights =
				CastlingRights.WHITE_QUEENSIDE |
				CastlingRights.BLACK_KINGSIDE |
				CastlingRights.BLACK_QUEENSIDE;
			board.generateLegalMoves();
			const move = board.makeMove('e8', 'e7');
			expect(move).not.toBe(null);

			expect(board.castlingRights & CastlingRights.BLACK_KINGSIDE).toBe(0);
			expect(board.castlingRights & CastlingRights.BLACK_QUEENSIDE).toBe(0);
			expect(board.castlingRights).toBe(CastlingRights.WHITE_QUEENSIDE);
		});

		it('removes proper castling rights when any rook moves from its starting square', () => {
			const board = createBoardWithPieces([
				['a1', PieceId.WHITE_ROOK],
				['e1', PieceId.WHITE_KING],
				['h1', PieceId.WHITE_ROOK],
				['a8', PieceId.BLACK_ROOK],
				['e8', PieceId.BLACK_KING],
				['h8', PieceId.BLACK_ROOK],
			]);
			board.castlingRights =
				CastlingRights.WHITE_KINGSIDE |
				CastlingRights.WHITE_QUEENSIDE |
				CastlingRights.BLACK_KINGSIDE |
				CastlingRights.BLACK_QUEENSIDE;
			board.generateLegalMoves();
			expect(board.turnColor).toBe(PieceColor.WHITE);

			let move = board.makeMove('a1', 'a2');
			expect(move).not.toBe(null);
			expect(board.castlingRights & CastlingRights.WHITE_QUEENSIDE).toBe(0);
			expect(board.castlingRights).toBe(
				CastlingRights.WHITE_KINGSIDE |
					CastlingRights.BLACK_QUEENSIDE |
					CastlingRights.BLACK_KINGSIDE
			);
			expect(board.turnColor).toBe(PieceColor.BLACK);

			move = board.makeMove('a8', 'a7');
			expect(move).not.toBe(null);
			expect(board.castlingRights & CastlingRights.BLACK_QUEENSIDE).toBe(0);
			expect(board.castlingRights).toBe(
				CastlingRights.WHITE_KINGSIDE | CastlingRights.BLACK_KINGSIDE
			);

			move = board.makeMove('h1', 'h2');
			expect(move).not.toBe(null);
			expect(board.castlingRights & CastlingRights.WHITE_KINGSIDE).toBe(0);
			expect(board.castlingRights).toBe(CastlingRights.BLACK_KINGSIDE);

			move = board.makeMove('h8', 'h7');
			expect(move).not.toBe(null);
			expect(board.castlingRights & CastlingRights.WHITE_KINGSIDE).toBe(0);
			expect(board.castlingRights).toBe(0);
		});

		it('removes castling rights when a rook is captured on its starting square', () => {
			const board = createBoardWithPieces(
				[
					['e1', PieceId.WHITE_KING],
					['h1', PieceId.WHITE_ROOK],
					['e8', PieceId.BLACK_KING],
					['h8', PieceId.BLACK_ROOK],
				],
				PieceColor.BLACK
			);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE | CastlingRights.BLACK_KINGSIDE;
			board.generateLegalMoves();

			const move = board.makeMove('h8', 'h1');

			expect(move).not.toBe(null);
			expect(board.castlingRights).toBe(0);
		});

		it('removes castling rights when a pawn captures a rook on its starting square', () => {
			const board = createBoardWithPieces([
				['e1', PieceId.WHITE_KING],
				['b7', PieceId.WHITE_PAWN],
				['a8', PieceId.BLACK_ROOK],
				['e8', PieceId.BLACK_KING],
			]);
			board.castlingRights = CastlingRights.WHITE_KINGSIDE | CastlingRights.BLACK_QUEENSIDE;
			board.generateLegalMoves();

			const move = board.makeMove('b7', 'a8');

			expect(move).not.toBe(null);
			expect(board.castlingRights).toBe(CastlingRights.WHITE_KINGSIDE);
		});

		it('does not remove castling rights when an opposite color rook moves from a starting square', () => {
			const cases: Array<
				[
					description: string,
					from: ChessSquareStr,
					to: ChessSquareStr,
					rook: PieceIdType,
					turnColor: PieceColor,
				]
			> = [
				[
					'black rook from white queenside square',
					'a1',
					'a2',
					PieceId.BLACK_ROOK,
					PieceColor.BLACK,
				],
				['black rook from white kingside square', 'h1', 'h2', PieceId.BLACK_ROOK, PieceColor.BLACK],
				[
					'white rook from black queenside square',
					'a8',
					'a7',
					PieceId.WHITE_ROOK,
					PieceColor.WHITE,
				],
				['white rook from black kingside square', 'h8', 'h7', PieceId.WHITE_ROOK, PieceColor.WHITE],
			];

			for (const [description, from, to, rook, turnColor] of cases) {
				const board = createBoardWithPieces([[from, rook]], turnColor);
				board.castlingRights = CastlingRights.all();
				board.generateLegalMoves();

				const move = board.makeMove(from, to);
				expect(move, description).not.toBe(null);
				expect(board.castlingRights, description).toBe(CastlingRights.all());
			}
		});

		it('applies a caller-selected non-queen promotion', () => {
			const board = createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();

			const move = board.makeMove('a7', 'a8', PromotionPiece.KNIGHT);

			expect(move).not.toBe(null);
			expect(ChessMove.unpackPromotion(move!)).toBe(PromotionPiece.KNIGHT);
			expect(board.getPiece('a7')).toBe(null);
			expect(board.getPiece('a8')).toBe(PieceId.WHITE_KNIGHT);
		});

		describe('apply and undo round trips', () => {
			it('restores a capture', () => {
				expectMoveRoundTrip(
					createBoardWithPieces([
						['b1', PieceId.WHITE_KNIGHT],
						['c3', PieceId.BLACK_BISHOP],
					]),
					'b1',
					'c3'
				);
			});

			it('restores a double pawn push and its metadata', () => {
				expectMoveRoundTrip(createBoardWithPieces([['e2', PieceId.WHITE_PAWN]]), 'e2', 'e4');
			});

			it('restores an en passant capture and the captured pawn', () => {
				const board = createBoardWithPieces([
					['e5', PieceId.WHITE_PAWN],
					['d5', PieceId.BLACK_PAWN],
				]);
				board.enPassantTarget = square('d6');
				expectMoveRoundTrip(board, 'e5', 'd6');
			});

			it('restores castling', () => {
				const board = createBoardWithPieces([
					['e1', PieceId.WHITE_KING],
					['h1', PieceId.WHITE_ROOK],
					['e8', PieceId.BLACK_KING],
				]);
				board.castlingRights = CastlingRights.WHITE_KINGSIDE;
				expectMoveRoundTrip(board, 'e1', 'g1');
			});

			it('restores promotion', () => {
				expectMoveRoundTrip(
					createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]),
					'a7',
					'a8',
					PromotionPiece.KNIGHT
				);
			});
		});
	});

	describe('error handling', () => {
		it('returns an invalid square error when placing a piece off board', () => {
			const board = new ChessBoard();

			const error = board.placePiece(Ox88.OFF_BOARD as ChessSquare, PieceId.WHITE_QUEEN);

			expect(error).toMatchObject({
				type: 'InvalidSquare',
				square: Ox88.OFF_BOARD,
			});
		});
	});

	describe('findMove', () => {
		it('finds a generated move and returns null for missing moves', () => {
			const board = createBoardWithPieces([['b1', PieceId.WHITE_KNIGHT]]);
			expect(board.findMove('b1', 'c3')).toBe(null);

			board.generateLegalMoves();
			const move = board.findMove('b1', 'c3');

			expect(move).not.toBe(null);
			expect(ChessMove.toString(move!)).toBe('b1c3');
			expect(board.findMove('b1', 'b2')).toBe(null);
		});

		it('selects the requested promotion move', () => {
			const board = createBoardWithPieces([['a7', PieceId.WHITE_PAWN]]);
			board.generateLegalMoves();

			const knightPromotion = board.findMove('a7', 'a8', PromotionPiece.KNIGHT);

			expect(knightPromotion).not.toBe(null);
			expect(ChessMove.unpackPromotion(knightPromotion!)).toBe(PromotionPiece.KNIGHT);
		});
	});
});

function square(position: ChessSquareStr): ChessSquare {
	const chessSquare = ChessSquare.parse(position);
	if (chessSquare == null) throw new Error(`Invalid test square: ${position}`);
	return chessSquare;
}

function createBoardWithPieces(
	pieces: Array<[position: ChessSquareStr, piece: PieceIdType]>,
	turnColor: PieceColor = PieceColor.WHITE
): ChessBoard {
	const board = new ChessBoard();
	for (const [position, piece] of pieces) {
		const error = board.placePiece(position, piece);
		expect(error).toBeUndefined();
	}
	board.turnColor = turnColor;
	return board;
}

function createMove(options: Partial<ChessMoveInfo> = {}): ChessMoveInfo {
	return {
		fromSquare: ChessSquare.from('a1'),
		toSquare: ChessSquare.from('h1'),
		movedPiece: PieceId.WHITE_ROOK,
		capturedPiece: null,
		promotion: null,
		...options,
	};
}

function legalMoveStringsOf(board: ChessBoard): string[] {
	return board.legalMovesThisTurn.map(ChessMove.toString).sort();
}

function expectLegalMovesToContain(board: ChessBoard, expectedMoveStrings: string[]): void {
	expect(legalMoveStringsOf(board)).toEqual(expect.arrayContaining(expectedMoveStrings));
}

function boardFromFen(fen: string): ChessBoard {
	const board = new ChessBoard();
	const error = loadFen(board, fen);
	expect(error).toBeUndefined();
	return board;
}

/**
 * Counts every legal move sequence to a given depth. Comparing the result with known
 * counts validates move generation together with apply/undo state restoration.
 */
function perft(board: ChessBoard, depth: number): number {
	if (depth === 0) return 1;
	board.generateLegalMoves();
	const moves = [...board.legalMovesThisTurn];
	let nodes = 0;
	for (const move of moves) {
		expect(board.applyMove(move)).toBe(true);
		nodes += perft(board, depth - 1);
		board.undoMove();
	}
	return nodes;
}

function expectMoveRoundTrip(
	board: ChessBoard,
	from: ChessSquareStr,
	to: ChessSquareStr,
	promotion?: PromotionPiece
): void {
	const before = boardStateOf(board);
	board.generateLegalMoves();
	const move = board.findMove(from, to, promotion);
	expect(move).not.toBe(null);
	expect(board.applyMove(move!)).toBe(true);
	board.undoMove();
	expect(boardStateOf(board)).toEqual(before);
}

function boardStateOf(board: ChessBoard): object {
	return {
		pieces: Array.from(board.iteratePieces()),
		turnColor: board.turnColor,
		enPassantTarget: board.enPassantTarget,
		castlingRights: board.castlingRights,
		halfMoveClock: board.halfMoveClock,
		fullMoveNumber: board.fullMoveNumber,
		undoMoves: [...board.undoMoves],
	};
}
